import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { ok } from "@appaloft/core";
import { createExecutionContext } from "../src/execution-context";
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
