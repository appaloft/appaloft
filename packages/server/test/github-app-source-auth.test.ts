import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  createExecutionContext,
  type ExecutionContext,
  type GitHubAppInstallationRepository,
  type GitHubAppRuntime,
  type IntegrationAuthPort,
  type PreviewFeedbackWriter,
  type PreviewFeedbackWriterInput,
  type PreviewFeedbackWriterResult,
} from "@appaloft/application";
import { type AuthRuntime } from "@appaloft/auth-better";
import { ok, type Result } from "@appaloft/core";

import {
  RequestScopedIntegrationAuthPort,
  ShellGitHubPreviewFeedbackWriter,
} from "../src/register-runtime-dependencies";

class CapturingIntegrationAuthPort implements IntegrationAuthPort {
  readonly requests: Array<{ accessTokenKind?: "installation" | "user" }> = [];

  async getProviderAccessToken(
    _context: ExecutionContext,
    _providerKey: "github",
    request?: { accessTokenKind?: "installation" | "user" },
  ): Promise<string | null> {
    this.requests.push(request ?? {});
    return request?.accessTokenKind === "installation" ? "installation-token" : "user-oauth-token";
  }
}

class CapturingPreviewFeedbackWriter implements PreviewFeedbackWriter {
  constructor(
    private readonly accessToken: string,
    private readonly tokenSink: string[],
  ) {}

  async publish(
    _context: ExecutionContext,
    _input: PreviewFeedbackWriterInput,
  ): Promise<Result<PreviewFeedbackWriterResult>> {
    this.tokenSink.push(this.accessToken);
    return ok({ providerFeedbackId: "feedback_1" });
  }
}

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

  test("[PG-PREVIEW-CREDENTIAL-001] preview feedback explicitly selects installation credentials", async () => {
    const integrationAuthPort = new CapturingIntegrationAuthPort();
    const usedTokens: string[] = [];
    const writer = new ShellGitHubPreviewFeedbackWriter(
      integrationAuthPort,
      "legacy-worker-token",
      (accessToken) => new CapturingPreviewFeedbackWriter(accessToken, usedTokens),
    );

    const result = await writer.publish(
      createExecutionContext({
        entrypoint: "worker",
        requestId: "req_preview_installation_feedback",
        tenant: {
          tenantId: "org_1",
          organizationId: "org_1",
          source: "durable-work-item",
        },
      }),
      {
        feedbackKey: "feedback:src_evt_1:github-pr-comment",
        sourceEventId: "src_evt_1",
        previewEnvironmentId: "prenv_1",
        channel: "github-pr-comment",
        repositoryFullName: "appaloft/example",
        pullRequestNumber: 42,
        body: "Preview deployment accepted.",
      },
    );

    expect(result._unsafeUnwrap()).toEqual({ providerFeedbackId: "feedback_1" });
    expect(integrationAuthPort.requests).toEqual([{ accessTokenKind: "installation" }]);
    expect(usedTokens).toEqual(["installation-token"]);
  });
});
