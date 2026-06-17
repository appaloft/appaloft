import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  DiffEnvironmentProfileQuery,
  DuplicateEnvironmentProfileCommand,
  type ExecutionContext,
  type ExecutionContextFactory,
  PlanDuplicateEnvironmentQuery,
  type ProductSessionAuthorizationPort,
  type Query,
  type QueryBus,
  SyncEnvironmentProfileCommand,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";
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
      requestId: input.requestId ?? "req_orpc_environment_profile_test",
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
      actor: {
        kind: "user",
        id: "usr_environment_profile",
        label: "environment-profile@example.com",
      },
      email: "environment-profile@example.com",
      organizationId: "org_self_hosted",
      role: input.requiredRole,
      userId: "usr_environment_profile",
    }),
};

describe("environment profile HTTP routes", () => {
  test("[ENV-PROFILE-DUP-001] dispatches duplicate plan query through HTTP", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus: noopCommandBus(),
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      productSessionAuthorizationPort,
      queryBus: {
        execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
          capturedQuery = query as Query<unknown>;
          return ok({
            schemaVersion: "environments.duplicate-plan/v1",
            sourceEnvironment: { id: "env_production" },
            target: { projectId: "prj_demo", name: "staging", conflict: false },
            variableCandidates: [],
            resourceCandidates: [],
            dependencyCandidates: [],
            dependencyBindingCandidates: [],
            domainRouteCandidates: [],
            storageDecisionCandidates: [],
            warnings: [],
            generatedAt: "2026-05-21T00:00:00.000Z",
          } as T);
        },
      } as QueryBus,
    });

    const response = await app.handle(
      new Request(
        "http://localhost/api/environments/env_production/duplicate-plan?targetName=staging&targetProjectId=prj_demo",
        {
          headers: {
            cookie: "better-auth.session_token=environment-profile-test",
          },
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "environments.duplicate-plan/v1",
      target: { projectId: "prj_demo", name: "staging" },
    });
    expect(capturedQuery).toBeInstanceOf(PlanDuplicateEnvironmentQuery);
    expect(capturedQuery).toMatchObject({
      environmentId: "env_production",
      targetName: "staging",
      targetProjectId: "prj_demo",
    });
  });

  test("[ENV-PROFILE-DUP-002] dispatches reviewed duplicate profile command through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus: {
        execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
          capturedCommand = command as Command<unknown>;
          return ok({
            schemaVersion: "environments.duplicate-profile/v1",
            sourceEnvironmentId: "env_production",
            targetEnvironmentId: "env_staging",
            copiedResources: [],
            appliedDependencies: [],
            createdDependencyBindings: [],
            deferredDecisions: [],
            warnings: [],
            generatedAt: "2026-05-21T00:00:00.000Z",
          } as T);
        },
      } as CommandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      productSessionAuthorizationPort,
      queryBus: noopQueryBus(),
    });

    const response = await app.handle(
      new Request("http://localhost/api/environments/env_production/duplicate-profile", {
        method: "POST",
        headers: {
          cookie: "better-auth.session_token=environment-profile-test",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          environmentId: "env_production",
          targetName: "staging",
          targetKind: "staging",
          resourceDecisions: [{ resourceId: "res_web", decision: "copy-shape" }],
          dependencyDecisions: [
            {
              dependencyResourceId: "dep_postgres",
              decision: "reuse-source",
              accessMode: "read-only",
              acknowledgement: "operator-confirmed-shared-production-dependency",
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "environments.duplicate-profile/v1",
      targetEnvironmentId: "env_staging",
    });
    expect(capturedCommand).toBeInstanceOf(DuplicateEnvironmentProfileCommand);
    expect(capturedCommand).toMatchObject({
      environmentId: "env_production",
      targetName: "staging",
      targetKind: "staging",
      resourceDecisions: [{ resourceId: "res_web", decision: "copy-shape" }],
      dependencyDecisions: [
        expect.objectContaining({
          dependencyResourceId: "dep_postgres",
          decision: "reuse-source",
          acknowledgement: "operator-confirmed-shared-production-dependency",
        }),
      ],
    });
  });

  test("[ENV-PROFILE-DUP-008] dispatches profile diff query through HTTP", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus: noopCommandBus(),
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      productSessionAuthorizationPort,
      queryBus: {
        execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
          capturedQuery = query as Query<unknown>;
          return ok({
            schemaVersion: "environments.diff-profile/v1",
            sourceEnvironment: { id: "env_production", name: "Production" },
            targetEnvironment: { id: "env_staging", name: "Staging" },
            entries: [],
            counts: { added: 0, removed: 0, changed: 0, unchanged: 0 },
            generatedAt: "2026-05-21T00:00:00.000Z",
          } as T);
        },
      } as QueryBus,
    });

    const response = await app.handle(
      new Request(
        "http://localhost/api/environments/env_production/diff-profile/env_staging?includeUnchanged=true",
        {
          headers: {
            cookie: "better-auth.session_token=environment-profile-test",
          },
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "environments.diff-profile/v1",
      targetEnvironment: { id: "env_staging" },
    });
    expect(capturedQuery).toBeInstanceOf(DiffEnvironmentProfileQuery);
    expect(capturedQuery).toMatchObject({
      environmentId: "env_production",
      targetEnvironmentId: "env_staging",
      includeUnchanged: true,
    });
  });

  test("[ENV-PROFILE-DUP-009] dispatches profile sync command through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus: {
        execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
          capturedCommand = command as Command<unknown>;
          return ok({
            schemaVersion: "environments.sync-profile/v1",
            sourceEnvironmentId: "env_production",
            targetEnvironmentId: "env_staging",
            syncedResources: [],
            skippedResources: [],
            deferredDecisions: [],
            warnings: [],
            generatedAt: "2026-05-21T00:00:00.000Z",
          } as T);
        },
      } as CommandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      productSessionAuthorizationPort,
      queryBus: noopQueryBus(),
    });

    const response = await app.handle(
      new Request("http://localhost/api/environments/env_production/sync-profile/env_staging", {
        method: "POST",
        headers: {
          cookie: "better-auth.session_token=environment-profile-test",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          environmentId: "env_production",
          targetEnvironmentId: "env_staging",
          resourceIds: ["res_worker"],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "environments.sync-profile/v1",
      targetEnvironmentId: "env_staging",
    });
    expect(capturedCommand).toBeInstanceOf(SyncEnvironmentProfileCommand);
    expect(capturedCommand).toMatchObject({
      environmentId: "env_production",
      targetEnvironmentId: "env_staging",
      resourceIds: ["res_worker"],
    });
  });
});

function noopCommandBus(): CommandBus {
  return {
    execute: async <T>(): Promise<Result<T>> => ok({} as T),
  } as CommandBus;
}

function noopQueryBus(): QueryBus {
  return {
    execute: async <T>(): Promise<Result<T>> => ok({} as T),
  } as QueryBus;
}
