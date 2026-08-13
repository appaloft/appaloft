import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  CleanupPlatformMigrationCommand,
  type Command,
  type CommandBus,
  createExecutionContext,
  createMigrationPlan,
  type ExecutionContext,
  type ExecutionContextFactory,
  type ProductSessionAuthorizationPort,
  type Query,
  type QueryBus,
  StatusPlatformMigrationQuery,
  VerifyPlatformMigrationQuery,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { Elysia } from "elysia";

import { mountAppaloftOrpcRoutes } from "../src";

class NoopLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class TestExecutionContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      requestId: input.requestId ?? "req_orpc_migration_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
      principal: input.principal,
    });
  }
}

const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
  authorizeProductSession: async (_context, input) =>
    ok({
      actor: { kind: "user", id: "usr_owner", label: "owner@example.test" },
      email: "owner@example.test",
      organizationId: input.organizationId ?? "org_migration",
      role: "owner",
      userId: "usr_owner",
    }),
};

function request(path: string, body: unknown): Request {
  return new Request(`http://localhost/api${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "better-auth.session_token=migration-test",
    },
    body: JSON.stringify(body),
  });
}

describe("platform migration HTTP routes", () => {
  test("[MIG-SURFACE-009][MIG-AUTH-013] dispatches status, verify, and owner-confirmed cleanup through shared messages", async () => {
    const plan = createMigrationPlan({
      apiVersion: "appaloft.io/migration/v1",
      kind: "MigrationBundle",
      metadata: { name: "HTTP migration" },
      spec: {
        project: { name: "HTTP" },
        environment: { name: "production", kind: "production" },
        target: { deploymentTargetId: "srv_http" },
        resources: [
          {
            ref: "web",
            name: "Web",
            source: { kind: "remote-git", locator: "https://github.com/acme/web.git" },
          },
        ],
      },
    });
    if (plan.isErr()) throw plan.error;
    const captured: Array<Command<unknown> | Query<unknown>> = [];
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        captured.push(command as Command<unknown>);
        return ok({
          protocol: "platform-migration/v1",
          planDigest: plan.value.planDigest,
          state: "completed",
          actions: [],
          skippedStepIds: [],
          remainingStepIds: [],
        } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        captured.push(query as Query<unknown>);
        if (query instanceof StatusPlatformMigrationQuery) {
          return ok({
            protocol: "platform-migration/v1",
            planDigest: plan.value.planDigest,
            state: "partial",
            completedStepIds: [],
            pendingStepIds: plan.value.steps.map((step) => step.id),
            evidence: [],
          } as T);
        }
        return ok({
          protocol: "platform-migration/v1",
          planDigest: plan.value.planDigest,
          state: "passed",
          evidence: [],
        } as T);
      },
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      productSessionAuthorizationPort,
      queryBus,
    });
    const task = { plan: plan.value, receipts: [] };

    const status = await app.handle(request("/migrations/status", task));
    const verification = await app.handle(request("/migrations/verify", task));
    const cleanup = await app.handle(
      request("/migrations/cleanup", {
        ...task,
        confirmedPlanDigest: plan.value.planDigest,
      }),
    );

    expect(status.status).toBe(200);
    expect(verification.status).toBe(200);
    expect(cleanup.status).toBe(200);
    expect(captured[0]).toBeInstanceOf(StatusPlatformMigrationQuery);
    expect(captured[1]).toBeInstanceOf(VerifyPlatformMigrationQuery);
    expect(captured[2]).toBeInstanceOf(CleanupPlatformMigrationCommand);
  });

  test("[MIG-AUTH-013] rejects member cleanup before CommandBus effects", async () => {
    const plan = createMigrationPlan({
      apiVersion: "appaloft.io/migration/v1",
      kind: "MigrationBundle",
      metadata: { name: "Denied cleanup" },
      spec: {
        project: { name: "Denied" },
        environment: { name: "production", kind: "production" },
        target: { deploymentTargetId: "srv_http" },
        resources: [
          {
            ref: "web",
            name: "Web",
            source: { kind: "remote-git", locator: "https://github.com/acme/web.git" },
          },
        ],
      },
    });
    if (plan.isErr()) throw plan.error;
    let commandExecutions = 0;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus: {
        execute: async <T>(): Promise<Result<T>> => {
          commandExecutions += 1;
          return ok({} as T);
        },
      } as CommandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      productSessionAuthorizationPort: {
        authorizeProductSession: async (_context, input) => {
          if (input.requiredRole === "owner") {
            return err(
              domainError.operationAuthorizationDenied("Owner role is required", {
                requiredRole: input.requiredRole,
              }),
            );
          }
          return ok({
            actor: { kind: "user", id: "usr_member", label: "member@example.test" },
            email: "member@example.test",
            organizationId: input.organizationId ?? "org_migration",
            role: "member",
            userId: "usr_member",
          });
        },
      },
      queryBus: { execute: async <T>() => ok({} as T) } as QueryBus,
    });

    const response = await app.handle(
      request("/migrations/cleanup", {
        plan: plan.value,
        receipts: [],
        confirmedPlanDigest: plan.value.planDigest,
      }),
    );

    expect(response.status).toBe(403);
    expect(commandExecutions).toBe(0);
  });
});
