import { type ProviderDescriptor, type ProviderRegistry } from "@appaloft/application";

export class InMemoryProviderRegistry implements ProviderRegistry {
  constructor(private readonly providers: ProviderDescriptor[]) {}

  list(): ProviderDescriptor[] {
    return [...this.providers];
  }
}
