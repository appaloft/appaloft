import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import {
  AllowAllOperationGuardPort,
  AllowAllOperationScopePort,
  CompositeOperationGuardPort,
  checkOperationGuards,
  constraintsByKind,
  createExecutionContext,
  createOperationCheckRequest,
  findOperationCatalogEntryByKey,
  type OperationCheckPort,
  type OperationScopePort,
  scopeOperation,
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

  test("[OP-SCOPE-001] community default returns unrestricted query visibility", async () => {
    const entry = findOperationCatalogEntryByKey("projects.list");
    expect(entry).toBeDefined();
    const context = createExecutionContext({
      entrypoint: "rpc",
      requestId: "req_operation_scope_default",
    });

    const result = await scopeOperation({
      context,
      entry: entry as NonNullable<typeof entry>,
      operationScopePort: new AllowAllOperationScopePort(),
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      effect: "allow",
      reason: "community-compatibility-unrestricted-scope",
      visibility: "unrestricted",
    });
  });

  test("[OP-SCOPE-002] constrained visibility carries neutral scope constraints", async () => {
    const entry = findOperationCatalogEntryByKey("projects.list");
    expect(entry).toBeDefined();
    const spanAttributes: Record<string, boolean | number | string | undefined>[] = [];
    const spanStatuses: { message?: string; status: "error" | "ok" }[] = [];
    const context = createExecutionContext({
      entrypoint: "rpc",
      principal: {
        kind: "user",
        actorId: "usr_developer",
        activeOrganization: {
          organizationId: "org_self_hosted",
          productRole: "member",
          role: "developer",
        },
      },
      requestId: "req_operation_scope_constrained",
      tracer: {
        async startActiveSpan(_name, options, callback) {
          const attributes = { ...(options.attributes ?? {}) };
          spanAttributes.push(attributes);

          return callback({
            addEvent() {},
            recordError() {},
            setAttribute(name, value) {
              attributes[name] = value;
            },
            setAttributes(input) {
              Object.assign(attributes, input);
            },
            setStatus(status, message) {
              spanStatuses.push({
                status,
                ...(message ? { message } : {}),
              });
            },
          });
        },
      },
    });
    const scopePort: OperationScopePort = {
      scopeOperation: async (_context, request) => ({
        effect: "allow",
        visibility: "constrained",
        reason: "test-project-visibility",
        constraints: [
          { kind: "organization", operator: "in", values: [request.organizationId ?? ""] },
          { kind: "project", operator: "in", values: ["prj_visible"] },
        ],
        traceAttributes: {
          "test.scope.visible": true,
        },
      }),
    };

    const result = await scopeOperation({
      context,
      entry: entry as NonNullable<typeof entry>,
      operationScopePort: scopePort,
    });

    expect(result.isOk()).toBe(true);
    const decision = result._unsafeUnwrap();
    expect(decision).toMatchObject({
      effect: "allow",
      reason: "test-project-visibility",
      visibility: "constrained",
    });
    expect(
      decision.effect === "allow" ? constraintsByKind(decision.constraints, "project") : [],
    ).toEqual(["prj_visible"]);
    expect(spanAttributes.at(0)).toMatchObject({
      "appaloft.operation.key": "projects.list",
      "appaloft.operation.scope.effect": "allow",
      "appaloft.operation.scope.visibility": "constrained",
      "test.scope.visible": true,
    });
    expect(spanStatuses).toEqual([{ message: "test-project-visibility", status: "ok" }]);
  });

  test("[OP-SCOPE-003] denied visibility maps to the stable operation check error", async () => {
    const entry = findOperationCatalogEntryByKey("projects.list");
    expect(entry).toBeDefined();
    const context = createExecutionContext({
      entrypoint: "rpc",
      requestId: "req_operation_scope_deny",
    });
    const scopePort: OperationScopePort = {
      scopeOperation: async () => ({
        effect: "deny",
        deniedBy: {
          checkKey: "test.visibility",
          kind: "authorization",
        },
        reason: "test-scope-denied",
      }),
    };

    const result = await scopeOperation({
      context,
      entry: entry as NonNullable<typeof entry>,
      operationScopePort: scopePort,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "operation_check_denied",
      details: {
        checkKey: "test.visibility",
        checkKind: "authorization",
        operationKey: "projects.list",
        reason: "test-scope-denied",
      },
    });
  });
});
