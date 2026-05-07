import { describe, expect, test } from "bun:test";

import {
  dependencyResourceSummarySchema,
  listDependencyResourcesResponseSchema,
} from "../src/index";

describe("dependency resource contract", () => {
  test("[DEP-RES-REDIS-READ-001] [DEP-RES-REDIS-READ-002] accepts safe Redis dependency summaries", () => {
    const redis = dependencyResourceSummarySchema.parse({
      id: "rsi_redis",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "External Cache",
      slug: "external-cache",
      kind: "redis",
      sourceMode: "imported-external",
      providerKey: "external-redis",
      providerManaged: false,
      lifecycleStatus: "ready",
      connection: {
        host: "cache.example.com",
        port: 6379,
        databaseName: "0",
        maskedConnection: "redis://default:********@cache.example.com:6379/0",
        secretRef: "secret://dependency/redis/external-cache",
      },
      bindingReadiness: { status: "not-implemented" },
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const list = listDependencyResourcesResponseSchema.parse({
      schemaVersion: "dependency-resources.list/v1",
      items: [redis],
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(list.items[0]?.kind).toBe("redis");
    expect(JSON.stringify(list)).not.toContain("super-secret");
  });

  test("[DEP-RES-PG-NATIVE-002] accepts safe managed Postgres realization metadata", () => {
    const postgres = dependencyResourceSummarySchema.parse({
      id: "rsi_pg",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Managed DB",
      slug: "managed-db",
      kind: "postgres",
      sourceMode: "appaloft-managed",
      providerKey: "appaloft-managed-postgres",
      providerManaged: true,
      lifecycleStatus: "ready",
      connection: {
        host: "managed.postgres.internal",
        port: 5432,
        databaseName: "managed_db",
        maskedConnection: "postgres://app:********@managed.postgres.internal:5432/managed_db",
        secretRef: "secret://dependency/postgres/rsi_pg",
      },
      providerRealization: {
        status: "ready",
        attemptId: "dpr_1",
        attemptedAt: "2026-01-01T00:00:00.000Z",
        providerResourceHandle: "pg/rsi_pg",
        realizedAt: "2026-01-01T00:00:00.000Z",
      },
      bindingReadiness: { status: "ready" },
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(postgres.providerRealization?.status).toBe("ready");
    expect(JSON.stringify(postgres)).not.toContain("super-secret");
  });

  test("[DEP-RES-REDIS-NATIVE-002] accepts safe managed Redis realization metadata", () => {
    const redis = dependencyResourceSummarySchema.parse({
      id: "rsi_managed_redis",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Managed Redis",
      slug: "managed-redis",
      kind: "redis",
      sourceMode: "appaloft-managed",
      providerKey: "appaloft-managed-redis",
      providerManaged: true,
      lifecycleStatus: "ready",
      connection: {
        host: "managed-redis.redis.internal",
        port: 6379,
        databaseName: "0",
        maskedConnection: "redis://:********@managed-redis.redis.internal:6379/0",
        secretRef: "secret://dependency/redis/rsi_managed_redis",
      },
      providerRealization: {
        status: "ready",
        attemptId: "dpr_redis_1",
        attemptedAt: "2026-01-01T00:00:00.000Z",
        providerResourceHandle: "redis/rsi_managed_redis",
        realizedAt: "2026-01-01T00:00:00.000Z",
      },
      bindingReadiness: { status: "ready" },
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(redis.providerRealization?.status).toBe("ready");
    expect(redis.kind).toBe("redis");
    expect(JSON.stringify(redis)).not.toContain("super-secret");
  });
});
