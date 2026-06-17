import "reflect-metadata";
import { describe, expect, test } from "bun:test";

import {
  createDefaultConnectorDefinitions,
  createExecutionContext,
  InMemoryConnectorRegistry,
  ListConnectorCategoriesQueryService,
  ListConnectorsQueryService,
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
});
