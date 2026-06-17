import {
  domainError,
  err,
  ok,
  ProviderAppTokenLease,
  type Result,
  SourceRepositoryAccess,
  type SourceRepositorySummarySnapshot,
} from "@appaloft/core";

import { type ExecutionContext } from "../execution-context";
import {
  type ConnectorCapabilityApplyInput,
  type ConnectorCapabilityApplyResult,
  type ConnectorCapabilityPlanInput,
  type ConnectorCapabilityPlanPreview,
  type ConnectorProviderAdapter,
} from "../ports";

export interface FakeSourceConnectorProviderAdapterOptions {
  connectorKey: string;
  providerKey: string;
  providerTitle: string;
  installationId?: string;
  accountLogin?: string;
  repositories?: readonly SourceRepositorySummarySnapshot[];
  permissions?: readonly string[];
  expiresAt?: string;
  now?: string;
}

export class FakeSourceConnectorProviderAdapter implements ConnectorProviderAdapter {
  readonly connectorKey: string;
  private readonly providerKey: string;
  private readonly providerTitle: string;
  private readonly installationId: string;
  private readonly accountLogin: string | undefined;
  private readonly repositories: readonly SourceRepositorySummarySnapshot[];
  private readonly permissions: readonly string[];
  private readonly expiresAt: string;
  private readonly now: string | undefined;

  constructor(options: FakeSourceConnectorProviderAdapterOptions) {
    this.connectorKey = options.connectorKey;
    this.providerKey = options.providerKey;
    this.providerTitle = options.providerTitle;
    this.installationId = options.installationId ?? "123456";
    this.accountLogin = options.accountLogin;
    this.repositories = options.repositories ?? defaultRepositories();
    this.permissions = options.permissions ?? ["contents:read", "metadata:read"];
    this.expiresAt = options.expiresAt ?? "2099-01-01T00:00:00.000Z";
    this.now = options.now;
  }

  canPlan(capabilityKey: string): boolean {
    return capabilityKey === "source.repositories.browse";
  }

  async planCapability(
    context: ExecutionContext,
    input: ConnectorCapabilityPlanInput,
  ): Promise<Result<ConnectorCapabilityPlanPreview>> {
    void context;
    if (!this.canPlan(input.capabilityKey)) {
      return err(
        domainError.validation(`Connector ${this.connectorKey} cannot plan ${input.capabilityKey}`),
      );
    }

    const requestedRepositories = optionalStringArray(input.parameters?.repositoryFullNames);
    const requestedPermissions = optionalStringArray(input.parameters?.permissions);
    const tokenLease = ProviderAppTokenLease.create({
      providerKey: this.providerKey,
      installationId: this.installationId,
      expiresAt: this.expiresAt,
      permissions: [...this.permissions],
      repositoryFullNames: this.repositories.map((repository) => repository.fullName),
      ...(this.now ? { now: this.now } : {}),
    }).andThen((lease) =>
      lease.narrow({
        ...(requestedRepositories ? { repositoryFullNames: requestedRepositories } : {}),
        ...(requestedPermissions ? { permissions: requestedPermissions } : {}),
        ...(this.now ? { now: this.now } : {}),
      }),
    );
    if (tokenLease.isErr()) return err(tokenLease.error);

    const visibleRepositories = filterRepositories(this.repositories, requestedRepositories);
    const access = SourceRepositoryAccess.create({
      providerKey: this.providerKey,
      installationId: this.installationId,
      ...(this.accountLogin ? { accountLogin: this.accountLogin } : {}),
      repositoriesSelection: requestedRepositories ? "selected" : "all",
      repositories: visibleRepositories,
      tokenLease: tokenLease.value.toJSON(),
    });
    if (access.isErr()) return err(access.error);

    return ok(this.toPreview(input, access.value));
  }

  canApply(capabilityKey: string): boolean {
    void capabilityKey;
    return false;
  }

  async applyCapability(
    context: ExecutionContext,
    input: ConnectorCapabilityApplyInput,
  ): Promise<Result<ConnectorCapabilityApplyResult>> {
    void context;
    return err(
      domainError.conflict(
        `Connector ${this.connectorKey} exposes source access through planning`,
        {
          capabilityKey: input.capabilityKey,
        },
      ),
    );
  }

  private toPreview(
    input: ConnectorCapabilityPlanInput,
    access: SourceRepositoryAccess,
  ): ConnectorCapabilityPlanPreview {
    const sourceRepositoryAccess = access.toJSON();
    const tokenState = sourceRepositoryAccess.tokenLease.expired ? "expired" : "valid";
    return {
      planId: `srcplan_${stableHash({
        connectorKey: input.connectorKey,
        capabilityKey: input.capabilityKey,
        sourceRepositoryAccess,
      })}`,
      connectorKey: input.connectorKey,
      capabilityKey: input.capabilityKey,
      riskLevel: "low",
      requiresExplicitAcceptance: false,
      summary: `${this.providerTitle}: ${access.repositoryCount()} repositories with ${tokenState} redacted provider-app token lease.`,
      effects: [
        {
          kind: "source.provider-app-token.exchange",
          title: "Exchange provider app credentials for a short-lived token",
          description: `Token value is redacted and expires at ${sourceRepositoryAccess.tokenLease.expiresAt}.`,
        },
        {
          kind: "source.repositories.browse",
          title: "Browse installation repositories",
          description: `${access.repositoryCount()} repositories are visible for this source connection.`,
        },
      ],
      cleanup: {
        supported: false,
        description: "Repository browsing does not create provider resources.",
      },
      providerPlan: {
        kind: "source-repository-access",
        sourceRepositoryAccess,
      },
    };
  }
}

function defaultRepositories(): SourceRepositorySummarySnapshot[] {
  return [
    {
      id: "repo_1",
      name: "app",
      fullName: "acme/app",
      ownerLogin: "acme",
      private: true,
      defaultBranch: "main",
      htmlUrl: "https://github.com/acme/app",
    },
    {
      id: "repo_2",
      name: "docs",
      fullName: "acme/docs",
      ownerLogin: "acme",
      private: false,
      defaultBranch: "main",
      htmlUrl: "https://github.com/acme/docs",
    },
  ];
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].sort();
  return values.length > 0 ? values : undefined;
}

function filterRepositories(
  repositories: readonly SourceRepositorySummarySnapshot[],
  requestedFullNames: readonly string[] | undefined,
): SourceRepositorySummarySnapshot[] {
  if (!requestedFullNames) {
    return repositories.map((repository) => ({ ...repository }));
  }
  const requested = new Set(requestedFullNames);
  return repositories
    .filter((repository) => requested.has(repository.fullName))
    .map((repository) => ({ ...repository }));
}

function stableHash(value: unknown): string {
  const input = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
