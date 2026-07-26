import { DockerSandboxProvider } from "../../packages/adapters/runtime/src/docker-sandbox-provider";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
const sourceSandboxId = `sbx_smoke_${suffix}`;
const restoredSandboxId = `sbx_restore_${suffix}`;
const snapshotId = `ssn_smoke_${suffix}`;
const ownerScope = `smoke_${suffix}`;
const provider = new DockerSandboxProvider({ isolation: "container-trusted" });
const limits = {
  cpuMillis: 500,
  memoryBytes: 128 * 1024 * 1024,
  diskBytes: 64 * 1024 * 1024,
  maxProcesses: 32,
};
const handles = new Map<string, string>();
let snapshotHandle: string | undefined;
let hibernationHandle: string | undefined;

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
    argv: ["sleep", "30"],
    background: true,
  });
  assert(background.mode === "background", "background process did not return a process id");
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

  const gvisor = new DockerSandboxProvider({ isolation: "gvisor" });
  try {
    await gvisor.probe();
    console.log("SBX-RUNTIME-004 gVisor available");
  } catch {
    console.log("SBX-RUNTIME-004 gVisor unsupported (runsc absent); no fallback used");
  }
  console.log("SBX-RUNTIME-003 Docker sandbox closed loop passed");
  console.log("HIB-DOCKER-001/002 compute-released hibernation closed loop passed");
} finally {
  await cleanup();
}
