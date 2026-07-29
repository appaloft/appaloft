import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  createExecutionContext,
  GitHubAgentConfigurationService,
  InMemoryGitHubAgentConfigurationRepository,
} from "../src";

function service() {
  let sequence = 0;
  return new GitHubAgentConfigurationService({
    repository: new InMemoryGitHubAgentConfigurationRepository(),
    clock: { now: () => "2026-07-28T00:00:00.000Z" },
    idGenerator: { next: (prefix) => `${prefix}_${++sequence}` },
  });
}

const context = createExecutionContext({
  entrypoint: "http",
  requestId: "req_github_agent_configuration",
  tenant: { tenantId: "tenant_a" },
});

describe("GitHub Agent configuration service", () => {
  test("[GH-AUTO-RULE-004] binds a numeric repository and persists a complete rule", async () => {
    const configuration = service();
    const binding = await configuration.bindRepository(context, {
      projectId: "project_a",
      installationConnectionId: "conn_github_installation",
      providerRepositoryId: "123456",
      repositoryFullNameSnapshot: "appaloft/agent-sandbox-smoke",
      defaultBranchSnapshot: "main",
      privateSnapshot: true,
    });
    const rule = await configuration.createAutomationRule(context, {
      projectId: "project_a",
      repositoryBindingId: binding._unsafeUnwrap().id,
      name: "Review ready pull requests",
      trigger: { event: "pull_request", action: "ready_for_review" },
      taskAction: "review",
      actorPolicy: "project-automation-identity",
      automationIdentityRef: "automation_identity_a",
      agentProfileId: "agp_review",
      workspaceProfileInstallationId: "awpi_review",
      sandboxTemplateId: "sandbox_template_review",
      serverPoolId: "server_pool_a",
      mode: "review-only",
      maximumRuntimeSeconds: 3_600,
      maximumRetries: 2,
      previewPolicy: "disabled",
      pullRequestDeliveryPolicy: "review-only",
      rerunReviewOnSynchronize: false,
    });

    expect(binding._unsafeUnwrap()).toMatchObject({
      tenantId: "tenant_a",
      providerRepositoryId: "123456",
      status: "active",
    });
    expect(rule._unsafeUnwrap()).toMatchObject({
      tenantId: "tenant_a",
      status: "enabled",
      revision: 1,
      maximumRuntimeSeconds: 3_600,
      maximumRetries: 2,
    });
    expect(
      (await configuration.listAutomationRules(context, "project_a"))._unsafeUnwrap(),
    ).toHaveLength(1);
  });

  test("[GH-AUTO-PROFILE-005] creates and disables an exact Agent Profile", async () => {
    const configuration = service();
    const created = await configuration.createAgentProfile(context, {
      name: "OpenCode fix",
      adapter: "opencode",
      adapterInstallationId: "aai_opencode",
      adapterVersion: "1.0.0",
      capabilities: ["write", "resume-fallback"],
      defaultModel: "agent-default",
      credentialConnectionId: "conn_agent_opencode",
      workspaceProfileInstallationId: "awpi_opencode",
      sandboxTemplateId: "sandbox_template_opencode",
      maximumRuntimeSeconds: 3_600,
      maximumRetries: 2,
      maximumOutputBytes: 262_144,
    });
    const disabled = await configuration.disableAgentProfile(context, created._unsafeUnwrap().id);

    expect(disabled._unsafeUnwrap()).toMatchObject({
      status: "disabled",
      revision: 2,
      adapter: "opencode",
      credentialConnectionId: "conn_agent_opencode",
    });
  });
});
