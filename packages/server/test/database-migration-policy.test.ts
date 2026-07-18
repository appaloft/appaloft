import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type ControlPlaneSecretRotationPort, tokens } from "@appaloft/application";
import { type AuthRuntime } from "@appaloft/auth-better";
import { ok } from "@appaloft/core";
import { createDatabase } from "@appaloft/persistence-pg";
import { createAppaloftServer } from "@appaloft/server";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function createConflictingPgliteState(): Promise<{ dataDir: string; pgliteDataDir: string }> {
  const dataDir = await mkdtemp(join(tmpdir(), "appaloft-server-migration-policy-"));
  tempRoots.push(dataDir);
  const pgliteDataDir = join(dataDir, "pglite");
  const database = await createDatabase({ driver: "pglite", pgliteDataDir });
  try {
    await database.db.schema
      .createTable("projects")
      .addColumn("id", "text", (column) => column.primaryKey())
      .execute();
  } finally {
    await database.close();
  }
  return { dataDir, pgliteDataDir };
}

function flags(dataDir: string, pgliteDataDir: string) {
  return {
    appVersion: "0.1.0-test",
    authProvider: "none" as const,
    databaseDriver: "pglite" as const,
    dataDir,
    docsStaticDir: "",
    httpHost: "localhost",
    httpPort: 3001,
    pgliteDataDir,
    webStaticDir: "",
    workerRuntime: {
      mode: "disabled" as const,
      queueBackend: "database" as const,
      workerCount: 0,
      workerGroup: "test-worker",
    },
  };
}

function createTestAuthRuntime(): AuthRuntime {
  return {
    async authorizeProductSession(_context, input) {
      return ok({
        actor: { kind: "user", id: "usr_test", label: "test@example.test" },
        email: "test@example.test",
        organizationId: input.organizationId ?? "org_test",
        role: input.requiredRole,
        userId: "usr_test",
      });
    },
    async getSessionStatus() {
      return {
        accountSecurity: { enabled: true, passwordState: "unknown" },
        accountRecovery: { enabled: false },
        enabled: true,
        emailVerification: { enabled: false, otpEnabled: false, required: false },
        provider: "better-auth",
        loginRequired: true,
        deferredAuth: false,
        session: { user: { id: "usr_test" } },
        providers: [],
      };
    },
    async getProviderAccessToken() {
      return null;
    },
    async issueCliProductSessionCookie() {
      return null;
    },
    async handle() {
      return new Response(null, { status: 404 });
    },
  } as AuthRuntime;
}

describe("PGlite migration policy", () => {
  test("[CPS-COMPAT-032] ordinary startup fails when a migration cannot be applied", async () => {
    const state = await createConflictingPgliteState();

    await expect(
      createAppaloftServer({
        flags: flags(state.dataDir, state.pgliteDataDir),
        authRuntime: createTestAuthRuntime(),
      }),
    ).rejects.toThrow();
  }, 20_000);

  test("[CPS-COMPAT-032] read-only remote maintenance inspects the original schema without migrating it", async () => {
    const state = await createConflictingPgliteState();
    const server = await createAppaloftServer({
      flags: flags(state.dataDir, state.pgliteDataDir),
      authRuntime: createTestAuthRuntime(),
      remotePgliteStateSyncSession: {
        dataRoot: "/srv/appaloft/state",
        localPgliteDataDir: state.pgliteDataDir,
        readOnly: true,
        target: { host: "example.test", port: 22, username: "appaloft" },
        async releaseForCliRuntime() {
          return ok(undefined);
        },
        async refreshLocalMirror() {
          return ok(undefined);
        },
      },
    });

    try {
      const rotation = server.container.resolve<ControlPlaneSecretRotationPort>(
        tokens.controlPlaneSecretRotationPort,
      );
      const plan = await rotation.plan();

      expect(plan._unsafeUnwrap()).toMatchObject({ recordCount: 0, variableKeyCount: 0 });
    } finally {
      await server.shutdown();
    }
  }, 20_000);
});
