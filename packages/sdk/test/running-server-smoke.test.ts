import "../../application/node_modules/reflect-metadata/Reflect.js";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  CreateProjectCommand,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListProjectsQuery,
  type ProductSessionAuthorizationPort,
  type Query,
  type QueryBus,
  ShowProjectQuery,
} from "@appaloft/application";
import { type ProjectSummary } from "@appaloft/contracts";
import { ok, type Result } from "@appaloft/core";
import { mountAppaloftOrpcRoutes } from "@appaloft/orpc";
import { Elysia } from "elysia";

import { createAppaloftSdkClient, type SdkOperationDescriptor } from "../src";

class NoopLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class TestExecutionContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      requestId: input.requestId ?? "req_sdk_running_server_smoke_test",
      entrypoint: input.entrypoint,
      ...(input.locale ? { locale: input.locale } : {}),
      ...(input.actor ? { actor: input.actor } : {}),
    });
  }
}

const createProjectOperation: SdkOperationDescriptor = {
  operationKey: "projects.create",
  operationGroup: "projects",
  operationMethod: "create",
  operationId: "projects.create",
  kind: "command",
  domain: "projects",
  messageName: "CreateProjectCommand",
  route: {
    method: "POST",
    path: "/projects",
  },
  docsHref: "/docs/resources/projects/#concept-project",
  authPolicy: "product-session",
  errorFamily: "structured-platform-error",
  streaming: false,
};

const listProjectsOperation: SdkOperationDescriptor = {
  operationKey: "projects.list",
  operationGroup: "projects",
  operationMethod: "list",
  operationId: "projects.list",
  kind: "query",
  domain: "projects",
  messageName: "ListProjectsQuery",
  route: {
    method: "GET",
    path: "/projects",
  },
  docsHref: "/docs/resources/projects/#concept-project",
  authPolicy: "product-session",
  errorFamily: "structured-platform-error",
  streaming: false,
};

const showProjectOperation: SdkOperationDescriptor = {
  operationKey: "projects.show",
  operationGroup: "projects",
  operationMethod: "show",
  operationId: "projects.show",
  kind: "query",
  domain: "projects",
  messageName: "ShowProjectQuery",
  route: {
    method: "GET",
    path: "/projects/{projectId}",
  },
  docsHref: "/docs/resources/projects/#concept-project",
  authPolicy: "product-session",
  errorFamily: "structured-platform-error",
  streaming: false,
};

const project: ProjectSummary = {
  id: "prj_sdk_smoke",
  name: "SDK Smoke",
  slug: "sdk-smoke",
  description: "Created through the SDK smoke boundary",
  lifecycleStatus: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("Appaloft SDK running-server smoke", () => {
  let server: ReturnType<typeof Bun.serve> | undefined;

  beforeAll(() => {
    const commandBus = {
      execute: async <T>(context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        expect(context.actor).toMatchObject({
          kind: "user",
          id: "usr_sdk_smoke",
        });
        expect(command).toBeInstanceOf(CreateProjectCommand);
        expect(command).toMatchObject({
          name: "SDK Smoke",
          description: "Created through the SDK smoke boundary",
        });

        return ok({ id: project.id } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        expect(context.actor).toMatchObject({
          kind: "user",
          id: "usr_sdk_smoke",
        });

        if (query instanceof ListProjectsQuery) {
          return ok({ items: [project] } as T);
        }

        expect(query).toBeInstanceOf(ShowProjectQuery);
        expect(query).toMatchObject({ projectId: project.id });
        return ok(project as T);
      },
    } as QueryBus;
    const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
      authorizeProductSession: async (_context, input) => {
        expect(input.cookieHeader).toBe("better-auth.session_token=sdk-smoke-session");
        expect(input.path).toMatch(/^\/api\/projects/);

        return ok({
          actor: {
            kind: "user",
            id: "usr_sdk_smoke",
            label: "sdk-smoke@example.com",
          },
          email: "sdk-smoke@example.com",
          organizationId: "org_self_hosted",
          role: input.requiredRole,
          userId: "usr_sdk_smoke",
        });
      },
    };
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      productSessionAuthorizationPort,
      queryBus,
    });

    server = Bun.serve({
      port: 0,
      fetch: (request) => app.handle(request),
    });
  });

  afterAll(() => {
    server?.stop(true);
  });

  test("[TS-SDK-BLACKBOX-001] exercises representative create/list/show flows through HTTP", async () => {
    expect(server).toBeDefined();
    if (!server) {
      throw new Error("SDK smoke server was not started");
    }

    const client = createAppaloftSdkClient({
      baseUrl: `http://127.0.0.1:${server.port}/api`,
      auth: {
        kind: "product-session",
        cookie: "better-auth.session_token=sdk-smoke-session",
      },
    });

    const created = await client.request<{ id: string }>({
      operation: createProjectOperation,
      body: {
        name: "SDK Smoke",
        description: "Created through the SDK smoke boundary",
      },
    });

    expect(created).toEqual({
      ok: true,
      status: 201,
      data: {
        id: project.id,
      },
    });

    const listed = await client.request<{ items: ProjectSummary[] }>({
      operation: listProjectsOperation,
    });

    expect(listed).toMatchObject({
      ok: true,
      status: 200,
      data: {
        items: [{ id: project.id }],
      },
    });

    const shown = await client.request<ProjectSummary>({
      operation: showProjectOperation,
      pathParams: {
        projectId: project.id,
      },
    });

    expect(shown).toMatchObject({
      ok: true,
      status: 200,
      data: {
        id: project.id,
        name: "SDK Smoke",
        lifecycleStatus: "active",
      },
    });
  });
});
