import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createExecutionContext,
  type GitHubAgentAutomationOutcome,
  toRepositoryContext,
} from "@appaloft/application";

function context(tenantId: string) {
  return createExecutionContext({
    requestId: `req_github_agent_${tenantId}`,
    entrypoint: "system",
    tenant: { tenantId, organizationId: `org_${tenantId}` },
  });
}

describe("Postgres GitHub Agent automation store", () => {
  test("[GH-AUTO-DELIVERY-007][GH-AUTO-LINEAGE-012] atomically claims delivery/review and persists tenant-scoped thread state", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-github-agent-"));
    const {
      createDatabase,
      createMigrator,
      PgGitHubAgentAutomationStore,
      PgSourceEventRepository,
    } = await import("../src");
    const database = await createDatabase({ driver: "pglite", pgliteDataDir: dataDir });

    try {
      expect((await createMigrator(database.db).migrateToLatest()).error).toBeUndefined();
      const firstStore = new PgGitHubAgentAutomationStore(database.db);
      const secondStore = new PgGitHubAgentAutomationStore(database.db);
      const tenantA = context("tenant_a");
      const tenantB = context("tenant_b");
      await new PgSourceEventRepository(database.db).record(toRepositoryContext(tenantA), {
        sourceEventId: "sevt_1",
        sourceKind: "github",
        eventKind: "issue_comment.created",
        sourceIdentity: {
          locator: "https://github.com/appaloft/agent-sandbox-smoke",
          providerRepositoryId: "123456",
          repositoryFullName: "appaloft/agent-sandbox-smoke",
        },
        ref: "refs/issues/41",
        revision: "501",
        deliveryId: "delivery_1",
        dedupeKey: "delivery:github:123456:delivery_1",
        dedupeStatus: "new",
        verification: { status: "verified", method: "provider-signature" },
        status: "accepted",
        matchedResourceIds: [],
        ignoredReasons: [],
        policyResults: [],
        createdDeploymentIds: [],
        receivedAt: "2026-07-28T02:00:00.000Z",
      });

      const claims = await Promise.all([
        firstStore.claimDelivery(tenantA, {
          sourceEventId: "sevt_1",
          deliveryId: "delivery_1",
        }),
        secondStore.claimDelivery(tenantA, {
          sourceEventId: "sevt_1",
          deliveryId: "delivery_1",
        }),
      ]);
      expect(claims.filter((claim) => claim.claimed)).toHaveLength(1);

      const outcome: GitHubAgentAutomationOutcome = {
        status: "accepted",
        sourceEventId: "sevt_1",
        deliveryId: "delivery_1",
        task: {
          taskId: "task_1",
          workspaceId: "workspace_1",
          activeRunId: "run_1",
          status: "running",
          taskUrl: "https://appaloft.test/tasks/task_1",
          sessionRecovery: "native",
        },
        actorSnapshot: {
          githubUserId: "303",
          appaloftUserId: "user_303",
          organizationId: "org_tenant_a",
          membershipRole: "member",
          repositoryPermission: "push",
          externalCollaborator: false,
        },
        authorization: {
          allowed: true,
          authorizationKind: "task-execution",
          actorSnapshot: {
            githubUserId: "303",
            appaloftUserId: "user_303",
            organizationId: "org_tenant_a",
            membershipRole: "member",
            repositoryPermission: "push",
            externalCollaborator: false,
          },
          repositoryBindingId: "grb_test",
          projectId: "project_test",
          agentProfileId: "agp_test",
          workspaceProfileInstallationId: "awpi_test",
          sandboxTemplateId: "sbt_test",
          serverPoolId: "pool_test",
          credentialConnectionId: "conn_agent",
          mode: "write",
          maximumRuntimeSeconds: 3_600,
          maximumRetries: 2,
          previewPolicy: "private",
          pullRequestDeliveryPolicy: "create-or-update",
          authorizationReason: "authorized",
        },
      };
      await firstStore.recordOutcome(tenantA, outcome);

      expect(
        await secondStore.claimDelivery(tenantA, {
          sourceEventId: "sevt_1",
          deliveryId: "delivery_1",
        }),
      ).toEqual({
        claimed: false,
        outcome,
      });
      expect(
        await secondStore.claimDelivery(tenantB, {
          sourceEventId: "sevt_1",
          deliveryId: "delivery_1",
        }),
      ).toEqual({ claimed: false, outcome });

      const reviewClaims = await Promise.all([
        firstStore.claimReviewExecution(tenantA, "github-review:123456:42:abcdef:gar_review"),
        secondStore.claimReviewExecution(tenantA, "github-review:123456:42:abcdef:gar_review"),
      ]);
      expect(reviewClaims.filter(Boolean)).toHaveLength(1);

      await firstStore.setCurrentTask(
        tenantA,
        "github-thread:123456:pull-request:42",
        outcome.task ??
          (() => {
            throw new Error("Expected task outcome");
          })(),
      );
      expect(
        await secondStore.currentTask(tenantA, "github-thread:123456:pull-request:42"),
      ).toEqual(outcome.task);
      expect(
        await secondStore.currentTask(tenantB, "github-thread:123456:pull-request:42"),
      ).toBeUndefined();
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
