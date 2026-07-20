import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ServerRepository } from "@appaloft/application";
import {
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetId,
  DeploymentTargetName,
  HostAddress,
  PortNumber,
  ProviderKey,
} from "@appaloft/core";
import {
  ShellDependencyResourceBackupProvider,
  type ShellDependencyResourceNativeCommandInput,
  type ShellDependencyResourceNativeCommandRunner,
  ShellManagedDependencyProvider,
} from "../src/register-application-services";

class SingleServerRepository implements ServerRepository {
  readonly server = DeploymentTarget.register({
    id: DeploymentTargetId.rehydrate("srv_production"),
    name: DeploymentTargetName.rehydrate("Production"),
    host: HostAddress.rehydrate("127.0.0.1"),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate("generic-ssh"),
    createdAt: CreatedAt.rehydrate("2026-07-20T00:00:00.000Z"),
  })._unsafeUnwrap();

  async findOne() {
    return this.server;
  }

  async upsert(): Promise<void> {}
}

class RejectingNativeCommandRunner implements ShellDependencyResourceNativeCommandRunner {
  readonly calls: ShellDependencyResourceNativeCommandInput[] = [];

  async run(input: ShellDependencyResourceNativeCommandInput) {
    this.calls.push(input);
    throw new Error("control-plane native command must not run");
  }
}

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function createTempRoot(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "appaloft-managed-dependency-provider-"));
  tempRoots.push(path);
  return path;
}

