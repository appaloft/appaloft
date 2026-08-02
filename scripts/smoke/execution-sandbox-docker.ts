import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DockerSandboxProvider } from "../../packages/adapters/runtime/src/docker-sandbox-provider";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
const sourceSandboxId = `sbx_smoke_${suffix}`;
const restoredSandboxId = `sbx_restore_${suffix}`;
const portableSandboxId = `sbx_portable_${suffix}`;
const snapshotId = `ssn_smoke_${suffix}`;
const portableSnapshotId = `ssn_portable_${suffix}`;
const portableSnapshotRestoreIds = [
  `sbx_snapshot_restore_a_${suffix}`,
  `sbx_snapshot_restore_b_${suffix}`,
];
const ownerScope = `smoke_${suffix}`;
const provider = new DockerSandboxProvider({ isolation: "container-trusted" });
const portableRecoveryRoot = await mkdtemp(join(tmpdir(), "appaloft-portable-recovery-"));
const portableProviderInput = {
  isolation: "container-trusted" as const,
  portableRecovery: {
    kind: "shared-filesystem" as const,
    rootPath: portableRecoveryRoot,
    storeId: `smoke-${suffix}`,
  },
};
const portableSourceProvider = new DockerSandboxProvider({
  ...portableProviderInput,
  key: "portable-source",
});
const portableTargetProvider = new DockerSandboxProvider({
  ...portableProviderInput,
  key: "portable-target",
});
const limits = {
  cpuMillis: 500,
  memoryBytes: 128 * 1024 * 1024,
  diskBytes: 64 * 1024 * 1024,
  maxProcesses: 32,
};
const handles = new Map<string, string>();
let snapshotHandle: string | undefined;
let hibernationHandle: string | undefined;
let portableRecoveryHandle: string | undefined;
let portableRecoveryPath: string | undefined;
let portableSnapshotHandle: string | undefined;
let portableSnapshotPath: string | undefined;

async function removeOwnedContainer(sandboxId: string, handle: string): Promise<void> {
  const inspected = Bun.spawnSync([
    "docker",
    "inspect",
    "--format",
    '{{index .Config.Labels "appaloft.sandbox.id"}} {{index .Config.Labels "appaloft.sandbox.owner"}}',
    handle,
  ]);
  if (inspected.exitCode !== 0) return;
  if (new TextDecoder().decode(inspected.stdout).trim() !== `${sandboxId} ${ownerScope}`) {
    throw new Error(`Refusing to clean non-owned container ${handle}`);
  }
  Bun.spawnSync(["docker", "rm", "-f", handle]);
}

async function cleanup(): Promise<void> {
  for (const [sandboxId, handle] of handles) await removeOwnedContainer(sandboxId, handle);
  if (snapshotHandle) {
    const inspected = Bun.spawnSync([
      "docker",
      "image",
      "inspect",
      "--format",
      '{{index .Config.Labels "appaloft.snapshot.id"}}',
      snapshotHandle,
    ]);
    if (
      inspected.exitCode === 0 &&
      new TextDecoder().decode(inspected.stdout).trim() === snapshotId
    ) {
      Bun.spawnSync(["docker", "image", "rm", snapshotHandle]);
    }
  }
  if (hibernationHandle) {
    const inspected = Bun.spawnSync([
      "docker",
      "image",
      "inspect",
      "--format",
      '{{index .Config.Labels "appaloft.hibernate.sandbox"}}',
      hibernationHandle,
    ]);
    if (
      inspected.exitCode === 0 &&
      new TextDecoder().decode(inspected.stdout).trim() === sourceSandboxId
    ) {
      Bun.spawnSync(["docker", "image", "rm", hibernationHandle]);
    }
  }
  if (portableRecoveryHandle) {
    await portableSourceProvider
      .terminate({
        sandboxId: portableSandboxId,
        providerHandle: portableRecoveryHandle,
      })
      .catch(() => undefined);
  }
  if (portableSnapshotHandle) {
    await portableTargetProvider
      .deleteSnapshot({
        snapshotId: portableSnapshotId,
        providerHandle: portableSnapshotHandle,
      })
      .catch(() => undefined);
  }
  await rm(portableRecoveryRoot, { recursive: true, force: true });
}

