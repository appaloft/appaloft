import "reflect-metadata";
import { describe, expect, test } from "bun:test";

import {
  createDefaultConnectorDefinitions,
  createExecutionContext,
  FakeDnsConnectorProviderAdapter,
  InMemoryConnectorProviderAdapterRegistry,
  InMemoryConnectorRegistry,
  ListConnectorCategoriesQueryService,
  ListConnectorsQueryService,
  PlanConnectorCapabilityQueryService,
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
});
