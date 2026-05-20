import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import {
  createExecutionContext,
  DefaultRouteSurfacePort,
  DefaultTenantContextResolver,
  EvaluateRouteSurfaceCommand,
  EvaluateRouteSurfaceUseCase,
  ListRouteSurfaceDecisionsQuery,
  ListRouteSurfaceDecisionsQueryService,
} from "../src";

describe("neutral route surface extension", () => {
  test("[CLOUD-SURFACE-PUBLIC-002] default route surface hook skips without side effects", async () => {
    const context = createExecutionContext({
      entrypoint: "rpc",
      requestId: "req_public_route_surface_default",
      tenant: {
        tenantId: "tenant_local",
        organizationId: "org_local",
      },
    });

    const result = await new DefaultRouteSurfacePort().evaluateRouteSurface(context, {
      operationKey: "route-surfaces.prepare",
      capabilityKey: "runtime.local-development",
      source: "application-test",
      surfaceKind: "static-artifact",
      resourceRefs: {
        projectId: "prj_1",
        environmentId: "env_1",
        resourceId: "res_1",
        deploymentId: "dep_1",
        staticArtifactId: "sta_1",
      },
    });

    expect(result).toEqual({
      operationKey: "route-surfaces.prepare",
      decision: "skipped",
      allowed: true,
      reason: "route-surface-default-noop",
      source: "default",
      surfaceKind: "static-artifact",
      details: {
        operationKey: "route-surfaces.prepare",
        source: "application-test",
        surfaceKind: "static-artifact",
        capabilityKey: "runtime.local-development",
        organizationId: "org_local",
        tenantId: "tenant_local",
      },
    });
    await expect(new DefaultRouteSurfacePort().listRouteSurfaceDecisions()).resolves.toEqual([]);
  });

  test("[CLOUD-SURFACE-PUBLIC-002] evaluate use case resolves tenant context before the hook", async () => {
    const context = createExecutionContext({
      entrypoint: "rpc",
      requestId: "req_public_route_surface_use_case",
    });
    const command = EvaluateRouteSurfaceCommand.create({
      operationKey: "route-surfaces.prepare",
      capabilityKey: "cloud.static-artifacts.publish",
      source: "api-harness",
      surfaceKind: "static-artifact",
    })._unsafeUnwrap();
    const useCase = new EvaluateRouteSurfaceUseCase(new DefaultRouteSurfacePort(), {
      resolveTenantContext: async () => ({
        tenantId: "tenant_query",
        organizationId: "org_query",
        source: "test",
      }),
    });

    const result = await useCase.execute(context, command);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().result).toEqual(
      expect.objectContaining({
        operationKey: "route-surfaces.prepare",
        allowed: true,
        decision: "skipped",
        reason: "route-surface-default-noop",
        surfaceKind: "static-artifact",
        details: expect.objectContaining({
          organizationId: "org_query",
          tenantId: "tenant_query",
        }),
      }),
    );
  });

  test("[CLOUD-SURFACE-QUERY-008] readback query uses the neutral port", async () => {
    const context = createExecutionContext({
      entrypoint: "rpc",
      requestId: "req_public_route_surface_list",
    });
    const query = ListRouteSurfaceDecisionsQuery.create({
      tenantId: "tenant_query",
      surfaceKind: "routing",
    })._unsafeUnwrap();
    const service = new ListRouteSurfaceDecisionsQueryService(
      {
        evaluateRouteSurface: new DefaultRouteSurfacePort().evaluateRouteSurface.bind(
          new DefaultRouteSurfacePort(),
        ),
        listRouteSurfaceDecisions: async (_context, input) => [
          {
            schemaVersion: "route-surface.decision/v1",
            id: "route_surface_1",
            operationKey: "route-surfaces.prepare",
            decision: "enabled",
            reason: "test-record",
            source: "test",
            surfaceKind: input?.surfaceKind ?? "routing",
            tenantId: input?.tenantId,
            decidedAt: "2026-05-20T00:00:01.000Z",
          },
        ],
      },
      new DefaultTenantContextResolver(),
    );

    const result = await service.execute(context, query);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().records).toEqual([
      expect.objectContaining({
        schemaVersion: "route-surface.decision/v1",
        id: "route_surface_1",
        surfaceKind: "routing",
        tenantId: "tenant_query",
      }),
    ]);
  });
});
