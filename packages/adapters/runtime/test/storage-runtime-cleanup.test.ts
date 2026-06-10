import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
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
  EnvironmentId,
  HostAddress,
  PortNumber,
  ProjectId,
  ProviderKey,
  type Result,
  SshPrivateKeyText,
  StorageBindSourcePath,
  StorageVolume,
  StorageVolumeId,
  StorageVolumeKindValue,
  StorageVolumeName,
  StorageVolumeSlug,
  TargetKindValue,
} from "@appaloft/core";

import {
  parseStorageRuntimeCleanupOutput,
  renderStorageRuntimeCleanupScript,
  StorageRuntimeCleanerAdapter,
} from "../src/storage-runtime-cleanup";

function unwrap<T>(result: Result<T>): T {
  expect(result.isOk()).toBe(true);
  return result._unsafeUnwrap();
}

const localDockerCleanupEnabled = process.env.APPALOFT_E2E_STORAGE_CLEANUP_DOCKER === "true";
const sshDockerCleanupEnabled = process.env.APPALOFT_E2E_SSH_STORAGE_CLEANUP_DOCKER === "true";

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
    id: DeploymentTargetId.rehydrate("srv_primary"),
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

function storageVolumeState(
  kind: "named-volume" | "bind-mount" = "named-volume",
  id = "stv_data",
) {
  return unwrap(
    StorageVolume.create({
      id: StorageVolumeId.rehydrate(id),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      name: StorageVolumeName.rehydrate("Data"),
      slug: StorageVolumeSlug.rehydrate("data"),
      kind: StorageVolumeKindValue.rehydrate(kind),
      ...(kind === "bind-mount"
        ? { sourcePath: StorageBindSourcePath.rehydrate("/srv/appaloft/data") }
        : {}),
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    }),
  ).toState();
}

