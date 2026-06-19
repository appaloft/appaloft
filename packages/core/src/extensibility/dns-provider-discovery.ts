export type DnsProviderId =
  | "cloudflare"
  | "godaddy"
  | "route53"
  | "namecheap"
  | "vercel"
  | "dnspod"
  | "aliyun"
  | "tencentcloud"
  | "unknown";

export type DnsProviderDiscoveryConfidence = "high" | "medium" | "unknown";

export interface DnsProviderDetectionSnapshot {
  providerId: DnsProviderId;
  title: string;
  confidence: DnsProviderDiscoveryConfidence;
  matchedNameserver?: string;
  matchedPattern?: string;
}

export interface DnsProviderDiscoverySnapshot {
  hostname: string;
  baseDomain: string;
  nameservers: string[];
  detectedProvider: DnsProviderDetectionSnapshot;
}

interface DnsProviderRule {
  providerId: Exclude<DnsProviderId, "unknown">;
  title: string;
  pattern: RegExp;
}

const dnsProviderRules: readonly DnsProviderRule[] = [
  {
    providerId: "cloudflare",
    title: "Cloudflare DNS",
    pattern: /(^|\.)ns\.cloudflare\.com$/i,
  },
  {
    providerId: "godaddy",
    title: "GoDaddy DNS",
    pattern: /(^|\.)domaincontrol\.com$/i,
  },
  {
    providerId: "route53",
    title: "Amazon Route 53",
    pattern: /(^|\.)awsdns-[0-9]+/i,
  },
  {
    providerId: "namecheap",
    title: "Namecheap DNS",
    pattern: /(^|\.)registrar-servers\.com$/i,
  },
  {
    providerId: "vercel",
    title: "Vercel DNS",
    pattern: /(^|\.)vercel-dns\.com$/i,
  },
  {
    providerId: "dnspod",
    title: "DNSPod",
    pattern: /(^|\.)dnspod\.(net|com)$/i,
  },
  {
    providerId: "aliyun",
    title: "Alibaba Cloud DNS",
    pattern: /(^|\.)(alidns\.com|hichina\.com)$/i,
  },
  {
    providerId: "tencentcloud",
    title: "Tencent Cloud DNS",
    pattern: /(^|\.)tencentdns\.com$/i,
  },
];

export function normalizeDnsHostname(value: string): string {
  return value.trim().replace(/\.$/, "").toLowerCase();
}

export function inferDnsBaseDomain(hostname: string): string {
  const normalized = normalizeDnsHostname(hostname);
  const labels = normalized.split(".").filter(Boolean);
  if (labels.length <= 2) {
    return normalized;
  }
  return labels.slice(-2).join(".");
}

export function detectDnsProviderFromNameservers(
  nameservers: readonly string[],
): DnsProviderDetectionSnapshot {
  const normalizedNameservers = nameservers
    .map(normalizeDnsHostname)
    .filter((nameserver) => nameserver.length > 0);

  for (const nameserver of normalizedNameservers) {
    for (const rule of dnsProviderRules) {
      if (rule.pattern.test(nameserver)) {
        return {
          providerId: rule.providerId,
          title: rule.title,
          confidence: "high",
          matchedNameserver: nameserver,
          matchedPattern: String(rule.pattern),
        };
      }
    }
  }

  return {
    providerId: "unknown",
    title: "Unknown DNS provider",
    confidence: normalizedNameservers.length > 0 ? "medium" : "unknown",
  };
}

export function inspectDnsProviderFromNameservers(input: {
  hostname: string;
  nameservers: readonly string[];
  baseDomain?: string;
}): DnsProviderDiscoverySnapshot {
  const hostname = normalizeDnsHostname(input.hostname);
  const baseDomain = normalizeDnsHostname(input.baseDomain ?? inferDnsBaseDomain(hostname));
  const nameservers = input.nameservers.map(normalizeDnsHostname).filter(Boolean);
  return {
    hostname,
    baseDomain,
    nameservers,
    detectedProvider: detectDnsProviderFromNameservers(nameservers),
  };
}
