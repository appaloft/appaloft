import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { ash, type AshScript } from "@appaloft/ash";
import { type StorageBackupObjectTransferBrokerPort } from "@appaloft/application";
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
  TargetKindValue,
} from "@appaloft/core";

import {
  DockerSqliteOnlineStorageBackupSourceAdapter,
  DockerTarStorageBackupSourceAdapter,
  LocalFilesystemStorageBackupTargetProvider,
  S3CompatibleStorageBackupTargetProvider,
  renderDockerVolumeTarBackupScript,
  renderDockerVolumeSqliteOnlineBackupScript,
  renderLocalFilesystemRestoreBackupScript,
  renderLocalFilesystemStoreBackupScript,
  renderS3CompatibleRestoreBackupScript,
  renderS3CompatibleStoreBackupScript,
  RuntimeStorageBackupProviderRegistry,
  type StorageBackupRuntimeCommandRenderer,
} from "../src/storage-volume-backup-provider";

const localDockerBackupEnabled = process.env.APPALOFT_E2E_STORAGE_BACKUP_DOCKER === "true";
const sshDockerBackupEnabled = process.env.APPALOFT_E2E_SSH_STORAGE_BACKUP_DOCKER === "true";

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
    id: DeploymentTargetId.rehydrate("srv_backup"),
    name: DeploymentTargetName.rehydrate("Backup target"),
    providerKey: ProviderKey.rehydrate(overrides.providerKey ?? "local-shell"),
    targetKind: TargetKindValue.rehydrate("single-server"),
    host: HostAddress.rehydrate(overrides.host ?? "127.0.0.1"),
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

