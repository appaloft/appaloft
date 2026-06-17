import { describe, expect, test } from "bun:test";

import {
  ConnectionCapabilityKey,
  ConnectorAvailabilityValue,
  ConnectorDefinition,
  CredentialGrantKindValue,
  connectionCategoryDefinitions,
} from "../src";

describe("ConnectorDefinition", () => {
  test("[APP-CONN-001] models neutral connector vocabulary with behavior", () => {
    const definition = ConnectorDefinition.create({
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
        {
          key: "dns.records.apply",
          title: "Apply DNS records",
          implemented: false,
        },
      ],
      grantKinds: [
        {
          kind: "persistent-provider-credential",
          title: "Provider credential",
          storesLongLivedSecret: true,
        },
      ],
      availability: ConnectorAvailabilityValue.available().toJSON(),
      visibility: "catalog",
    });

    expect(definition.isOk()).toBe(true);
    const connector = definition._unsafeUnwrap();

    expect(connector.category().isDns()).toBe(true);
    expect(
      connector.supportsCapability(ConnectionCapabilityKey.rehydrate("dns.records.plan")),
    ).toBe(true);
    expect(
      connector.supportsCapability(ConnectionCapabilityKey.rehydrate("dns.records.apply")),
    ).toBe(false);
    expect(connector.storesReusableSecret()).toBe(true);
  });

  test("[APP-CONN-002] hides unavailable providers when a surface asks for visible catalog entries", () => {
    const definition = ConnectorDefinition.create({
      key: "vultr-infrastructure",
      title: "Vultr Infrastructure",
      category: "infrastructure",
      providerKey: "vultr",
      capabilities: [
        {
          key: "infrastructure.server.propose",
          title: "Propose SSH target",
          implemented: true,
        },
      ],
      grantKinds: [
        {
          kind: "persistent-provider-credential",
          title: "Provider credential",
          storesLongLivedSecret: true,
        },
      ],
      availability: ConnectorAvailabilityValue.deferred("Not implemented yet.").toJSON(),
      visibility: "hidden-when-unavailable",
    })._unsafeUnwrap();

    expect(definition.shouldShowInCatalog({ includeUnavailable: false })).toBe(false);
    expect(definition.shouldShowInCatalog({ includeUnavailable: true })).toBe(true);
  });

  test("[APP-CONN-006] keeps identity and source categories separate", () => {
    const categories = new Set(connectionCategoryDefinitions.map((category) => category.key));

    expect(categories.has("identity")).toBe(true);
    expect(categories.has("source")).toBe(true);
    expect(CredentialGrantKindValue.rehydrate("provider-app-installation").isTemporary()).toBe(
      false,
    );
    expect(CredentialGrantKindValue.rehydrate("temporary-domain-connect").isTemporary()).toBe(true);
  });
});