function docker(args: readonly string[]) {
  let result: ReturnType<typeof Bun.spawnSync>;
  try {
    result = Bun.spawnSync(["docker", ...args], {
      stderr: "pipe",
      stdout: "pipe",
    });
  } catch (error) {
    return {
      exitCode: 127,
      stderr: error instanceof Error ? error.message : String(error),
      stdout: "",
    };
  }

  return {
    exitCode: result.exitCode,
    stderr: (result.stderr ?? new Uint8Array()).toString(),
    stdout: (result.stdout ?? new Uint8Array()).toString(),
  };
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
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
    throw new Error("APPALOFT_E2E_SSH_HOST is required when APPALOFT_E2E_SSH_STORAGE_CLEANUP_DOCKER=true");
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

describe("storage runtime cleanup adapter", () => {
  test("[STOR-CLEANUP-001][STOR-CLEANUP-002] renders scoped Docker cleanup without broad prune", () => {
    const script = ash.render(renderStorageRuntimeCleanupScript({
      storageVolumeId: "stv_data",
      storageVolumeKind: "named-volume",
      volumeName: "appaloft-stv_data",
      before: "2026-01-01T00:05:00.000Z",
      dryRun: false,
      activeAttachmentCount: 0,
      backupRetentionRequired: false,
      backupRestoreInFlightCount: 0,
      retainedSnapshotCount: 0,
      rollbackCandidateCount: 0,
    }));

    expect(script).toMatchSnapshot();
    expect(script).toContain("APPALOFT_STORAGE_CLEANUP_V1");
    expect(script).toContain('docker volume rm "$APPALOFT_DOCKER_VOLUME_NAME"');
    expect(script).toContain('docker ps -q --filter "volume=$APPALOFT_DOCKER_VOLUME_NAME"');
    expect(script).toContain('{{ index .Labels "appaloft.storage-volume-id" }}');
    expect(script).toContain("ownership-unproven");
    expect(script).not.toContain("docker volume prune");
    expect(script).not.toContain("docker system prune");
  });

  test("[STOR-CLEANUP-001][STOR-CLEANUP-002][STOR-CLEANUP-003] parses matched cleaned and blocked cleanup output", () => {
    const result = parseStorageRuntimeCleanupOutput({
      stdout: [
        "APPALOFT_STORAGE_CLEANUP_V1",
        "STORAGE_CLEANUP_CANDIDATE\tappaloft-stv_data\tnamed-volume\tappaloft-stv_data\t2026-01-01T00:00:00.000Z\tmatched\t",
        "STORAGE_CLEANUP_CANDIDATE\tappaloft-stv_old\tnamed-volume\tappaloft-stv_old\t2026-01-01T00:00:00.000Z\tcleaned\t",
        "STORAGE_CLEANUP_CANDIDATE\tappaloft-stv_active\tnamed-volume\tappaloft-stv_active\t2026-01-01T00:00:00.000Z\tblocked\tactive-runtime",
        "STORAGE_CLEANUP_WARNING\tdocker-warning\tDocker returned a warning",
      ].join("\n"),
      server: serverState(),
      storageVolume: storageVolumeState(),
      before: "2026-01-01T00:05:00.000Z",
      dryRun: false,
      cleanedAt: "2026-01-01T00:10:00.000Z",
      timedOut: false,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "storage-volumes.cleanup-runtime/v1",
      dryRun: false,
      summary: {
        inspectedCount: 3,
        matchedCount: 1,
        cleanedCount: 1,
        blockedCount: 1,
      },
      candidates: [
        expect.objectContaining({ action: "matched" }),
        expect.objectContaining({ action: "cleaned" }),
        expect.objectContaining({ action: "blocked", blockedReason: "active-runtime" }),
      ],
      warnings: [expect.objectContaining({ code: "docker-warning" })],
    });
  });

  test("[STOR-CLEANUP-004] bind-mount cleanup is diagnostic only", () => {
    const script = ash.render(renderStorageRuntimeCleanupScript({
      storageVolumeId: "stv_bind",
      storageVolumeKind: "bind-mount",
      volumeName: "appaloft-stv_bind",
      before: "2026-01-01T00:05:00.000Z",
      dryRun: false,
      activeAttachmentCount: 0,
      backupRetentionRequired: false,
      backupRestoreInFlightCount: 0,
      retainedSnapshotCount: 0,
      rollbackCandidateCount: 0,
    }));

    expect(script).toContain("bind-mount-unsupported");
    expect(script.indexOf("bind-mount-unsupported")).toBeLessThan(
      script.indexOf("command -v docker"),
    );
  });

  test("[STOR-CLEANUP-004] parses bind-mount cleanup as a stable blocked candidate", () => {
    const result = parseStorageRuntimeCleanupOutput({
      stdout: [
        "APPALOFT_STORAGE_CLEANUP_V1",
        "STORAGE_CLEANUP_CANDIDATE\tstv_bind\tbind-mount\tstv_bind\t\tblocked\tbind-mount-unsupported",
      ].join("\n"),
      server: serverState(),
      storageVolume: storageVolumeState("bind-mount"),
      before: "2026-01-01T00:05:00.000Z",
      dryRun: false,
      cleanedAt: "2026-01-01T00:10:00.000Z",
      timedOut: false,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      storageVolume: { kind: "bind-mount" },
      summary: { inspectedCount: 1, blockedCount: 1, cleanedCount: 0 },
      candidates: [
        {
          id: "stv_bind",
          kind: "bind-mount",
          target: "stv_bind",
          updatedAt: null,
          action: "blocked",
          blockedReason: "bind-mount-unsupported",
        },
      ],
    });
  });

  test("[STOR-CLEANUP-003] retained snapshots and rollback candidates block cleanup in the target script", () => {
    const retainedSnapshotScript = ash.render(renderStorageRuntimeCleanupScript({
      storageVolumeId: "stv_data",
      storageVolumeKind: "named-volume",
      volumeName: "appaloft-stv_data",
      before: "2026-01-01T00:05:00.000Z",
      dryRun: false,
      activeAttachmentCount: 0,
      backupRetentionRequired: false,
      backupRestoreInFlightCount: 0,
      retainedSnapshotCount: 1,
      rollbackCandidateCount: 0,
    }));
    const rollbackCandidateScript = ash.render(renderStorageRuntimeCleanupScript({
      storageVolumeId: "stv_data",
      storageVolumeKind: "named-volume",
      volumeName: "appaloft-stv_data",
      before: "2026-01-01T00:05:00.000Z",
      dryRun: false,
      activeAttachmentCount: 0,
      backupRetentionRequired: false,
      backupRestoreInFlightCount: 0,
      retainedSnapshotCount: 0,
      rollbackCandidateCount: 1,
    }));

    expect(retainedSnapshotScript).toContain("APPALOFT_STORAGE_RETAINED_SNAPSHOT_COUNT='1'");
    expect(retainedSnapshotScript).toContain("blocked retained-snapshot");
    expect(rollbackCandidateScript).toContain("APPALOFT_STORAGE_ROLLBACK_CANDIDATE_COUNT='1'");
    expect(rollbackCandidateScript).toContain("blocked rollback-candidate");
  });

  test("[STOR-CLEANUP-003] in-flight storage backup or restore blocks cleanup in the target script", () => {
    const script = ash.render(renderStorageRuntimeCleanupScript({
      storageVolumeId: "stv_data",
      storageVolumeKind: "named-volume",
      volumeName: "appaloft-stv_data",
      before: "2026-01-01T00:05:00.000Z",
      dryRun: false,
      activeAttachmentCount: 0,
      backupRetentionRequired: false,
      backupRestoreInFlightCount: 2,
      retainedSnapshotCount: 0,
      rollbackCandidateCount: 0,
    }));

    expect(script).toContain("APPALOFT_STORAGE_BACKUP_RESTORE_IN_FLIGHT_COUNT='2'");
    expect(script).toContain("blocked backup-restore-in-flight");
  });

  test("[STOR-CLEANUP-002] ownership labels are required before named volume cleanup", () => {
    const script = ash.render(renderStorageRuntimeCleanupScript({
      storageVolumeId: "stv_data",
      storageVolumeKind: "named-volume",
      volumeName: "appaloft-stv_data",
      before: "2026-01-01T00:05:00.000Z",
      dryRun: false,
      activeAttachmentCount: 0,
      backupRetentionRequired: false,
      backupRestoreInFlightCount: 0,
      retainedSnapshotCount: 0,
      rollbackCandidateCount: 0,
    }));

    expect(script.indexOf("ownership-unproven")).toBeLessThan(script.indexOf("active_container="));
    expect(script).toContain('[ "$volume_storage_id" != "$APPALOFT_STORAGE_VOLUME_ID" ]');
    expect(script).toContain('[ "$volume_managed" != "true" ]');
  });

  test("[STOR-CLEANUP-004] executes bind-mount diagnostic path through ash", () => {
    const script = renderStorageRuntimeCleanupScript({
      storageVolumeId: "stv_bind",
      storageVolumeKind: "bind-mount",
      volumeName: "appaloft-stv_bind",
      before: "2026-01-01T00:05:00.000Z",
      dryRun: false,
      activeAttachmentCount: 0,
      backupRetentionRequired: false,
      backupRestoreInFlightCount: 0,
      retainedSnapshotCount: 0,
      rollbackCandidateCount: 0,
    });

    const result = ash.execute(script);

    expect(result.success, result.stderr).toBe(true);
    expect(result.stdout).toContain("APPALOFT_STORAGE_CLEANUP_V1");
    expect(result.stdout).toContain(
      "STORAGE_CLEANUP_CANDIDATE\tstv_bind\tbind-mount\tstv_bind\t\tblocked\tbind-mount-unsupported",
    );
  });

  test("[STOR-CLEANUP-003] unsupported providers return runtime_target_unsupported before mutation", async () => {
    const adapter = new StorageRuntimeCleanerAdapter("/var/lib/appaloft/runtime");

    const result = await adapter.cleanup(
      {
        requestId: "req_storage_cleanup_adapter_test",
        entrypoint: "test",
      },
      {
        server: serverState({ providerKey: "unsupported-provider" }),
        storageVolume: storageVolumeState(),
        before: "2026-01-01T00:05:00.000Z",
        dryRun: false,
        safetyEvidence: {
          activeAttachmentCount: 0,
          backupRetentionRequired: false,
          backupRestoreInFlightCount: 0,
          retainedSnapshotCount: 0,
          rollbackCandidateCount: 0,
        },
      },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "runtime_target_unsupported",
      details: {
        phase: "storage-runtime-cleanup",
        serverId: "srv_primary",
        providerKey: "unsupported-provider",
        missingCapability: "storage.runtime-cleanup",
      },
    });
  });

  if (!localDockerCleanupEnabled) {
    test.skip("[STOR-CLEANUP-006] local explicit real local Docker cleanup requires APPALOFT_E2E_STORAGE_CLEANUP_DOCKER=true", () => {});
  } else {
    test("[STOR-CLEANUP-006] runs dry-run-first cleanup against a real local Docker named volume", async () => {
      const dockerVersion = docker(["version", "--format", "{{.Server.Version}}"]);
      expect(dockerVersion.exitCode, dockerVersion.stderr).toBe(0);

      const storageVolumeId = "stv_real_cleanup";
      const volumeName = `appaloft-${storageVolumeId}`;
      docker(["volume", "rm", "-f", volumeName]);
      const created = docker([
        "volume",
        "create",
        "--label",
        "appaloft.managed=true",
        "--label",
        `appaloft.storage-volume-id=${storageVolumeId}`,
        "--label",
        "appaloft.storage-volume-kind=named-volume",
        "--label",
        "appaloft.storage-runtime-realized-by=deployment-execution",
        volumeName,
      ]);
      expect(created.exitCode, created.stderr).toBe(0);

      const adapter = new StorageRuntimeCleanerAdapter("/var/lib/appaloft/runtime");
      try {
        const dryRun = await adapter.cleanup(
          {
            requestId: "req_storage_cleanup_real_local_dry_run",
            entrypoint: "test",
          },
          {
            server: serverState({ providerKey: "local-shell" }),
            storageVolume: storageVolumeState("named-volume", storageVolumeId),
            before: "2099-01-01T00:00:00.000Z",
            dryRun: true,
            safetyEvidence: {
              activeAttachmentCount: 0,
              backupRetentionRequired: false,
              backupRestoreInFlightCount: 0,
              retainedSnapshotCount: 0,
              rollbackCandidateCount: 0,
            },
          },
        );
        expect(dryRun.isOk()).toBe(true);
        expect(dryRun._unsafeUnwrap()).toMatchObject({
          dryRun: true,
          summary: {
            matchedCount: 1,
            cleanedCount: 0,
          },
          candidates: [expect.objectContaining({ action: "matched", target: volumeName })],
        });
        expect(docker(["volume", "inspect", volumeName]).exitCode).toBe(0);

        const destructive = await adapter.cleanup(
          {
            requestId: "req_storage_cleanup_real_local_destructive",
            entrypoint: "test",
          },
          {
            server: serverState({ providerKey: "local-shell" }),
            storageVolume: storageVolumeState("named-volume", storageVolumeId),
            before: "2099-01-01T00:00:00.000Z",
            dryRun: false,
            safetyEvidence: {
              activeAttachmentCount: 0,
              backupRetentionRequired: false,
              backupRestoreInFlightCount: 0,
              retainedSnapshotCount: 0,
              rollbackCandidateCount: 0,
            },
          },
        );
        expect(destructive.isOk()).toBe(true);
        expect(destructive._unsafeUnwrap()).toMatchObject({
          dryRun: false,
          summary: {
            matchedCount: 0,
            cleanedCount: 1,
          },
          candidates: [expect.objectContaining({ action: "cleaned", target: volumeName })],
        });
        expect(docker(["volume", "inspect", volumeName]).exitCode).not.toBe(0);
      } finally {
        docker(["volume", "rm", "-f", volumeName]);
      }
    }, 120000);
  }

  if (!sshDockerCleanupEnabled) {
    test.skip("[STOR-CLEANUP-007] local explicit real SSH Docker cleanup requires APPALOFT_E2E_SSH_STORAGE_CLEANUP_DOCKER=true", () => {});
  } else {
    test("[STOR-CLEANUP-007] runs dry-run-first cleanup against a real generic-SSH Docker named volume", async () => {
      const config = sshConfig();
      const dockerVersion = ssh(config, "docker version --format '{{.Server.Version}}'");
      expect(dockerVersion.exitCode, dockerVersion.stderr).toBe(0);

      const storageVolumeId = "stv_real_ssh_cleanup";
      const volumeName = `appaloft-${storageVolumeId}`;
      ssh(config, `docker volume rm -f ${shellQuote(volumeName)} >/dev/null 2>&1 || true`);
      const created = ssh(
        config,
        [
          "docker volume create",
          "--label",
          shellQuote("appaloft.managed=true"),
          "--label",
          shellQuote(`appaloft.storage-volume-id=${storageVolumeId}`),
          "--label",
          shellQuote("appaloft.storage-volume-kind=named-volume"),
          "--label",
          shellQuote("appaloft.storage-runtime-realized-by=deployment-execution"),
          shellQuote(volumeName),
        ].join(" "),
      );
      expect(created.exitCode, created.stderr).toBe(0);

      const adapter = new StorageRuntimeCleanerAdapter("/var/lib/appaloft/runtime");
      const server = serverState({
        host: config.host,
        port: Number(config.port),
        privateKey: config.privateKeyText,
        providerKey: "generic-ssh",
        username: config.username,
      });
      try {
        const dryRun = await adapter.cleanup(
          {
            requestId: "req_storage_cleanup_real_ssh_dry_run",
            entrypoint: "test",
          },
          {
            server,
            storageVolume: storageVolumeState("named-volume", storageVolumeId),
            before: "2099-01-01T00:00:00.000Z",
            dryRun: true,
            safetyEvidence: {
              activeAttachmentCount: 0,
              backupRetentionRequired: false,
              backupRestoreInFlightCount: 0,
              retainedSnapshotCount: 0,
              rollbackCandidateCount: 0,
            },
          },
        );
        expect(dryRun.isOk()).toBe(true);
        expect(dryRun._unsafeUnwrap()).toMatchObject({
          dryRun: true,
          summary: {
            matchedCount: 1,
            cleanedCount: 0,
          },
          candidates: [expect.objectContaining({ action: "matched", target: volumeName })],
        });
        expect(ssh(config, `docker volume inspect ${shellQuote(volumeName)} >/dev/null`).exitCode).toBe(0);

        const destructive = await adapter.cleanup(
          {
            requestId: "req_storage_cleanup_real_ssh_destructive",
            entrypoint: "test",
          },
          {
            server,
            storageVolume: storageVolumeState("named-volume", storageVolumeId),
            before: "2099-01-01T00:00:00.000Z",
            dryRun: false,
            safetyEvidence: {
              activeAttachmentCount: 0,
              backupRetentionRequired: false,
              backupRestoreInFlightCount: 0,
              retainedSnapshotCount: 0,
              rollbackCandidateCount: 0,
            },
          },
        );
        expect(destructive.isOk()).toBe(true);
        expect(destructive._unsafeUnwrap()).toMatchObject({
          dryRun: false,
          summary: {
            matchedCount: 0,
            cleanedCount: 1,
          },
          candidates: [expect.objectContaining({ action: "cleaned", target: volumeName })],
        });
        expect(ssh(config, `docker volume inspect ${shellQuote(volumeName)} >/dev/null`).exitCode).not.toBe(
          0,
        );
      } finally {
        ssh(config, `docker volume rm -f ${shellQuote(volumeName)} >/dev/null 2>&1 || true`);
      }
    }, 120000);
  }
});
