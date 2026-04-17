import { describe, expect, test } from "bun:test";
import { request } from "node:http";
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

const enabled = process.env.YUNDU_E2E_PROXY_DOCKER === "true";
const fixtureDir = fixturePath("docker-express-hello");

type DeploymentSummary = {
  destinationId: string;
  environmentId: string;
  id: string;
  projectId: string;
  resourceId: string;
  serverId: string;
};

async function requestThroughProxy(input: { domain: string; path: string; port: number }): Promise<{
  body: string;
  statusCode: number;
}> {
  return await new Promise((resolveRequest, reject) => {
    const client = request(
      {
        headers: {
          Host: input.domain,
        },
        hostname: "127.0.0.1",
        path: input.path,
        port: input.port,
        timeout: 2000,
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolveRequest({
            body,
            statusCode: response.statusCode ?? 0,
          });
        });
      },
    );

    client.on("timeout", () => {
      client.destroy(new Error("Proxy request timed out"));
    });
    client.on("error", reject);
    client.end();
  });
}

async function waitForProxy(input: { domain: string; port: number }): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await requestThroughProxy({
        domain: input.domain,
        path: "/health",
        port: input.port,
      });

      if (response.statusCode === 200) {
        return response.body;
      }
    } catch {
      // proxy or router not ready yet
    }

    await Bun.sleep(500);
  }

  throw new Error(`Timed out waiting for proxy route ${input.domain}`);
}

describe("routing/domain/TLS proxy workflow e2e", () => {
  if (!enabled) {
    test.skip("[ROUTE-TLS-WORKFLOW-002] opt-in Docker proxy workflow requires YUNDU_E2E_PROXY_DOCKER=true", () => {});
    return;
  }

  test("[ROUTE-TLS-WORKFLOW-002] reaches a service through a durable domain binding route", async () => {
    const dockerVersion = runDocker(["version", "--format", "{{.Server.Version}}"]);
    expect(dockerVersion.exitCode, dockerVersion.stderr).toBe(0);

    const existingProxy = runDocker(["inspect", "yundu-traefik"]);
    if (existingProxy.exitCode === 0) {
      console.warn("Skipping proxy workflow e2e because yundu-traefik already exists.");
      return;
    }

    const existingNetwork = runDocker(["network", "inspect", "yundu-edge"]).exitCode === 0;
    const proxyHttpPort = await reservePort();
    const proxyHttpsPort = await reservePort();
    const appPort = await reservePort();
    const workspace = createShellE2eWorkspace("yundu-proxy-domain-workflow-e2e-", {
      appVersion: "0.1.0-routing-domain-tls-proxy-e2e",
      env: {
        YUNDU_EDGE_HTTP_PORT: String(proxyHttpPort),
        YUNDU_EDGE_HTTPS_PORT: String(proxyHttpsPort),
      },
    });
    const suffix = crypto.randomUUID().slice(0, 8);
    const durableDomain = `proxy-workflow-${suffix}.test`;
    const deploymentIds: string[] = [];

    try {
      const project = runShellCli(
        ["project", "create", "--name", `Proxy Workflow ${suffix}`],
        workspace.cliOptions,
      );
      expectCliSuccess(project, "create proxy workflow project");
      const projectId = parseJson<{ id: string }>(project.stdout).id;

      const server = runShellCli(
        [
          "server",
          "register",
          "--name",
          `proxy-${suffix}`,
          "--host",
          "127.0.0.1",
          "--provider",
          "local-shell",
          "--proxy-kind",
          "traefik",
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(server, "register proxy workflow server");
      const serverId = parseJson<{ id: string }>(server.stdout).id;

      const environment = runShellCli(
        ["env", "create", "--project", projectId, "--name", "local", "--kind", "local"],
        workspace.cliOptions,
      );
      expectCliSuccess(environment, "create proxy workflow environment");
      const environmentId = parseJson<{ id: string }>(environment.stdout).id;

      const initialDeployment = runShellCli(
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
          "dockerfile",
          "--port",
          String(appPort),
          "--health-path",
          "/health",
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(initialDeployment, "initial proxy workflow deployment");
      const initialDeploymentId = parseJson<{ id: string }>(initialDeployment.stdout).id;
      deploymentIds.push(initialDeploymentId);

      const listedDeployments = runShellCli(["deployments", "list"], workspace.cliOptions);
      expectCliSuccess(listedDeployments, "list proxy workflow deployments");
      const initialContext = parseJson<{ items: DeploymentSummary[] }>(
        listedDeployments.stdout,
      ).items.find((deployment) => deployment.id === initialDeploymentId);
      expect(initialContext).toBeDefined();
      if (!initialContext) {
        throw new Error(`Deployment ${initialDeploymentId} was not listed`);
      }

      const createdBinding = runShellCli(
        [
          "domain-binding",
          "create",
          durableDomain,
          "--project-id",
          initialContext.projectId,
          "--environment-id",
          initialContext.environmentId,
          "--resource-id",
          initialContext.resourceId,
          "--server-id",
          initialContext.serverId,
          "--destination-id",
          initialContext.destinationId,
          "--proxy-kind",
          "traefik",
          "--tls-mode",
          "disabled",
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(createdBinding, "create durable proxy domain binding");
      const domainBindingId = parseJson<{ id: string }>(createdBinding.stdout).id;

      const confirmed = runShellCli(
        ["domain-binding", "confirm-ownership", domainBindingId],
        workspace.cliOptions,
      );
      expectCliSuccess(confirmed, "confirm durable proxy domain binding");

      const redeployed = runShellCli(
        [
          "deploy",
          fixtureDir,
          "--project",
          initialContext.projectId,
          "--server",
          initialContext.serverId,
          "--destination",
          initialContext.destinationId,
          "--environment",
          initialContext.environmentId,
          "--resource",
          initialContext.resourceId,
          "--method",
          "dockerfile",
          "--port",
          String(appPort),
          "--health-path",
          "/health",
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(redeployed, "redeploy proxy workflow resource");
      deploymentIds.push(parseJson<{ id: string }>(redeployed.stdout).id);

      const body = await waitForProxy({
        domain: durableDomain,
        port: proxyHttpPort,
      });
      expect(JSON.parse(body)).toEqual(
        expect.objectContaining({
          message: "hello from express",
          port: appPort,
          status: "ok",
        }),
      );
    } finally {
      for (const deploymentId of deploymentIds) {
        cleanupLocalDockerDeployment(deploymentId);
      }

      runDocker(["rm", "-f", "yundu-traefik"]);
      if (!existingNetwork) {
        runDocker(["network", "rm", "yundu-edge"]);
      }
      cleanupWorkspace(workspace.workspaceDir);
    }
  }, 180000);
});
