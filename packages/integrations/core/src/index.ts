import { type IntegrationDescriptor, type IntegrationRegistry } from "@appaloft/application";

export class InMemoryIntegrationRegistry implements IntegrationRegistry {
  constructor(private readonly integrations: IntegrationDescriptor[]) {}

  list(): IntegrationDescriptor[] {
    return [...this.integrations];
  }
}
