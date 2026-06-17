import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { ok } from "@appaloft/core";
import {
  createDefaultConnectorDefinitions,
  createExecutionContext,
  GitHubAppSourceConnectionProjectionSource,
  InMemoryConnectorConnectionStore,
  InMemoryConnectorRegistry,
  ListConnectionsQueryService,
  ShowConnectionQueryService,
} from "../src";
import { GitHubAppConnectionQueryService } from "../src/operations/system/github-app-connection.query-service";
import { UpsertGitHubAppInstallationUseCase } from "../src/operations/system/upsert-github-app-installation.use-case";
import {
  type GitHubAppInstallationRecord,
  type GitHubAppInstallationRepository,
  type GitHubAppRuntime,
  type IntegrationRegistry,
  type TenantContextResolver,
} from "../src/ports";

describe("GitHub App connection", () => {
  test("[GITHUB-APP-CONNECTION-001] resolves tenant context before reading connection status", async () => {
    let requestedTenantId = "";
    const service = new GitHubAppConnectionQueryService(
      integrationRegistry,
      {
        ...installationRepository,
        async findForTenant(_context, input) {
          requestedTenantId = input.tenantId;
          return ok(null);
        },
      },
      tenantContextResolver,
    );

    const result = await service.execute(createExecutionContext({ entrypoint: "system" }));

    expect(result.isOk()).toBe(true);
    expect(requestedTenantId).toBe("org_active");
    expect(result.isOk() ? result.value.tenantId : "").toBe("org_active");
    expect(result.isOk() ? result.value.installUrl : "").toBe(
      "https://github.com/apps/appaloft/installations/new",
    );
  });

  test("[GITHUB-APP-CONNECTION-002] resolves tenant context before persisting callback installation", async () => {
    let storedTenantId = "";
    const useCase = new UpsertGitHubAppInstallationUseCase(
      githubAppRuntime,
      {
        ...installationRepository,
        async upsert(_context, record) {
          storedTenantId = record.tenantId;
          return ok(record);
        },
      },
      tenantContextResolver,
    );

    const result = await useCase.execute(createExecutionContext({ entrypoint: "system" }), {
      installationId: "123",
      setupAction: "install",
    });

    expect(result.isOk()).toBe(true);
    expect(storedTenantId).toBe("org_active");
    expect(result.isOk() ? result.value.tenantId : "").toBe("org_active");
    expect(result.isOk() ? result.value.accountLogin : "").toBe("appaloft");
  });

  test("[CLOUD-CONN-SOURCE-008][APP-CONN-007] projects GitHub App installation as source connection", async () => {
    const repository = {
      ...installationRepository,
      async findForTenant(_context, input) {
        expect(input.tenantId).toBe("org_active");
        return ok(githubInstallationRecord);
      },
      async findByInstallationId(_context, input) {
        expect(input.installationId).toBe("123");
        return ok(githubInstallationRecord);
      },
    } satisfies GitHubAppInstallationRepository;
    const projection = new GitHubAppSourceConnectionProjectionSource(
      new InMemoryConnectorRegistry(
        createDefaultConnectorDefinitions({
          githubSource: {
            configured: true,
          },
        }),
      ),
      repository,
      tenantContextResolver,
    );
    const listService = new ListConnectionsQueryService(
      new InMemoryConnectorConnectionStore(),
      projection,
    );
    const showService = new ShowConnectionQueryService(
      new InMemoryConnectorConnectionStore(),
      projection,
    );

    const list = await listService.execute(createExecutionContext({ entrypoint: "system" }), {
      category: "source",
    });
    const shown = await showService.execute(createExecutionContext({ entrypoint: "system" }), {
      connectionId: "conn_github_source_123",
    });
    const mismatchedProjection = new GitHubAppSourceConnectionProjectionSource(
      new InMemoryConnectorRegistry(
        createDefaultConnectorDefinitions({
          githubSource: {
            configured: true,
          },
        }),
      ),
      repository,
      {
        async resolveTenantContext() {
          return {
            tenantId: "org_other",
            organizationId: "org_other",
            source: "test",
            mode: "organization",
          };
        },
      },
    );
    const mismatchedShow = await new ShowConnectionQueryService(
      new InMemoryConnectorConnectionStore(),
      mismatchedProjection,
    ).execute(createExecutionContext({ entrypoint: "system" }), {
      connectionId: "conn_github_source_123",
    });

    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      id: "conn_github_source_123",
      connectorKey: "github-source",
      providerKey: "github",
      category: "source",
      owner: {
        scope: "organization",
        id: "org_active",
      },
      displayName: "GitHub: appaloft",
      status: "connected",
      credentialGrant: {
        kind: "provider-app-installation",
        storage: "provider-app",
        redacted: true,
        externalAccountId: "acct_123",
        externalInstallationId: "123",
      },
    });
    expect(list.items[0]?.capabilities).toContain("source.repositories.browse");
    expect(shown.isOk()).toBe(true);
    expect(shown.isOk() ? shown.value.id : "").toBe("conn_github_source_123");
    expect(mismatchedShow.isErr()).toBe(true);
    expect(JSON.stringify(list.items)).not.toContain("ghs_");
    expect(JSON.stringify(list.items)).not.toContain("secret");
  });
});

const tenantContextResolver = {
  async resolveTenantContext() {
    return {
      tenantId: "org_active",
      organizationId: "org_active",
      source: "test",
      mode: "organization",
    };
  },
} satisfies TenantContextResolver;

const integrationRegistry = {
  findByKey() {
    return {
      key: "github",
      title: "GitHub",
      capabilities: [],
      configuration: {
        status: "configured",
        diagnostics: [],
      },
      setup: {
        providerApp: {
          installUrl: "https://github.com/apps/appaloft/installations/new",
        },
      },
    };
  },
  list() {
    return [];
  },
} satisfies IntegrationRegistry;

const installationRepository = {
  async findForTenant() {
    return ok(null);
  },
  async findByInstallationId() {
    return ok(null);
  },
  async markSuspended() {
    return ok(null);
  },
  async upsert(_context, record) {
    return ok(record);
  },
} satisfies GitHubAppInstallationRepository;

const githubAppRuntime = {
  async createInstallationAccessToken() {
    throw new Error("not used");
  },
  async readInstallation(_context, input) {
    return ok({
      accountLogin: "appaloft",
      accountType: "Organization",
      installationId: input.installationId,
      repositoriesSelection: "selected",
      repositoryCount: 3,
    });
  },
} satisfies GitHubAppRuntime;

const githubInstallationRecord = {
  accountId: "acct_123",
  accountLogin: "appaloft",
  accountType: "Organization",
  installationId: "123",
  installedAt: "2026-06-17T08:00:00.000Z",
  providerKey: "github",
  repositoriesSelection: "selected",
  repositoryCount: 3,
  tenantId: "org_active",
  updatedAt: "2026-06-17T09:00:00.000Z",
} satisfies GitHubAppInstallationRecord;
