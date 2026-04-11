import { type ProviderDescriptor, type ProviderRegistry } from "@yundu/application";

export class InMemoryProviderRegistry implements ProviderRegistry {
  constructor(private readonly providers: ProviderDescriptor[]) {}

  list(): ProviderDescriptor[] {
    return [...this.providers];
  }
}
