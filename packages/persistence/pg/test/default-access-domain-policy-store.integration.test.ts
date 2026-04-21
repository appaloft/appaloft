import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createExecutionContext,
  type RepositoryContext,
  toRepositoryContext,
} from "@appaloft/application";
import {
  CreatedAt,
  DeploymentTargetId,
  DeploymentTargetName,
  HostAddress,
  PortNumber,
  ProviderKey,
  Server,
  UpsertServerSpec,
} from "@appaloft/core";

function createRepositoryContext(): RepositoryContext {
  return toRepositoryContext(
    createExecutionContext({
      entrypoint: "system",
      requestId: "req_default_access_policy_store_test",
      tracer: {
        startActiveSpan(_name, _options, callback) {
          return Promise.resolve(
            callback({
              addEvent() {},
              recordError() {},
              setAttribute() {},
              setAttributes() {},
              setStatus() {},
            }),
          );
        },
      },
    }),
  );
}

function serverFixture(id = "srv_demo"): Server {
  return Server.register({
    id: DeploymentTargetId.rehydrate(id),
    name: DeploymentTargetName.rehydrate("demo-server"),
    host: HostAddress.rehydrate("127.0.0.1"),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate("generic-ssh"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();
}

describe("default access domain policy store pglite integration", () => {
  test("[DEF-ACCESS-POLICY-007] persists system and deployment-target policy state through PGlite", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "appaloft-default-access-policy-store-"));
    const context = createRepositoryContext();

    try {
      const {
        createDatabase,
        createMigrator,
        PgDefaultAccessDomainPolicyStore,
        PgServerRepository,
      } = await import("../src");
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir: tempDir,
      });

      try {
        const migrator = createMigrator(database.db);
        await migrator.migrateToLatest();

        const serverRepository = new PgServerRepository(database.db);
        const store = new PgDefaultAccessDomainPolicyStore(database.db);
        const server = serverFixture();

        await serverRepository.upsert(context, server, UpsertServerSpec.fromServer(server));

        const systemPolicy = await store.upsert({
          id: "dap_system",
          scope: { kind: "system" },
          mode: "provider",
          providerKey: "sslip",
          updatedAt: "2026-01-01T00:00:10.000Z",
          idempotencyKey: "policy-1",
        });
        const targetPolicy = await store.upsert({
          id: "dap_server",
          scope: { kind: "deployment-target", serverId: "srv_demo" },
          mode: "disabled",
          updatedAt: "2026-01-01T00:00:11.000Z",
        });

        expect(systemPolicy.isOk()).toBe(true);
        expect(targetPolicy.isOk()).toBe(true);

        const persistedSystem = await store.read({ kind: "system" });
        const persistedTarget = await store.read({
          kind: "deployment-target",
          serverId: "srv_demo",
        });

        expect(persistedSystem.isOk()).toBe(true);
        expect(persistedTarget.isOk()).toBe(true);
        expect(persistedSystem._unsafeUnwrap()).toEqual({
          id: "dap_system",
          scope: { kind: "system" },
          mode: "provider",
          providerKey: "sslip",
          updatedAt: "2026-01-01T00:00:10.000Z",
          idempotencyKey: "policy-1",
        });
        expect(persistedTarget._unsafeUnwrap()).toEqual({
          id: "dap_server",
          scope: { kind: "deployment-target", serverId: "srv_demo" },
          mode: "disabled",
          updatedAt: "2026-01-01T00:00:11.000Z",
        });
      } finally {
        await database.close();
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
