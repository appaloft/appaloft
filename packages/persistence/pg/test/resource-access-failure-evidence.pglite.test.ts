import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createExecutionContext,
  ResourceAccessFailureEvidenceByHostnameSpec,
  ResourceAccessFailureEvidenceByPathSpec,
  ResourceAccessFailureEvidenceByRequestIdSpec,
  ResourceAccessFailureEvidenceUnexpiredAtSpec,
  toRepositoryContext,
} from "@appaloft/application";

describe("resource access failure evidence projection pglite integration", () => {
  test("[RES-ACCESS-DIAG-EVIDENCE-001][RES-ACCESS-DIAG-EVIDENCE-003] stores and expires safe request evidence", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-access-evidence-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    let closeDatabase: (() => Promise<void>) | undefined;

    try {
      const { createDatabase, createMigrator, PgResourceAccessFailureEvidenceProjection } =
        await import("../src/index");
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      closeDatabase = () => database.close();
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const projection = new PgResourceAccessFailureEvidenceProjection(database.db);
      const context = toRepositoryContext(createExecutionContext({ entrypoint: "http" }));
      const recordResult = await projection.record(context, {
        diagnostic: {
          schemaVersion: "resource-access-failure/v1",
          requestId: "req_pg_access",
          generatedAt: "2026-01-01T00:00:00.000Z",
          code: "resource_access_route_not_found",
          category: "not-found",
          phase: "edge-request-routing",
          httpStatus: 404,
          retriable: false,
          ownerHint: "platform",
          nextAction: "inspect-proxy-preview",
          affected: {
            url: "https://web.example.test/private",
            hostname: "web.example.test",
            path: "/private",
            method: "GET",
          },
          route: {
            resourceId: "res_web",
            deploymentId: "dep_web",
            providerKey: "traefik",
            routeId: "route_web",
            routeSource: "generated-default",
          },
        },
        capturedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-01-01T00:10:00.000Z",
      });
      expect(recordResult.isOk()).toBe(true);

      const found = await projection.findOne(
        context,
        ResourceAccessFailureEvidenceByRequestIdSpec.create("req_pg_access")
          .and(ResourceAccessFailureEvidenceByHostnameSpec.create("web.example.test"))
          .and(ResourceAccessFailureEvidenceByPathSpec.create("/private"))
          .and(ResourceAccessFailureEvidenceUnexpiredAtSpec.create("2026-01-01T00:05:00.000Z")),
      );
      expect(found.isOk()).toBe(true);
      expect(found._unsafeUnwrap()).toMatchObject({
        requestId: "req_pg_access",
        capturedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-01-01T00:10:00.000Z",
        diagnostic: {
          affected: {
            url: "https://web.example.test/private",
          },
        },
      });
      expect(JSON.stringify(found._unsafeUnwrap())).not.toContain("Authorization");
      expect(JSON.stringify(found._unsafeUnwrap())).not.toContain("token=secret");

      const expired = await projection.findOne(
        context,
        ResourceAccessFailureEvidenceByRequestIdSpec.create("req_pg_access").and(
          ResourceAccessFailureEvidenceUnexpiredAtSpec.create("2026-01-01T00:10:00.000Z"),
        ),
      );
      expect(expired.isOk()).toBe(true);
      expect(expired._unsafeUnwrap()).toBeNull();
    } finally {
      await closeDatabase?.();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);
});
