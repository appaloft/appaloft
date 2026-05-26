import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { ok } from "@appaloft/core";
import { createExecutionContext } from "../src/execution-context";
import { ListGitHubRepositoriesQueryService } from "../src/operations/system/list-github-repositories.query-service";
import type {
  GitHubAppInstallationRepository,
  GitHubAppRuntime,
  GitHubRepositoryBrowser,
  IntegrationAuthPort,
  IntegrationRegistry,
} from "../src/ports";

describe("ListGitHubRepositoriesQueryService", () => {
  test("[GITHUB-APP-REPO-001] uses installation tokens without falling back to user OAuth", async () => {
    let oauthTokenRequested = false;
    let accessTokenKind: string | undefined;

    const service = new ListGitHubRepositoriesQueryService(
      {
        async getProviderAccessToken() {
          oauthTokenRequested = true;
          return "user-token";
        },
      } satisfies IntegrationAuthPort,
      {
        async listRepositories(_context, input) {
          accessTokenKind = input.accessTokenKind;
          return [];
        },
      } satisfies GitHubRepositoryBrowser,
      {
        findByKey() {
          return {
            key: "github",
            title: "GitHub",
            capabilities: [],
            defaultConnectionModeKey: "hosted-provider-app",
          };
        },
        list() {
          return [];
        },
      } satisfies IntegrationRegistry,
      {
        async findForTenant() {
          return ok({
            installationId: "987",
            installedAt: "2026-05-26T00:00:00.000Z",
            providerKey: "github",
            tenantId: "org_1",
            updatedAt: "2026-05-26T00:00:00.000Z",
          });
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
      } satisfies GitHubAppInstallationRepository,
      {
        async createInstallationAccessToken() {
          return ok({
            expiresAt: "2026-05-26T01:00:00.000Z",
            token: "installation-token",
          });
        },
        async readInstallation() {
          throw new Error("not used");
        },
      } satisfies GitHubAppRuntime,
    );

    const result = await service.execute(
      createExecutionContext({
        entrypoint: "system",
        tenant: {
          tenantId: "org_1",
        },
      }),
    );

    expect(result.isOk()).toBe(true);
    expect(oauthTokenRequested).toBe(false);
    expect(accessTokenKind).toBe("installation");
  });
});
