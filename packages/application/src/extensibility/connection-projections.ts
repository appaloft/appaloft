import {
  Connection,
  type ConnectionSnapshot,
  type ConnectorDefinitionSnapshot,
  CreatedAt,
  OccurredAt,
  ok,
  type Result,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../execution-context";
import {
  type ConnectorConnectionProjectionSource,
  type ConnectorConnectionStoreListInput,
  type ConnectorRegistry,
  DefaultTenantContextResolver,
  type GitHubAppInstallationRecord,
  type GitHubAppInstallationRepository,
  type TenantContextResolver,
} from "../ports";
import { tokens } from "../tokens";

const githubSourceConnectorKey = "github-source";
const githubSourceConnectionIdPrefix = "conn_github_source_";

export class EmptyConnectorConnectionProjectionSource
  implements ConnectorConnectionProjectionSource
{
  async list(): Promise<ConnectionSnapshot[]> {
    return [];
  }

  async findById(): Promise<ConnectionSnapshot | null> {
    return null;
  }
}

export class CompositeConnectorConnectionProjectionSource
  implements ConnectorConnectionProjectionSource
{
  constructor(private readonly sources: readonly ConnectorConnectionProjectionSource[]) {}

  async list(
    context: ExecutionContext,
    input: ConnectorConnectionStoreListInput = {},
  ): Promise<ConnectionSnapshot[]> {
    const byId = new Map<string, ConnectionSnapshot>();
    for (const source of this.sources) {
      for (const connection of await source.list(context, input)) {
        byId.set(connection.id, connection);
      }
    }
    return [...byId.values()];
  }

  async findById(
    context: ExecutionContext,
    connectionId: string,
  ): Promise<ConnectionSnapshot | null> {
    for (const source of this.sources) {
      const connection = await source.findById(context, connectionId);
      if (connection) return connection;
    }
    return null;
  }
}

@injectable()
export class GitHubAppSourceConnectionProjectionSource
  implements ConnectorConnectionProjectionSource
{
  constructor(
    @inject(tokens.connectorRegistry)
    private readonly connectorRegistry: ConnectorRegistry,
    @inject(tokens.githubAppInstallationRepository)
    private readonly installationRepository: GitHubAppInstallationRepository,
    @inject(tokens.tenantContextResolver)
    private readonly tenantContextResolver: TenantContextResolver = new DefaultTenantContextResolver(),
  ) {}

  async list(
    context: ExecutionContext,
    input: ConnectorConnectionStoreListInput = {},
  ): Promise<ConnectionSnapshot[]> {
    if (!acceptsGitHubSourceInput(input)) return [];

    const tenantId = await this.resolveTenantId(context, input);
    if (!tenantId) return [];

    const installation = await this.installationRepository.findForTenant(
      toRepositoryContext({ ...context, tenant: { tenantId } }),
      {
        providerKey: "github",
        tenantId,
      },
    );
    if (installation.isErr() || !installation.value) return [];

    const connection = this.connectionFromInstallation(installation.value);
    if (connection.isErr()) return [];
    if (input.owner && !ownerMatches(connection.value, input.owner)) return [];
    return [connection.value];
  }

  async findById(
    context: ExecutionContext,
    connectionId: string,
  ): Promise<ConnectionSnapshot | null> {
    const installationId = githubInstallationIdFromConnectionId(connectionId);
    if (!installationId) return null;

    const installation = await this.installationRepository.findByInstallationId(
      toRepositoryContext(context),
      {
        providerKey: "github",
        installationId,
      },
    );
    if (installation.isErr() || !installation.value) return null;

    const tenantContext = await this.tenantContextResolver.resolveTenantContext(context);
    if (tenantContext.tenantId && tenantContext.tenantId !== installation.value.tenantId) {
      return null;
    }

    const connection = this.connectionFromInstallation(installation.value);
    return connection.isOk() ? connection.value : null;
  }

  private async resolveTenantId(
    context: ExecutionContext,
    input: ConnectorConnectionStoreListInput,
  ): Promise<string | null> {
    if (input.owner) {
      if (input.owner.scope === "organization" || input.owner.scope === "account") {
        return input.owner.id;
      }
      return null;
    }

    const tenantContext = await this.tenantContextResolver.resolveTenantContext(context);
    return tenantContext.tenantId || null;
  }

  private connectionFromInstallation(
    installation: GitHubAppInstallationRecord,
  ): Result<ConnectionSnapshot> {
    const connector =
      this.connectorRegistry.findByKey(githubSourceConnectorKey) ?? githubConnectorFallback();

    return Connection.start({
      id: githubSourceConnectionId(installation.installationId),
      connector,
      owner: githubConnectionOwner(installation),
      displayName: githubConnectionDisplayName(installation),
      credentialGrant: githubCredentialGrant(installation),
      createdAt: CreatedAt.rehydrate(installation.installedAt),
    })
      .andThen((connection) =>
        connectOrFailGitHubInstallation(connection, installation).map(() => connection),
      )
      .map((connection) => connection.toJSON());
  }
}

function acceptsGitHubSourceInput(input: ConnectorConnectionStoreListInput): boolean {
  if (input.connectorKey && input.connectorKey !== githubSourceConnectorKey) return false;
  if (input.category && input.category !== "source") return false;
  return true;
}

function ownerMatches(
  connection: ConnectionSnapshot,
  owner: NonNullable<ConnectorConnectionStoreListInput["owner"]>,
): boolean {
  return connection.owner.scope === owner.scope && connection.owner.id === owner.id;
}

function githubSourceConnectionId(installationId: string): string {
  return `${githubSourceConnectionIdPrefix}${installationId.trim()}`;
}

function githubInstallationIdFromConnectionId(connectionId: string): string | null {
  if (!connectionId.startsWith(githubSourceConnectionIdPrefix)) return null;
  const installationId = connectionId.slice(githubSourceConnectionIdPrefix.length).trim();
  return installationId || null;
}

function githubConnectionOwner(installation: GitHubAppInstallationRecord) {
  return {
    scope: "organization" as const,
    id: installation.tenantId,
  };
}

function githubConnectionDisplayName(installation: GitHubAppInstallationRecord): string {
  return installation.accountLogin ? `GitHub: ${installation.accountLogin}` : "GitHub Source";
}

function githubCredentialGrant(installation: GitHubAppInstallationRecord) {
  return {
    kind: "provider-app-installation" as const,
    storage: "provider-app" as const,
    ...(installation.accountId || installation.accountLogin
      ? { externalAccountId: installation.accountId ?? installation.accountLogin }
      : {}),
    externalInstallationId: installation.installationId,
  };
}

function connectOrFailGitHubInstallation(
  connection: Connection,
  installation: GitHubAppInstallationRecord,
): Result<void> {
  const occurredAt = OccurredAt.rehydrate(installation.suspendedAt ?? installation.updatedAt);
  if (installation.suspendedAt) {
    connection.fail(occurredAt, {
      code: "github_app_installation_suspended",
      severity: "warning",
      message: "GitHub App installation is suspended and cannot issue source access tokens.",
    });
    return ok(undefined);
  }

  return connection.connect(occurredAt, {
    ...(installation.accountId || installation.accountLogin
      ? { externalAccountId: installation.accountId ?? installation.accountLogin }
      : {}),
    externalInstallationId: installation.installationId,
  });
}

function githubConnectorFallback(): ConnectorDefinitionSnapshot {
  return {
    key: githubSourceConnectorKey,
    title: "GitHub Source",
    category: "source",
    providerKey: "github",
    capabilities: [],
    grantKinds: [
      {
        kind: "provider-app-installation",
        title: "GitHub App installation",
        storesLongLivedSecret: false,
      },
    ],
    availability: {
      status: "setup-required",
      diagnostics: [],
    },
    visibility: "catalog",
  };
}
