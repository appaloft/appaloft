import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";

function repositoryContext() {
  return toRepositoryContext(
    createExecutionContext({
      requestId: "req_auth_bootstrap_status_pglite_test",
      entrypoint: "system",
    }),
  );
}

async function harness() {
  const dataDir = mkdtempSync(join(tmpdir(), "appaloft-auth-bootstrap-status-pglite-"));
  const { createDatabase, createMigrator, PgAuthBootstrapStatusReader } = await import("../src");
  const database = await createDatabase({
    driver: "pglite",
    pgliteDataDir: dataDir,
  });
  const migrationResult = await createMigrator(database.db).migrateToLatest();
  expect(migrationResult.error).toBeUndefined();

  return {
    dataDir,
    database,
    reader: new PgAuthBootstrapStatusReader(database.db, {
      githubConfigured: false,
      loginUrl: "http://localhost:3721/login",
    }),
  };
}

describe("auth bootstrap status persistence", () => {
  test("[FIRST-ADMIN-STATUS-001] reports bootstrap required when no owner exists", async () => {
    const { dataDir, database, reader } = await harness();

    try {
      const result = await reader.getStatus(repositoryContext());

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual({
        bootstrapRequired: true,
        firstAdminConfigured: false,
        organizationConfigured: false,
        loginMethods: [
          {
            key: "local-password",
            configured: true,
            enabled: true,
          },
          {
            key: "github",
            configured: false,
            enabled: false,
            reason: "not-configured",
          },
          {
            key: "google",
            configured: false,
            enabled: false,
            reason: "not-configured",
          },
          {
            key: "oidc",
            configured: false,
            enabled: false,
            reason: "not-configured",
          },
        ],
        loginUrl: "http://localhost:3721/login",
        nextSteps: ["create-first-admin"],
      });
      expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("password-hash");
      expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("session-token");
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("[FIRST-ADMIN-STATUS-001] reports complete after an organization owner exists", async () => {
    const { dataDir, database, reader } = await harness();

    try {
      await database.db
        .insertInto("user")
        .values({
          id: "usr_admin",
          name: "Admin User",
          email: "admin@example.com",
          emailVerified: true,
          image: null,
          updatedAt: "2026-05-11T00:00:00.000Z",
        })
        .execute();
      await database.db
        .insertInto("organization")
        .values({
          id: "org_self_hosted",
          name: "Self-hosted Appaloft",
          slug: "self-hosted-appaloft",
          logo: null,
          createdAt: "2026-05-11T00:00:00.000Z",
          metadata: null,
        })
        .execute();
      await database.db
        .insertInto("member")
        .values({
          id: "mbr_admin",
          organizationId: "org_self_hosted",
          userId: "usr_admin",
          role: "owner",
          createdAt: "2026-05-11T00:00:00.000Z",
        })
        .execute();

      const result = await reader.getStatus(repositoryContext());

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toMatchObject({
        bootstrapRequired: false,
        firstAdminConfigured: true,
        firstAdminEmail: "admin@example.com",
        organizationConfigured: true,
        organizationId: "org_self_hosted",
        organizationSlug: "self-hosted-appaloft",
        nextSteps: ["sign-in"],
      });
      expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("password-hash");
      expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("session-token");
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
