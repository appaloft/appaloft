import { Resolver } from "node:dns/promises";

import {
  type DomainOwnershipVerificationResult,
  type DomainOwnershipVerifier,
  type ExecutionContext,
} from "@appaloft/application";

const defaultResolverServers = ["1.1.1.1", "8.8.8.8"] as const;

export class PublicDnsDomainOwnershipVerifier implements DomainOwnershipVerifier {
  private readonly resolverServers: string[];

  constructor() {
    this.resolverServers = readResolverServers();
  }

  async verifyDns(
    context: ExecutionContext,
    input: {
      domainName: string;
      expectedTargets: string[];
    },
  ): Promise<DomainOwnershipVerificationResult> {
    void context;

    const expectedTargets = normalizeTargets(input.expectedTargets);
    if (expectedTargets.length === 0) {
      return {
        status: "skipped",
        observedTargets: [],
        message: "No expected DNS target is recorded for this domain binding",
      };
    }

    const resolver = new Resolver();
    resolver.setServers(this.resolverServers);

    const [aRecords, aaaaRecords, cnameRecords] = await Promise.all([
      resolveRecords(() => resolver.resolve4(input.domainName)),
      resolveRecords(() => resolver.resolve6(input.domainName)),
      resolveRecords(() => resolver.resolveCname(input.domainName)),
    ]);

    const observedTargets = normalizeTargets([
      ...aRecords.records,
      ...aaaaRecords.records,
      ...cnameRecords.records,
    ]);

    if (observedTargets.some((target) => expectedTargets.includes(target))) {
      return {
        status: "matched",
        observedTargets,
        message: "Public DNS resolves to the expected Appaloft target",
      };
    }

    if (observedTargets.length > 0) {
      return {
        status: "mismatch",
        observedTargets,
        message: "Public DNS resolves, but not to the expected Appaloft target",
      };
    }

    const lookupFailed = [aRecords, aaaaRecords, cnameRecords].find((result) => result.failed);
    if (lookupFailed) {
      return {
        status: "lookup_failed",
        observedTargets: [],
        message: lookupFailed.message ?? "Public DNS lookup failed",
      };
    }

    return {
      status: "unresolved",
      observedTargets: [],
      message: "Public DNS has not resolved this domain yet",
    };
  }
}

interface ResolveRecordsResult {
  records: string[];
  failed: boolean;
  message?: string;
}

async function resolveRecords(resolve: () => Promise<string[]>): Promise<ResolveRecordsResult> {
  try {
    return {
      records: await resolve(),
      failed: false,
    };
  } catch (error: unknown) {
    const code = readDnsErrorCode(error);
    if (code === "ENODATA" || code === "ENOTFOUND" || code === "NODATA" || code === "NOTFOUND") {
      return {
        records: [],
        failed: false,
      };
    }

    return {
      records: [],
      failed: true,
      message: error instanceof Error ? error.message : "DNS lookup failed",
    };
  }
}

function normalizeTargets(targets: readonly string[]): string[] {
  return [
    ...new Set(
      targets
        .map((target) => target.trim().toLowerCase().replace(/\.$/, ""))
        .filter((target) => target.length > 0),
    ),
  ];
}

function readResolverServers(): string[] {
  const configured = process.env.APPALOFT_DNS_RESOLVERS?.split(",")
    .map((server) => server.trim())
    .filter((server) => server.length > 0);

  return configured && configured.length > 0 ? configured : [...defaultResolverServers];
}

function readDnsErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