async function assertWorkspaceProcessHome(
  sandboxId: string,
  providerHandle: string,
  phase: string,
): Promise<void> {
  const result = await provider.exec({
    sandboxId,
    providerHandle,
    argv: [
      "sh",
      "-c",
      'printf "%s\\n%s\\n%s\\n%s\\n%s" "$HOME" "$XDG_DATA_HOME" "$XDG_CONFIG_HOME" "$XDG_STATE_HOME" "$XDG_CACHE_HOME"',
    ],
  });
  assert(result.mode === "foreground", `${phase} process-home probe ran in the background`);
  const stdout = result.frames
    .filter((frame) => frame.kind === "stdout")
    .map((frame) => frame.data)
    .join("");
  assert(
    stdout ===
      "/workspace\n/workspace/.local/share\n/workspace/.config\n/workspace/.local/state\n/workspace/.cache",
    `${phase} process home escaped the Workspace: ${stdout}`,
  );
}

try {
  const source = await provider.provision({
    sandboxId: sourceSandboxId,
    ownerScope,
    source: { kind: "image", image: "alpine:latest" },
    requestedIsolation: "container-trusted",
    limits,
    networkPolicy: { mode: "deny", rules: [] },
  });
  handles.set(sourceSandboxId, source.providerHandle);
  await provider.writeFile({
    sandboxId: sourceSandboxId,
    providerHandle: source.providerHandle,
    path: "input/data.bin",
    content: new Uint8Array([0, 255, 1, 2]),
  });
  const bytes = await provider.readFile({
    sandboxId: sourceSandboxId,
    providerHandle: source.providerHandle,
    path: "input/data.bin",
  });
  assert(bytes.length === 4 && bytes[1] === 255, "binary workspace round-trip failed");
  const foreground = await provider.exec({
    sandboxId: sourceSandboxId,
    providerHandle: source.providerHandle,
    argv: ["sh", "-c", "printf sandbox-smoke"],
  });
  assert(
    foreground.mode === "foreground" &&
      foreground.frames.some((frame) => frame.kind === "stdout" && frame.data === "sandbox-smoke"),
    "foreground execution failed",
  );
  await assertWorkspaceProcessHome(sourceSandboxId, source.providerHandle, "initial");
  const hibernated = await provider.pause({
    sandboxId: sourceSandboxId,
    providerHandle: source.providerHandle,
  });
  hibernationHandle = hibernated.providerHandle;
  handles.delete(sourceSandboxId);
  assert(
    Bun.spawnSync(["docker", "inspect", source.providerHandle]).exitCode !== 0,
    "compute-released pause retained the live container",
  );
  const recoveryFiles = Bun.spawnSync([
    "docker",
    "run",
    "--rm",
    hibernated.providerHandle,
    "find",
    "/appaloft-snapshot-workspace",
    "-maxdepth",
    "4",
    "-type",
    "f",
    "-print",
  ]);
  const recoveryFileList = new TextDecoder().decode(recoveryFiles.stdout).trim();
  assert(
    recoveryFiles.exitCode === 0 &&
      recoveryFileList.split("\n").includes("/appaloft-snapshot-workspace/input/data.bin"),
    `hibernation image workspace layout is invalid: ${recoveryFileList}`,
  );
  const resumed = await provider.resume({
    sandboxId: sourceSandboxId,
    ownerScope,
    source: { kind: "image", image: "alpine:latest" },
    requestedIsolation: "container-trusted",
    limits,
    networkPolicy: { mode: "deny", rules: [] },
    providerHandle: hibernated.providerHandle,
  });
  hibernationHandle = undefined;
  handles.set(sourceSandboxId, resumed.providerHandle);
  await assertWorkspaceProcessHome(sourceSandboxId, resumed.providerHandle, "resumed");
  const resumedBytes = await provider.readFile({
    sandboxId: sourceSandboxId,
    providerHandle: resumed.providerHandle,
    path: "input/data.bin",
  });
  assert(resumedBytes[1] === 255, "hibernation resume did not preserve workspace bytes");
  await provider.removeFile({
    sandboxId: sourceSandboxId,
    providerHandle: resumed.providerHandle,
    path: "input/data.bin",
  });
  const hibernatedAgain = await provider.pause({
    sandboxId: sourceSandboxId,
    providerHandle: resumed.providerHandle,
  });
  hibernationHandle = hibernatedAgain.providerHandle;
  handles.delete(sourceSandboxId);
  const resumedAgain = await provider.resume({
    sandboxId: sourceSandboxId,
    ownerScope,
    source: { kind: "image", image: "alpine:latest" },
    requestedIsolation: "container-trusted",
    limits,
    networkPolicy: { mode: "deny", rules: [] },
    providerHandle: hibernatedAgain.providerHandle,
  });
  hibernationHandle = undefined;
  handles.set(sourceSandboxId, resumedAgain.providerHandle);
  const removedFile = await provider.listFiles({
    sandboxId: sourceSandboxId,
    providerHandle: resumedAgain.providerHandle,
    path: "input",
  });
  assert(
    !removedFile.some((entry) => entry.path === "input/data.bin"),
    "repeated hibernation resurrected a deleted workspace file",
  );
  await provider.writeFile({
    sandboxId: sourceSandboxId,
    providerHandle: resumedAgain.providerHandle,
    path: "input/data.bin",
    content: bytes,
  });
  const background = await provider.exec({
    sandboxId: sourceSandboxId,
    providerHandle: resumedAgain.providerHandle,
    argv: [
      "sh",
      "-c",
      "trap '' TERM; sh -c 'trap \"\" TERM; echo $$ > /workspace/descendant.pid; exec sleep 300' & wait",
    ],
    background: true,
  });
  assert(background.mode === "background", "background process did not return a process id");
  let descendantReady = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      descendantReady =
        (
          await provider.readFile({
            sandboxId: sourceSandboxId,
            providerHandle: resumedAgain.providerHandle,
            path: "descendant.pid",
          })
        ).byteLength > 0;
    } catch {}
    if (descendantReady) break;
    await Bun.sleep(20);
  }
  assert(descendantReady, "background descendant marker was not created");
  assert(
    (
      await provider.listProcesses({
        sandboxId: sourceSandboxId,
        providerHandle: resumedAgain.providerHandle,
      })
    ).some((process) => process.processId === background.processId),
    "background process was not observable",
  );
  await provider.terminateProcess({
    sandboxId: sourceSandboxId,
    providerHandle: resumedAgain.providerHandle,
    processId: background.processId,
  });
  await provider.terminateProcess({
    sandboxId: sourceSandboxId,
    providerHandle: resumedAgain.providerHandle,
    processId: background.processId,
  });
  const descendant = await provider.exec({
    sandboxId: sourceSandboxId,
    providerHandle: resumedAgain.providerHandle,
    argv: [
      "sh",
      "-c",
      'pid=$(cat descendant.pid); [ ! -r "/proc/$pid/stat" ] || [ "$(awk \'{print $3}\' "/proc/$pid/stat")" = Z ]',
    ],
  });
  assert(
    descendant.mode === "foreground" &&
      descendant.frames.some((frame) => frame.kind === "exit" && frame.exitCode === 0),
    "background descendant remained running after exact repeated termination",
  );
  const snapshot = await provider.captureSnapshot({
    sandboxId: sourceSandboxId,
    providerHandle: resumedAgain.providerHandle,
    snapshotId,
    capability: "filesystem",
  });
  snapshotHandle = snapshot.providerHandle;
  await provider.terminate({
    sandboxId: sourceSandboxId,
    providerHandle: resumedAgain.providerHandle,
  });
  handles.delete(sourceSandboxId);

  const restored = await provider.provision({
    sandboxId: restoredSandboxId,
    ownerScope,
    source: { kind: "snapshot", providerHandle: snapshot.providerHandle },
    requestedIsolation: "container-trusted",
    limits,
    networkPolicy: { mode: "deny", rules: [] },
  });
  handles.set(restoredSandboxId, restored.providerHandle);
  const restoredBytes = await provider.readFile({
    sandboxId: restoredSandboxId,
    providerHandle: restored.providerHandle,
    path: "input/data.bin",
  });
  assert(restoredBytes[1] === 255, "snapshot restore did not preserve workspace bytes");
  await provider.terminate({
    sandboxId: restoredSandboxId,
    providerHandle: restored.providerHandle,
  });
  handles.delete(restoredSandboxId);
  await provider.deleteSnapshot({ snapshotId, providerHandle: snapshot.providerHandle });
  snapshotHandle = undefined;

  const portable = await portableSourceProvider.provision({
    sandboxId: portableSandboxId,
    ownerScope,
    source: { kind: "image", image: "alpine:latest" },
    requestedIsolation: "container-trusted",
    limits,
    networkPolicy: { mode: "deny", rules: [] },
  });
  handles.set(portableSandboxId, portable.providerHandle);
  await portableSourceProvider.writeFile({
    sandboxId: portableSandboxId,
    providerHandle: portable.providerHandle,
    path: "portable/marker.bin",
    content: new Uint8Array([80, 79, 82, 84]),
  });
  const portablePaused = await portableSourceProvider.pause({
    sandboxId: portableSandboxId,
    providerHandle: portable.providerHandle,
  });
  portableRecoveryHandle = portablePaused.providerHandle;
  handles.delete(portableSandboxId);
  assert(
    portablePaused.providerHandle.startsWith("appaloft-docker-recovery:v1:"),
    "portable pause did not return an external recovery handle",
  );
  assert(
    Bun.spawnSync(["docker", "inspect", portable.providerHandle]).exitCode !== 0,
    "portable pause retained the source allocation",
  );
  assert(
    Bun.spawnSync(["docker", "image", "inspect", `appaloft-sandbox-hibernate:${portableSandboxId}`])
      .exitCode !== 0,
    "portable pause retained a provider-local hibernation image",
  );
  const portableRecoveryFiles = (await readdir(`${portableRecoveryRoot}/v1`)).filter(
    (name) => name.startsWith(`${portableSandboxId}-pr_`) && name.endsWith(".tar"),
  );
  assert(portableRecoveryFiles.length === 1, "portable pause did not persist one recovery package");
  portableRecoveryPath = `${portableRecoveryRoot}/v1/${portableRecoveryFiles[0]}`;
  assert(await Bun.file(portableRecoveryPath).exists(), "portable recovery package is missing");
  assert(
    ((await stat(`${portableRecoveryRoot}/v1`)).mode & 0o777) === 0o700,
    "portable recovery directory permissions are not 0700",
  );
  assert(
    ((await stat(portableRecoveryPath)).mode & 0o777) === 0o600,
    "portable recovery package permissions are not 0600",
  );
  const portableResumed = await portableTargetProvider.resume({
    sandboxId: portableSandboxId,
    ownerScope,
    source: { kind: "image", image: "alpine:latest" },
    requestedIsolation: "container-trusted",
    limits,
    networkPolicy: { mode: "deny", rules: [] },
    providerHandle: portablePaused.providerHandle,
  });
  portableRecoveryHandle = undefined;
  handles.set(portableSandboxId, portableResumed.providerHandle);
  const portableBytes = await portableTargetProvider.readFile({
    sandboxId: portableSandboxId,
    providerHandle: portableResumed.providerHandle,
    path: "portable/marker.bin",
  });
  assert(
    new TextDecoder().decode(portableBytes) === "PORT",
    "portable target restore did not preserve workspace bytes",
  );
  assert(
    portableRecoveryPath !== undefined && !(await Bun.file(portableRecoveryPath).exists()),
    "portable target restore retained the one-shot recovery package",
  );
  const reusableSnapshot = await portableTargetProvider.captureSnapshot({
    sandboxId: portableSandboxId,
    providerHandle: portableResumed.providerHandle,
    snapshotId: portableSnapshotId,
    capability: "filesystem",
  });
  portableSnapshotHandle = reusableSnapshot.providerHandle;
  assert(
    reusableSnapshot.portability === "provider-family" &&
      reusableSnapshot.recoveryFamily ===
        portableTargetProvider.capabilities.snapshotRecovery?.recoveryFamily,
    "portable reusable Snapshot did not declare the shared recovery family",
  );
  const portableSnapshotFiles = await readdir(`${portableRecoveryRoot}/v1/snapshots`);
  const portableSnapshotFile = portableSnapshotFiles.find(
    (name) => name.startsWith(`${portableSnapshotId}-ps_`) && name.endsWith(".tar"),
  );
  assert(portableSnapshotFile, "portable reusable Snapshot package is missing");
  portableSnapshotPath = `${portableRecoveryRoot}/v1/snapshots/${portableSnapshotFile}`;

  for (const [index, restoreSandboxId] of portableSnapshotRestoreIds.entries()) {
    const restoringProvider = index === 0 ? portableSourceProvider : portableTargetProvider;
    const restoredSnapshot = await restoringProvider.provision({
      sandboxId: restoreSandboxId,
      ownerScope,
      source: {
        kind: "snapshot",
        providerHandle: reusableSnapshot.providerHandle,
        portability: reusableSnapshot.portability,
        ...(reusableSnapshot.recoveryFamily
          ? { recoveryFamily: reusableSnapshot.recoveryFamily }
          : {}),
      },
      requestedIsolation: "container-trusted",
      limits,
      networkPolicy: { mode: "deny", rules: [] },
    });
    handles.set(restoreSandboxId, restoredSnapshot.providerHandle);
    const restoredPortableBytes = await restoringProvider.readFile({
      sandboxId: restoreSandboxId,
      providerHandle: restoredSnapshot.providerHandle,
      path: "portable/marker.bin",
    });
    assert(
      new TextDecoder().decode(restoredPortableBytes) === "PORT",
      `portable reusable Snapshot restore ${index + 1} did not preserve workspace bytes`,
    );
    assert(
      await Bun.file(portableSnapshotPath).exists(),
      `portable reusable Snapshot package was consumed by restore ${index + 1}`,
    );
    await restoringProvider.terminate({
      sandboxId: restoreSandboxId,
      providerHandle: restoredSnapshot.providerHandle,
    });
    handles.delete(restoreSandboxId);
  }
  await portableTargetProvider.deleteSnapshot({
    snapshotId: portableSnapshotId,
    providerHandle: reusableSnapshot.providerHandle,
  });
  portableSnapshotHandle = undefined;
  assert(
    !(await Bun.file(portableSnapshotPath).exists()),
    "portable reusable Snapshot exact deletion retained the package",
  );
  await portableTargetProvider.terminate({
    sandboxId: portableSandboxId,
    providerHandle: portableResumed.providerHandle,
  });
  handles.delete(portableSandboxId);

  const gvisor = new DockerSandboxProvider({ isolation: "gvisor" });
  try {
    await gvisor.probe();
    console.log("SBX-RUNTIME-004 gVisor available");
  } catch {
    console.log("SBX-RUNTIME-004 gVisor unsupported (runsc absent); no fallback used");
  }
  console.log("SBX-RUNTIME-003 Docker sandbox closed loop passed");
  console.log("HIB-DOCKER-001/002 compute-released hibernation closed loop passed");
  console.log("PORT-REC-001/002 portable two-provider recovery closed loop passed");
  console.log("SNAP-PORT-001/002/005 reusable portable Snapshot closed loop passed");
} finally {
  await cleanup();
}
