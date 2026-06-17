import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  AcceptConnectorCapabilityPlanCommand,
  ApplyConnectorCapabilityCommand,
  type Command,
  type CommandBus,
  CompleteConnectionCallbackCommand,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListConnectionsQuery,
  ListConnectorCategoriesQuery,
  ListConnectorsQuery,
  PlanConnectorCapabilityQuery,
  PlanDomainBindingDnsQuery,
  type ProductSessionAuthorizationPort,
  type Query,
  type QueryBus,
  RevokeConnectionCommand,
  ShowConnectionQuery,
  StartConnectionCommand,
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

  test("[APP-CONN-014] plans connector capabilities through HTTP/oRPC", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus: noopCommandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus: queryBusFor((query) => {
        capturedQuery = query;
        return {
          planId: "dnsplan_test",
          connectorKey: "cloudflare-dns",
          capabilityKey: "dns.records.plan",
          riskLevel: "low",
          requiresExplicitAcceptance: true,
          summary: "Cloudflare DNS: 1 DNS record planned in example.com.",
          effects: [
            {
              kind: "dns.record.upsert",
              title: "CNAME app.example.com",
              description: "CNAME app.example.com -> edge.appaloft.dev",
            },
          ],
          cleanup: {
            supported: true,
          },
          providerPlan: {
            kind: "dns-records",
            dnsRecords: {
              zoneName: "example.com",
              records: [
                {
                  name: "app.example.com",
                  type: "CNAME",
                  value: "edge.appaloft.dev",
                  purpose: "domain-routing",
                },
              ],
              conflicts: [],
            },
          },
        };
      }),
    });

    const response = await app.handle(
      new Request("http://localhost/api/connections/capabilities/plan", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          connectorKey: "cloudflare-dns",
          capabilityKey: "dns.records.plan",
          parameters: {
            zoneName: "example.com",
            hostname: "app.example.com",
            target: "edge.appaloft.dev",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      planId: "dnsplan_test",
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.records.plan",
      providerPlan: {
        kind: "dns-records",
      },
    });
    expect(capturedQuery).toBeInstanceOf(PlanConnectorCapabilityQuery);
  });

  test("[APP-CONN-014][APP-CONN-004] plans domain binding DNS through HTTP/oRPC", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus: noopCommandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      productSessionAuthorizationPort: authenticatedProductSessionAuthorizationPort,
      queryBus: queryBusFor((query) => {
        capturedQuery = query;
        return {
          planId: "dnsplan_binding_test",
          connectorKey: "cloudflare-dns",
          capabilityKey: "dns.records.plan",
          riskLevel: "low",
          requiresExplicitAcceptance: true,
          summary: "Cloudflare DNS: 1 DNS record planned in example.com.",
          effects: [
            {
              kind: "dns.record.upsert",
              title: "A app.example.com",
              description: "A app.example.com -> 127.0.0.1",
            },
          ],
          cleanup: {
            supported: true,
          },
          providerPlan: {
            kind: "dns-records",
            dnsRecords: {
              zoneName: "example.com",
              records: [
                {
                  name: "app.example.com",
                  type: "A",
                  value: "127.0.0.1",
                  purpose: "domain-routing",
                },
              ],
              conflicts: [],
            },
          },
        };
      }),
    });

    const response = await app.handle(
      new Request("http://localhost/api/domain-bindings/dbind_test/dns-plan", {
        method: "POST",
        headers: {
          cookie: "appaloft-session=connections-test",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          domainBindingId: "dbind_test",
          connectorKey: "cloudflare-dns",
          capabilityKey: "dns.records.plan",
          zoneName: "example.com",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      planId: "dnsplan_binding_test",
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.records.plan",
      providerPlan: {
        kind: "dns-records",
      },
    });
    expect(capturedQuery).toBeInstanceOf(PlanDomainBindingDnsQuery);
  });

  test("[APP-CONN-014][APP-CONN-010] accepts connector capability plans through HTTP/oRPC", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus: commandBusFor((command) => {
        capturedCommand = command;
        return {
          acceptedPlanId: "accepted_dnsplan_test",
          planId: "dnsplan_test",
          connectorKey: "cloudflare-dns",
          capabilityKey: "dns.records.apply",
          acceptedBy: "usr_test",
          acceptedAt: "2026-06-17T10:00:00.000Z",
          riskLevel: "low",
          summary: "Apply one Cloudflare DNS record.",
          effects: [
            {
              kind: "dns.record.upsert",
              title: "CNAME app.example.com",
            },
          ],
          cleanup: {
            supported: true,
          },
        };
      }),
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus: queryBusFor(() => ({})),
    });

    const response = await app.handle(
      new Request("http://localhost/api/connections/capabilities/accept", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          planId: "dnsplan_test",
          connectorKey: "cloudflare-dns",
          capabilityKey: "dns.records.apply",
          riskLevel: "low",
          summary: "Apply one Cloudflare DNS record.",
          effects: [
            {
              kind: "dns.record.upsert",
              title: "CNAME app.example.com",
            },
          ],
          cleanup: {
            supported: true,
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      acceptedPlanId: "accepted_dnsplan_test",
      planId: "dnsplan_test",
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.records.apply",
    });
    expect(capturedCommand).toBeInstanceOf(AcceptConnectorCapabilityPlanCommand);
  });

  test("[APP-CONN-014][APP-CONN-016] applies connector capabilities through HTTP/oRPC", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus: commandBusFor((command) => {
        capturedCommand = command;
        return {
          operationId: "dnsop_test",
          connectorKey: "cloudflare-dns",
          capabilityKey: "dns.records.apply",
          status: "applied",
          summary:
            "Cloudflare DNS: 1 DNS record apply finished in example.com with status applied.",
          effects: [
            {
              kind: "dns.record.upsert",
              title: "CNAME app.example.com",
              description: "CNAME app.example.com -> edge.appaloft.dev",
              providerRecordId: "dnsrec_test",
              managed: true,
            },
          ],
          providerResult: {
            kind: "dns-records",
            dnsRecords: {
              zoneName: "example.com",
              status: "applied",
              records: [
                {
                  name: "app.example.com",
                  type: "CNAME",
                  value: "edge.appaloft.dev",
                  purpose: "domain-routing",
                },
              ],
              conflicts: [],
              missingRecords: [],
              effects: [
                {
                  kind: "dns.record.upsert",
                  title: "CNAME app.example.com",
                  description: "CNAME app.example.com -> edge.appaloft.dev",
                  providerRecordId: "dnsrec_test",
                  managed: true,
                },
              ],
            },
          },
        };
      }),
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus: queryBusFor(() => ({})),
    });

    const response = await app.handle(
      new Request("http://localhost/api/connections/capabilities/apply", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          connectorKey: "cloudflare-dns",
          capabilityKey: "dns.records.apply",
          acceptedPlanId: "dnsplan_test",
          parameters: {
            zoneName: "example.com",
            hostname: "app.example.com",
            target: "edge.appaloft.dev",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      operationId: "dnsop_test",
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.records.apply",
      status: "applied",
      providerResult: {
        kind: "dns-records",
      },
    });
    expect(capturedCommand).toBeInstanceOf(ApplyConnectorCapabilityCommand);
  });

  test("[APP-CONN-014][APP-CONN-013] lists and shows connection instances through HTTP/oRPC", async () => {
    const connection = connectionFixture();
    const capturedQueries: Query<unknown>[] = [];
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus: noopCommandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus: queryBusFor((query) => {
        capturedQueries.push(query);
        if (query instanceof ListConnectionsQuery) {
          return { items: [connection] };
        }
        return connection;
      }),
    });

    const listResponse = await app.handle(new Request("http://localhost/api/connections"));
    const showResponse = await app.handle(
      new Request("http://localhost/api/connections/conn_cloudflare_dns_test"),
    );
    const statusResponse = await app.handle(
      new Request("http://localhost/api/connections/conn_cloudflare_dns_test/status"),
    );

    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual({ items: [connection] });
    expect(showResponse.status).toBe(200);
    expect(await showResponse.json()).toEqual(connection);
    expect(statusResponse.status).toBe(200);
    expect(await statusResponse.json()).toEqual(connection);
    expect(capturedQueries[0]).toBeInstanceOf(ListConnectionsQuery);
    expect(capturedQueries[1]).toBeInstanceOf(ShowConnectionQuery);
    expect(capturedQueries[2]).toBeInstanceOf(ShowConnectionQuery);
    expect(JSON.stringify(connection)).not.toContain("cf_token");
  });

  test("[APP-CONN-014] starts, completes callback, and revokes connections through HTTP/oRPC", async () => {
    const connection = connectionFixture();
    const capturedCommands: Command<unknown>[] = [];
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus: commandBusFor((command) => {
        capturedCommands.push(command);
        if (command instanceof StartConnectionCommand) {
          return {
            connection,
            nextAction: "ready",
          };
        }
        return { connection };
      }),
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus: queryBusFor(() => ({})),
    });

    const startResponse = await app.handle(
      new Request("http://localhost/api/connections/connect/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          connectorKey: "cloudflare-dns",
          credentialGrant: {
            kind: "manual-secret-reference",
            storage: "secret-ref",
            secretRef: "secretref_cloudflare_dns",
          },
        }),
      }),
    );
    const callbackResponse = await app.handle(
      new Request("http://localhost/api/connections/connect/callback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          connectionId: "conn_cloudflare_dns_test",
          status: "success",
        }),
      }),
    );
    const revokeResponse = await app.handle(
      new Request("http://localhost/api/connections/conn_cloudflare_dns_test/revoke", {
        method: "POST",
      }),
    );

    expect(startResponse.status).toBe(201);
    expect(await startResponse.json()).toEqual({ connection, nextAction: "ready" });
    expect(callbackResponse.status).toBe(200);
    expect(await callbackResponse.json()).toEqual({ connection });
    expect(revokeResponse.status).toBe(200);
    expect(await revokeResponse.json()).toEqual({ connection });
    expect(capturedCommands[0]).toBeInstanceOf(StartConnectionCommand);
    expect(capturedCommands[1]).toBeInstanceOf(CompleteConnectionCallbackCommand);
    expect(capturedCommands[2]).toBeInstanceOf(RevokeConnectionCommand);
  });
});

