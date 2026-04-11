import { type IntegrationDescriptor, type IntegrationRegistry } from "@yundu/application";

export class InMemoryIntegrationRegistry implements IntegrationRegistry {
  constructor(private readonly integrations: IntegrationDescriptor[]) {}

  list(): IntegrationDescriptor[] {
    return [...this.integrations];
  }
}
