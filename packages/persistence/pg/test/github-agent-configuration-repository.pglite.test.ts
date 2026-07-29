import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, GitHubAgentConfigurationService } from "@appaloft/application";

describe("Postgres GitHub Agent configuration repository", () => {
  test("[GH-AUTO-RULE-004][GH-AUTO-PROFILE-005] persists tenant-scoped configuration and optimistic revisions", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-github-agent-config-"));
    const { createDatabase, createMigrator, PgGitHubAgentConfigurationRepository } = await import(
      "../src"
    );
    const database = await createDatabase({ driver: "pglite", pgliteDataDir: dataDir });
    let sequence = 0;
    const context = createExecutionContext({
      entrypoint: "http",
      requestId: "req_github_agent_configuration_pg",
      tenant: { tenantId: "tenant_a" },
    });

    try {
      expect((await createMigrator(database.db).migrateToLatest()).error).toBeUndefined();
      const service = new GitHubAgentConfigurationService({
        repository: new PgGitHubAgentConfigurationRepository(database.db),
        clock: { now: () => "2026-07-28T00:00:00.000Z" },
        idGenerator: { next: (prefix) => `${prefix}_${++sequence}` },
      });
      const binding = await service.bindRepository(context, {
        projectId: "project_a",
        installationConnectionId: "conn_github",
        providerRepositoryId: "123456",
        repositoryFullNameSnapshot: "appaloft/agent-sandbox-smoke",
      });
      const profile = await service.createAgentProfile(context, {
        name: "OpenCode fix",
        adapter: "opencode",
        adapterInstallationId: "aai_opencode",
        adapterVersion: "1.0.0",
        capabilities: ["write"],
        defaultModel: "agent-default",
        credentialConnectionId: "conn_agent",
        workspaceProfileInstallationId: "awpi_opencode",
        sandboxTemplateId: "sandbox_template_opencode",
        maximumRuntimeSeconds: 3_600,
        maximumRetries: 2,
        maximumOutputBytes: 262_144,
      });
      const rule = await service.createAutomationRule(context, {
        projectId: "project_a",
        repositoryBindingId: binding._unsafeUnwrap().id,
        name: "Fix label",
        trigger: { event: "issues", action: "labeled", label: "appaloft:fix" },
        taskAction: "fix",
        actorPolicy: "project-automation-identity",
        automationIdentityRef: "automation_identity_a",
        agentProfileId: profile._unsafeUnwrap().id,
        workspaceProfileInstallationId: "awpi_opencode",
        sandboxTemplateId: "sandbox_template_opencode",
        serverPoolId: "server_pool_a",
        mode: "write",
        maximumRuntimeSeconds: 3_600,
        maximumRetries: 2,
        previewPolicy: "private",
        pullRequestDeliveryPolicy: "create-or-update",
        rerunReviewOnSynchronize: false,
      });

      expect(
        (await service.listRepositoryBindings(context, "project_a"))._unsafeUnwrap(),
      ).toHaveLength(1);
      expect((await service.listAutomationRules(context, "project_a"))._unsafeUnwrap()).toEqual([
        rule._unsafeUnwrap(),
      ]);
      expect((await service.listAgentProfiles(context))._unsafeUnwrap()).toEqual([
        profile._unsafeUnwrap(),
      ]);
      expect(
        (await service.disableAutomationRule(context, rule._unsafeUnwrap().id))._unsafeUnwrap(),
      ).toMatchObject({ status: "disabled", revision: 2 });
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
