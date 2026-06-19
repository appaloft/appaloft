import {
  inferDnsBaseDomain,
  inspectDnsProviderFromNameservers,
  normalizeDnsHostname,
  ok,
  type Result,
} from "@appaloft/core";

import {
  type DnsProviderDiscoveryPort,
  type DomainBindingDnsProviderDiscoveryReadiness,
} from "../ports";

export class StaticDnsProviderDiscoveryPort implements DnsProviderDiscoveryPort {
  constructor(
    private readonly records: Record<
      string,
      { nameservers: readonly string[]; baseDomain?: string }
    > = {},
  ) {}

  async inspectHostname(
    hostname: string,
  ): Promise<Result<DomainBindingDnsProviderDiscoveryReadiness>> {
    const lookup = this.records[hostname.toLowerCase()] ?? this.records["*"];
    if (!lookup) {
      const snapshot = inspectDnsProviderFromNameservers({ hostname, nameservers: [] });
      return ok({
        status: "unknown",
        hostname: snapshot.hostname,
        baseDomain: snapshot.baseDomain,
        nameservers: snapshot.nameservers,
        providerId: snapshot.detectedProvider.providerId,
        providerTitle: snapshot.detectedProvider.title,
        confidence: snapshot.detectedProvider.confidence,
      });
    }

    const snapshot = inspectDnsProviderFromNameservers({
      hostname,
      nameservers: lookup.nameservers,
      ...(lookup.baseDomain ? { baseDomain: lookup.baseDomain } : {}),
    });
    return ok({
      status: snapshot.detectedProvider.providerId === "unknown" ? "unknown" : "detected",
      hostname: snapshot.hostname,
      baseDomain: snapshot.baseDomain,
      nameservers: snapshot.nameservers,
      providerId: snapshot.detectedProvider.providerId,
      providerTitle: snapshot.detectedProvider.title,
      confidence: snapshot.detectedProvider.confidence,
    });
  }
}

export interface DnsNameserverResolver {
  resolveNs(domain: string): Promise<readonly string[]>;
}

export class ResolvingDnsProviderDiscoveryPort implements DnsProviderDiscoveryPort {
  constructor(private readonly resolver: DnsNameserverResolver) {}

  async inspectHostname(
    hostname: string,
  ): Promise<Result<DomainBindingDnsProviderDiscoveryReadiness>> {
    const normalizedHostname = normalizeDnsHostname(hostname);
    const baseDomain = inferDnsBaseDomain(normalizedHostname);
    try {
      const nameservers = await this.resolver.resolveNs(baseDomain);
      const snapshot = inspectDnsProviderFromNameservers({
        hostname: normalizedHostname,
        baseDomain,
        nameservers,
      });
      return ok({
        status: snapshot.detectedProvider.providerId === "unknown" ? "unknown" : "detected",
        hostname: snapshot.hostname,
        baseDomain: snapshot.baseDomain,
        nameservers: snapshot.nameservers,
        providerId: snapshot.detectedProvider.providerId,
        providerTitle: snapshot.detectedProvider.title,
        confidence: snapshot.detectedProvider.confidence,
      });
    } catch (error) {
      const snapshot = inspectDnsProviderFromNameservers({
        hostname: normalizedHostname,
        baseDomain,
        nameservers: [],
      });
      return ok({
        status: "unavailable",
        hostname: snapshot.hostname,
        baseDomain: snapshot.baseDomain,
        nameservers: [],
        providerId: "unknown",
        providerTitle: snapshot.detectedProvider.title,
        confidence: "unknown",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