const noopCommandBus = {
  execute: async <T>(): Promise<Result<T>> => ok({} as T),
} as CommandBus;

const authenticatedProductSessionAuthorizationPort = {
  authorizeProductSession: async (_context, input) =>
    ok({
      actor: {
        kind: "user",
        id: "usr_connections_test",
        label: "connections@example.com",
      },
      email: "connections@example.com",
      organizationId: "org_connections_test",
      role: input.requiredRole,
      userId: "usr_connections_test",
    }),
} satisfies ProductSessionAuthorizationPort;

function commandBusFor(resolve: (command: Command<unknown>) => unknown): CommandBus {
  return {
    execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> =>
      ok(resolve(command as Command<unknown>) as T),
  } as CommandBus;
}

function queryBusFor(resolve: (query: Query<unknown>) => unknown): QueryBus {
  return {
    execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> =>
      ok(resolve(query as Query<unknown>) as T),
  } as QueryBus;
}

function connectionFixture() {
  return {
    id: "conn_cloudflare_dns_test",
    connectorKey: "cloudflare-dns",
    providerKey: "cloudflare",
    category: "dns",
    owner: {
      scope: "project",
      id: "project_123",
    },
    displayName: "Cloudflare DNS",
    status: "connected",
    capabilities: ["dns.records.plan"],
    credentialGrant: {
      kind: "manual-secret-reference",
      storage: "secret-ref",
      redacted: true,
      secretRef: "secretref_cloudflare_dns",
    },
    diagnostics: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
