import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, type DependencyResourceSecretStore } from "@appaloft/application";
import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";

import {
  BunDependencyResourceNativeCommandRunner,
  ShellDependencyResourceBackupProvider,
  type ShellDependencyResourceNativeCommandInput,
  type ShellDependencyResourceNativeCommandRunner,
  ShellManagedPostgresProvider,
  ShellManagedRedisProvider,
} from "../src/register-application-services";

class MemoryDependencyResourceSecretStore implements DependencyResourceSecretStore {
  private readonly values = new Map<string, string>();

  set(secretRef: string, secretValue: string): void {
    this.values.set(secretRef, secretValue);
  }

  async storeConnection(
    _context: Parameters<DependencyResourceSecretStore["storeConnection"]>[0],
    input: Parameters<DependencyResourceSecretStore["storeConnection"]>[1],
  ): Promise<Result<{ secretRef: string }, DomainError>> {
    const secretRef = `appaloft://dependency-resources/${input.dependencyResourceId}/connection`;
    this.values.set(secretRef, input.secretValue);
    return ok({ secretRef });
  }

  async resolve(
    _context: Parameters<DependencyResourceSecretStore["resolve"]>[0],
    input: { secretRef: string },
  ): Promise<Result<{ secretRef: string; secretValue: string }, DomainError>> {
    const secretValue = this.values.get(input.secretRef);
    if (!secretValue) {
      return err(domainError.notFound("dependency_resource_secret", input.secretRef));
    }
    return ok({ secretRef: input.secretRef, secretValue });
  }
}

class RecordingNativeCommandRunner implements ShellDependencyResourceNativeCommandRunner {
  readonly calls: ShellDependencyResourceNativeCommandInput[] = [];

  async run(input: ShellDependencyResourceNativeCommandInput): Promise<Result<void, DomainError>> {
    this.calls.push(input);
    return ok(undefined);
  }
}

