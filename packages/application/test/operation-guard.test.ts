import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import {
  AllowAllOperationGuardPort,
  CompositeOperationGuardPort,
  checkOperationGuards,
  createExecutionContext,
  createOperationCheckRequest,
  findOperationCatalogEntryByKey,
  type OperationCheckPort,
} from "../src";

describe("operation guard extension boundary", () => {
  test("[OP-GUARD-001] community default allows operations without engine-specific policy", async () => {
    const entry = findOperationCatalogEntryByKey("projects.create");
    expect(entry).toBeDefined();
    const context = createExecutionContext({
      entrypoint: "system",
      requestId: "req_operation_guard_default",
    });

    const result = await checkOperationGuards({
      context,
      entry: entry as NonNullable<typeof entry>,
      message: {
        name: "Customer API",
        organizationId: "org_self_hosted",
      },
      operationGuardPort: new AllowAllOperationGuardPort(),
    });

    expect(result.isOk()).toBe(true);
  });

  test("[OP-GUARD-002] composite checks return a stable generic denial structure", async () => {
    const entry = findOperationCatalogEntryByKey("projects.rename");
    expect(entry).toBeDefined();
    const context = createExecutionContext({
      actor: {
        kind: "user",
        id: "usr_viewer",
      },
      entrypoint: "http",
      principal: {
        kind: "user",
        actorId: "usr_viewer",
        userId: "usr_viewer",
        activeOrganization: {
          organizationId: "org_self_hosted",
          role: "viewer",
          productRole: "member",
        },
      },
      requestId: "req_operation_guard_deny",
    });
    const denyingCheck: OperationCheckPort = {
      checkKey: "test.authorization",
      kind: "authorization",
      checkOperation: async (_context, request) => ({
        allowed: false,
        checkKey: "test.authorization",
        kind: "authorization",
        reason: "test-role-denied",
        details: {
          operationKey: request.operationKey,
          role: request.organizationRole ?? "unknown",
        },
      }),
    };

    const result = await checkOperationGuards({
      context,
      entry: entry as NonNullable<typeof entry>,
      message: {
        projectId: "prj_demo",
        name: "Renamed",
      },
      operationGuardPort: new CompositeOperationGuardPort([denyingCheck]),
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "operation_check_denied",
      details: {
        checkKey: "test.authorization",
        checkKind: "authorization",
        operationKey: "projects.rename",
        projectId: "prj_demo",
        reason: "test-role-denied",
        role: "viewer",
      },
    });
  });

  test("[OP-GUARD-003] request shape preserves actor, organization role, and resource refs", () => {
    const entry = findOperationCatalogEntryByKey("projects.archive");
    expect(entry).toBeDefined();
    const context = createExecutionContext({
      actor: {
        kind: "user",
        id: "usr_developer",
      },
      entrypoint: "rpc",
      principal: {
        kind: "user",
        actorId: "usr_developer",
        email: "developer@example.com",
        userId: "usr_developer",
        activeOrganization: {
          organizationId: "org_product",
          role: "developer",
          productRole: "member",
        },
      },
      requestId: "req_operation_guard_request",
    });

    const request = createOperationCheckRequest({
      context,
      entry: entry as NonNullable<typeof entry>,
      message: {
        projectId: "prj_demo",
      },
    });

    expect(request).toMatchObject({
      actor: {
        kind: "user",
        id: "usr_developer",
      },
      email: "developer@example.com",
      kind: "command",
      operationKey: "projects.archive",
      organizationId: "org_product",
      organizationRole: "developer",
      productRole: "member",
      resourceRefs: {
        projectId: "prj_demo",
      },
      userId: "usr_developer",
    });
  });
});
