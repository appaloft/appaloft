import {
  type DefaultAccessDomainGeneration,
  type DefaultAccessDomainProvider,
  type DefaultAccessDomainRequest,
  type ExecutionContext,
} from "@yundu/application";
import { type DomainError, domainError, err, ok, PublicDomainName, type Result } from "@yundu/core";

export interface SslipDefaultAccessDomainProviderOptions {
  providerKey?: string;
  zone?: string;
  scheme?: "http" | "https";
}

const defaultProviderKey = "sslip";
const defaultZone = "sslip.io";
const defaultScheme = "http";

function sanitizeDnsLabel(input: string, fallback: string): string {
  const normalized =
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback;

  return normalized.slice(0, 63).replace(/-+$/g, "") || fallback;
}

function sanitizeDnsZone(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .split(".")
    .map((label) => sanitizeDnsLabel(label, "zone"))
    .join(".");
}

function resourceRouteLabel(input: DefaultAccessDomainRequest): string {
  const suffix = sanitizeDnsLabel(input.resourceId, "resource")
    .replace(/^res-?/, "")
    .slice(-10);
  const maxBaseLength = Math.max(1, 62 - suffix.length);
  const base = sanitizeDnsLabel(input.resourceSlug, "resource").slice(0, maxBaseLength);

  return sanitizeDnsLabel(`${base}-${suffix}`, "resource");
}

function normalizeIpv4Address(input: string): Result<string, DomainError> {
  const trimmed = input.trim();
  const host = (() => {
    try {
      if (trimmed.includes("://")) {
        return new URL(trimmed).hostname;
      }
    } catch {
      return trimmed;
    }

    return trimmed.replace(/^\[/, "").replace(/\]$/, "").split(":")[0] ?? trimmed;
  })();

  if (
    !/^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(host)
  ) {
    return err(
      domainError.provider("Default access domain provider requires an IPv4 public address", {
        phase: "default-access-domain-generation",
        publicAddress: input,
      }),
    );
  }

  return ok(host);
}

export class SslipDefaultAccessDomainProvider implements DefaultAccessDomainProvider {
  private readonly providerKey: string;
  private readonly zone: string;
  private readonly scheme: "http" | "https";

  constructor(options: SslipDefaultAccessDomainProviderOptions = {}) {
    this.providerKey = options.providerKey ?? defaultProviderKey;
    this.zone = sanitizeDnsZone(options.zone ?? defaultZone);
    this.scheme = options.scheme ?? defaultScheme;
  }

  async generate(
    _context: ExecutionContext,
    input: DefaultAccessDomainRequest,
  ): Promise<Result<DefaultAccessDomainGeneration, DomainError>> {
    return normalizeIpv4Address(input.publicAddress).andThen((address) => {
      const hostname = `${resourceRouteLabel(input)}.${address}.${this.zone}`;
      return PublicDomainName.create(hostname).map((domain) => ({
        kind: "generated" as const,
        domain: {
          hostname: domain.value,
          scheme: this.scheme,
          providerKey: this.providerKey,
          metadata: {
            zone: this.zone,
            routePurpose: input.routePurpose,
          },
        },
      }));
    });
  }
}
