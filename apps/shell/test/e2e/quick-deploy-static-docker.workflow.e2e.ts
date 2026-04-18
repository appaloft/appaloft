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
  runDocker,
  runShellCli,
} from "./support/shell-e2e-fixture";

const fixtureDir = fixturePath("static-site");

async function waitForStaticSite(url: string): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      const text = await response.text();
      if (response.ok && text.includes("static site fixture served by nginx")) {
        return text;
      }
    } catch {
      // static site container is not reachable yet
    }

    await Bun.sleep(500);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

describe("quick deploy static Docker workflow e2e", () => {
  test("[QUICK-DEPLOY-WF-040] quick deploys a static site through generated nginx Docker packaging", async () => {
    expect(existsSync(join(fixtureDir, "Dockerfile"))).toBe(false);
    expect(existsSync(join(fixtureDir, "dist", "index.html"))).toBe(true);

    const dockerVersion = runDocker(["version", "--format", "{{.Server.Version}}"]);
    expect(dockerVersion.exitCode, dockerVersion.stderr).toBe(0);

    const workspace = createShellE2eWorkspace("appaloft-static-docker-", {
      appVersion: "0.1.0-quick-deploy-static-docker-e2e",
    });
    const suffix = crypto.randomUUID().slice(0, 8);
    let deploymentId: string | undefined;

    try {
      const project = runShellCli(
        ["project", "create", "--name", `Static Docker ${suffix}`],
        workspace.cliOptions,
      );
      expectCliSuccess(project, "create project");
      const projectId = parseJson<{ id: string }>(project.stdout).id;

      const server = runShellCli(
        [
          "server",
          "register",
          "--name",
          `local-static-${suffix}`,
          "--host",
          "127.0.0.1",
          "--provider",
          "local-shell",
          "--proxy-kind",
          "none",
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
          "static",
          "--publish-dir",
          "/dist",
          "--health-path",
          "/",
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(deployment, "quick deploy static site");
      deploymentId = parseJson<{ id: string }>(deployment.stdout).id;

      const logs = runShellCli(["logs", deploymentId], workspace.cliOptions);
      expect(logs.exitCode, logs.stderr).toBe(0);
      expect(logs.stdout).toContain("Generated static site Dockerfile");
      expect(logs.stdout).toContain("Container is reachable");
      const runtimeUrl = /Container is reachable at (http:\/\/127\.0\.0\.1:\d+\/)/u.exec(
        logs.stdout,
      )?.[1];
      if (!runtimeUrl) {
        throw new Error(`Could not find runtime static URL in logs:\n${logs.stdout}`);
      }

      const html = await waitForStaticSite(runtimeUrl);
      expect(html).toContain('data-smoke-marker="static-site"');

      const generatedDockerfile = join(
        workspace.dataDir,
        "runtime",
        "local-deployments",
        deploymentId,
        "Dockerfile.appaloft-static",
      );
      expect(existsSync(generatedDockerfile)).toBe(true);
      const dockerfileText = await Bun.file(generatedDockerfile).text();
      expect(dockerfileText).toContain("FROM nginx:1.27-alpine");
      expect(dockerfileText).toContain('COPY ["dist/","/usr/share/nginx/html/"]');
      expect(dockerfileText).toContain("EXPOSE 80");

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
    } finally {
      cleanupLocalDockerDeployment(deploymentId);
      cleanupWorkspace(workspace.workspaceDir);
    }
  }, 180000);
});
