import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";
import {
  type EdgeProxyProvider,
  type EdgeProxyProviderRegistry,
  type EdgeProxyProviderSelectionInput,
} from "./ports";

export class InMemoryEdgeProxyProviderRegistry implements EdgeProxyProviderRegistry {
  private readonly byKey: Map<string, EdgeProxyProvider>;

  constructor(providers: EdgeProxyProvider[]) {
    this.byKey = new Map(providers.map((provider) => [provider.key, provider]));
  }

  resolve(key: string): Result<EdgeProxyProvider, DomainError> {
    const provider = this.byKey.get(key);
    if (!provider) {
      return err(
        domainError.proxyProviderUnavailable("Edge proxy provider is not registered", {
          phase: "proxy-provider-resolution",
          providerKey: key,
        }),
      );
    }

    return ok(provider);
  }

  defaultFor(
    input: EdgeProxyProviderSelectionInput,
  ): Result<EdgeProxyProvider | null, DomainError> {
    if (input.proxyKind === undefined || input.proxyKind === "none") {
      return ok(null);
    }

    return this.resolve(input.providerKey ?? input.proxyKind);
  }
}