describe("Shell managed dependency resource providers", () => {
  test("[DEP-RES-PG-NATIVE-001] [DEP-RES-PG-NATIVE-005] writes and marks managed Postgres realization artifacts", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "appaloft-managed-postgres-"));
    const provider = new ShellManagedPostgresProvider(dataDir);
    const context = createExecutionContext({
      requestId: "req_shell_managed_postgres_provider_test",
      entrypoint: "system",
    });

    const realized = await provider.realize(context, {
      dependencyResourceId: "rsi_shell_pg",
      projectId: "prj_shell",
      environmentId: "env_shell",
      providerKey: "appaloft-managed-postgres",
      name: "Main DB",
      slug: "main-db",
      attemptId: "dpr_shell_pg",
      requestedAt: "2026-05-15T00:00:00.000Z",
    });

    expect(realized.isOk()).toBe(true);
    expect(realized._unsafeUnwrap()).toMatchObject({
      providerResourceHandle: "pg/rsi_shell_pg",
      endpoint: {
        maskedConnection: "postgres://app:********@main-db.postgres.internal:5432/main_db",
      },
      secretRef: "secret://dependency/postgres/rsi_shell_pg",
    });

    const artifactPath = join(
      dataDir,
      "dependency-resource-realizations",
      "postgres",
      "rsi_shell_pg.json",
    );
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
    expect(artifact).toMatchObject({
      schemaVersion: "appaloft.dependency-resource-realization/v1",
      dependencyResourceId: "rsi_shell_pg",
      dependencyKind: "postgres",
      providerKey: "appaloft-managed-postgres",
      providerResourceHandle: "pg/rsi_shell_pg",
    });
    expect(JSON.stringify(artifact)).not.toContain("raw-password");

    const deleted = await provider.delete(context, {
      dependencyResourceId: "rsi_shell_pg",
      providerKey: "appaloft-managed-postgres",
      providerResourceHandle: "pg/rsi_shell_pg",
      attemptId: "dpr_delete_shell_pg",
      requestedAt: "2026-05-15T00:01:00.000Z",
    });

    expect(deleted.isOk()).toBe(true);
    const deletedArtifact = JSON.parse(await readFile(artifactPath, "utf8"));
    expect(deletedArtifact).toMatchObject({
      dependencyResourceId: "rsi_shell_pg",
      deletedAt: "2026-05-15T00:01:00.000Z",
    });
  });

  test("[DEP-RES-REDIS-NATIVE-001] [DEP-RES-REDIS-NATIVE-006] writes and validates managed Redis realization artifacts", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "appaloft-managed-redis-"));
    const provider = new ShellManagedRedisProvider(dataDir);
    const context = createExecutionContext({
      requestId: "req_shell_managed_redis_provider_test",
      entrypoint: "system",
    });

    const realized = await provider.realize(context, {
      dependencyResourceId: "rsi_shell_redis",
      projectId: "prj_shell",
      environmentId: "env_shell",
      providerKey: "appaloft-managed-redis",
      name: "Cache",
      slug: "cache",
      attemptId: "dpr_shell_redis",
      requestedAt: "2026-05-15T00:00:00.000Z",
    });
    const deleted = await provider.delete(context, {
      dependencyResourceId: "rsi_shell_redis",
      providerKey: "appaloft-managed-redis",
      providerResourceHandle: "redis/other",
      attemptId: "dpr_delete_shell_redis",
      requestedAt: "2026-05-15T00:01:00.000Z",
    });

    expect(realized.isOk()).toBe(true);
    expect(realized._unsafeUnwrap()).toMatchObject({
      providerResourceHandle: "redis/rsi_shell_redis",
      secretRef: "secret://dependency/redis/rsi_shell_redis",
    });
    expect(deleted.isErr()).toBe(true);
    expect(deleted._unsafeUnwrapErr()).toMatchObject({
      code: "provider_error",
      details: {
        phase: "dependency-resource-realization-artifact",
        dependencyResourceId: "rsi_shell_redis",
        dependencyKind: "redis",
        providerKey: "appaloft-managed-redis",
      },
    });
    expect(JSON.stringify(deleted._unsafeUnwrapErr())).not.toContain("redis/other");
  });
});