describe("ShellManagedDependencyProvider", () => {
  test("[DEP-RES-BACKUP-011] backs up managed Postgres on its Docker target", async () => {
    const root = await createTempRoot();
    const binDir = join(root, "bin");
    const sshLog = join(root, "ssh.log");
    await mkdir(binDir, { recursive: true });
    await writeFile(
      join(binDir, "ssh"),
      ["#!/bin/sh", `printf '%s\\n' "$*" >> ${JSON.stringify(sshLog)}`, "exit 0", ""].join("\n"),
    );
    await chmod(join(binDir, "ssh"), 0o755);

    const previousPath = process.env.PATH;
    process.env.PATH = `${binDir}:/usr/bin:/bin:/usr/sbin:/sbin:${previousPath ?? ""}`;
    try {
      const nativeRunner = new RejectingNativeCommandRunner();
      const provider = new ShellDependencyResourceBackupProvider(join(root, "data"), {
        nativeCommandRunner: nativeRunner,
        serverRepository: new SingleServerRepository(),
      });
      const backup = await provider.createBackup(
        { requestId: "req_managed_backup", entrypoint: "test" },
        {
          backupId: "drb_managed",
          dependencyResourceId: "rsi_managed",
          dependencyKind: "postgres",
          providerKey: "appaloft-managed-postgres",
          providerResourceHandle:
            "docker-single-server:v1:postgres:srv_production:appaloft-postgres-rsi_managed",
          connectionSecretValue:
            "postgres://app:managed-secret@appaloft-postgres-rsi_managed:5432/stocktruth_postgres",
          attemptId: "dba_managed",
          requestedAt: "2026-07-20T00:00:00.000Z",
        },
      );

      expect(backup.isOk()).toBe(true);
      expect(nativeRunner.calls).toHaveLength(0);
      expect(backup._unsafeUnwrap().providerArtifactHandle).toMatch(
        /^docker-single-server-backup:v1:postgres:srv_production:appaloft-postgres-rsi_managed:drb_managed$/,
      );
      const log = await readFile(sshLog, "utf8");
      expect(log).toContain("docker exec");
      expect(log).toContain("pg_dump");
      expect(log).toContain("appaloft-postgres-rsi_managed");
      expect(log).not.toContain("managed-secret");

      const restored = await provider.restoreBackup(
        { requestId: "req_managed_restore_to_external", entrypoint: "test" },
        {
          backupId: "drb_managed",
          dependencyResourceId: "rsi_supabase",
          sourceDependencyResourceId: "rsi_managed",
          dependencyKind: "postgres",
          providerKey: "external-postgres",
          sourceProviderKey: "appaloft-managed-postgres",
          providerArtifactHandle: backup._unsafeUnwrap().providerArtifactHandle,
          connectionSecretValue:
            "postgres://postgres.project:target-secret@pooler.example.com:5432/postgres?sslmode=require",
          restoreAttemptId: "dra_migration",
          requestedAt: "2026-07-20T00:01:00.000Z",
        },
      );

      expect(restored.isOk()).toBe(true);
      expect(nativeRunner.calls).toHaveLength(0);
      const restoreLog = await readFile(sshLog, "utf8");
      expect(restoreLog).toContain("pg_restore");
      expect(restoreLog).toContain("postgres:16-alpine");
      expect(restoreLog).not.toContain("target-secret");
    } finally {
      process.env.PATH = previousPath;
    }
  });

  test("[CLOUD-DEP-PROV-CAPABILITY-052] rejects required capabilities before shell provider realization", () => {
    const provider = new ShellManagedDependencyProvider();

    expect(
      provider.supports("appaloft-managed-postgres", "postgres", [
        { type: "postgres-extension", name: "vector", required: true },
      ]),
    ).toBe(false);
    expect(
      provider.supports("appaloft-managed-redis", "redis", [
        { type: "redis-module", name: "search", required: true },
      ]),
    ).toBe(false);
  });

  test("[CLOUD-DEP-PROV-CAPABILITY-052] allows optional unsupported capabilities for readback evidence", () => {
    const provider = new ShellManagedDependencyProvider();

    expect(
      provider.supports("appaloft-managed-redis", "redis", [
        { type: "redis-module", name: "search", required: false },
      ]),
    ).toBe(true);
  });

  test("[DEP-BIND-SECRET-RESOLVE-005] realizes targeted Postgres as Docker-backed runtime secret", async () => {
    const root = await createTempRoot();
    const binDir = join(root, "bin");
    const sshLog = join(root, "ssh.log");
    await mkdir(binDir, { recursive: true });
    await writeFile(
      join(binDir, "ssh"),
      ["#!/bin/sh", `printf '%s\\n' "$*" >> ${JSON.stringify(sshLog)}`, "exit 0", ""].join("\n"),
    );
    await chmod(join(binDir, "ssh"), 0o755);

    const previousPath = process.env.PATH;
    process.env.PATH = `${binDir}:/usr/bin:/bin:/usr/sbin:/sbin:${previousPath ?? ""}`;
    try {
      const provider = new ShellManagedDependencyProvider(join(root, "data"));
      const realized = await provider.realize(
        { requestId: "req_dependency_provider_test", entrypoint: "test" },
        {
          dependencyResourceId: "rsi_preview",
          projectId: "prj_preview",
          environmentId: "env_preview",
          kind: "postgres",
          providerKey: "appaloft-managed-postgres",
          name: "preview db",
          slug: "preview-db",
          attemptId: "dpr_preview",
          requestedAt: "2026-05-25T00:00:00.000Z",
          target: {
            serverId: "srv_preview",
            providerKey: "generic-ssh",
            targetKind: "single-server",
            host: "127.0.0.1",
            port: 22,
          },
        },
      );

      if (realized.isErr()) {
        throw new Error(JSON.stringify(realized._unsafeUnwrapErr()));
      }
      expect(realized.isOk()).toBe(true);
      const state = realized._unsafeUnwrap();
      expect(state.providerResourceHandle).toMatch(
        /^docker-single-server:v1:postgres:srv_preview:appaloft-postgres-rsi_preview$/,
      );
      expect(state.secretRef).toBeUndefined();
      expect(state.connectionSecretValue).toMatch(
        /^postgres:\/\/app:[a-f0-9]{48}@appaloft-postgres-rsi_preview:5432\/preview_db$/,
      );
      expect(state.endpoint).toMatchObject({
        host: "appaloft-postgres-rsi_preview",
        port: 5432,
        databaseName: "preview_db",
        maskedConnection: "postgres://app:********@appaloft-postgres-rsi_preview:5432/preview_db",
      });

      const log = await readFile(sshLog, "utf8");
      expect(log).toContain("network inspect 'appaloft-edge'");
      expect(log).toContain("run -d --name 'appaloft-postgres-rsi_preview'");
      expect(log).toContain("postgres:16-alpine");
    } finally {
      process.env.PATH = previousPath;
    }
  });

  test("[DEP-BIND-SECRET-RESOLVE-006] recovers an existing targeted Postgres secret without recreating the container", async () => {
    const root = await createTempRoot();
    const binDir = join(root, "bin");
    const sshLog = join(root, "ssh.log");
    await mkdir(binDir, { recursive: true });
    await writeFile(
      join(binDir, "ssh"),
      [
        "#!/bin/sh",
        `printf '%s\\n' "$*" >> ${JSON.stringify(sshLog)}`,
        'case "$*" in',
        '  *"docker inspect"*)',
        "    printf '%s\\n' 'POSTGRES_DB=stocktruth_postgres' 'POSTGRES_USER=app' 'POSTGRES_PASSWORD=recovered-secret'",
        "    exit 0",
        "    ;;",
        "esac",
        "exit 1",
        "",
      ].join("\n"),
    );
    await chmod(join(binDir, "ssh"), 0o755);

    const previousPath = process.env.PATH;
    process.env.PATH = `${binDir}:/usr/bin:/bin:/usr/sbin:/sbin:${previousPath ?? ""}`;
    try {
      const provider = new ShellManagedDependencyProvider(join(root, "data"));
      const realized = await provider.realize(
        { requestId: "req_dependency_provider_recovery", entrypoint: "test" },
        {
          dependencyResourceId: "rsi_stocktruth",
          projectId: "prj_stocktruth",
          environmentId: "env_production",
          kind: "postgres",
          providerKey: "appaloft-managed-postgres",
          name: "StockTruth Postgres",
          slug: "stocktruth-postgres",
          attemptId: "dpr_recovery",
          requestedAt: "2026-07-19T00:00:00.000Z",
          target: {
            serverId: "srv_production",
            providerKey: "generic-ssh",
            targetKind: "single-server",
            host: "127.0.0.1",
            port: 22,
          },
        },
      );

      expect(realized._unsafeUnwrap()).toMatchObject({
        connectionSecretValue:
          "postgres://app:recovered-secret@appaloft-postgres-rsi_stocktruth:5432/stocktruth_postgres",
        endpoint: {
          databaseName: "stocktruth_postgres",
        },
      });
      const log = await readFile(sshLog, "utf8");
      expect(log).toContain("docker inspect");
      expect(log).not.toContain("docker rm");
      expect(log).not.toContain("docker run");
    } finally {
      process.env.PATH = previousPath;
    }
  });

  test("[DEP-RES-REDIS-NATIVE-005] realizes targeted Redis as Docker-backed runtime secret", async () => {
    const root = await createTempRoot();
    const binDir = join(root, "bin");
    const sshLog = join(root, "ssh.log");
    await mkdir(binDir, { recursive: true });
    await writeFile(
      join(binDir, "ssh"),
      ["#!/bin/sh", `printf '%s\\n' "$*" >> ${JSON.stringify(sshLog)}`, "exit 0", ""].join("\n"),
    );
    await chmod(join(binDir, "ssh"), 0o755);

    const previousPath = process.env.PATH;
    process.env.PATH = `${binDir}:/usr/bin:/bin:/usr/sbin:/sbin:${previousPath ?? ""}`;
    try {
      const provider = new ShellManagedDependencyProvider(join(root, "data"));
      const realized = await provider.realize(
        { requestId: "req_redis_dependency_provider_test", entrypoint: "test" },
        {
          dependencyResourceId: "rsi_cache",
          projectId: "prj_preview",
          environmentId: "env_preview",
          kind: "redis",
          providerKey: "appaloft-managed-redis",
          name: "preview cache",
          slug: "preview-cache",
          attemptId: "dpr_preview_cache",
          requestedAt: "2026-05-25T00:00:00.000Z",
          target: {
            serverId: "srv_preview",
            providerKey: "generic-ssh",
            targetKind: "single-server",
            host: "127.0.0.1",
            port: 22,
          },
        },
      );

      if (realized.isErr()) {
        throw new Error(JSON.stringify(realized._unsafeUnwrapErr()));
      }
      expect(realized.isOk()).toBe(true);
      const state = realized._unsafeUnwrap();
      expect(state.providerResourceHandle).toMatch(
        /^docker-single-server:v1:redis:srv_preview:appaloft-redis-rsi_cache$/,
      );
      expect(state.secretRef).toBeUndefined();
      expect(state.connectionSecretValue).toMatch(
        /^redis:\/\/:[a-f0-9]{48}@appaloft-redis-rsi_cache:6379\/0$/,
      );
      expect(state.endpoint).toMatchObject({
        host: "appaloft-redis-rsi_cache",
        port: 6379,
        maskedConnection: "redis://:********@appaloft-redis-rsi_cache:6379/0",
      });

      const log = await readFile(sshLog, "utf8");
      expect(log).toContain("network inspect 'appaloft-edge'");
      expect(log).toContain("run -d --name 'appaloft-redis-rsi_cache'");
      expect(log).toContain("redis:7-alpine");
      expect(log).toContain("redis-cli -a");
    } finally {
      process.env.PATH = previousPath;
    }
  });
});
