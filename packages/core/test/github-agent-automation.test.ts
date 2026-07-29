import { describe, expect, test } from "bun:test";

import {
  AgentProfile,
  CreatedAt,
  createAgentCredentialConnectionMetadata,
  githubReviewExecutionKey,
  ProjectAutomationRule,
  RepositoryBinding,
  UpdatedAt,
} from "../src";

const now = CreatedAt.rehydrate("2026-07-28T03:00:00.000Z");
const later = UpdatedAt.rehydrate("2026-07-28T04:00:00.000Z");

describe("GitHub Agent repository automation domain", () => {
  test("[GH-AUTO-BINDING-003] binds one numeric provider repository to a Project and revokes safely", () => {
    const binding = RepositoryBinding.create({
      id: "grb_test",
      tenantId: "tenant_a",
      projectId: "project_a",
      installationConnectionId: "conn_github_installation",
      providerRepositoryId: "123456",
      repositoryFullNameSnapshot: "appaloft/agent-sandbox-smoke",
      defaultBranchSnapshot: "main",
      privateSnapshot: true,
      createdAt: now,
    })._unsafeUnwrap();

    expect(binding.matches("tenant_a", "123456")).toBe(true);
    expect(binding.toSnapshot()).toMatchObject({
      id: "grb_test",
      projectId: "project_a",
      provider: "github",
      providerRepositoryId: "123456",
      status: "active",
    });

    expect(binding.revoke(later).isOk()).toBe(true);
    expect(binding.matches("tenant_a", "123456")).toBe(false);
    expect(binding.toSnapshot()).toMatchObject({
      status: "revoked",
      revokedAt: "2026-07-28T04:00:00.000Z",
    });
  });

  test("[GH-AUTO-RULE-004] matches complete label and head-specific review policies", () => {
    const rule = ProjectAutomationRule.create({
      id: "gar_review_ready",
      tenantId: "tenant_a",
      projectId: "project_a",
      repositoryBindingId: "grb_test",
      name: "Review ready pull requests",
      trigger: { event: "pull_request", action: "ready_for_review" },
      taskAction: "review",
      actorPolicy: "project-automation-identity",
      automationIdentityRef: "automation_identity_review",
      agentProfileId: "agp_review",
      workspaceProfileInstallationId: "awpi_review",
      sandboxTemplateId: "sbt_readonly",
      serverPoolId: "pool_agents",
      mode: "review-only",
      maximumRuntimeSeconds: 1_800,
      maximumRetries: 2,
      previewPolicy: "disabled",
      pullRequestDeliveryPolicy: "review-only",
      rerunReviewOnSynchronize: true,
      createdAt: now,
    })._unsafeUnwrap();

    expect(
      rule.matches({
        repositoryBindingId: "grb_test",
        event: "pull_request",
        action: "ready_for_review",
      }),
    ).toBe(true);
    expect(
      rule.matches({
        repositoryBindingId: "grb_test",
        event: "pull_request",
        action: "synchronize",
      }),
    ).toBe(true);
    expect(
      githubReviewExecutionKey({
        providerRepositoryId: "123456",
        pullRequestNumber: 42,
        headSha: "abcdef123456",
        ruleId: "gar_review_ready",
      }),
    ).toBe("github-review:123456:42:abcdef123456:gar_review_ready");
    expect(rule.toSnapshot()).toMatchObject({
      mode: "review-only",
      maximumRuntimeSeconds: 1_800,
      maximumRetries: 2,
      previewPolicy: "disabled",
      pullRequestDeliveryPolicy: "review-only",
      revision: 1,
    });
  });

  test("[GH-AUTO-RULE-004] requires a complete rule and blocks unsafe review/write combinations", () => {
    const invalid = ProjectAutomationRule.create({
      id: "gar_invalid",
      tenantId: "tenant_a",
      projectId: "project_a",
      repositoryBindingId: "grb_test",
      name: "Invalid",
      trigger: { event: "issues", action: "labeled", label: "appaloft:review" },
      taskAction: "review",
      actorPolicy: "project-automation-identity",
      agentProfileId: "agp_review",
      workspaceProfileInstallationId: "awpi_review",
      sandboxTemplateId: "sbt_review",
      serverPoolId: "pool_agents",
      mode: "write",
      maximumRuntimeSeconds: 1_800,
      maximumRetries: 0,
      previewPolicy: "private",
      pullRequestDeliveryPolicy: "create-or-update",
      createdAt: now,
    });

    expect(invalid.isErr()).toBe(true);
  });
});

