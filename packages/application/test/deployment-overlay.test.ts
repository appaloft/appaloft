import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import {
  createExecutionContext,
  DefaultDeploymentOverlayPort,
  DefaultTenantContextResolver,
  EvaluateDeploymentOverlayCommand,
  EvaluateDeploymentOverlayUseCase,
  ListDeploymentOverlayDecisionsQuery,
  ListDeploymentOverlayDecisionsQueryService,
} from "../src";

describe("neutral deployment overlay extension", () => {
  test("[CLOUD-MDEP-PUBLIC-002] default deployment overlay hook skips without side effects", async () => {
    const context = createExecutionContext({
      entrypoint: "rpc",
      requestId: "req_public_deployment_overlay_default",
      tenant: {
        tenantId: "tenant_local",
        organizationId: "org_local",
      },
    });

    const result = await new DefaultDeploymentOverlayPort().evaluateDeploymentOverlay(context, {
      operationKey: "deployments.create",
      capabilityKey: "runtime.local-development",
      source: "application-test",
      resourceRefs: {
        projectId: "prj_1",
        environmentId: "env_1",
        resourceId: "res_1",
        serverId: "srv_1",
      },
    });

    expect(result).toEqual({
      operationKey: "deployments.create",
      decision: "skipped",
      allowed: true,
      reason: "deployment-overlay-default-noop",
      source: "default",
      details: {
        operationKey: "deployments.create",
        source: "application-test",
        capabilityKey: "runtime.local-development",
        organizationId: "org_local",
        tenantId: "tenant_local",
      },
    });
    await expect(
      new DefaultDeploymentOverlayPort().listDeploymentOverlayDecisions(),
    ).resolves.toEqual([]);
  });

  test("[CLOUD-MDEP-PUBLIC-002] evaluate use case resolves tenant context before the hook", async () => {
    const context = createExecutionContext({
      entrypoint: "rpc",
      requestId: "req_public_deployment_overlay_use_case",
    });
    const command = EvaluateDeploymentOverlayCommand.create({
      operationKey: "deployments.create",
      capabilityKey: "managed-deployments.use",
      source: "api-harness",
    })._unsafeUnwrap();
    const useCase = new EvaluateDeploymentOverlayUseCase(new DefaultDeploymentOverlayPort(), {
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
        operationKey: "deployments.create",
        allowed: true,
        decision: "skipped",
        reason: "deployment-overlay-default-noop",
        details: expect.objectContaining({
          organizationId: "org_query",
          tenantId: "tenant_query",
        }),
      }),
    );
  });

  test("[CLOUD-MDEP-QUERY-008] readback query uses the neutral port", async () => {
    const context = createExecutionContext({
      entrypoint: "rpc",
      requestId: "req_public_deployment_overlay_list",
    });
    const query = ListDeploymentOverlayDecisionsQuery.create({
      tenantId: "tenant_query",
    })._unsafeUnwrap();
    const service = new ListDeploymentOverlayDecisionsQueryService(
      {
        evaluateDeploymentOverlay:
          new DefaultDeploymentOverlayPort().evaluateDeploymentOverlay.bind(
            new DefaultDeploymentOverlayPort(),
          ),
        listDeploymentOverlayDecisions: async (_context, input) => [
          {
            schemaVersion: "deployment-overlay.decision/v1",
            id: "deployment_overlay_1",
            operationKey: "deployments.create",
            decision: "enabled",
            reason: "test-record",
            source: "test",
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
        schemaVersion: "deployment-overlay.decision/v1",
        id: "deployment_overlay_1",
        tenantId: "tenant_query",
      }),
    ]);
  });
});
