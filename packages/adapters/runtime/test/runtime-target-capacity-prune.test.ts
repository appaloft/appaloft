import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { ash } from "@appaloft/ash";
import {
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetCredentialKindValue,
  DeploymentTargetId,
  DeploymentTargetLifecycleStatusValue,
  DeploymentTargetName,
  DeploymentTargetUsername,
  HostAddress,
  ok,
  PortNumber,
  ProviderKey,
  SshPrivateKeyText,
  type Result,
  TargetKindValue,
} from "@appaloft/core";

import {
  parseRuntimeTargetCapacityPruneOutput,
  renderRuntimeTargetCapacityPruneScript,
  RuntimeTargetCapacityPrunerAdapter,
} from "../src/runtime-target-capacity";

function unwrap<T>(result: Result<T>): T {
  expect(result.isOk()).toBe(true);
  return result._unsafeUnwrap();
}

const localCapacityPruneEnabled = process.env.APPALOFT_E2E_CAPACITY_PRUNE_LOCAL === "true";
const sshCapacityPruneEnabled = process.env.APPALOFT_E2E_SSH_CAPACITY_PRUNE === "true";

function serverState(
  overrides: {
    host?: string;
    port?: number;
    privateKey?: string;
    providerKey?: string;
    username?: string;
  } = {},
) {
  return DeploymentTarget.rehydrate({
    id: unwrap(DeploymentTargetId.create("srv_primary")),
    name: DeploymentTargetName.rehydrate("Primary"),
    providerKey: ProviderKey.rehydrate(overrides.providerKey ?? "generic-ssh"),
    targetKind: TargetKindValue.rehydrate("single-server"),
    host: HostAddress.rehydrate(overrides.host ?? "203.0.113.10"),
    port: PortNumber.rehydrate(overrides.port ?? 22),
    lifecycleStatus: DeploymentTargetLifecycleStatusValue.active(),
    ...(overrides.privateKey
      ? {
          credential: {
            kind: DeploymentTargetCredentialKindValue.rehydrate("ssh-private-key"),
            username: DeploymentTargetUsername.rehydrate(overrides.username ?? "root"),
            privateKey: SshPrivateKeyText.rehydrate(overrides.privateKey),
          },
        }
      : {}),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  }).toState();
}

function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function sshConfig(): {
  host: string;
  port: string;
  privateKeyFile: string;
  privateKeyText: string;
  username: string;
} {
  const host = process.env.APPALOFT_E2E_SSH_HOST;
  const privateKeyFile = expandHome(process.env.APPALOFT_E2E_SSH_PRIVATE_KEY ?? "~/.ssh/appaloft");

  if (!host) {
    throw new Error("APPALOFT_E2E_SSH_HOST is required when APPALOFT_E2E_SSH_CAPACITY_PRUNE=true");
  }

  if (!existsSync(privateKeyFile)) {
    throw new Error(`SSH private key file does not exist: ${privateKeyFile}`);
  }

  return {
    host,
    port: process.env.APPALOFT_E2E_SSH_PORT ?? "22",
    privateKeyFile,
    privateKeyText: readFileSync(privateKeyFile, "utf8"),
    username: process.env.APPALOFT_E2E_SSH_USERNAME ?? "root",
  };
}

function ssh(
  config: ReturnType<typeof sshConfig>,
  command: string,
): {
  exitCode: number;
  stderr: string;
  stdout: string;
} {
  const result = Bun.spawnSync(
    [
      "ssh",
      "-i",
      config.privateKeyFile,
      "-p",
      config.port,
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=accept-new",
      `${config.username}@${config.host}`,
      command,
    ],
    {
      stderr: "pipe",
      stdout: "pipe",
    },
  );

  return {
    exitCode: result.exitCode,
    stderr: (result.stderr ?? new Uint8Array()).toString(),
    stdout: (result.stdout ?? new Uint8Array()).toString(),
  };
}

