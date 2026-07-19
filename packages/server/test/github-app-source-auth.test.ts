import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  createExecutionContext,
  type GitHubAppInstallationRepository,
  type GitHubAppRuntime,
} from "@appaloft/application";
import { type AuthRuntime } from "@appaloft/auth-better";
import { ok } from "@appaloft/core";

import { RequestScopedIntegrationAuthPort } from "../src/register-runtime-dependencies";

describe("RequestScopedIntegrationAuthPort", () => {
  test("[GITHUB-APP-SOURCE-001] deployment sources explicitly select tenant installation tokens", async () => {
    let requestedInstallationId: string | undefined;
    const port = new RequestScopedIntegrationAuthPort(
      {
        async getProviderAccessToken() {
          return "stale-user-oauth-token";
        },
      } as AuthRuntime,
      {
        warn() {},
      } as unknown as AppLogger,
      {
        async findForTenant(_context, input) {
          expect(input.tenantId).toBe("org_1");
          return ok({
            installationId: "147623842",
            installedAt: "2026-07-19T00:00:00.000Z",
            providerKey: "github",
            tenantId: "org_1",
            updatedAt: "2026-07-19T00:00:00.000Z",
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
        async createInstallationAccessToken(_context, input) {
          requestedInstallationId = input.installationId;
          return ok({
            expiresAt: "2026-07-19T01:00:00.000Z",
            token: "installation-token",
          });
        },
        async readInstallation() {
          throw new Error("not used");
        },
      } satisfies GitHubAppRuntime,
    );

    const context = createExecutionContext({
      entrypoint: "worker",
      tenant: { tenantId: "org_1" },
    });
    const token = await port.runWithRequest(
      new Request("https://appaloft.test/api/deployments"),
      context,
      () =>
        port.getProviderAccessToken(context, "github", {
          accessTokenKind: "installation",
        }),
    );

    expect(token).toBe("installation-token");
    expect(requestedInstallationId).toBe("147623842");
  });
});
