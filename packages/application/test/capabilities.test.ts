import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import {
  createExecutionContext,
  DefaultOperationCapabilityPort,
  type OperationGuardPort,
  type OperationScopePort,
  QueryCapabilitiesQuery,
  QueryCapabilitiesQueryService,
} from "../src";

describe("operation capability query", () => {
  test("[OP-CAP-001] batches neutral operation capability decisions", async () => {
    const context = createExecutionContext({
      entrypoint: "rpc",
      requestId: "req_operation_capability_test",
    });
    const guard: OperationGuardPort = {
      checkOperation: async (_context, request) => ({
        allowed: request.operationKey !== "projects.rename",
        checks: [],
        reason:
          request.operationKey === "projects.rename"
            ? "test-capability-denied"
            : "test-capability-allowed",
      }),
    };
    const scope: OperationScopePort = {
      scopeOperation: async (_context, request) => {
        if (request.operationKey === "projects.list") {
          return {
            effect: "allow",
            visibility: "constrained",
            reason: "test-capability-scope",
            constraints: [
              {
                kind: "projectId",
                operator: "in",
                values: ["prj_visible"],
              },
            ],
          };
        }

        return {
          effect: "allow",
          visibility: "unrestricted",
          reason: "test-capability-scope",
        };
      },
    };
    const query = QueryCapabilitiesQuery.create({
      queries: [
        { operationKey: "projects.list" },
        { operationKey: "projects.rename", resourceRefs: { projectId: "prj_hidden" } },
        { operationKey: "projects.show", resourceRefs: { projectId: "prj_visible" } },
      ],
    })._unsafeUnwrap();
    const service = new QueryCapabilitiesQueryService(
      new DefaultOperationCapabilityPort(guard, scope),
    );

    const result = await service.execute(context, query);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().capabilities).toEqual([
      {
        operationKey: "projects.list",
        allowed: true,
        mode: "constrained",
        hint: "partial",
        reason: "test-capability-scope",
      },
      {
        operationKey: "projects.rename",
        allowed: false,
        mode: "denied",
        hint: "disabled",
        reason: "test-capability-denied",
        details: {
          operationKey: "projects.rename",
          operationName: "RenameProjectCommand",
          reason: "test-capability-denied",
          projectId: "prj_hidden",
        },
      },
      {
        operationKey: "projects.show",
        allowed: true,
        mode: "unrestricted",
        hint: "enabled",
        reason: "test-capability-scope",
      },
    ]);
  });
});
