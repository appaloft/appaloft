import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListConnectorCategoriesQuery,
  ListConnectorsQuery,
  type Query,
  type QueryBus,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";
import { Elysia } from "elysia";

import { mountAppaloftOrpcRoutes } from "../src";

class NoopLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class TestExecutionContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      requestId: input.requestId ?? "req_orpc_connections_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

describe("connections HTTP routes", () => {
  test("[APP-CONN-014] lists connector categories through HTTP/oRPC", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus: noopCommandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus: queryBusFor((query) => {
        capturedQuery = query;
        return {
          items: [
            {
              key: "dns",
              title: "DNS",
              description:
                "Domain verification, routing records, record cleanup, and DNS readback.",
            },
          ],
        };
      }),
    });

    const response = await app.handle(new Request("http://localhost/api/connections/categories"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [
        {
          key: "dns",
          title: "DNS",
          description: "Domain verification, routing records, record cleanup, and DNS readback.",
        },
      ],
    });
    expect(capturedQuery).toBeInstanceOf(ListConnectorCategoriesQuery);
  });

  test("[APP-CONN-014] lists connector catalog entries through HTTP/oRPC", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus: noopCommandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus: queryBusFor((query) => {
        capturedQuery = query;
        return {
          items: [
            {
              key: "cloudflare-dns",
              title: "Cloudflare DNS",
              category: "dns",
              providerKey: "cloudflare",
              capabilities: [
                {
                  key: "dns.records.plan",
                  title: "Plan DNS records",
                  implemented: true,
                },
              ],
              grantKinds: [
                {
                  kind: "persistent-provider-credential",
                  title: "Cloudflare API token",
                  storesLongLivedSecret: true,
                },
              ],
              availability: {
                status: "available",
                diagnostics: [],
              },
              visibility: "catalog",
            },
          ],
        };
      }),
    });

    const response = await app.handle(
      new Request("http://localhost/api/connections/catalog?category=dns"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [
        {
          key: "cloudflare-dns",
          title: "Cloudflare DNS",
          category: "dns",
          providerKey: "cloudflare",
          capabilities: [
            {
              key: "dns.records.plan",
              title: "Plan DNS records",
              implemented: true,
            },
          ],
          grantKinds: [
            {
              kind: "persistent-provider-credential",
              title: "Cloudflare API token",
              storesLongLivedSecret: true,
            },
          ],
          availability: {
            status: "available",
            diagnostics: [],
          },
          visibility: "catalog",
        },
      ],
    });
    expect(capturedQuery).toBeInstanceOf(ListConnectorsQuery);
  });
});

const noopCommandBus = {
  execute: async <T>(): Promise<Result<T>> => ok({} as T),
} as CommandBus;

function queryBusFor(resolve: (query: Query<unknown>) => unknown): QueryBus {
  return {
    execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> =>
      ok(resolve(query as Query<unknown>) as T),
  } as QueryBus;
}
