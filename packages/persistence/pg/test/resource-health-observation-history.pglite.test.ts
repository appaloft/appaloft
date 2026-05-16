import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createExecutionContext,
  type ResourceHealthSummary,
  toRepositoryContext,
} from "@appaloft/application";

function createTestContext() {
  return createExecutionContext({
    requestId: "req_resource_health_history_pglite",
    entrypoint: "system",
  });
}

function summary(input: {
  resourceId: string;
  observedAt: string;
  overall: ResourceHealthSummary["overall"];
}): ResourceHealthSummary {
  return {
    schemaVersion: "resources.health/v1",
    resourceId: input.resourceId,
    generatedAt: input.observedAt,
    observedAt: input.observedAt,
    overall: input.overall,
    runtime: {
      lifecycle: input.overall === "healthy" ? "running" : "degraded",
      health: input.overall === "healthy" ? "healthy" : "unhealthy",
      observedAt: input.observedAt,
    },
    healthPolicy: {
      status: "configured",
      enabled: true,
      type: "http",
      path: "/health",
      expectedStatusCode: 200,
    },
    publicAccess: {
      status: input.overall === "healthy" ? "ready" : "failed",
    },
    proxy: {
      status: input.overall === "healthy" ? "ready" : "failed",
    },
    checks: [],
    sourceErrors: [],
  };
}

describe("resource health observation history pglite integration", () => {
  test("[RES-HEALTH-HIST-001] records and reads retained health observations by resource window", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-resource-health-history-"));
    const {
      createDatabase,
      createMigrator,
      PgResourceHealthObservationHistoryReadModel,
      PgResourceHealthObservationRecorder,
    } = await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: join(dataDir, "pglite"),
    });

    try {
      const migrations = await createMigrator(database.db).migrateToLatest();
      if (migrations.error) {
        throw migrations.error;
      }

      const context = createTestContext();
      const recorder = new PgResourceHealthObservationRecorder(database.db);
      const readModel = new PgResourceHealthObservationHistoryReadModel(database.db);

      const recordResult = await recorder.record(toRepositoryContext(context), {
        observationId: "rho_api_1",
        resourceId: "res_api",
        observedAt: "2026-01-01T00:01:00.000Z",
        retainedUntil: "2026-01-15T00:01:00.000Z",
        summary: summary({
          resourceId: "res_api",
          observedAt: "2026-01-01T00:01:00.000Z",
          overall: "unhealthy",
        }),
      });
      expect(recordResult.isOk()).toBe(true);

      await recorder.record(toRepositoryContext(context), {
        observationId: "rho_other_1",
        resourceId: "res_other",
        observedAt: "2026-01-01T00:01:00.000Z",
        retainedUntil: "2026-01-15T00:01:00.000Z",
        summary: summary({
          resourceId: "res_other",
          observedAt: "2026-01-01T00:01:00.000Z",
          overall: "healthy",
        }),
      });

      const history = await readModel.listObservations(context, {
        resourceId: "res_api",
        window: {
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-01T00:05:00.000Z",
        },
        limit: 10,
      });

      expect(history.isOk()).toBe(true);
      const value = history._unsafeUnwrap();
      expect(value.sourceErrors).toEqual([]);
      expect(value.observations).toHaveLength(1);
      expect(value.observations[0]).toMatchObject({
        observationId: "rho_api_1",
        overall: "unhealthy",
        runtimeLifecycle: "degraded",
        runtimeHealth: "unhealthy",
        publicAccessStatus: "failed",
        proxyStatus: "failed",
        healthPolicyStatus: "configured",
      });
      expect(value.observations[0]?.summary.resourceId).toBe("res_api");
    } finally {
      await database.db.destroy();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
