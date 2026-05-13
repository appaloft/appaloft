import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListPluginsQuery,
  ListProvidersQuery,
  type Query,
  type QueryBus,
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
      requestId: input.requestId ?? "req_orpc_system_diagnostics_test",
      entrypoint: input.entrypoint,
      ...(input.locale ? { locale: input.locale } : {}),
      ...(input.actor ? { actor: input.actor } : {}),
    });
  }
}

function mountSystemDiagnosticRoutes(queryBus: QueryBus) {
  const commandBus = {
    execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
      ok({} as T),
  } as CommandBus;

  return mountAppaloftOrpcRoutes(new Elysia(), {
    commandBus,
    executionContextFactory: new TestExecutionContextFactory(),
    logger: new NoopLogger(),
    queryBus,
  });
}

describe("system diagnostics HTTP routes", () => {
  test("[SYSTEM-DIAG-003] exposes safe provider capability and configuration diagnostics", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          items: [
            {
              key: "generic-ssh",
              title: "Generic SSH",
              category: "deploy-target",
              capabilities: ["remote-command"],
              capabilityDetails: [
                {
                  key: "remote-command",
                  title: "Remote command execution",
                  enabled: true,
                },
              ],
              configuration: {
                status: "configured",
                diagnostics: [
                  {
                    code: "provider.generic_ssh.configured",
                    severity: "info",
                    message:
                      "Generic SSH uses per-server credentials and requires no global provider secret.",
                  },
                ],
              },
            },
          ],
        } as T);
      },
    } as QueryBus;
    const app = mountSystemDiagnosticRoutes(queryBus);

    const response = await app.handle(new Request("http://localhost/api/providers"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      items: [
        {
          key: "generic-ssh",
          capabilityDetails: [
            {
              key: "remote-command",
              enabled: true,
            },
          ],
          configuration: {
            status: "configured",
          },
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain("privateKey");
    expect(JSON.stringify(body)).not.toContain("accessToken");
    expect(capturedQuery).toBeInstanceOf(ListProvidersQuery);
  });

  test("[SYSTEM-DIAG-003] exposes safe plugin capability and compatibility diagnostics", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          items: [
            {
              name: "builtin-openapi-reference",
              displayName: "OpenAPI Reference",
              version: "0.1.0",
              kind: "system-extension",
              capabilities: ["http-route", "web-page"],
              capabilityDetails: [
                {
                  key: "http-route",
                  title: "http-route",
                  enabled: true,
                },
              ],
              compatible: true,
              configuration: {
                status: "configured",
                diagnostics: [
                  {
                    code: "plugin.compatible",
                    severity: "info",
                    message: "Plugin compatibility range matches the current Appaloft version.",
                  },
                ],
              },
            },
          ],
        } as T);
      },
    } as QueryBus;
    const app = mountSystemDiagnosticRoutes(queryBus);

    const response = await app.handle(new Request("http://localhost/api/plugins"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      items: [
        {
          name: "builtin-openapi-reference",
          capabilityDetails: [
            {
              key: "http-route",
              enabled: true,
            },
          ],
          configuration: {
            status: "configured",
          },
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain("privateKey");
    expect(JSON.stringify(body)).not.toContain("accessToken");
    expect(capturedQuery).toBeInstanceOf(ListPluginsQuery);
  });
});