function seedPocketBaseSqliteFile(path: string): void {
  const db = new Database(path);
  try {
    db.exec("CREATE TABLE records (id TEXT PRIMARY KEY, title TEXT NOT NULL)");
    db.query("INSERT INTO records (id, title) VALUES (?, ?)").run(
      "rec_pocketbase",
      "PocketBase survives restore",
    );
  } finally {
    db.close();
  }
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
    throw new Error(
      "APPALOFT_E2E_SSH_HOST is required when APPALOFT_E2E_SSH_STORAGE_BACKUP_DOCKER=true",
    );
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

function sqliteRecordTitle(path: string): string | null {
  const db = new Database(path, { readonly: true });
  try {
    const row = db.query("SELECT title FROM records WHERE id = ?").get("rec_pocketbase") as
      | { title: string }
      | null;
    return row?.title ?? null;
  } finally {
    db.close();
  }
}

class FakeDialectRenderer implements StorageBackupRuntimeCommandRenderer {
  readonly key = "fake-runtime-dialect";
  readonly calls: string[] = [];

  constructor(
    private readonly failS3Store = false,
    private readonly failSqliteSource = false,
  ) {}

  renderDockerVolumeTarBackup(): AshScript {
    this.calls.push("tar-source");
    return ash`
      ${ash.raw(`printf 'APPALOFT_STORAGE_BACKUP_SOURCE_V1\\n'
      printf 'STORAGE_BACKUP_SOURCE\\t/tmp/fake.tar.gz\\t42\\tfake-checksum\\n'`)}
    `;
  }

  renderDockerVolumeSqliteOnlineBackup(): AshScript {
    this.calls.push("sqlite-source");
    if (this.failSqliteSource) {
      return ash`
        ${ash.raw(`printf 'APPALOFT_STORAGE_BACKUP_SOURCE_V1\n'
        printf 'STORAGE_BACKUP_ERROR\tworking-root-unwritable\tbackup working root is not writable\n'
        exit 1`)}
      `;
    }
    return ash`
      ${ash.raw(`printf 'APPALOFT_STORAGE_BACKUP_SOURCE_V1\\n'
      printf 'STORAGE_BACKUP_SOURCE\\t/tmp/fake.sqlite.tar.gz\\t43\\tfake-sqlite-checksum\\n'`)}
    `;
  }

  renderLocalFilesystemStoreBackup(): AshScript {
    this.calls.push("store-target");
    return ash`
      ${ash.raw(`printf 'APPALOFT_STORAGE_BACKUP_TARGET_V1\\n'
      printf 'STORAGE_BACKUP_ARTIFACT\\t/tmp/fake-artifact.tar.gz\\t44\\tfake-artifact-checksum\\n'`)}
    `;
  }

  renderLocalFilesystemRestoreBackup(): AshScript {
    this.calls.push("restore-target");
    return ash`
      ${ash.raw(`printf 'APPALOFT_STORAGE_RESTORE_TARGET_V1\\n'
      printf 'STORAGE_RESTORE_COMPLETED\\tappaloft-stv_fake_restore\\n'`)}
    `;
  }

  renderS3CompatibleStoreBackup(
    input: Parameters<StorageBackupRuntimeCommandRenderer["renderS3CompatibleStoreBackup"]>[0],
  ): AshScript {
    this.calls.push("s3-store-target");
    if (this.failS3Store) {
      return ash`
        ${ash.env("FAKE_SIGNED_UPLOAD_URL", input.uploadUrl)}
        ${ash.raw(`printf '%s\\n' "$FAKE_SIGNED_UPLOAD_URL" >&2
        exit 1`)}
      `;
    }
    return ash`
      ${ash.raw(`printf 'APPALOFT_STORAGE_BACKUP_TARGET_V1\\n'
      printf 'STORAGE_BACKUP_ARTIFACT\\ts3-compatible://backups/storage-volume/svb_fake.tar.gz\\t45\\tfake-s3-checksum\\n'`)}
    `;
  }

  renderS3CompatibleRestoreBackup(): AshScript {
    this.calls.push("s3-restore-target");
    return ash`
      ${ash.raw(`printf 'APPALOFT_STORAGE_RESTORE_TARGET_V1\\n'
      printf 'STORAGE_RESTORE_COMPLETED\\tappaloft-stv_fake_restore\\n'`)}
    `;
  }
}

class FakeObjectTransferBroker implements StorageBackupObjectTransferBrokerPort {
  readonly uploads: Parameters<StorageBackupObjectTransferBrokerPort["authorizeUpload"]>[0][] = [];
  readonly downloads: Parameters<StorageBackupObjectTransferBrokerPort["authorizeDownload"]>[0][] = [];
  readonly deletes: Parameters<StorageBackupObjectTransferBrokerPort["deleteObject"]>[0][] = [];

  async authorizeUpload(
    input: Parameters<StorageBackupObjectTransferBrokerPort["authorizeUpload"]>[0],
  ) {
    this.uploads.push(input);
    return ok({
      url: "https://objects.example.test/backups/svb_fake?X-Amz-Signature=upload-secret",
      headers: { "content-type": "application/gzip" },
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      artifactHandle: "s3-compatible://backups/storage-volume/svb_fake.tar.gz",
    });
  }

  async authorizeDownload(
    input: Parameters<StorageBackupObjectTransferBrokerPort["authorizeDownload"]>[0],
  ) {
    this.downloads.push(input);
    return ok({
      url: "https://objects.example.test/backups/svb_fake?X-Amz-Signature=download-secret",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
  }

  async deleteObject(
    input: Parameters<StorageBackupObjectTransferBrokerPort["deleteObject"]>[0],
  ) {
    this.deletes.push(input);
    return ok({ deletedAt: input.requestedAt });
  }
}

describe("storage volume backup runtime provider", () => {
  test("[STOR-BACKUP-CREATE-001] renders Docker named-volume tar source and local target scripts", () => {
    const sourceScript = ash.render(
      renderDockerVolumeTarBackupScript({
        storageVolumeId: "stv_data",
        dockerVolumeName: "appaloft-stv_data",
        backupId: "svb_data",
        attemptId: "sba_data",
        workingRoot: "/var/lib/appaloft/backups/.work",
      }),
    );

    expect(sourceScript).toMatchSnapshot();
    expect(sourceScript).toContain("APPALOFT_STORAGE_BACKUP_SOURCE_V1");
    expect(sourceScript).toContain(
      "APPALOFT_STORAGE_BACKUP_COMMAND_DIALECT='posix-shell-docker'",
    );
    expect(sourceScript).toContain("docker volume inspect");
    expect(sourceScript).toContain("appaloft.storage-volume-id");
    expect(sourceScript).toContain("tar -czf");

    const storeScript = ash.render(
      renderLocalFilesystemStoreBackupScript({
        sourceRef: "/var/lib/appaloft/backups/.work/sources/svb_data.sba_data.tar.gz",
        storageVolumeId: "stv_data",
        backupId: "svb_data",
        targetRef: "/var/lib/appaloft/backups",
        retentionMaxCount: 3,
      }),
    );

    expect(storeScript).toMatchSnapshot();
    expect(storeScript).toContain("APPALOFT_STORAGE_BACKUP_TARGET_V1");
    expect(storeScript).toContain(
      "APPALOFT_STORAGE_BACKUP_COMMAND_DIALECT='posix-shell-docker'",
    );
    expect(storeScript).toContain("storage-volume/$APPALOFT_STORAGE_VOLUME_ID");
    expect(storeScript).toContain("STORAGE_BACKUP_ARTIFACT");
  });

  test("[STOR-BACKUP-RESTORE-001] renders restore-to-new Docker named-volume script", () => {
    const script = ash.render(
      renderLocalFilesystemRestoreBackupScript({
        artifactHandle: "/var/lib/appaloft/backups/storage-volume/stv_data/svb_data.tar.gz",
        targetStorageVolumeId: "stv_restored",
        targetDockerVolumeName: "appaloft-stv_restored",
      }),
    );

    expect(script).toMatchSnapshot();
    expect(script).toContain("APPALOFT_STORAGE_RESTORE_TARGET_V1");
    expect(script).toContain("APPALOFT_STORAGE_BACKUP_COMMAND_DIALECT='posix-shell-docker'");
    expect(script).toContain("docker volume create");
    expect(script).toContain("appaloft.storage-volume-id");
    expect(script).toContain("tar -xzf");
  });

  test("[STOR-BACKUP-SQLITE-001] tar adapter refuses live SQLite application-consistent backup", () => {
    const adapter = new DockerTarStorageBackupSourceAdapter();

    expect(
      adapter.supports({
        source: {
          storageVolumeId: "stv_data",
          dataFormat: "sqlite",
          liveWrites: true,
        },
        requestedConsistency: "application-consistent",
        target: {
          providerKey: "local-filesystem",
          targetRef: "/var/lib/appaloft/backups",
        },
        retention: {
          maxCount: 3,
          minFreeBytes: 1,
        },
      }),
    ).toBe(false);

    expect(
      adapter.supports({
        source: {
          storageVolumeId: "stv_data",
          dataFormat: "filesystem",
          liveWrites: false,
        },
        requestedConsistency: "quiesced",
        target: {
          providerKey: "local-filesystem",
          targetRef: "/var/lib/appaloft/backups",
        },
        retention: {
          maxCount: 3,
          minFreeBytes: 1,
        },
      }),
    ).toBe(true);
  });

  test("[STOR-BACKUP-SQLITE-001] SQLite adapter renders an online backup source command", () => {
    const adapter = new DockerSqliteOnlineStorageBackupSourceAdapter();
    const script = ash.render(
      renderDockerVolumeSqliteOnlineBackupScript({
        storageVolumeId: "stv_pocketbase",
        dockerVolumeName: "appaloft-stv_pocketbase",
        backupId: "svb_pocketbase",
        attemptId: "sba_pocketbase",
        sqliteHelperImage: "keinos/sqlite3:latest",
        workingRoot: "/var/lib/appaloft/backups/.work",
      }),
    );

    expect(
      adapter.supports({
        source: {
          storageVolumeId: "stv_pocketbase",
          destinationPath: "/pb_data",
          dataFormat: "sqlite",
          liveWrites: true,
        },
        requestedConsistency: "application-consistent",
        target: {
          providerKey: "local-filesystem",
          targetRef: "/var/lib/appaloft/backups",
        },
        retention: {
          maxCount: 3,
          minFreeBytes: 1,
        },
      }),
    ).toBe(true);
    expect(script).toMatchSnapshot();
    expect(script).toContain("APPALOFT_STORAGE_BACKUP_SOURCE_V1");
    expect(script).toContain("APPALOFT_STORAGE_BACKUP_COMMAND_DIALECT='posix-shell-docker'");
    expect(script).toContain("sqlite3");
    expect(script).toContain(".backup");
    expect(script).toContain("data.db");
    expect(script).toContain("APPALOFT_SQLITE_HELPER_IMAGE");
    expect(script).toContain("keinos/sqlite3:latest");
    expect(script).toContain('--user "$(id -u):$(id -g)"');
    expect(script).toContain('-v "$APPALOFT_DOCKER_VOLUME_NAME:/source"');
    expect(script).not.toContain('-v "$APPALOFT_DOCKER_VOLUME_NAME:/source:ro"');
    expect(script).toContain("tar -czf");
    expect(script).toContain("appaloft.storage-volume-id");
    expect(script).not.toContain("apk add");
  });

  test("[STOR-BACKUP-OFFSITE-PLAN-001] runtime source selection is independent from S3 target storage", () => {
    const tarAdapter = new DockerTarStorageBackupSourceAdapter();
    const sqliteAdapter = new DockerSqliteOnlineStorageBackupSourceAdapter();
    const target = {
      providerKey: "s3-compatible" as const,
      targetRef: "s3://backups/storage-volume",
    };

    expect(
      tarAdapter.supports({
        source: { storageVolumeId: "stv_data", dataFormat: "filesystem", liveWrites: false },
        requestedConsistency: "quiesced",
        target,
        retention: { maxCount: 3 },
      }),
    ).toBe(true);
    expect(
      sqliteAdapter.supports({
        source: { storageVolumeId: "stv_data", dataFormat: "sqlite", liveWrites: true },
        requestedConsistency: "application-consistent",
        target,
        retention: { maxCount: 3 },
      }),
    ).toBe(true);
  });

  test("[STOR-BACKUP-OFFSITE-STORE-001][STOR-BACKUP-OFFSITE-RESTORE-001] renders guarded S3 transfer scripts", () => {
    const storeScript = ash.render(
      renderS3CompatibleStoreBackupScript({
        sourceRef: "/var/lib/appaloft/backups/.work/sources/svb_data.tar.gz",
        artifactHandle: "s3-compatible://backups/storage-volume/svb_data.tar.gz",
        uploadUrl: "https://objects.example.test/svb_data?signature=short-lived",
        headers: { "content-type": "application/gzip" },
        backupId: "svb_data",
      }),
    );
    expect(storeScript).toContain("command -v curl");
    expect(storeScript).toContain("--upload-file");
    expect(storeScript).toContain('rm -f "$APPALOFT_STORAGE_BACKUP_SOURCE_REF"');
    expect(storeScript).toContain("STORAGE_BACKUP_ARTIFACT");

    const restoreScript = ash.render(
      renderS3CompatibleRestoreBackupScript({
        artifactHandle: "s3-compatible://backups/storage-volume/svb_data.tar.gz",
        downloadUrl: "https://objects.example.test/svb_data?signature=short-lived",
        expectedChecksum: "sha256-test",
        backupId: "svb_data",
        restoreAttemptId: "sra_data",
        workingRoot: "/var/lib/appaloft/backups/.work",
        targetStorageVolumeId: "stv_restored",
        targetDockerVolumeName: "appaloft-stv_restored",
      }),
    );
    expect(restoreScript).toContain("--request GET");
    expect(restoreScript).toContain("checksum-mismatch");
    expect(restoreScript).toContain("trap 'rm -f");
    expect(restoreScript).toContain("docker volume create");
  });

  test("[STOR-BACKUP-CREATE-001] executes local filesystem store script through ash", () => {
    const root = mkdtempSync(join(tmpdir(), "appaloft-storage-backup-ash-"));
    const sourceRef = join(root, "source.tar.gz");
    const targetRef = join(root, "target");
    writeFileSync(sourceRef, "backup artifact\n");

    try {
      const script = renderLocalFilesystemStoreBackupScript({
        sourceRef,
        storageVolumeId: "stv_data",
        backupId: "svb_data",
        targetRef,
        retentionMaxCount: 3,
      });

      const result = ash.execute(script);
      const artifactPath = join(targetRef, "storage-volume", "stv_data", "svb_data.tar.gz");

      expect(result.success, result.stderr).toBe(true);
      expect(result.stdout).toContain("APPALOFT_STORAGE_BACKUP_TARGET_V1");
      expect(result.stdout).toContain(`STORAGE_BACKUP_ARTIFACT\t${artifactPath}`);
      expect(readFileSync(artifactPath, "utf8")).toBe("backup artifact\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("[STOR-BACKUP-PLAN-001] runtime registry exposes local filesystem target provider", () => {
    const registry = new RuntimeStorageBackupProviderRegistry();
    const targetProvider = new LocalFilesystemStorageBackupTargetProvider();

    expect(registry.sourceAdapters().map((adapter) => adapter.key)).toContain("tar-volume");
    expect(registry.sourceAdapters().map((adapter) => adapter.key)).toContain(
      "sqlite-online-backup",
    );
    expect(registry.targetProviders().map((provider) => provider.key)).toContain("local-filesystem");
    expect(
      targetProvider.supports({
        source: {
          storageVolumeId: "stv_data",
        },
        requestedConsistency: "quiesced",
        target: {
          providerKey: "local-filesystem",
          targetRef: "/var/lib/appaloft/backups",
        },
        retention: {
          maxCount: 3,
          minFreeBytes: 1,
        },
      }),
    ).toBe(true);
  });

  test("[STOR-BACKUP-OFFSITE-STORE-001][STOR-BACKUP-OFFSITE-RESTORE-001][STOR-BACKUP-OFFSITE-PRUNE-001] composes S3 transfer only with an injected broker", async () => {
    const broker = new FakeObjectTransferBroker();
    const renderer = new FakeDialectRenderer();
    const registry = new RuntimeStorageBackupProviderRegistry({
      objectTransferBroker: broker,
      commandDialect: renderer.key,
      commandRenderers: [renderer],
    });
    expect(new RuntimeStorageBackupProviderRegistry().targetProviders().map(({ key }) => key)).not.toContain(
      "s3-compatible",
    );
    expect(registry.targetProviders().map(({ key }) => key)).toContain("s3-compatible");

    const targetProvider = registry
      .targetProviders()
      .find((provider) => provider.key === "s3-compatible") as S3CompatibleStorageBackupTargetProvider;
    const runtimeTarget = serverState({ providerKey: "local-shell" });
    const plan = {
      schemaVersion: "storage-volumes.backup-plan/v1" as const,
      storageVolumeId: "stv_fake",
      sourceAdapterKey: "tar-volume" as const,
      targetProviderKey: "s3-compatible" as const,
      consistency: "quiesced" as const,
      localOnly: false,
      retention: { maxCount: 3 },
      blockers: [],
    };
    const stored = await targetProvider.store({
      backupId: "svb_fake",
      attemptId: "sba_fake",
      requestedAt: "2026-01-01T00:00:00.000Z",
      plan,
      target: { providerKey: "s3-compatible", targetRef: "s3://backups/storage-volume" },
      sourceResult: {
        sourceRef: "/tmp/fake.tar.gz",
        manifest: { sizeBytes: 45, checksum: "fake-s3-checksum" },
      },
      runtimeTarget,
    });
    expect(stored.isOk()).toBe(true);
    expect(stored._unsafeUnwrap().artifactHandle).toBe(
      "s3-compatible://backups/storage-volume/svb_fake.tar.gz",
    );
    expect(broker.uploads).toHaveLength(1);

    const restored = await targetProvider.restore({
      backupId: "svb_fake",
      restoreAttemptId: "sra_fake",
      requestedAt: "2026-01-01T00:00:00.000Z",
      artifactHandle: stored._unsafeUnwrap().artifactHandle,
      expectedChecksum: stored._unsafeUnwrap().checksum,
      targetStorageVolumeId: "stv_fake_restore",
      runtimeTarget,
    });
    expect(restored.isOk()).toBe(true);
    expect(broker.downloads).toHaveLength(1);

    const pruned = await targetProvider.prune({
      backupId: "svb_fake",
      artifactHandle: stored._unsafeUnwrap().artifactHandle,
      requestedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(pruned.isOk()).toBe(true);
    expect(broker.deletes).toEqual([
      {
        backupId: "svb_fake",
        artifactHandle: "s3-compatible://backups/storage-volume/svb_fake.tar.gz",
        requestedAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
    expect(renderer.calls).toEqual(["s3-store-target", "s3-restore-target"]);
  });

  test("[STOR-BACKUP-OFFSITE-SECRET-001] redacts signed transfer authorization from provider errors", async () => {
    const broker = new FakeObjectTransferBroker();
    const renderer = new FakeDialectRenderer(true);
    const provider = new S3CompatibleStorageBackupTargetProvider(broker, {
      commandDialect: renderer.key,
      commandRenderers: [renderer],
    });
    const result = await provider.store({
      backupId: "svb_fake",
      attemptId: "sba_fake",
      requestedAt: "2026-01-01T00:00:00.000Z",
      plan: {
        schemaVersion: "storage-volumes.backup-plan/v1",
        storageVolumeId: "stv_fake",
        sourceAdapterKey: "tar-volume",
        targetProviderKey: "s3-compatible",
        consistency: "quiesced",
        localOnly: false,
        retention: { maxCount: 3 },
        blockers: [],
      },
      target: { providerKey: "s3-compatible", targetRef: "s3://backups/storage-volume" },
      sourceResult: { sourceRef: "/tmp/fake.tar.gz" },
      runtimeTarget: serverState({ providerKey: "local-shell" }),
    });
    expect(result.isErr()).toBe(true);
    expect(JSON.stringify(result._unsafeUnwrapErr())).not.toContain("upload-secret");
    expect(JSON.stringify(result._unsafeUnwrapErr())).not.toContain("X-Amz-Signature");
    expect(
      provider.supports({
        source: { storageVolumeId: "stv_fake" },
        requestedConsistency: "quiesced",
        target: {
          providerKey: "s3-compatible",
          targetRef: "s3://backups/storage-volume?X-Amz-Signature=must-not-persist",
        },
        retention: { maxCount: 3 },
      }),
    ).toBe(false);
  });

  test("[STOR-BACKUP-RUNTIME-001] runtime command renderer can be swapped by dialect", async () => {
    const renderer = new FakeDialectRenderer();
    const sourceAdapter = new DockerSqliteOnlineStorageBackupSourceAdapter({
      commandDialect: renderer.key,
      commandRenderers: [renderer],
    });
    const targetProvider = new LocalFilesystemStorageBackupTargetProvider({
      commandDialect: renderer.key,
      commandRenderers: [renderer],
    });
    const plan = {
      schemaVersion: "storage-volumes.backup-plan/v1" as const,
      storageVolumeId: "stv_fake",
      sourceAdapterKey: "sqlite-online-backup" as const,
      targetProviderKey: "local-filesystem" as const,
      consistency: "application-consistent" as const,
      localOnly: true,
      retention: {
        maxCount: 3,
        minFreeBytes: 1,
      },
      blockers: [],
    };
    const runtimeTarget = serverState({ providerKey: "local-shell" });

    const sourceResult = await sourceAdapter.createBackup({
      backupId: "svb_fake",
      attemptId: "sba_fake",
      requestedAt: "2026-01-01T00:00:00.000Z",
      plan,
      source: {
        storageVolumeId: "stv_fake",
        destinationPath: "/pb_data",
        dataFormat: "sqlite",
        liveWrites: true,
      },
      runtimeTarget,
    });
    expect(sourceResult.isOk()).toBe(true);
    expect(sourceResult._unsafeUnwrap()).toMatchObject({
      sourceRef: "/tmp/fake.sqlite.tar.gz",
      manifest: {
        sizeBytes: 43,
        checksum: "fake-sqlite-checksum",
      },
    });

    const storeResult = await targetProvider.store({
      backupId: "svb_fake",
      attemptId: "sba_fake",
      requestedAt: "2026-01-01T00:00:00.000Z",
      plan,
      target: {
        providerKey: "local-filesystem",
        targetRef: "/tmp/fake-target",
      },
      sourceResult: sourceResult._unsafeUnwrap(),
      runtimeTarget,
    });
    expect(storeResult.isOk()).toBe(true);
    expect(storeResult._unsafeUnwrap()).toMatchObject({
      artifactHandle: "/tmp/fake-artifact.tar.gz",
      retentionStatus: "retained",
      sizeBytes: 44,
      checksum: "fake-artifact-checksum",
    });

    const restoreResult = await targetProvider.restore({
      backupId: "svb_fake",
      restoreAttemptId: "sra_fake",
      requestedAt: "2026-01-01T00:00:00.000Z",
      artifactHandle: "/tmp/fake-artifact.tar.gz",
      targetStorageVolumeId: "stv_fake_restore",
      runtimeTarget,
    });
    expect(restoreResult.isOk()).toBe(true);
    expect(renderer.calls).toEqual(["sqlite-source", "store-target", "restore-target"]);
  });

  test("[STOR-BACKUP-DIAGNOSTIC-001] persists a bounded source command diagnostic", async () => {
    const renderer = new FakeDialectRenderer(false, true);
    const sourceAdapter = new DockerSqliteOnlineStorageBackupSourceAdapter({
      commandDialect: renderer.key,
      commandRenderers: [renderer],
    });
    const result = await sourceAdapter.createBackup({
      backupId: "svb_failed",
      attemptId: "sba_failed",
      requestedAt: "2026-01-01T00:00:00.000Z",
      plan: {
        schemaVersion: "storage-volumes.backup-plan/v1",
        storageVolumeId: "stv_failed",
        sourceAdapterKey: "sqlite-online-backup",
        targetProviderKey: "local-filesystem",
        consistency: "application-consistent",
        localOnly: true,
        retention: { maxCount: 3 },
        blockers: [],
      },
      source: {
        storageVolumeId: "stv_failed",
        destinationPath: "/pb_data",
        dataFormat: "sqlite",
        liveWrites: true,
      },
      runtimeTarget: serverState({ providerKey: "local-shell" }),
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toContain("working-root-unwritable");
    expect(result._unsafeUnwrapErr().message.length).toBeLessThanOrEqual(360);
  });

  if (!localDockerBackupEnabled) {
    test.skip("[STOR-BACKUP-RUNTIME-002] real local Docker SQLite backup/restore requires APPALOFT_E2E_STORAGE_BACKUP_DOCKER=true", () => {});
  } else {
    test("[STOR-BACKUP-RUNTIME-002] backs up and restores a real local Docker SQLite volume", async () => {
      const dockerVersion = docker(["version", "--format", "{{.Server.Version}}"]);
      expect(dockerVersion.exitCode, dockerVersion.stderr).toBe(0);

      const dockerSharedRoot = join(process.cwd(), ".tmp");
      mkdirSync(dockerSharedRoot, { recursive: true });
      const tmpRoot = mkdtempSync(join(dockerSharedRoot, "appaloft-storage-backup-"));
      const seedDir = join(tmpRoot, "seed");
      const extractDir = join(tmpRoot, "extract");
      const workingRoot = join(tmpRoot, "work");
      const targetRef = join(tmpRoot, "artifacts");
      const sourceVolumeId = "stv_real_backup";
      const targetVolumeId = "stv_real_backup_restored";
      const sourceVolumeName = `appaloft-${sourceVolumeId}`;
      const targetVolumeName = `appaloft-${targetVolumeId}`;
      const backupId = "svb_real_backup";
      const attemptId = "sba_real_backup";
      const requestedAt = "2026-01-01T00:00:00.000Z";
      mkdirSync(seedDir, { recursive: true });
      mkdirSync(extractDir, { recursive: true });
      seedPocketBaseSqliteFile(join(seedDir, "data.db"));

      docker(["volume", "rm", "-f", sourceVolumeName]);
      docker(["volume", "rm", "-f", targetVolumeName]);
      const created = docker([
        "volume",
        "create",
        "--label",
        "appaloft.managed=true",
        "--label",
        `appaloft.storage-volume-id=${sourceVolumeId}`,
        "--label",
        "appaloft.storage-volume-kind=named-volume",
        "--label",
        "appaloft.storage-runtime-realized-by=deployment-execution",
        sourceVolumeName,
      ]);
      expect(created.exitCode, created.stderr).toBe(0);

      const seeded = docker([
        "run",
        "--rm",
        "-v",
        `${sourceVolumeName}:/source`,
        "-v",
        `${seedDir}:/seed:ro`,
        "alpine:3.20",
        "sh",
        "-c",
        "cp /seed/data.db /source/data.db && mkdir -p /source/pb_migrations && printf '001_create_records\\n' > /source/pb_migrations/001.txt",
      ]);
      expect(seeded.exitCode, seeded.stderr).toBe(0);

      const plan = {
        schemaVersion: "storage-volumes.backup-plan/v1" as const,
        storageVolumeId: sourceVolumeId,
        sourceAdapterKey: "sqlite-online-backup" as const,
        targetProviderKey: "local-filesystem" as const,
        consistency: "application-consistent" as const,
        localOnly: true,
        retention: {
          maxCount: 3,
          minFreeBytes: 1,
        },
        blockers: [],
      };
      const runtimeTarget = serverState({ providerKey: "local-shell" });
      const sourceAdapter = new DockerSqliteOnlineStorageBackupSourceAdapter({ workingRoot });
      const targetProvider = new LocalFilesystemStorageBackupTargetProvider();

      try {
        const sourceResult = await sourceAdapter.createBackup({
          backupId,
          attemptId,
          requestedAt,
          plan,
          source: {
            storageVolumeId: sourceVolumeId,
            destinationPath: "/pb_data",
            dataFormat: "sqlite",
            liveWrites: true,
          },
          runtimeTarget,
        });
        expect(sourceResult.isOk()).toBe(true);

        const storeResult = await targetProvider.store({
          backupId,
          attemptId,
          requestedAt,
          plan,
          target: {
            providerKey: "local-filesystem",
            targetRef,
          },
          sourceResult: sourceResult._unsafeUnwrap(),
          runtimeTarget,
        });
        expect(storeResult.isOk()).toBe(true);
        const artifactHandle = storeResult._unsafeUnwrap().artifactHandle;
        expect(existsSync(artifactHandle)).toBe(true);

        const restoreResult = await targetProvider.restore({
          backupId,
          restoreAttemptId: "sra_real_backup",
          requestedAt,
          artifactHandle,
          targetStorageVolumeId: targetVolumeId,
          runtimeTarget,
        });
        expect(restoreResult.isOk()).toBe(true);
        expect(docker(["volume", "inspect", targetVolumeName]).exitCode).toBe(0);

        const extracted = docker([
          "run",
          "--rm",
          "-v",
          `${targetVolumeName}:/target:ro`,
          "-v",
          `${extractDir}:/extract`,
          "alpine:3.20",
          "sh",
          "-c",
          "cp /target/data.db /extract/data.db && cp /target/pb_migrations/001.txt /extract/001.txt",
        ]);
        expect(extracted.exitCode, extracted.stderr).toBe(0);

        expect(sqliteRecordTitle(join(extractDir, "data.db"))).toBe("PocketBase survives restore");
        expect(await Bun.file(join(extractDir, "001.txt")).text()).toBe("001_create_records\n");
      } finally {
        docker(["volume", "rm", "-f", sourceVolumeName]);
        docker(["volume", "rm", "-f", targetVolumeName]);
        rmSync(tmpRoot, { recursive: true, force: true });
      }
    }, 180000);
  }

  if (!sshDockerBackupEnabled) {
    test.skip("[STOR-BACKUP-RUNTIME-003] real generic-SSH Docker SQLite backup/restore requires APPALOFT_E2E_SSH_STORAGE_BACKUP_DOCKER=true", () => {});
  } else {
    test("[STOR-BACKUP-RUNTIME-003] backs up and restores a real generic-SSH Docker SQLite volume", async () => {
      const config = sshConfig();
      const dockerVersion = ssh(config, "docker version --format '{{.Server.Version}}'");
      expect(dockerVersion.exitCode, dockerVersion.stderr).toBe(0);

      const dockerSharedRoot = join(process.cwd(), ".tmp");
      mkdirSync(dockerSharedRoot, { recursive: true });
      const tmpRoot = mkdtempSync(join(dockerSharedRoot, "appaloft-storage-backup-ssh-"));
      const seedDir = join(tmpRoot, "seed");
      const extractDir = join(tmpRoot, "extract");
      const remoteRoot = `/tmp/appaloft-storage-backup-${Date.now()}`;
      const remoteSeedDir = `${remoteRoot}/seed`;
      const remoteExtractDir = `${remoteRoot}/extract`;
      const workingRoot = `${remoteRoot}/work`;
      const targetRef = `${remoteRoot}/artifacts`;
      const sourceVolumeId = "stv_real_ssh_backup";
      const targetVolumeId = "stv_real_ssh_backup_restored";
      const sourceVolumeName = `appaloft-${sourceVolumeId}`;
      const targetVolumeName = `appaloft-${targetVolumeId}`;
      const backupId = "svb_real_ssh_backup";
      const attemptId = "sba_real_ssh_backup";
      const requestedAt = "2026-01-01T00:00:00.000Z";
      mkdirSync(seedDir, { recursive: true });
      mkdirSync(extractDir, { recursive: true });
      seedPocketBaseSqliteFile(join(seedDir, "data.db"));

      const runtimeTarget = serverState({
        host: config.host,
        port: Number(config.port),
        privateKey: config.privateKeyText,
        providerKey: "generic-ssh",
        username: config.username,
      });
      const sourceAdapter = new DockerSqliteOnlineStorageBackupSourceAdapter({ workingRoot });
      const targetProvider = new LocalFilesystemStorageBackupTargetProvider();
      const plan = {
        schemaVersion: "storage-volumes.backup-plan/v1" as const,
        storageVolumeId: sourceVolumeId,
        sourceAdapterKey: "sqlite-online-backup" as const,
        targetProviderKey: "local-filesystem" as const,
        consistency: "application-consistent" as const,
        localOnly: true,
        retention: {
          maxCount: 3,
          minFreeBytes: 1,
        },
        blockers: [],
      };

      try {
        const prepared = ssh(
          config,
          [
            `rm -rf ${shellQuote(remoteRoot)}`,
            `mkdir -p ${shellQuote(remoteSeedDir)} ${shellQuote(remoteExtractDir)}`,
            `docker volume rm -f ${shellQuote(sourceVolumeName)} ${shellQuote(targetVolumeName)} >/dev/null 2>&1 || true`,
          ].join(" && "),
        );
        expect(prepared.exitCode, prepared.stderr).toBe(0);

        const copiedSeed = Bun.spawnSync(
          [
            "scp",
            "-i",
            config.privateKeyFile,
            "-P",
            config.port,
            "-o",
            "BatchMode=yes",
            "-o",
            "StrictHostKeyChecking=accept-new",
            join(seedDir, "data.db"),
            `${config.username}@${config.host}:${remoteSeedDir}/data.db`,
          ],
          {
            stderr: "pipe",
            stdout: "pipe",
          },
        );
        expect(copiedSeed.exitCode, (copiedSeed.stderr ?? new Uint8Array()).toString()).toBe(0);

        const created = ssh(
          config,
          [
            "docker volume create",
            "--label",
            shellQuote("appaloft.managed=true"),
            "--label",
            shellQuote(`appaloft.storage-volume-id=${sourceVolumeId}`),
            "--label",
            shellQuote("appaloft.storage-volume-kind=named-volume"),
            "--label",
            shellQuote("appaloft.storage-runtime-realized-by=deployment-execution"),
            shellQuote(sourceVolumeName),
          ].join(" "),
        );
        expect(created.exitCode, created.stderr).toBe(0);

        const seeded = ssh(
          config,
          [
            "docker run --rm",
            `-v ${shellQuote(`${sourceVolumeName}:/source`)}`,
            `-v ${shellQuote(`${remoteSeedDir}:/seed:ro`)}`,
            "alpine:3.20",
            "sh -c",
            shellQuote(
              "cp /seed/data.db /source/data.db && mkdir -p /source/pb_migrations && printf '001_create_records\\n' > /source/pb_migrations/001.txt",
            ),
          ].join(" "),
        );
        expect(seeded.exitCode, seeded.stderr).toBe(0);

        const sourceResult = await sourceAdapter.createBackup({
          backupId,
          attemptId,
          requestedAt,
          plan,
          source: {
            storageVolumeId: sourceVolumeId,
            destinationPath: "/pb_data",
            dataFormat: "sqlite",
            liveWrites: true,
          },
          runtimeTarget,
        });
        expect(sourceResult.isOk()).toBe(true);

        const storeResult = await targetProvider.store({
          backupId,
          attemptId,
          requestedAt,
          plan,
          target: {
            providerKey: "local-filesystem",
            targetRef,
          },
          sourceResult: sourceResult._unsafeUnwrap(),
          runtimeTarget,
        });
        expect(storeResult.isOk()).toBe(true);
        const artifactHandle = storeResult._unsafeUnwrap().artifactHandle;
        expect(artifactHandle).toStartWith(targetRef);
        expect(ssh(config, `test -f ${shellQuote(artifactHandle)}`).exitCode).toBe(0);

        const restoreResult = await targetProvider.restore({
          backupId,
          restoreAttemptId: "sra_real_ssh_backup",
          requestedAt,
          artifactHandle,
          targetStorageVolumeId: targetVolumeId,
          runtimeTarget,
        });
        expect(restoreResult.isOk()).toBe(true);
        expect(ssh(config, `docker volume inspect ${shellQuote(targetVolumeName)} >/dev/null`).exitCode).toBe(0);

        const extracted = ssh(
          config,
          [
            "docker run --rm",
            `-v ${shellQuote(`${targetVolumeName}:/target:ro`)}`,
            `-v ${shellQuote(`${remoteExtractDir}:/extract`)}`,
            "alpine:3.20",
            "sh -c",
            shellQuote(
              "cp /target/data.db /extract/data.db && cp /target/pb_migrations/001.txt /extract/001.txt",
            ),
          ].join(" "),
        );
        expect(extracted.exitCode, extracted.stderr).toBe(0);

        const copiedRestore = Bun.spawnSync(
          [
            "scp",
            "-i",
            config.privateKeyFile,
            "-P",
            config.port,
            "-o",
            "BatchMode=yes",
            "-o",
            "StrictHostKeyChecking=accept-new",
            `${config.username}@${config.host}:${remoteExtractDir}/data.db`,
            join(extractDir, "data.db"),
          ],
          {
            stderr: "pipe",
            stdout: "pipe",
          },
        );
        expect(
          copiedRestore.exitCode,
          (copiedRestore.stderr ?? new Uint8Array()).toString(),
        ).toBe(0);
        const copiedMigration = Bun.spawnSync(
          [
            "scp",
            "-i",
            config.privateKeyFile,
            "-P",
            config.port,
            "-o",
            "BatchMode=yes",
            "-o",
            "StrictHostKeyChecking=accept-new",
            `${config.username}@${config.host}:${remoteExtractDir}/001.txt`,
            join(extractDir, "001.txt"),
          ],
          {
            stderr: "pipe",
            stdout: "pipe",
          },
        );
        expect(
          copiedMigration.exitCode,
          (copiedMigration.stderr ?? new Uint8Array()).toString(),
        ).toBe(0);

        expect(sqliteRecordTitle(join(extractDir, "data.db"))).toBe("PocketBase survives restore");
        expect(await Bun.file(join(extractDir, "001.txt")).text()).toBe("001_create_records\n");
      } finally {
        ssh(
          config,
          [
            `docker volume rm -f ${shellQuote(sourceVolumeName)} ${shellQuote(targetVolumeName)} >/dev/null 2>&1 || true`,
            `rm -rf ${shellQuote(remoteRoot)}`,
          ].join(" ; "),
        );
        rmSync(tmpRoot, { recursive: true, force: true });
      }
    }, 180000);
  }
});