describe("runtime target capacity prune adapter", () => {
  test("[RT-CAP-PRUNE-004] unsupported provider returns runtime_target_unsupported without mutation", async () => {
    const adapter = new RuntimeTargetCapacityPrunerAdapter("/var/lib/appaloft/runtime");

    const result = await adapter.prune(
      {
        requestId: "req_runtime_capacity_prune_unsupported_test",
        entrypoint: "test",
      },
      {
        server: serverState({ providerKey: "unsupported-provider" }),
        before: "2026-01-01T00:05:00.000Z",
        categories: ["source-workspaces"],
        dryRun: false,
      },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "runtime_target_unsupported",
      details: {
        phase: "runtime-target-capacity-prune",
        serverId: "srv_primary",
        providerKey: "unsupported-provider",
        missingCapability: "runtime.capacity",
      },
    });
  });

  test("[RT-CAP-PRUNE-003] parses skip and exclusion diagnostics without counting them as pruned", () => {
    const result = parseRuntimeTargetCapacityPruneOutput({
      stdout: [
        "APPALOFT_CAPACITY_PRUNE_V1",
        "PRUNE_CANDIDATE\tstopped-containers\tctr_active\tapp_web\t2026-01-01T00:00:00.000Z\t0\tskipped\tactive-runtime",
        "PRUNE_CANDIDATE\tsource-workspaces\tdep_rollback\t/var/lib/appaloft/runtime/ssh-deployments/dep_rollback\t2026-01-01T00:00:00.000Z\t2048\tskipped\trollback-candidate",
        "PRUNE_CANDIDATE\tsource-workspaces\tstate-root\t/var/lib/appaloft/runtime/state\t\t0\texcluded\tstate-root-excluded",
        "PRUNE_CANDIDATE\tsource-workspaces\tvolumes\tdocker-volumes\t\t0\texcluded\tvolume-excluded",
        "PRUNE_CANDIDATE\tpreview-workspaces\tpreview_old\t/var/lib/appaloft/runtime/ssh-deployments/preview_old\t2026-01-01T00:00:00.000Z\t4096\tmatched\t",
        "PRUNE_CANDIDATE\tdocker-build-cache\tdocker-build-cache\tdocker-build-cache\t2026-01-01T00:00:00.000Z\t8192\tmatched\t",
        "PRUNE_CANDIDATE\tunused-images\tdocker-unused-images\tdocker-unused-images\t2026-01-01T00:00:00.000Z\t16384\tmatched\t",
        "PRUNE_CANDIDATE\tremote-state-markers\tstate-root\t/var/lib/appaloft/runtime/state\t\t0\texcluded\tremote-state-excluded",
      ].join("\n"),
      server: serverState(),
      before: "2026-01-01T00:05:00.000Z",
      categories: [
        "stopped-containers",
        "preview-workspaces",
        "source-workspaces",
        "docker-build-cache",
        "unused-images",
        "remote-state-markers",
      ],
      dryRun: true,
      prunedAt: "2026-01-01T00:10:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "servers.capacity.prune/v1",
      dryRun: true,
      summary: {
        inspectedCount: 8,
        matchedCount: 3,
        prunedCount: 0,
        skippedCount: 2,
        excludedCount: 3,
      },
    });
  });

  test("[RT-CAP-PRUNE-002] destructive parse reports reclaimed bytes only for pruned candidates", () => {
    const result = parseRuntimeTargetCapacityPruneOutput({
      stdout: [
        "APPALOFT_CAPACITY_PRUNE_V1",
        "PRUNE_CANDIDATE\tsource-workspaces\tdep_old\t/var/lib/appaloft/runtime/ssh-deployments/dep_old\t2026-01-01T00:00:00.000Z\t4096\tpruned\t",
        "PRUNE_CANDIDATE\tsource-workspaces\tdep_new\t/var/lib/appaloft/runtime/ssh-deployments/dep_new\t2026-01-01T00:06:00.000Z\t8192\tskipped\tcutoff-not-reached",
      ].join("\n"),
      server: serverState(),
      before: "2026-01-01T00:05:00.000Z",
      categories: ["source-workspaces"],
      dryRun: false,
      prunedAt: "2026-01-01T00:10:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      summary: {
        matchedCount: 0,
        prunedCount: 1,
        skippedCount: 1,
        reclaimedBytes: 4096,
      },
    });
  });

  test("[RT-CAP-PRUNE-007] rendered prune script keeps Docker cache and image prune explicit and filtered", () => {
    const script = renderRuntimeTargetCapacityPruneScript({
      runtimeRoot: "/var/lib/appaloft/runtime",
      before: "2026-01-01T00:05:00.000Z",
      categories: ["docker-build-cache", "unused-images"],
      dryRun: true,
    });
    const rendered = ash.render(script);

    expect(rendered).toMatchSnapshot();
    expect(rendered).toContain("APPALOFT_CAPACITY_PRUNE_V1");
    expect(rendered).toContain("docker builder prune --force --filter");
    expect(rendered).toContain("docker image prune --force --filter");
    expect(rendered).toContain("until=$APPALOFT_PRUNE_BEFORE");
    expect(rendered).toContain("state-root-excluded");
    expect(rendered).toContain("volume-excluded");
    expect(rendered).not.toContain("docker volume prune");
    expect(rendered).not.toContain("docker system prune");
    expect(rendered).not.toContain("docker rmi");
  });

  test("[RT-CAP-PRUNE-010] rendered prune script keeps remote-state marker cleanup opt-in and state-root preserving", () => {
    const defaultScript = renderRuntimeTargetCapacityPruneScript({
      runtimeRoot: "/var/lib/appaloft/runtime",
      before: "2026-01-01T00:05:00.000Z",
      categories: ["source-workspaces"],
      dryRun: true,
    });
    const explicitScript = renderRuntimeTargetCapacityPruneScript({
      runtimeRoot: "/var/lib/appaloft/runtime",
      before: "2026-01-01T00:05:00.000Z",
      categories: ["remote-state-markers"],
      dryRun: false,
    });
    const defaultRendered = ash.render(defaultScript);
    const explicitRendered = ash.render(explicitScript);

    expect(explicitRendered).toMatchSnapshot();
    expect(defaultRendered).toContain("if has_category remote-state-markers");
    expect(explicitRendered).toContain('"$APPALOFT_STATE_ROOT"/journals/*.json');
    expect(explicitRendered).toContain('"$APPALOFT_STATE_ROOT"/backups/*');
    expect(explicitRendered).toContain('"$APPALOFT_STATE_ROOT"/recovery/*.json');
    expect(explicitRendered).toContain('"$APPALOFT_STATE_ROOT"/locks/recovered/*');
    expect(explicitRendered).toContain("remote-state-excluded");
    expect(explicitRendered).toContain('rm -f "$marker"');
    expect(explicitRendered).toContain('rm -rf "$marker"');
    expect(explicitRendered).not.toContain('rm -rf "$APPALOFT_STATE_ROOT"');
    expect(explicitRendered).not.toContain("pglite");
  });

  test("[RT-CAP-PRUNE-012] target filter limits dry-run output and destructive matching", () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "appaloft-capacity-prune-target-"));
    const sourceRoot = join(runtimeRoot, "ssh-deployments");
    const keepWorkspace = join(sourceRoot, "dep_keep");
    const targetWorkspace = join(sourceRoot, "dep_target");
    mkdirSync(keepWorkspace, { recursive: true });
    mkdirSync(targetWorkspace, { recursive: true });
    writeFileSync(join(keepWorkspace, "artifact.txt"), "keep\n");
    writeFileSync(join(targetWorkspace, "artifact.txt"), "target\n");

    try {
      const dryRunScript = renderRuntimeTargetCapacityPruneScript({
        runtimeRoot,
        before: "2099-01-01T00:00:00.000Z",
        categories: ["source-workspaces"],
        target: "dep_target",
        dryRun: true,
      });
      const dryRunOutput = ash.execute(dryRunScript);
      const dryRun = parseRuntimeTargetCapacityPruneOutput({
        stdout: dryRunOutput.stdout,
        stderr: dryRunOutput.stderr,
        server: serverState(),
        before: "2099-01-01T00:00:00.000Z",
        categories: ["source-workspaces"],
        dryRun: true,
        prunedAt: "2026-01-01T00:10:00.000Z",
      });

      expect(dryRun.isOk()).toBe(true);
      expect(dryRun._unsafeUnwrap()).toMatchObject({
        summary: {
          inspectedCount: 1,
          matchedCount: 1,
        },
        candidates: [expect.objectContaining({ id: "dep_target", action: "matched" })],
      });
      expect(existsSync(keepWorkspace)).toBe(true);
      expect(existsSync(targetWorkspace)).toBe(true);

      const destructiveScript = renderRuntimeTargetCapacityPruneScript({
        runtimeRoot,
        before: "2099-01-01T00:00:00.000Z",
        categories: ["source-workspaces"],
        target: targetWorkspace,
        dryRun: false,
      });
      const destructiveOutput = ash.execute(destructiveScript);
      const destructive = parseRuntimeTargetCapacityPruneOutput({
        stdout: destructiveOutput.stdout,
        stderr: destructiveOutput.stderr,
        server: serverState(),
        before: "2099-01-01T00:00:00.000Z",
        categories: ["source-workspaces"],
        dryRun: false,
        prunedAt: "2026-01-01T00:10:00.000Z",
      });

      expect(destructive.isOk()).toBe(true);
      expect(destructive._unsafeUnwrap()).toMatchObject({
        summary: {
          inspectedCount: 1,
          prunedCount: 1,
        },
        candidates: [expect.objectContaining({ id: "dep_target", action: "pruned" })],
      });
      expect(existsSync(keepWorkspace)).toBe(true);
      expect(existsSync(targetWorkspace)).toBe(false);
    } finally {
      rmSync(runtimeRoot, { recursive: true, force: true });
    }
  });

  test("[RT-CAP-PRUNE-011] remote-state marker dry-run output is bounded and reports estimated reclaimable bytes", () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "appaloft-capacity-prune-markers-"));
    const stateRoot = join(runtimeRoot, "state");
    const backupsRoot = join(stateRoot, "backups");
    mkdirSync(backupsRoot, { recursive: true });
    for (let index = 0; index < 205; index += 1) {
      const marker = join(backupsRoot, `sync-20260101000000-${String(index).padStart(3, "0")}`);
      mkdirSync(marker, { recursive: true });
      writeFileSync(join(marker, "backup.txt"), "backup marker\n");
    }

    try {
      const script = renderRuntimeTargetCapacityPruneScript({
        runtimeRoot,
        before: "2099-01-01T00:00:00.000Z",
        categories: ["remote-state-markers"],
        dryRun: true,
      });
      const output = ash.execute(script);

      expect(output.exitCode).toBe(0);
      const parsed = parseRuntimeTargetCapacityPruneOutput({
        stdout: output.stdout,
        stderr: output.stderr,
        server: serverState(),
        before: "2099-01-01T00:00:00.000Z",
        categories: ["remote-state-markers"],
        dryRun: true,
        prunedAt: "2026-01-01T00:10:00.000Z",
      });

      expect(parsed.isOk()).toBe(true);
      const result = parsed._unsafeUnwrap();
      expect(result.candidates).toHaveLength(200);
      expect(result.summary).toMatchObject({
        inspectedCount: 208,
        matchedCount: 205,
        prunedCount: 0,
        excludedCount: 3,
        reportedCandidateCount: 200,
        omittedCandidateCount: 8,
        outputLimit: 200,
      });
      expect(result.summary.reclaimedBytes).toBeGreaterThan(0);
      expect(result.candidates.every((candidate) => candidate.target.includes("sync-"))).toBe(true);
    } finally {
      rmSync(runtimeRoot, { recursive: true, force: true });
    }
  });

  test("[RT-CAP-REMOTE-STATE-002] remote-state marker prune preserves live standalone PGlite state", () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "appaloft-capacity-prune-live-state-"));
    const stateRoot = join(runtimeRoot, "state");
    const backupRoot = join(stateRoot, "backups", "sync-20260101000000-old");
    const pgliteRoot = join(stateRoot, "pglite");
    const sourceLinksRoot = join(stateRoot, "source-links");
    const routesRoot = join(stateRoot, "server-applied-routes");

    mkdirSync(backupRoot, { recursive: true });
    mkdirSync(pgliteRoot, { recursive: true });
    mkdirSync(sourceLinksRoot, { recursive: true });
    mkdirSync(routesRoot, { recursive: true });
    writeFileSync(join(backupRoot, "backup.txt"), "old sync backup\n");
    writeFileSync(join(pgliteRoot, "live.txt"), "standalone ssh pglite state\n");
    writeFileSync(join(sourceLinksRoot, "link.json"), "{}\n");
    writeFileSync(join(routesRoot, "route.json"), "{}\n");
    writeFileSync(join(stateRoot, "sync-revision.txt"), "7\n");

    try {
      const script = renderRuntimeTargetCapacityPruneScript({
        runtimeRoot,
        before: "2099-01-01T00:00:00.000Z",
        categories: ["remote-state-markers"],
        dryRun: false,
      });
      const output = ash.execute(script);

      expect(output.exitCode).toBe(0);
      const parsed = parseRuntimeTargetCapacityPruneOutput({
        stdout: output.stdout,
        stderr: output.stderr,
        server: serverState(),
        before: "2099-01-01T00:00:00.000Z",
        categories: ["remote-state-markers"],
        dryRun: false,
        prunedAt: "2026-01-01T00:10:00.000Z",
      });

      expect(parsed.isOk()).toBe(true);
      expect(existsSync(backupRoot)).toBe(false);
      expect(readFileSync(join(pgliteRoot, "live.txt"), "utf8")).toBe(
        "standalone ssh pglite state\n",
      );
      expect(readFileSync(join(sourceLinksRoot, "link.json"), "utf8")).toBe("{}\n");
      expect(readFileSync(join(routesRoot, "route.json"), "utf8")).toBe("{}\n");
      expect(readFileSync(join(stateRoot, "sync-revision.txt"), "utf8")).toBe("7\n");
    } finally {
      rmSync(runtimeRoot, { recursive: true, force: true });
    }
  });

  if (!localCapacityPruneEnabled) {
    test.skip("[RT-CAP-PRUNE-008] local explicit real local target prune requires APPALOFT_E2E_CAPACITY_PRUNE_LOCAL=true", () => {});
  } else {
    test("[RT-CAP-PRUNE-008] runs dry-run-first scoped prune against a real local runtime root", async () => {
      const runtimeRoot = mkdtempSync(join(tmpdir(), "appaloft-capacity-prune-"));
      const workspace = join(runtimeRoot, "ssh-deployments", "preview_capacity_prune_smoke");
      mkdirSync(workspace, { recursive: true });
      writeFileSync(join(workspace, "artifact.txt"), "preview artifact\n");

      const adapter = new RuntimeTargetCapacityPrunerAdapter(runtimeRoot);
      try {
        const dryRun = await adapter.prune(
          {
            requestId: "req_capacity_prune_real_local_dry_run",
            entrypoint: "test",
          },
          {
            server: serverState({ providerKey: "local-shell" }),
            before: "2099-01-01T00:00:00.000Z",
            categories: ["preview-workspaces"],
            dryRun: true,
          },
        );

        expect(dryRun.isOk()).toBe(true);
        expect(dryRun._unsafeUnwrap()).toMatchObject({
          dryRun: true,
          summary: {
            matchedCount: 1,
            prunedCount: 0,
          },
          candidates: expect.arrayContaining([
            expect.objectContaining({ action: "matched", target: workspace }),
          ]),
        });
        expect(existsSync(workspace)).toBe(true);

        const destructive = await adapter.prune(
          {
            requestId: "req_capacity_prune_real_local_destructive",
            entrypoint: "test",
          },
          {
            server: serverState({ providerKey: "local-shell" }),
            before: "2099-01-01T00:00:00.000Z",
            categories: ["preview-workspaces"],
            dryRun: false,
          },
        );

        expect(destructive.isOk()).toBe(true);
        expect(destructive._unsafeUnwrap()).toMatchObject({
          dryRun: false,
          summary: {
            matchedCount: 0,
            prunedCount: 1,
          },
          candidates: expect.arrayContaining([
            expect.objectContaining({ action: "pruned", target: workspace }),
          ]),
        });
        expect(existsSync(workspace)).toBe(false);
      } finally {
        rmSync(runtimeRoot, { recursive: true, force: true });
      }
    }, 120000);
  }

  if (!sshCapacityPruneEnabled) {
    test.skip("[RT-CAP-PRUNE-009] local explicit real SSH target prune requires APPALOFT_E2E_SSH_CAPACITY_PRUNE=true", () => {});
  } else {
    test("[RT-CAP-PRUNE-009] runs dry-run-first scoped prune against a real generic-SSH runtime root", async () => {
      const config = sshConfig();
      const remoteRoot = `/tmp/appaloft-capacity-prune-${Date.now()}`;
      const workspace = `${remoteRoot}/ssh-deployments/preview_capacity_prune_ssh`;
      const prepared = ssh(
        config,
        `mkdir -p ${shellQuote(workspace)} && printf '%s\\n' preview > ${shellQuote(
          `${workspace}/artifact.txt`,
        )}`,
      );
      expect(prepared.exitCode, prepared.stderr).toBe(0);

      const adapter = new RuntimeTargetCapacityPrunerAdapter(
        "/var/lib/appaloft/runtime",
        remoteRoot,
      );
      const server = serverState({
        host: config.host,
        port: Number(config.port),
        privateKey: config.privateKeyText,
        providerKey: "generic-ssh",
        username: config.username,
      });

      try {
        const dryRun = await adapter.prune(
          {
            requestId: "req_capacity_prune_real_ssh_dry_run",
            entrypoint: "test",
          },
          {
            server,
            before: "2099-01-01T00:00:00.000Z",
            categories: ["preview-workspaces"],
            dryRun: true,
          },
        );

        expect(dryRun.isOk()).toBe(true);
        expect(dryRun._unsafeUnwrap()).toMatchObject({
          dryRun: true,
          summary: {
            matchedCount: 1,
            prunedCount: 0,
          },
          candidates: expect.arrayContaining([
            expect.objectContaining({ action: "matched", target: workspace }),
          ]),
        });
        expect(ssh(config, `test -d ${shellQuote(workspace)}`).exitCode).toBe(0);

        const destructive = await adapter.prune(
          {
            requestId: "req_capacity_prune_real_ssh_destructive",
            entrypoint: "test",
          },
          {
            server,
            before: "2099-01-01T00:00:00.000Z",
            categories: ["preview-workspaces"],
            dryRun: false,
          },
        );

        expect(destructive.isOk()).toBe(true);
        expect(destructive._unsafeUnwrap()).toMatchObject({
          dryRun: false,
          summary: {
            matchedCount: 0,
            prunedCount: 1,
          },
          candidates: expect.arrayContaining([
            expect.objectContaining({ action: "pruned", target: workspace }),
          ]),
        });
        expect(ssh(config, `test ! -d ${shellQuote(workspace)}`).exitCode).toBe(0);
      } finally {
        ssh(config, `rm -rf ${shellQuote(remoteRoot)}`);
      }
    }, 120000);
  }
});
