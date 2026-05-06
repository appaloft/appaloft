import { describe, expect, test } from "bun:test";

import {
  resourceDependencyBindingSummarySchema,
  rotateResourceDependencyBindingSecretResponseSchema,
} from "../src/index";

describe("resource dependency binding contract", () => {
  test("[DEP-BIND-REDIS-BIND-001] accepts safe Redis binding summaries", () => {
    const binding = resourceDependencyBindingSummarySchema.parse({
      id: "rbd_redis",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_web",
      dependencyResourceId: "rsi_redis",
      dependencyResourceName: "External Redis",
      dependencyResourceSlug: "external-redis",
      kind: "redis",
      sourceMode: "imported-external",
      providerKey: "external-redis",
      providerManaged: false,
      lifecycleStatus: "ready",
      target: {
        targetName: "REDIS_URL",
        scope: "runtime-only",
        injectionMode: "env",
        secretRef: "appaloft://dependency-resources/rsi_redis/connection",
      },
      connection: {
        host: "redis.example.com",
        port: 6379,
        databaseName: "0",
        maskedConnection: "redis://:********@redis.example.com:6379/0",
        secretRef: "appaloft://dependency-resources/rsi_redis/connection",
      },
      bindingReadiness: { status: "ready" },
      snapshotReadiness: { status: "ready" },
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(binding.kind).toBe("redis");
    expect(JSON.stringify(binding)).not.toContain("super-secret");
  });

  test("[DEP-BIND-ROTATE-003] [DEP-BIND-ROTATE-005] accepts safe secret rotation metadata", () => {
    const binding = resourceDependencyBindingSummarySchema.parse({
      id: "rbd_pg",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_web",
      dependencyResourceId: "rsi_pg",
      dependencyResourceName: "External DB",
      dependencyResourceSlug: "external-db",
      kind: "postgres",
      sourceMode: "imported-external",
      providerKey: "external-postgres",
      providerManaged: false,
      lifecycleStatus: "ready",
      target: {
        targetName: "DATABASE_URL",
        scope: "runtime-only",
        injectionMode: "env",
        secretRef: "secret://dependency-binding/rbd_pg/current",
      },
      secretRotation: {
        secretRef: "secret://dependency-binding/rbd_pg/current",
        secretVersion: "rbsv_0001",
        rotatedAt: "2026-01-01T00:00:00.000Z",
      },
      bindingReadiness: { status: "ready" },
      snapshotReadiness: { status: "ready" },
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      dependencyResource: {
        id: "rsi_pg",
        projectId: "prj_demo",
        environmentId: "env_demo",
        name: "External DB",
        slug: "external-db",
        kind: "postgres",
        sourceMode: "imported-external",
        providerKey: "external-postgres",
        providerManaged: false,
        lifecycleStatus: "ready",
        bindingReadiness: { status: "ready" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    const response = rotateResourceDependencyBindingSecretResponseSchema.parse({
      id: "rbd_pg",
      rotatedAt: "2026-01-01T00:00:00.000Z",
      secretVersion: "rbsv_0001",
    });

    expect(binding.secretRotation?.secretVersion).toBe("rbsv_0001");
    expect(response.id).toBe("rbd_pg");
    expect(JSON.stringify({ binding, response })).not.toContain("super-secret");
    expect(JSON.stringify({ binding, response })).not.toContain("postgres://");
  });
});
