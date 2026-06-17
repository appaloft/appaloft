import "reflect-metadata";
import { describe, expect, test } from "bun:test";

import {
  createDefaultConnectorDefinitions,
  createExecutionContext,
  FakeDnsConnectorProviderAdapter,
  InMemoryConnectorConnectionStore,
  InMemoryConnectorProviderAdapterRegistry,
  InMemoryConnectorRegistry,
  ListConnectionsQueryService,
  ListConnectorCategoriesQueryService,
  ListConnectorsQueryService,
  PlanConnectorCapabilityQueryService,
  RevokeConnectionUseCase,
  ShowConnectionQueryService,
  StartConnectionUseCase,
} from "../src";

describe("connector catalog", () => {
  test("[APP-CONN-002] lists categories independently from implemented providers", async () => {
    const service = new ListConnectorCategoriesQueryService();
    const result = await service.execute(createExecutionContext({ entrypoint: "system" }));

    expect(result.items.map((item) => item.key)).toEqual([
      "source",
      "dns",
      "infrastructure",
      "notification",
      "billing",
      "identity",
      "observability",
      "storage",
    ]);
  });

  test("[APP-CONN-004] exposes Cloudflare DNS as the primary DNS connector when configured", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        cloudflareDns: {
          configured: true,
        },
      }),
    );
    const service = new ListConnectorsQueryService(registry);
    const result = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      category: "dns",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.key).toBe("cloudflare-dns");
    expect(result.items[0]?.availability.status).toBe("available");
    expect(result.items[0]?.capabilities.map((capability) => capability.key)).toContain(
      "dns.records.plan",
    );
  });

  test("[APP-CONN-002] hides unavailable Cloudflare DNS unless the catalog requests unavailable entries", async () => {
    const registry = new InMemoryConnectorRegistry(createDefaultConnectorDefinitions());
    const service = new ListConnectorsQueryService(registry);

    const visible = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      category: "dns",
    });
    const catalog = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      category: "dns",
      includeUnavailable: true,
    });

    expect(visible.items).toEqual([]);
    expect(catalog.items.map((item) => item.key)).toEqual(["cloudflare-dns"]);
    expect(catalog.items[0]?.availability.status).toBe("unavailable");
  });

  test("[APP-CONN-007] maps existing GitHub App capability into a source connector", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        githubSource: {
          configured: true,
          installUrl: "https://github.com/apps/appaloft/installations/new",
        },
      }),
    );
    const service = new ListConnectorsQueryService(registry);
    const result = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      category: "source",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.key).toBe("github-source");
    expect(result.items[0]?.setup?.connectHref).toBe(
      "https://github.com/apps/appaloft/installations/new",
    );
    expect(result.items[0]?.grantKinds.map((grant) => grant.kind)).toEqual([
      "provider-app-installation",
    ]);
  });

  test("[APP-CONN-012] keeps billing as a category without implementing a billing connector", async () => {
    const registry = new InMemoryConnectorRegistry(createDefaultConnectorDefinitions());
    const service = new ListConnectorsQueryService(registry);
    const result = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      category: "billing",
      includeUnavailable: true,
    });

    expect(result.items).toEqual([]);
  });

  test("[APP-CONN-004][APP-CONN-014][APP-CONN-016] plans Cloudflare DNS records through a provider adapter", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        cloudflareDns: {
          configured: true,
        },
      }),
    );
    const service = new PlanConnectorCapabilityQueryService(
      registry,
      new InMemoryConnectorProviderAdapterRegistry([
        new FakeDnsConnectorProviderAdapter({
          connectorKey: "cloudflare-dns",
          providerTitle: "Cloudflare DNS",
        }),
      ]),
    );

    const result = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.records.plan",
      parameters: {
        zoneName: "example.com",
        hostname: "app.example.com",
        target: "edge.appaloft.dev",
        recordType: "CNAME",
      },
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();
    expect(plan.connectorKey).toBe("cloudflare-dns");
    expect(plan.providerPlan?.dnsRecords?.records).toEqual([
      {
        name: "app.example.com",
        type: "CNAME",
        value: "edge.appaloft.dev",
        purpose: "domain-routing",
      },
    ]);
    expect(JSON.stringify(plan)).not.toContain("token");
  });

  test("[APP-CONN-005][APP-CONN-016] fake DNS provider reports conflicts without applying changes", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        cloudflareDns: {
          configured: true,
        },
      }),
    );
    const service = new PlanConnectorCapabilityQueryService(
      registry,
      new InMemoryConnectorProviderAdapterRegistry([
        new FakeDnsConnectorProviderAdapter({
          connectorKey: "cloudflare-dns",
          providerTitle: "Cloudflare DNS",
          existingRecords: [
            {
              name: "app.example.com",
              type: "A",
              value: "203.0.113.10",
              purpose: "manual",
            },
          ],
        }),
      ]),
    );

    const result = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.records.plan",
      parameters: {
        zoneName: "example.com",
        hostname: "app.example.com",
        target: "edge.appaloft.dev",
        recordType: "CNAME",
      },
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();
    expect(plan.riskLevel).toBe("medium");
    expect(plan.requiresExplicitAcceptance).toBe(true);
    expect(plan.providerPlan?.dnsRecords?.conflicts).toHaveLength(1);
    expect(plan.effects.map((effect) => effect.kind)).toContain("dns.record.conflict");
  });

  test("[APP-CONN-014][APP-CONN-013] starts, lists, shows, and redacts connection instances", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        cloudflareDns: {
          configured: true,
        },
      }),
    );
    const store = new InMemoryConnectorConnectionStore();
    const clock = { now: () => "2026-01-01T00:00:00.000Z" };
    const idGenerator = { next: () => "conn_cloudflare_dns_test" };
    const start = new StartConnectionUseCase(registry, store, clock, idGenerator);
    const list = new ListConnectionsQueryService(store);
    const show = new ShowConnectionQueryService(store);

    const started = await start.execute({
      connectorKey: "cloudflare-dns",
      owner: { scope: "project", id: "project_123" },
      credentialGrant: {
        kind: "manual-secret-reference",
        storage: "secret-ref",
        secretRef: "secretref_cloudflare_dns",
        externalAccountId: "acct_example",
      },
    });

    expect(started.isOk()).toBe(true);
    const result = started._unsafeUnwrap();
    expect(result.connection.status).toBe("connected");
    expect(result.nextAction).toBe("ready");
    expect(result.connection.credentialGrant).toMatchObject({
      kind: "manual-secret-reference",
      storage: "secret-ref",
      redacted: true,
      secretRef: "secretref_cloudflare_dns",
    });
    expect(JSON.stringify(result)).not.toContain("cf_token");

    const listed = await list.execute(createExecutionContext({ entrypoint: "system" }), {
      owner: { scope: "project", id: "project_123" },
      category: "dns",
    });
    expect(listed.items.map((connection) => connection.id)).toEqual(["conn_cloudflare_dns_test"]);

    const shown = await show.execute(createExecutionContext({ entrypoint: "system" }), {
      connectionId: "conn_cloudflare_dns_test",
    });
    expect(shown.isOk()).toBe(true);
    expect(shown._unsafeUnwrap().connectorKey).toBe("cloudflare-dns");
  });

  test("[APP-CONN-014] revokes connection instances without deleting safe readback", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        cloudflareDns: {
          configured: true,
        },
      }),
    );
    const store = new InMemoryConnectorConnectionStore();
    const start = new StartConnectionUseCase(
      registry,
      store,
      { now: () => "2026-01-01T00:00:00.000Z" },
      { next: () => "conn_revoke_test" },
    );
    const revoke = new RevokeConnectionUseCase(store, {
      now: () => "2026-01-01T00:01:00.000Z",
    });

    const started = await start.execute({
      connectorKey: "cloudflare-dns",
      credentialGrant: {
        kind: "manual-secret-reference",
        storage: "secret-ref",
        secretRef: "secretref_cloudflare_dns",
      },
    });
    expect(started.isOk()).toBe(true);

    const revoked = await revoke.execute({ connectionId: "conn_revoke_test" });
    expect(revoked.isOk()).toBe(true);
    expect(revoked._unsafeUnwrap().connection.status).toBe("revoked");
    expect(revoked._unsafeUnwrap().connection.revokedAt).toBe("2026-01-01T00:01:00.000Z");
    expect(revoked._unsafeUnwrap().connection.credentialGrant.redacted).toBe(true);
  });
});
