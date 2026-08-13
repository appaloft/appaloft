import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  cleanupLocalDockerDeployment,
  cleanupWorkspace,
  createShellE2eWorkspace,
  dockerName,
  expectCliSuccess,
  fixturePath,
  parseJson,
  runDocker,
  runShellCli,
  waitForDeploymentSucceeded,
  waitForDeploymentTimeline,
} from "./support/shell-e2e-fixture";

type MigrationPlan = {
  planDigest: string;
  state: "ready" | "blocked";
  steps: Array<{ id: string; operationKey: string }>;
};

type MigrationApplyResult = {
  planDigest: string;
  state: "completed" | "partial" | "failed";
  receipts: Array<{
    stepId: string;
    operationKey: string;
    state: "completed";
    output: Record<string, string | number | boolean>;
    ownership: "created" | "reused";
  }>;
  failure?: { code: string; message: string };
};

describe("platform migration fresh web workflow e2e", () => {
  test("[MIG-WEB-010] migrates, observes, recovers, and exactly cleans up a local Docker web app", async () => {
    const dockerVersion = runDocker(["version", "--format", "{{.Server.Version}}"]);
    expect(dockerVersion.exitCode, dockerVersion.stderr).toBe(0);

    const workspace = createShellE2eWorkspace("appaloft-platform-migration-web-", {
      appVersion: "0.1.0-platform-migration-web-e2e",
    });
    const suffix = crypto.randomUUID().slice(0, 8);
    const bundlePath = join(workspace.workspaceDir, "migration-bundle.json");
    const planPath = join(workspace.workspaceDir, "migration-plan.json");
    const taskPath = join(workspace.workspaceDir, "migration-task.json");
    let deploymentId: string | undefined;

    try {
      const server = runShellCli(
        [
          "server",
          "register",
          "--name",
          `migration-web-${suffix}`,
          "--host",
          "127.0.0.1",
          "--provider",
          "local-shell",
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(server, "register local migration target");
      const serverId = parseJson<{ id: string }>(server.stdout).id;

      await writeFile(
        bundlePath,
        JSON.stringify({
          apiVersion: "appaloft.io/migration/v1",
          kind: "MigrationBundle",
          metadata: { name: `Fresh web ${suffix}`, source: { provider: "railway" } },
          spec: {
            project: { name: `Fresh web ${suffix}` },
            environment: { name: "production", kind: "production" },
            target: { deploymentTargetId: serverId },
            resources: [
              {
                ref: "web",
                name: `Web ${suffix}`,
                source: { kind: "local-folder", locator: fixturePath("docker-express-hello") },
                runtime: {
                  strategy: "dockerfile",
                  dockerfilePath: "Dockerfile",
                  healthCheckPath: "/health",
                },
                network: { internalPort: 3000 },
              },
            ],
            variables: [
              {
                key: "MIGRATION_PACKET",
                value: suffix,
                exposure: "runtime",
                resourceRef: "web",
              },
            ],
          },
        }),
        "utf8",
      );

      const planned = runShellCli(["migrate", "plan", "--input", bundlePath], workspace.cliOptions);
      expectCliSuccess(planned, "plan fresh web migration");
      const plan = parseJson<MigrationPlan>(planned.stdout);
      expect(plan.state).toBe("ready");
      await writeFile(planPath, JSON.stringify(plan), "utf8");

      const applied = runShellCli(
        ["migrate", "apply", "--plan", planPath, "--confirm", plan.planDigest],
        workspace.cliOptions,
      );
      expectCliSuccess(applied, "apply fresh web migration");
      const applyResult = parseJson<MigrationApplyResult>(applied.stdout);
      expect(applyResult.state, JSON.stringify(applyResult.failure)).toBe("completed");
      deploymentId = String(
        applyResult.receipts.find((receipt) => receipt.operationKey === "deployments.create")
          ?.output.deploymentId,
      );
      const resourceId = String(
        applyResult.receipts.find((receipt) => receipt.operationKey === "resources.create")?.output
          .resourceId,
      );
      expect(deploymentId).not.toBe("undefined");
      expect(resourceId).not.toBe("undefined");
      await writeFile(taskPath, JSON.stringify({ plan, receipts: applyResult.receipts }), "utf8");

      await waitForDeploymentSucceeded(deploymentId, workspace.cliOptions);
      await waitForDeploymentTimeline(
        deploymentId,
        workspace.cliOptions,
        ["Using local docker-container execution", "Container is reachable"],
        { label: "migrated web deployment" },
      );

      const verified = runShellCli(["migrate", "verify", "--task", taskPath], workspace.cliOptions);
      expectCliSuccess(verified, "verify fresh web migration");
      expect(parseJson<{ state: string }>(verified.stdout).state).toBe("passed");

      const stopped = runShellCli(
        ["resource", "runtime", "stop", resourceId, "--deployment", deploymentId],
        workspace.cliOptions,
      );
      expectCliSuccess(stopped, "stop migrated runtime");
      const started = runShellCli(
        [
          "resource",
          "runtime",
          "start",
          resourceId,
          "--deployment",
          deploymentId,
          "--acknowledge-retained-runtime-metadata",
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(started, "recover migrated runtime");

      const cleaned = runShellCli(
        ["migrate", "cleanup", "--task", taskPath, "--confirm", plan.planDigest],
        workspace.cliOptions,
      );
      expectCliSuccess(cleaned, "clean fresh web migration");
      expect(parseJson<{ state: string; remainingStepIds: string[] }>(cleaned.stdout)).toEqual(
        expect.objectContaining({ state: "completed", remainingStepIds: [] }),
      );
      expect(runDocker(["inspect", dockerName(`appaloft-${deploymentId}`)]).exitCode).not.toBe(0);
    } finally {
      cleanupLocalDockerDeployment(deploymentId);
      cleanupWorkspace(workspace.workspaceDir);
    }
  }, 360_000);
});
