import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  cleanupLocalDockerComposeDeployment,
  cleanupLocalDockerDeployment,
  cleanupWorkspace,
  createShellE2eWorkspace,
  dockerName,
  expectCliSuccess,
  fixturePath,
  parseJson,
  reservePort,
  runDocker,
  runShellCli,
} from "./support/shell-e2e-fixture";

const dockerfileFixtureDir = fixturePath("docker-express-hello");
const composeFixtureFile = join(fixturePath("docker-compose-hello"), "docker-compose.yml");

async function waitForHealth(url: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // container health endpoint is not reachable yet
    }

    await Bun.sleep(500);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

describe("quick deploy local Docker substrate e2e", () => {
  test("[QUICK-DEPLOY-WF-057][QUICK-DEPLOY-WF-058][QUICK-DEPLOY-WF-059] quick deploy covers local Dockerfile, Compose, and prebuilt image paths", async () => {
    const dockerVersion = runDocker(["version", "--format", "{{.Server.Version}}"]);
    expect(dockerVersion.exitCode, dockerVersion.stderr).toBe(0);

    const suffix = crypto.randomUUID().slice(0, 8);
    const prebuiltImage = dockerName(`appaloft-smoke-prebuilt-${suffix}:latest`);
    const workspace = createShellE2eWorkspace("appaloft-local-docker-substrates-", {
      appVersion: "0.1.0-quick-deploy-local-docker-substrates-e2e",
      env: {
        APPALOFT_COMPOSE_SMOKE_IMAGE: prebuiltImage,
      },
    });
    const dockerfilePort = await reservePort();
    const prebuiltPort = await reservePort();
    let dockerfileDeploymentId: string | undefined;
    let composeDeploymentId: string | undefined;
    let prebuiltDeploymentId: string | undefined;

    try {
      const imageBuild = runDocker(["build", "-t", prebuiltImage, dockerfileFixtureDir]);
      expect(imageBuild.exitCode, imageBuild.stderr).toBe(0);

      const project = runShellCli(
        ["project", "create", "--name", `Local Docker Substrates ${suffix}`],
        workspace.cliOptions,
      );
      expectCliSuccess(project, "create project");
      const projectId = parseJson<{ id: string }>(project.stdout).id;

      const server = runShellCli(
        [
          "server",
          "register",
          "--name",
          `local-${suffix}`,
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
      expectCliSuccess(environment, "create environment");
      const environmentId = parseJson<{ id: string }>(environment.stdout).id;

      const dockerfileDeployment = runShellCli(
        [
          "deploy",
          dockerfileFixtureDir,
          "--project",
          projectId,
          "--server",
          serverId,
          "--environment",
          environmentId,
          "--method",
          "dockerfile",
          "--port",
          String(dockerfilePort),
          "--health-path",
          "/health",
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(dockerfileDeployment, "quick deploy Dockerfile");
      dockerfileDeploymentId = parseJson<{ id: string }>(dockerfileDeployment.stdout).id;

      const dockerfileLogs = runShellCli(["logs", dockerfileDeploymentId], workspace.cliOptions);
      expectCliSuccess(dockerfileLogs, "Dockerfile logs");
      expect(dockerfileLogs.stdout).toContain("Using local docker-container execution");
      expect(dockerfileLogs.stdout).toContain("Container is reachable");
      const dockerfileHealthUrl =
        /Container is reachable at (http:\/\/127\.0\.0\.1:\d+\/health)/u.exec(
          dockerfileLogs.stdout,
        )?.[1];
      if (!dockerfileHealthUrl) {
        throw new Error(`Could not find Dockerfile health URL in logs:\n${dockerfileLogs.stdout}`);
      }
      await waitForHealth(dockerfileHealthUrl);

      const prebuiltDeployment = runShellCli(
        [
          "deploy",
          `docker://${prebuiltImage}`,
          "--project",
          projectId,
          "--server",
          serverId,
          "--environment",
          environmentId,
          "--method",
          "prebuilt-image",
          "--port",
          String(prebuiltPort),
          "--health-path",
          "/health",
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(prebuiltDeployment, "quick deploy prebuilt image");
      prebuiltDeploymentId = parseJson<{ id: string }>(prebuiltDeployment.stdout).id;

      const prebuiltLogs = runShellCli(["logs", prebuiltDeploymentId], workspace.cliOptions);
      expectCliSuccess(prebuiltLogs, "prebuilt image logs");
      expect(prebuiltLogs.stdout).toContain("Using local docker-container execution");
      expect(prebuiltLogs.stdout).toContain("Container is reachable");
      const prebuiltHealthUrl =
        /Container is reachable at (http:\/\/127\.0\.0\.1:\d+\/health)/u.exec(
          prebuiltLogs.stdout,
        )?.[1];
      if (!prebuiltHealthUrl) {
        throw new Error(`Could not find prebuilt health URL in logs:\n${prebuiltLogs.stdout}`);
      }
      await waitForHealth(prebuiltHealthUrl);

      const composeDeployment = runShellCli(
        [
          "deploy",
          composeFixtureFile,
          "--project",
          projectId,
          "--server",
          serverId,
          "--environment",
          environmentId,
          "--method",
          "docker-compose",
          "--port",
          "3000",
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(composeDeployment, "quick deploy Docker Compose");
      composeDeploymentId = parseJson<{ id: string }>(composeDeployment.stdout).id;

      const composeLogs = runShellCli(["logs", composeDeploymentId], workspace.cliOptions);
      expectCliSuccess(composeLogs, "Docker Compose logs");
      expect(composeLogs.stdout).toContain("Using local docker-compose-stack execution");
      expect(composeLogs.stdout).toContain("Compose stack started successfully");
      expect(composeLogs.stdout).toContain("docker-compose.yml");
      expect(composeLogs.stdout).toContain(fixturePath("docker-compose-hello"));

      const deployments = runShellCli(["deployments", "list"], workspace.cliOptions);
      expectCliSuccess(deployments, "list deployments");
      expect(
        parseJson<{ items: Array<{ id: string; status: string }> }>(deployments.stdout).items,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: dockerfileDeploymentId, status: "succeeded" }),
          expect.objectContaining({ id: prebuiltDeploymentId, status: "succeeded" }),
          expect.objectContaining({ id: composeDeploymentId, status: "succeeded" }),
        ]),
      );
    } finally {
      cleanupLocalDockerComposeDeployment(composeDeploymentId, composeFixtureFile);
      cleanupLocalDockerDeployment(prebuiltDeploymentId);
      cleanupLocalDockerDeployment(dockerfileDeploymentId);
      runDocker(["image", "rm", "-f", prebuiltImage]);
      cleanupWorkspace(workspace.workspaceDir);
    }
  }, 240000);
});