describe("ShellDependencyResourceBackupProvider", () => {
  test("[DEP-RES-BACKUP-001] [DEP-RES-BACKUP-006] writes and validates safe local artifacts", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "appaloft-dependency-backup-"));
    const provider = new ShellDependencyResourceBackupProvider(dataDir);
    const context = createExecutionContext({
      requestId: "req_shell_dependency_backup_provider_test",
      entrypoint: "system",
    });

    const backup = await provider.createBackup(context, {
      backupId: "drb_shell",
      dependencyResourceId: "rsi_shell",
      dependencyKind: "postgres",
      providerKey: "appaloft-managed-postgres",
      providerResourceHandle: "pg/rsi_shell",
      connection: {
        host: "main-db.postgres.internal",
        port: 5432,
        databaseName: "main_db",
        maskedConnection: "postgres://app:********@main-db.postgres.internal:5432/main_db",
        secretRef: "secret://dependency/postgres/rsi_shell",
      },
      attemptId: "dba_shell",
      requestedAt: "2026-05-14T00:00:00.000Z",
    });

    expect(backup.isOk()).toBe(true);
    expect(backup._unsafeUnwrap()).toEqual({
      providerArtifactHandle: "backup/rsi_shell/drb_shell",
      completedAt: "2026-05-14T00:00:00.000Z",
      retentionStatus: "retained",
    });

    const backupArtifactPath = join(
      dataDir,
      "dependency-resource-backups",
      "rsi_shell",
      "drb_shell.json",
    );
    const backupArtifact = JSON.parse(await readFile(backupArtifactPath, "utf8"));
    expect(backupArtifact).toMatchObject({
      schemaVersion: "appaloft.dependency-resource-backup/v1",
      backupId: "drb_shell",
      dependencyResourceId: "rsi_shell",
      dependencyKind: "postgres",
      providerKey: "appaloft-managed-postgres",
      providerResourceHandle: "pg/rsi_shell",
      connection: {
        maskedConnection: "postgres://app:********@main-db.postgres.internal:5432/main_db",
        secretRef: "secret://dependency/postgres/rsi_shell",
      },
      providerArtifactHandle: "backup/rsi_shell/drb_shell",
    });
    expect(JSON.stringify(backupArtifact)).not.toContain("raw-password");

    const restored = await provider.restoreBackup(context, {
      backupId: "drb_shell",
      dependencyResourceId: "rsi_shell",
      dependencyKind: "postgres",
      providerKey: "appaloft-managed-postgres",
      providerArtifactHandle: "backup/rsi_shell/drb_shell",
      providerResourceHandle: "pg/rsi_shell",
      restoreAttemptId: "dra_shell",
      requestedAt: "2026-05-14T00:01:00.000Z",
    });

    expect(restored.isOk()).toBe(true);
    const restoreArtifact = JSON.parse(
      await readFile(
        join(
          dataDir,
          "dependency-resource-backups",
          "rsi_shell",
          "drb_shell.dra_shell.restore.json",
        ),
        "utf8",
      ),
    );
    expect(restoreArtifact).toMatchObject({
      schemaVersion: "appaloft.dependency-resource-restore/v1",
      backupId: "drb_shell",
      dependencyResourceId: "rsi_shell",
      restoreAttemptId: "dra_shell",
      completedAt: "2026-05-14T00:01:00.000Z",
    });
  });

  test("[DEP-RES-BACKUP-006] rejects restore requests for a different provider resource handle", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "appaloft-dependency-backup-"));
    const provider = new ShellDependencyResourceBackupProvider(dataDir);
    const context = createExecutionContext({
      requestId: "req_shell_dependency_backup_provider_mismatch_test",
      entrypoint: "system",
    });

    const backup = await provider.createBackup(context, {
      backupId: "drb_shell_mismatch",
      dependencyResourceId: "rsi_shell_mismatch",
      dependencyKind: "redis",
      providerKey: "appaloft-managed-redis",
      providerResourceHandle: "redis/rsi_shell_mismatch",
      attemptId: "dba_shell_mismatch",
      requestedAt: "2026-05-14T00:00:00.000Z",
    });
    const restored = await provider.restoreBackup(context, {
      backupId: "drb_shell_mismatch",
      dependencyResourceId: "rsi_shell_mismatch",
      dependencyKind: "redis",
      providerKey: "appaloft-managed-redis",
      providerArtifactHandle: "backup/rsi_shell_mismatch/drb_shell_mismatch",
      providerResourceHandle: "redis/other_resource",
      restoreAttemptId: "dra_shell_mismatch",
      requestedAt: "2026-05-14T00:01:00.000Z",
    });

    expect(backup.isOk()).toBe(true);
    expect(restored.isErr()).toBe(true);
    expect(restored._unsafeUnwrapErr()).toMatchObject({
      code: "provider_error",
      details: {
        phase: "dependency-resource-backup-artifact",
        dependencyResourceId: "rsi_shell_mismatch",
        dependencyKind: "redis",
        providerKey: "appaloft-managed-redis",
        backupId: "drb_shell_mismatch",
      },
    });
    expect(JSON.stringify(restored._unsafeUnwrapErr())).not.toContain("redis/other_resource");
  });

  test("[DEP-RES-BACKUP-001] [DEP-RES-BACKUP-006] runs native Postgres commands for resolvable Appaloft-owned refs", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "appaloft-dependency-backup-native-"));
    const secretStore = new MemoryDependencyResourceSecretStore();
    const nativeCommandRunner = new RecordingNativeCommandRunner();
    const provider = new ShellDependencyResourceBackupProvider(dataDir, {
      dependencyResourceSecretStore: secretStore,
      nativeCommandRunner,
    });
    const context = createExecutionContext({
      requestId: "req_shell_dependency_backup_native_provider_test",
      entrypoint: "system",
    });
    const secretRef = "appaloft://dependency-resources/rsi_shell_native/connection";
    const rawConnection = "postgres://app:raw-password@localhost:5432/main_db";
    secretStore.set(secretRef, rawConnection);

    const backup = await provider.createBackup(context, {
      backupId: "drb_shell_native",
      dependencyResourceId: "rsi_shell_native",
      dependencyKind: "postgres",
      providerKey: "external-postgres",
      providerResourceHandle: "pg/rsi_shell_native",
      connection: {
        host: "localhost",
        port: 5432,
        databaseName: "main_db",
        maskedConnection: "postgres://app:********@localhost:5432/main_db",
        secretRef,
      },
      attemptId: "dba_shell_native",
      requestedAt: "2026-05-14T00:00:00.000Z",
    });

    expect(backup.isOk()).toBe(true);
    expect(nativeCommandRunner.calls).toHaveLength(1);
    expect(nativeCommandRunner.calls[0]).toMatchObject({
      operation: "postgres-backup",
      connectionUrl: rawConnection,
    });
    expect(nativeCommandRunner.calls[0]?.artifactPath).toEndWith("drb_shell_native.pgdump");

    const backupArtifactPath = join(
      dataDir,
      "dependency-resource-backups",
      "rsi_shell_native",
      "drb_shell_native.json",
    );
    const backupArtifact = JSON.parse(await readFile(backupArtifactPath, "utf8"));
    expect(backupArtifact).toMatchObject({
      executionMode: "postgres-native-command",
      nativeArtifactPath: nativeCommandRunner.calls[0]?.artifactPath,
      connection: {
        maskedConnection: "postgres://app:********@localhost:5432/main_db",
        secretRef,
      },
    });
    expect(JSON.stringify(backupArtifact)).not.toContain("raw-password");

    const restored = await provider.restoreBackup(context, {
      backupId: "drb_shell_native",
      dependencyResourceId: "rsi_shell_native",
      dependencyKind: "postgres",
      providerKey: "external-postgres",
      providerArtifactHandle: "backup/rsi_shell_native/drb_shell_native",
      providerResourceHandle: "pg/rsi_shell_native",
      connection: {
        host: "localhost",
        port: 5432,
        databaseName: "main_db",
        maskedConnection: "postgres://app:********@localhost:5432/main_db",
        secretRef,
      },
      restoreAttemptId: "dra_shell_native",
      requestedAt: "2026-05-14T00:01:00.000Z",
    });

    expect(restored.isOk()).toBe(true);
    expect(nativeCommandRunner.calls).toHaveLength(2);
    expect(nativeCommandRunner.calls[1]).toMatchObject({
      operation: "postgres-restore",
      connectionUrl: rawConnection,
      artifactPath: nativeCommandRunner.calls[0]?.artifactPath,
    });
    const restoreArtifact = JSON.parse(
      await readFile(
        join(
          dataDir,
          "dependency-resource-backups",
          "rsi_shell_native",
          "drb_shell_native.dra_shell_native.restore.json",
        ),
        "utf8",
      ),
    );
    expect(restoreArtifact).toMatchObject({
      executionMode: "postgres-native-command",
      backupId: "drb_shell_native",
      restoreAttemptId: "dra_shell_native",
    });
    expect(JSON.stringify(restoreArtifact)).not.toContain("raw-password");

    const backupSpec = await readFile(
      "docs/specs/039-dependency-resource-backup-restore/spec.md",
      "utf8",
    );
    const dependencyMatrix = await readFile(
      "docs/testing/dependency-resource-test-matrix.md",
      "utf8",
    );
    const coreOperations = await readFile("docs/CORE_OPERATIONS.md", "utf8");
    const roadmap = await readFile("docs/PRODUCT_ROADMAP.md", "utf8");
    expect(backupSpec).toContain("native Postgres and Redis backup/restore commands");
    expect(dependencyMatrix).toContain("native Postgres backup and native Redis logical backup");
    expect(coreOperations).toContain("native Redis logical backup/restore commands");
    expect(coreOperations).not.toContain(
      "provider-owned, and Redis references use safe metadata-only",
    );
    expect(roadmap).not.toContain("It does not yet run provider-native dump/restore commands");
  });

  test("[DEP-RES-BACKUP-001] [DEP-RES-BACKUP-006] runs native Redis logical commands for resolvable Appaloft-owned refs", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "appaloft-dependency-backup-redis-native-"));
    const secretStore = new MemoryDependencyResourceSecretStore();
    const nativeCommandRunner = new RecordingNativeCommandRunner();
    const provider = new ShellDependencyResourceBackupProvider(dataDir, {
      dependencyResourceSecretStore: secretStore,
      nativeCommandRunner,
    });
    const context = createExecutionContext({
      requestId: "req_shell_dependency_backup_redis_native_provider_test",
      entrypoint: "system",
    });
    const secretRef = "appaloft://dependency-resources/rsi_shell_redis_native/connection";
    const rawConnection = "redis://:raw-password@localhost:6379/0";
    secretStore.set(secretRef, rawConnection);

    const backup = await provider.createBackup(context, {
      backupId: "drb_shell_redis_native",
      dependencyResourceId: "rsi_shell_redis_native",
      dependencyKind: "redis",
      providerKey: "external-redis",
      providerResourceHandle: "redis/rsi_shell_redis_native",
      connection: {
        host: "localhost",
        port: 6379,
        maskedConnection: "redis://:********@localhost:6379/0",
        secretRef,
      },
      attemptId: "dba_shell_redis_native",
      requestedAt: "2026-05-14T00:00:00.000Z",
    });

    expect(backup.isOk()).toBe(true);
    expect(nativeCommandRunner.calls).toHaveLength(1);
    expect(nativeCommandRunner.calls[0]).toMatchObject({
      operation: "redis-backup",
      connectionUrl: rawConnection,
    });
    expect(nativeCommandRunner.calls[0]?.artifactPath).toEndWith(
      "drb_shell_redis_native.redis.json",
    );

    const backupArtifact = JSON.parse(
      await readFile(
        join(
          dataDir,
          "dependency-resource-backups",
          "rsi_shell_redis_native",
          "drb_shell_redis_native.json",
        ),
        "utf8",
      ),
    );
    expect(backupArtifact).toMatchObject({
      executionMode: "redis-native-command",
      nativeArtifactPath: nativeCommandRunner.calls[0]?.artifactPath,
      connection: {
        maskedConnection: "redis://:********@localhost:6379/0",
        secretRef,
      },
    });
    expect(JSON.stringify(backupArtifact)).not.toContain("raw-password");

    const restored = await provider.restoreBackup(context, {
      backupId: "drb_shell_redis_native",
      dependencyResourceId: "rsi_shell_redis_native",
      dependencyKind: "redis",
      providerKey: "external-redis",
      providerArtifactHandle: "backup/rsi_shell_redis_native/drb_shell_redis_native",
      providerResourceHandle: "redis/rsi_shell_redis_native",
      connection: {
        host: "localhost",
        port: 6379,
        maskedConnection: "redis://:********@localhost:6379/0",
        secretRef,
      },
      restoreAttemptId: "dra_shell_redis_native",
      requestedAt: "2026-05-14T00:01:00.000Z",
    });

    expect(restored.isOk()).toBe(true);
    expect(nativeCommandRunner.calls).toHaveLength(2);
    expect(nativeCommandRunner.calls[1]).toMatchObject({
      operation: "redis-restore",
      connectionUrl: rawConnection,
      artifactPath: nativeCommandRunner.calls[0]?.artifactPath,
    });
    const restoreArtifact = JSON.parse(
      await readFile(
        join(
          dataDir,
          "dependency-resource-backups",
          "rsi_shell_redis_native",
          "drb_shell_redis_native.dra_shell_redis_native.restore.json",
        ),
        "utf8",
      ),
    );
    expect(restoreArtifact).toMatchObject({
      executionMode: "redis-native-command",
      backupId: "drb_shell_redis_native",
      restoreAttemptId: "dra_shell_redis_native",
    });
    expect(JSON.stringify(restoreArtifact)).not.toContain("raw-password");
  });

  test("[DEP-RES-BACKUP-001] [DEP-RES-BACKUP-006] passes Redis RESTORE payload as the serialized value argument", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "appaloft-dependency-backup-redis-cli-"));
    const artifactPath = join(dataDir, "redis-backup.json");
    const binDir = join(dataDir, "bin");
    const argsLog = join(dataDir, "redis-cli.args.log");
    const stdinLog = join(dataDir, "redis-cli.stdin.log");
    await mkdir(binDir);
    await Bun.write(
      artifactPath,
      `${JSON.stringify({
        schemaVersion: "appaloft.redis-logical-backup/v1",
        generatedAt: "2026-05-16T00:00:00.000Z",
        keyCount: 1,
        keys: [
          {
            key: "appaloft:e2e:dependency-backup:restore-command",
            ttlMs: -1,
            dumpBase64: Buffer.from("serialized-redis-dump").toString("base64"),
          },
        ],
      })}\n`,
    );
    await Bun.write(
      join(binDir, "redis-cli"),
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$APPALOFT_TEST_REDIS_CLI_ARGS_LOG"
if [[ "$*" == *" -x RESTORE "* ]]; then
  cat > "$APPALOFT_TEST_REDIS_CLI_STDIN_LOG"
fi
`,
    );
    await chmod(join(binDir, "redis-cli"), 0o755);

    const previousPath = process.env.PATH;
    const previousArgsLog = process.env.APPALOFT_TEST_REDIS_CLI_ARGS_LOG;
    const previousStdinLog = process.env.APPALOFT_TEST_REDIS_CLI_STDIN_LOG;
    process.env.PATH = `${binDir}:${previousPath ?? ""}`;
    process.env.APPALOFT_TEST_REDIS_CLI_ARGS_LOG = argsLog;
    process.env.APPALOFT_TEST_REDIS_CLI_STDIN_LOG = stdinLog;
    try {
      const restored = await new BunDependencyResourceNativeCommandRunner().run({
        operation: "redis-restore",
        connectionUrl: "redis://127.0.0.1:6379/0",
        artifactPath,
        redactions: ["redis://127.0.0.1:6379/0"],
      });

      expect(restored.isOk()).toBe(true);
      const calls = (await readFile(argsLog, "utf8")).trim().split(/\r?\n/);
      expect(calls).toEqual([
        "-u redis://127.0.0.1:6379/0 DEL appaloft:e2e:dependency-backup:restore-command",
        "-u redis://127.0.0.1:6379/0 -x RESTORE appaloft:e2e:dependency-backup:restore-command 0",
      ]);
      expect(await readFile(stdinLog, "utf8")).toBe("serialized-redis-dump");
    } finally {
      process.env.PATH = previousPath;
      if (previousArgsLog === undefined) {
        delete process.env.APPALOFT_TEST_REDIS_CLI_ARGS_LOG;
      } else {
        process.env.APPALOFT_TEST_REDIS_CLI_ARGS_LOG = previousArgsLog;
      }
      if (previousStdinLog === undefined) {
        delete process.env.APPALOFT_TEST_REDIS_CLI_STDIN_LOG;
      } else {
        process.env.APPALOFT_TEST_REDIS_CLI_STDIN_LOG = previousStdinLog;
      }
    }
  });
});
