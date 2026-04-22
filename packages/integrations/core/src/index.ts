import { type IntegrationDescriptor, type IntegrationRegistry } from "@appaloft/application";

export class InMemoryIntegrationRegistry implements IntegrationRegistry {
  private readonly byKey: Map<string, IntegrationDescriptor>;

  constructor(private readonly integrations: IntegrationDescriptor[]) {
    this.byKey = new Map(integrations.map((integration) => [integration.key, integration]));
  }

  list(): IntegrationDescriptor[] {
    return [...this.integrations];
  }

  findByKey(key: string): IntegrationDescriptor | null {
    return this.byKey.get(key) ?? null;
  }
}
