import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  cleanupLocalDockerComposeDeployment,
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

type MigrationPlan = { planDigest: string; state: string };
type MigrationApplyResult = {
  state: string;
  failure?: { code: string; message: string; stepId: string };
  receipts: Array<{ operationKey: string; output: Record<string, string | number | boolean> }>;
};

describe("platform migration Compose workflow e2e", () => {
  test("[MIG-COMPOSE-011] migrates a reviewed service graph with private networking and exact cleanup", async () => {
    const dockerVersion = runDocker(["version", "--format", "{{.Server.Version}}"]);
    expect(dockerVersion.exitCode, dockerVersion.stderr).toBe(0);

    const suffix = crypto.randomUUID().slice(0, 8);
    const image = dockerName(`appaloft-migration-compose-${suffix}:latest`);
    const fixtureDir = fixturePath("platform-migration-compose");
    const composeFile = join(fixtureDir, "docker-compose.yml");
    const workspace = createShellE2eWorkspace("appaloft-platform-migration-compose-", {
      appVersion: "0.1.0-platform-migration-compose-e2e",
      env: { APPALOFT_MIGRATION_COMPOSE_IMAGE: image },
    });
    const bundlePath = join(workspace.workspaceDir, "migration-bundle.json");
    const planPath = join(workspace.workspaceDir, "migration-plan.json");
    const taskPath = join(workspace.workspaceDir, "migration-task.json");
    let deploymentId: string | undefined;

    try {
      const built = runDocker(["build", "-t", image, fixturePath("docker-express-hello")]);
      expect(built.exitCode, built.stderr).toBe(0);
      const server = runShellCli(
        [
          "server",
          "register",
          "--name",
          `migration-compose-${suffix}`,
          "--host",
          "127.0.0.1",
          "--provider",
          "local-shell",
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(server, "register Compose migration target");
      const serverId = parseJson<{ id: string }>(server.stdout).id;

      await writeFile(
        bundlePath,
        JSON.stringify({
          apiVersion: "appaloft.io/migration/v1",
          kind: "MigrationBundle",
          metadata: { name: `Compose ${suffix}`, source: { provider: "railway" } },
          spec: {
            project: { name: `Compose ${suffix}` },
            environment: { name: "production", kind: "production" },
            target: { deploymentTargetId: serverId },
            resources: [
              {
                ref: "stack",
                name: `Compose stack ${suffix}`,
                kind: "compose-stack",
                services: [
                  { name: "web", kind: "web" },
                  { name: "api", kind: "api" },
                ],
                source: { kind: "local-folder", locator: fixtureDir },
                runtime: {
                  strategy: "docker-compose",
                  dockerComposeFilePath: "docker-compose.yml",
                },
                network: {
                  internalPort: 3000,
                  exposureMode: "none",
                  targetServiceName: "web",
                },
              },
            ],
            variables: [
              {
                key: "APPALOFT_MIGRATION_COMPOSE_IMAGE",
                value: image,
                exposure: "runtime",
                resourceRef: "stack",
              },
              {
                key: "MIGRATION_GRAPH_ID",
                value: suffix,
                exposure: "runtime",
                resourceRef: "stack",
              },
            ],
          },
        }),
        "utf8",
      );
      const planned = runShellCli(["migrate", "plan", "--input", bundlePath], workspace.cliOptions);
      expectCliSuccess(planned, "plan Compose migration");
      const plan = parseJson<MigrationPlan>(planned.stdout);
      expect(plan.state).toBe("ready");
      await writeFile(planPath, JSON.stringify(plan), "utf8");

      const applied = runShellCli(
        ["migrate", "apply", "--plan", planPath, "--confirm", plan.planDigest],
        workspace.cliOptions,
      );
      expectCliSuccess(applied, "apply Compose migration");
      const applyResult = parseJson<MigrationApplyResult>(applied.stdout);
      expect(applyResult.state, JSON.stringify(applyResult.failure)).toBe("completed");
      deploymentId = String(
        applyResult.receipts.find((receipt) => receipt.operationKey === "deployments.create")
          ?.output.deploymentId,
      );
      expect(deploymentId).not.toBe("undefined");
      await writeFile(taskPath, JSON.stringify({ plan, receipts: applyResult.receipts }), "utf8");

      try {
        await waitForDeploymentSucceeded(deploymentId, workspace.cliOptions);
      } catch (error) {
        const timeline = runShellCli(
          ["deployments", "timeline", deploymentId],
          workspace.cliOptions,
        );
        throw new Error(
          `${error instanceof Error ? error.message : String(error)}\nTimeline:\n${timeline.stdout}\n${timeline.stderr}`,
        );
      }
      await waitForDeploymentTimeline(
        deploymentId,
        workspace.cliOptions,
        [
          "Using local docker-compose-stack execution",
          "Compose stack passed deployment verification",
        ],
        { label: "migrated Compose deployment" },
      );

      const projectName = dockerName(`appaloft-${deploymentId}`);
      const webContainer = runDocker([
        "ps",
        "-q",
        "--filter",
        `label=com.docker.compose.project=${projectName}`,
        "--filter",
        "label=com.docker.compose.service=web",
      ]).stdout.trim();
      const apiContainer = runDocker([
        "ps",
        "-q",
        "--filter",
        `label=com.docker.compose.project=${projectName}`,
        "--filter",
        "label=com.docker.compose.service=api",
      ]).stdout.trim();
      expect(webContainer).not.toBe("");
      expect(apiContainer).not.toBe("");

      const privateCall = runDocker([
        "exec",
        webContainer,
        "node",
        "-e",
        "fetch(process.env.PRIVATE_API_URL).then(async r => { if (!r.ok) process.exit(2); const body = await r.json(); if (body.status !== 'ok') process.exit(3); })",
      ]);
      expect(privateCall.exitCode, privateCall.stderr).toBe(0);
      const webEnvironment = runDocker([
        "inspect",
        "--format",
        "{{json .Config.Env}}",
        webContainer,
      ]);
      const apiEnvironment = runDocker([
        "inspect",
        "--format",
        "{{json .Config.Env}}",
        apiContainer,
      ]);
      expect(webEnvironment.stdout).toContain("SERVICE_ROLE=web");
      expect(webEnvironment.stdout).toContain("PRIVATE_API_URL=http://api:3000/health");
      expect(apiEnvironment.stdout).toContain("SERVICE_ROLE=api");

      const verified = runShellCli(["migrate", "verify", "--task", taskPath], workspace.cliOptions);
      expectCliSuccess(verified, "verify Compose migration");
      expect(parseJson<{ state: string }>(verified.stdout).state).toBe("passed");

      const cleaned = runShellCli(
        ["migrate", "cleanup", "--task", taskPath, "--confirm", plan.planDigest],
        workspace.cliOptions,
      );
      expectCliSuccess(cleaned, "clean Compose migration");
      expect(parseJson<{ state: string; remainingStepIds: string[] }>(cleaned.stdout)).toEqual(
        expect.objectContaining({ state: "completed", remainingStepIds: [] }),
      );
      expect(
        runDocker([
          "ps",
          "-q",
          "--filter",
          `label=com.docker.compose.project=${projectName}`,
        ]).stdout.trim(),
      ).toBe("");
    } finally {
      cleanupLocalDockerComposeDeployment(deploymentId, composeFile);
      runDocker(["image", "rm", "-f", image]);
      cleanupWorkspace(workspace.workspaceDir);
    }
  }, 360_000);
});
