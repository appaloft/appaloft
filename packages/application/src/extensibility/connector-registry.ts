import {
  type ConnectionCategoryDefinitionSnapshot,
  ConnectorDefinition,
  type ConnectorDefinitionSnapshot,
  connectionCategoryDefinitions,
} from "@appaloft/core";

import {
  type ConnectorAuthorizationAdapter,
  type ConnectorAuthorizationAdapterRegistry,
  type ConnectorDescriptor,
  type ConnectorProviderAdapter,
  type ConnectorProviderAdapterRegistry,
  type ConnectorRegistry,
  type ConnectorRegistryListInput,
} from "../ports";

export class InMemoryConnectorRegistry implements ConnectorRegistry {
  private readonly definitions: ConnectorDefinition[];
  private readonly byKey: Map<string, ConnectorDefinition>;

  constructor(connectors: ConnectorDefinitionSnapshot[]) {
    this.definitions = connectors.map(ConnectorDefinition.rehydrate);
    this.byKey = new Map(
      this.definitions.map((definition) => [definition.key().value, definition]),
    );
  }

  list(input: ConnectorRegistryListInput = {}): ConnectorDescriptor[] {
    return this.definitions
      .filter((definition) =>
        input.category ? definition.category().value === input.category : true,
      )
      .filter((definition) =>
        definition.shouldShowInCatalog({ includeUnavailable: input.includeUnavailable ?? false }),
      )
      .map((definition) => definition.toJSON());
  }

  findByKey(key: string): ConnectorDescriptor | null {
    return this.byKey.get(key)?.toJSON() ?? null;
  }

  findDnsConnectorForProvider(providerId: string): ConnectorDescriptor | null {
    const normalizedProviderId = providerId.trim().toLowerCase();
    if (!normalizedProviderId || normalizedProviderId === "unknown") {
      return null;
    }

    const match = this.definitions.find((definition) => {
      const snapshot = definition.toJSON();
      return (
        snapshot.category === "dns" &&
        snapshot.availability.status !== "unavailable" &&
        snapshot.dnsProviderIds?.includes(normalizedProviderId)
      );
    });
    return match?.toJSON() ?? null;
  }
}

export class InMemoryConnectorProviderAdapterRegistry implements ConnectorProviderAdapterRegistry {
  private readonly byConnectorKey: Map<string, ConnectorProviderAdapter>;

  constructor(private readonly adapters: ConnectorProviderAdapter[]) {
    this.byConnectorKey = new Map(adapters.map((adapter) => [adapter.connectorKey, adapter]));
  }

  list(): ConnectorProviderAdapter[] {
    return [...this.adapters];
  }

  findForConnector(connectorKey: string): ConnectorProviderAdapter | null {
    return this.byConnectorKey.get(connectorKey) ?? null;
  }
}

export class InMemoryConnectorAuthorizationAdapterRegistry
  implements ConnectorAuthorizationAdapterRegistry
{
  private readonly byConnectorKey: Map<string, ConnectorAuthorizationAdapter>;

  constructor(private readonly adapters: ConnectorAuthorizationAdapter[]) {
    this.byConnectorKey = new Map(adapters.map((adapter) => [adapter.connectorKey, adapter]));
  }

  findForConnector(connectorKey: string): ConnectorAuthorizationAdapter | null {
    return this.byConnectorKey.get(connectorKey) ?? null;
  }
}

export function listConnectionCategoryDefinitions(): ConnectionCategoryDefinitionSnapshot[] {
  return [...connectionCategoryDefinitions];
}
