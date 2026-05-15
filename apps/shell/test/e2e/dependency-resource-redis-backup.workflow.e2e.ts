import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, type DependencyResourceSecretStore } from "@appaloft/application";
import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";
import {
  BunDependencyResourceNativeCommandRunner,
  ShellDependencyResourceBackupProvider,
} from "../../src/register-application-services";

class MemoryDependencyResourceSecretStore implements DependencyResourceSecretStore {
  constructor(private readonly secretValue: string) {}

  async storeConnection(): Promise<Result<{ secretRef: string }, DomainError>> {
    return ok({ secretRef: "appaloft://dependency-resources/rsi_redis_e2e/connection" });
  }

  async resolve(
    _context: Parameters<DependencyResourceSecretStore["resolve"]>[0],
    input: { secretRef: string },
  ): Promise<Result<{ secretRef: string; secretValue: string }, DomainError>> {
    if (input.secretRef !== "appaloft://dependency-resources/rsi_redis_e2e/connection") {
      return err(domainError.notFound("dependency_resource_secret", input.secretRef));
    }
    return ok({ secretRef: input.secretRef, secretValue: this.secretValue });
  }
}

function redisCli(
  connectionUrl: string,
  args: string[],
): { stdout: string; stderr: string; code: number } {
  const result = Bun.spawnSync(["redis-cli", "-u", connectionUrl, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    stdout: new TextDecoder().decode(result.stdout ?? new Uint8Array()).trim(),
    stderr: new TextDecoder().decode(result.stderr ?? new Uint8Array()).trim(),
    code: result.exitCode,
  };
}

function expectRedisOk(result: { stderr: string; code: number }, label: string): void {
  expect(result.code, `${label}: ${result.stderr}`).toBe(0);
}

const enabled = process.env.APPALOFT_E2E_REDIS_BACKUP_RESTORE === "true";
const redisUrl = process.env.APPALOFT_E2E_REDIS_URL ?? "redis://127.0.0.1:6379/0";

describe("dependency resource Redis native backup/restore e2e", () => {
  if (!enabled) {
    test.skip("[DEP-RES-BACKUP-001] [DEP-RES-BACKUP-006] real Redis logical backup/restore requires APPALOFT_E2E_REDIS_BACKUP_RESTORE=true", () => {});
    return;
  }

  test("[DEP-RES-BACKUP-001] [DEP-RES-BACKUP-006] restores Redis keys through redis-cli logical dump", async () => {
    const key = `appaloft:e2e:dependency-backup:${crypto.randomUUID()}`;
    const secretRef = "appaloft://dependency-resources/rsi_redis_e2e/connection";
    const provider = new ShellDependencyResourceBackupProvider(
      await mkdtemp(join(tmpdir(), "appaloft-redis-backup-e2e-")),
      {
        dependencyResourceSecretStore: new MemoryDependencyResourceSecretStore(redisUrl),
        nativeCommandRunner: new BunDependencyResourceNativeCommandRunner(),
      },
    );
    const context = createExecutionContext({
      requestId: "req_dependency_resource_redis_backup_e2e",
      entrypoint: "system",
    });

    try {
      expectRedisOk(redisCli(redisUrl, ["DEL", key]), "delete stale key");
      expectRedisOk(redisCli(redisUrl, ["SET", key, "before-restore"]), "seed key");

      const backup = await provider.createBackup(context, {
        backupId: "drb_redis_e2e",
        dependencyResourceId: "rsi_redis_e2e",
        dependencyKind: "redis",
        providerKey: "external-redis",
        providerResourceHandle: "redis/rsi_redis_e2e",
        connection: {
          host: "127.0.0.1",
          port: 6379,
          maskedConnection: "redis://:********@127.0.0.1:6379/0",
          secretRef,
        },
        attemptId: "dba_redis_e2e",
        requestedAt: "2026-05-15T00:00:00.000Z",
      });

      expect(backup.isOk()).toBe(true);
      expectRedisOk(redisCli(redisUrl, ["SET", key, "after-backup"]), "mutate key after backup");

      const restore = await provider.restoreBackup(context, {
        backupId: "drb_redis_e2e",
        dependencyResourceId: "rsi_redis_e2e",
        dependencyKind: "redis",
        providerKey: "external-redis",
        providerArtifactHandle: "backup/rsi_redis_e2e/drb_redis_e2e",
        providerResourceHandle: "redis/rsi_redis_e2e",
        connection: {
          host: "127.0.0.1",
          port: 6379,
          maskedConnection: "redis://:********@127.0.0.1:6379/0",
          secretRef,
        },
        restoreAttemptId: "dra_redis_e2e",
        requestedAt: "2026-05-15T00:01:00.000Z",
      });

      expect(restore.isOk()).toBe(true);
      const restored = redisCli(redisUrl, ["GET", key]);
      expectRedisOk(restored, "read restored key");
      expect(restored.stdout).toBe("before-restore");
    } finally {
      redisCli(redisUrl, ["DEL", key]);
    }
  });
});