describe("GitHub Agent profile and credential contracts", () => {
  test("[GH-AUTO-PROFILE-005] resolves exact existing installations and bounded execution limits", () => {
    const profile = AgentProfile.create({
      id: "agp_opencode_fix",
      tenantId: "tenant_a",
      name: "OpenCode fix",
      adapter: "opencode",
      adapterInstallationId: "aai_opencode",
      adapterVersion: "1.18.4",
      capabilities: ["task-mode", "native-session", "structured-events"],
      defaultModel: "agent-default",
      credentialConnectionId: "conn_agent_opencode",
      workspaceProfileInstallationId: "awpi_opencode",
      sandboxTemplateId: "sbt_opencode",
      maximumRuntimeSeconds: 3_600,
      maximumRetries: 2,
      maximumOutputBytes: 64_000,
      createdAt: now,
    })._unsafeUnwrap();

    expect(profile.toSnapshot()).toEqual({
      id: "agp_opencode_fix",
      tenantId: "tenant_a",
      name: "OpenCode fix",
      adapter: "opencode",
      adapterInstallationId: "aai_opencode",
      adapterVersion: "1.18.4",
      capabilities: ["native-session", "structured-events", "task-mode"],
      defaultModel: "agent-default",
      credentialConnectionId: "conn_agent_opencode",
      workspaceProfileInstallationId: "awpi_opencode",
      sandboxTemplateId: "sbt_opencode",
      maximumRuntimeSeconds: 3_600,
      maximumRetries: 2,
      maximumOutputBytes: 64_000,
      status: "enabled",
      revision: 1,
      createdAt: "2026-07-28T03:00:00.000Z",
    });
  });

  test("[GH-AUTO-CREDENTIAL-006] validates auth lifecycle without accepting plaintext or unsafe server config", () => {
    const connected = createAgentCredentialConnectionMetadata({
      connectionId: "conn_agent_opencode",
      owner: { kind: "organization", id: "org_a" },
      agent: "opencode",
      authMode: "agent-native-api-key",
      status: "connected",
      encryptedCredentialReference: "secretref://agent/org-a/opencode",
      lastValidatedAt: "2026-07-28T03:00:00.000Z",
      allowedProjectIds: ["project_a"],
      allowedProfileIds: ["agp_opencode_fix"],
      unattendedUse: "organization-automation",
    })._unsafeUnwrap();

    expect(connected).toMatchObject({
      connectionId: "conn_agent_opencode",
      authMode: "agent-native-api-key",
      status: "connected",
      redacted: true,
    });
    expect(JSON.stringify(connected)).not.toContain("api-key-value");

    expect(
      createAgentCredentialConnectionMetadata({
        connectionId: "conn_bad",
        owner: { kind: "user", id: "user_a" },
        agent: "codex",
        authMode: "agent-native-api-key",
        status: "connected",
        encryptedCredentialReference: `sk-${"abcdefghijklmnopqrstuvwxyz"}`,
        allowedProjectIds: ["project_a"],
        allowedProfileIds: ["agp_codex"],
        unattendedUse: "denied",
      }).isErr(),
    ).toBe(true);

    expect(
      createAgentCredentialConnectionMetadata({
        connectionId: "conn_server",
        owner: { kind: "organization", id: "org_a" },
        agent: "pi",
        authMode: "existing-server-config",
        status: "connected",
        encryptedCredentialReference: "server-config://root/.config/pi",
        allowedProjectIds: ["project_a"],
        allowedProfileIds: ["agp_pi"],
        unattendedUse: "organization-automation",
        existingServerIsolation: {
          serverPoolId: "pool_agents",
          homeScope: "global",
          portable: false,
        },
      }).isErr(),
    ).toBe(true);
  });
});
