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
});
