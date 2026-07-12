import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  cleanupLocalDockerDeployment,
  cleanupWorkspace,
  createShellE2eWorkspace,
  expectCliSuccess,
  parseJson,
  reservePort,
  runDocker,
  runShellCli,
} from "./support/shell-e2e-fixture";

interface DeploymentShow {
  deployment: {
    id: string;
    resourceId: string;
  };
  status: {
    current: string;
  };
}

function readContainerMarker(deploymentId: string): string {
  const result = runDocker([
    "exec",
    `appaloft-${deploymentId}`,
    "bun",
    "-e",
    'console.log(await (await fetch("http://127.0.0.1:3000")).text())',
  ]);
  expect(result.exitCode, result.stderr).toBe(0);
  return result.stdout.trim();
}

function containerId(deploymentId: string): string {
  const result = runDocker(["inspect", "--format", "{{.Id}}", `appaloft-${deploymentId}`]);
  expect(result.exitCode, result.stderr).toBe(0);
  return result.stdout.trim();
}

describe("quick deploy changed-workload Docker workflow e2e", () => {
  if (Bun.env.APPALOFT_E2E_DEPLOYMENT_CHANGE_DOCKER !== "true") {
    test.skip("[QUICK-DEPLOY-WF-067] opt-in real Docker redeploy smoke is disabled", () => {});
    return;
  }

  test("[QUICK-DEPLOY-WF-067] config-only redeploy changes the running workload", async () => {
    const dockerVersion = runDocker(["version", "--format", "{{.Server.Version}}"]);
    expect(dockerVersion.exitCode, dockerVersion.stderr).toBe(0);

    const existingProxy = runDocker(["inspect", "appaloft-traefik"]);
    if (existingProxy.exitCode === 0) {
      console.warn("Skipping changed-workload smoke because appaloft-traefik already exists.");
      return;
    }

    const existingNetwork = runDocker(["network", "inspect", "appaloft-edge"]).exitCode === 0;
    const workspace = createShellE2eWorkspace("appaloft-deployment-change-e2e-", {
      appVersion: "0.1.0-deployment-change-e2e",
      env: {
        APPALOFT_EDGE_HTTP_PORT: String(await reservePort()),
        APPALOFT_EDGE_HTTPS_PORT: String(await reservePort()),
      },
    });
    const sourceDir = join(workspace.workspaceDir, "source");
    const suffix = crypto.randomUUID().slice(0, 8);
    const deploymentIds: string[] = [];

    try {
      mkdirSync(sourceDir, { recursive: true });
      writeFileSync(
        join(sourceDir, "Dockerfile"),
        [
          "FROM oven/bun:1-alpine",
          "WORKDIR /app",
          "COPY server.ts ./server.ts",
          "EXPOSE 3000",
          'CMD ["bun", "server.ts"]',
          "",
        ].join("\n"),
      );
      writeFileSync(
        join(sourceDir, "server.ts"),
        'Bun.serve({ port: 3000, hostname: "0.0.0.0", fetch() { return new Response(Bun.env.DEPLOYMENT_MARKER ?? "v1"); } });\n',
      );

      const project = runShellCli(
        ["project", "create", "--name", `Deployment Change ${suffix}`],
        workspace.cliOptions,
      );
      expectCliSuccess(project, "create project");
      const projectId = parseJson<{ id: string }>(project.stdout).id;

      const server = runShellCli(
        [
          "server",
          "register",
          "--name",
          `local-change-${suffix}`,
          "--host",
          "127.0.0.1",
          "--provider",
          "local-shell",
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(server, "register local server");
      const serverId = parseJson<{ id: string }>(server.stdout).id;

      const environment = runShellCli(
        ["env", "create", "--project", projectId, "--name", "local", "--kind", "local"],
        workspace.cliOptions,
      );
      expectCliSuccess(environment, "create local environment");
      const environmentId = parseJson<{ id: string }>(environment.stdout).id;

      const first = runShellCli(
        [
          "deploy",
          sourceDir,
          "--project",
          projectId,
          "--server",
          serverId,
          "--environment",
          environmentId,
          "--resource-name",
          `deployment-change-${suffix}`,
          "--method",
          "dockerfile",
          "--port",
          "3000",
          "--health-path",
          "/",
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(first, "first deployment");
      const firstId = parseJson<{ id: string }>(first.stdout).id;
      deploymentIds.push(firstId);

      const firstShowResult = runShellCli(["deployments", "show", firstId], workspace.cliOptions);
      expectCliSuccess(firstShowResult, "show first deployment");
      const firstShow = parseJson<DeploymentShow>(firstShowResult.stdout);
      expect(firstShow.status.current).toBe("succeeded");
      expect(readContainerMarker(firstId)).toBe("v1");
      const firstContainerId = containerId(firstId);

      const variable = runShellCli(
        [
          "resource",
          "set-variable",
          firstShow.deployment.resourceId,
          "DEPLOYMENT_MARKER",
          "v2",
          "--exposure",
          "runtime",
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(variable, "set runtime variable");

      const second = runShellCli(
        [
          "deployments",
          "redeploy",
          firstShow.deployment.resourceId,
          "--project",
          projectId,
          "--environment",
          environmentId,
          "--server",
          serverId,
          "--source-deployment",
          firstId,
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(second, "redeploy changed resource");
      const secondId = parseJson<{ id: string }>(second.stdout).id;
      deploymentIds.push(secondId);
      expect(secondId).not.toBe(firstId);

      const secondShowResult = runShellCli(["deployments", "show", secondId], workspace.cliOptions);
      expectCliSuccess(secondShowResult, "show second deployment");
      const secondShow = parseJson<DeploymentShow>(secondShowResult.stdout);
      expect(secondShow.status.current).toBe("succeeded");
      expect(readContainerMarker(secondId)).toBe("v2");
      const secondContainerId = containerId(secondId);
      expect(secondContainerId).not.toBe(firstContainerId);

      console.info(
        JSON.stringify(
          {
            first: { containerId: firstContainerId, deploymentId: firstId, marker: "v1" },
            second: { containerId: secondContainerId, deploymentId: secondId, marker: "v2" },
          },
          null,
          2,
        ),
      );
    } finally {
      for (const deploymentId of deploymentIds) {
        cleanupLocalDockerDeployment(deploymentId);
      }
      runDocker(["rm", "-f", "appaloft-traefik"]);
      if (!existingNetwork) {
        runDocker(["network", "rm", "appaloft-edge"]);
      }
      cleanupWorkspace(workspace.workspaceDir);
    }
  }, 600_000);
});
