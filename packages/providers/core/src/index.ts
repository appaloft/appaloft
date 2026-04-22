import { type ProviderDescriptor, type ProviderRegistry } from "@appaloft/application";

export class InMemoryProviderRegistry implements ProviderRegistry {
  private readonly byKey: Map<string, ProviderDescriptor>;

  constructor(private readonly providers: ProviderDescriptor[]) {
    this.byKey = new Map(providers.map((provider) => [provider.key, provider]));
  }

  list(): ProviderDescriptor[] {
    return [...this.providers];
  }

  findByKey(key: string): ProviderDescriptor | null {
    return this.byKey.get(key) ?? null;
  }
}
