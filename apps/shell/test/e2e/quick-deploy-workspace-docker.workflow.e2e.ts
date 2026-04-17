import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  cleanupLocalDockerDeployment,
  cleanupWorkspace,
  createShellE2eWorkspace,
  expectCliSuccess,
  fixturePath,
  parseJson,
  reservePort,
  runDocker,
  runShellCli,
} from "./support/shell-e2e-fixture";

const fixtureDir = fixturePath("workspace-http-app");

async function waitForHealth(url: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // app container is not reachable yet
    }

    await Bun.sleep(500);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

describe("quick deploy workspace Docker workflow e2e", () => {
  test("[QUICK-DEPLOY-WF-011] quick deploys a workspace app without Dockerfile by generating Dockerfile.appaloft", async () => {
    expect(existsSync(join(fixtureDir, "Dockerfile"))).toBe(false);

    const dockerVersion = runDocker(["version", "--format", "{{.Server.Version}}"]);
    expect(dockerVersion.exitCode, dockerVersion.stderr).toBe(0);

    const workspace = createShellE2eWorkspace("appaloft-workspace-docker-", {
      appVersion: "0.1.0-quick-deploy-workspace-docker-e2e",
    });
    const appPort = await reservePort();
    const suffix = crypto.randomUUID().slice(0, 8);
    let deploymentId: string | undefined;

    try {
      const project = runShellCli(
        ["project", "create", "--name", `Workspace Docker ${suffix}`],
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

      const deployment = runShellCli(
        [
          "deploy",
          fixtureDir,
          "--project",
          projectId,
          "--server",
          serverId,
          "--environment",
          environmentId,
          "--method",
          "workspace-commands",
          "--build",
          "node build.mjs",
          "--start",
          "node dist/server.js",
          "--port",
          String(appPort),
          "--health-path",
          "/health",
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(deployment, "quick deploy workspace commands");
      deploymentId = parseJson<{ id: string }>(deployment.stdout).id;

      const logs = runShellCli(["logs", deploymentId], workspace.cliOptions);
      expect(logs.exitCode, logs.stderr).toBe(0);
      expect(logs.stdout).toContain("Generated workspace Dockerfile");
      expect(logs.stdout).toContain("Container is reachable");
      const runtimeUrl = /Container is reachable at (http:\/\/127\.0\.0\.1:\d+\/health)/u.exec(
        logs.stdout,
      )?.[1];
      if (!runtimeUrl) {
        throw new Error(`Could not find runtime health URL in logs:\n${logs.stdout}`);
      }

      await waitForHealth(runtimeUrl);
      const payload = await (await fetch(runtimeUrl)).json();
      expect(payload).toEqual(
        expect.objectContaining({
          port: appPort,
          service: "workspace-http-app",
          status: "ok",
        }),
      );

      const generatedDockerfile = join(
        workspace.dataDir,
        "runtime",
        "local-deployments",
        deploymentId,
        "Dockerfile.appaloft",
      );
      expect(existsSync(generatedDockerfile)).toBe(true);
      const dockerfileText = await Bun.file(generatedDockerfile).text();
      expect(dockerfileText).toContain("FROM node:22-alpine");
      expect(dockerfileText).toContain('RUN ["sh","-lc","node build.mjs"]');
      expect(dockerfileText).toContain('CMD ["sh","-lc","node dist/server.js"]');

      const deployments = runShellCli(["deployments", "list"], workspace.cliOptions);
      expect(deployments.exitCode, deployments.stderr).toBe(0);
      expect(
        parseJson<{ items: Array<{ id: string; status: string }> }>(deployments.stdout).items,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: deploymentId,
            status: "succeeded",
          }),
        ]),
      );

      expect(logs.stdout).toContain("docker build");
    } finally {
      cleanupLocalDockerDeployment(deploymentId);
      cleanupWorkspace(workspace.workspaceDir);
    }
  }, 180000);
});
