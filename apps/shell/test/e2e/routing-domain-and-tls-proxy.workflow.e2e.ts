import { describe, expect, test } from "bun:test";
import { request } from "node:http";
import { TraefikEdgeProxyProvider } from "@appaloft/provider-edge-proxy-traefik";
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
  startShellHttpServer,
} from "./support/shell-e2e-fixture";

const enabled = process.env.APPALOFT_E2E_PROXY_DOCKER === "true";
const fixtureDir = fixturePath("docker-express-hello");

type DeploymentSummary = {
  destinationId: string;
  environmentId: string;
  id: string;
  projectId: string;
  resourceId: string;
  serverId: string;
};

async function requestThroughProxy(input: {
  domain: string;
  headers?: Record<string, string>;
  path: string;
  port: number;
}): Promise<{
  body: string;
  statusCode: number;
}> {
  return await new Promise((resolveRequest, reject) => {
    const client = request(
      {
        headers: {
          Host: input.domain,
          ...input.headers,
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

async function waitForProxyDiagnostic(input: {
  domain: string;
  expectedCode: string;
  path: string;
  port: number;
  requestId: string;
}): Promise<string> {
  let lastResponse: { body: string; statusCode: number } | undefined;
  let lastError: string | undefined;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await requestThroughProxy({
        domain: input.domain,
        headers: {
          Accept: "text/html",
          "X-Request-Id": input.requestId,
        },
        path: input.path,
        port: input.port,
      });
      lastResponse = response;
      lastError = undefined;

      if (response.body.includes(input.expectedCode)) {
        return response.body;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      // proxy, router, or renderer not ready yet
    }

    await Bun.sleep(500);
  }

  throw new Error(
    [
      `Timed out waiting for proxy diagnostic ${input.expectedCode}`,
      lastResponse
        ? `last response: ${lastResponse.statusCode} ${lastResponse.body.slice(0, 500)}`
        : `last error: ${lastError ?? "n/a"}`,
    ].join("\n"),
  );
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
    test.skip("[ROUTE-TLS-WORKFLOW-002] opt-in Docker proxy workflow requires APPALOFT_E2E_PROXY_DOCKER=true", () => {});
    return;
  }

  test("[ROUTE-TLS-WORKFLOW-002] reaches a service through a durable domain binding route", async () => {
    const dockerVersion = runDocker(["version", "--format", "{{.Server.Version}}"]);
    expect(dockerVersion.exitCode, dockerVersion.stderr).toBe(0);

    const existingProxy = runDocker(["inspect", "appaloft-traefik"]);
    if (existingProxy.exitCode === 0) {
      console.warn("Skipping proxy workflow e2e because appaloft-traefik already exists.");
      return;
    }

    const existingNetwork = runDocker(["network", "inspect", "appaloft-edge"]).exitCode === 0;
    const proxyHttpPort = await reservePort();
    const proxyHttpsPort = await reservePort();
    const appPort = await reservePort();
    const workspace = createShellE2eWorkspace("appaloft-proxy-domain-workflow-e2e-", {
      appVersion: "0.1.0-routing-domain-tls-proxy-e2e",
      env: {
        APPALOFT_EDGE_HTTP_PORT: String(proxyHttpPort),
        APPALOFT_EDGE_HTTPS_PORT: String(proxyHttpsPort),
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
        ["domain-binding", "confirm-ownership", domainBindingId, "--verification-mode", "manual"],
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

      runDocker(["rm", "-f", "appaloft-traefik"]);
      if (!existingNetwork) {
        runDocker(["network", "rm", "appaloft-edge"]);
      }
      cleanupWorkspace(workspace.workspaceDir);
    }
  }, 180000);

  test("[RES-ACCESS-DIAG-REAL-003][ROUTE-TLS-BOUNDARY-009] real Traefik upstream failure reaches Appaloft renderer and evidence lookup", async () => {
    const dockerVersion = runDocker(["version", "--format", "{{.Server.Version}}"]);
    expect(dockerVersion.exitCode, dockerVersion.stderr).toBe(0);

    const existingProxy = runDocker(["inspect", "appaloft-traefik"]);
    if (existingProxy.exitCode === 0) {
      console.warn(
        "Skipping real Traefik access failure e2e because appaloft-traefik already exists.",
      );
      return;
    }

    const existingNetwork = runDocker(["network", "inspect", "appaloft-edge"]).exitCode === 0;
    const proxyHttpPort = await reservePort();
    const proxyHttpsPort = await reservePort();
    const rendererHttpPort = await reservePort();
    const suffix = crypto.randomUUID().slice(0, 8);
    const domain = `real-access-${suffix}.test`;
    const requestId = `req_real_${suffix}`;
    const badContainer = `appaloft-real-access-${suffix}`;
    const workspace = createShellE2eWorkspace("appaloft-real-traefik-access-e2e-", {
      appVersion: "0.1.0-real-traefik-access-failure-e2e",
      env: {
        APPALOFT_HTTP_HOST: "0.0.0.0",
      },
      httpPort: String(rendererHttpPort),
    });
    let httpServer: Awaited<ReturnType<typeof startShellHttpServer>> | undefined;

    try {
      httpServer = await startShellHttpServer(workspace.cliOptions);

      const network = runDocker(["network", "create", "appaloft-edge"]);
      if (!existingNetwork) {
        expect(network.exitCode, network.stderr).toBe(0);
      }

      const provider = new TraefikEdgeProxyProvider();
      const realized = await provider.realizeRoutes(
        { correlationId: requestId },
        {
          deploymentId: "dep_real",
          port: 3000,
          accessRoutes: [
            {
              proxyKind: "traefik",
              domains: [domain],
              pathPrefix: "/",
              tlsMode: "disabled",
              targetPort: 6553,
              appliedRouteContext: {
                schemaVersion: "applied-route-context/v1",
                resourceId: "res_real",
                deploymentId: "dep_real",
                domainBindingId: "dbnd_real",
                serverId: "srv_real",
                destinationId: "dst_real",
                routeId: `durable-domain:res_real:dep_real:${domain}:/`,
                diagnosticId: `durable-domain:res_real:dep_real:${domain}:/`,
                routeSource: "durable-domain",
                hostname: domain,
                pathPrefix: "/",
                proxyKind: "traefik",
                providerKey: "traefik",
                appliedAt: "2026-05-04T00:00:00.000Z",
              },
            },
          ],
          resourceAccessFailureRenderer: {
            url: `http://host.docker.internal:${rendererHttpPort}`,
          },
        },
      );
      expect(realized.isOk()).toBe(true);
      const labels = realized._unsafeUnwrap().labels.flatMap((label) => ["--label", label]);
      const badUpstream = runDocker([
        "run",
        "-d",
        "--name",
        badContainer,
        "--network",
        "appaloft-edge",
        ...labels,
        "traefik:v3.6.2",
        "--ping=true",
        "--entrypoints.web.address=:8080",
        "--ping.entrypoint=web",
      ]);
      expect(badUpstream.exitCode, badUpstream.stderr).toBe(0);

      const proxy = runDocker([
        "run",
        "-d",
        "--restart",
        "unless-stopped",
        "--name",
        "appaloft-traefik",
        "--network",
        "appaloft-edge",
        "-p",
        `${proxyHttpPort}:80`,
        "-p",
        `${proxyHttpsPort}:443`,
        "--add-host",
        "host.docker.internal:host-gateway",
        "-v",
        "/var/run/docker.sock:/var/run/docker.sock:ro",
        "traefik:v3.6.2",
        "--providers.docker=true",
        "--providers.docker.exposedbydefault=false",
        "--providers.docker.network=appaloft-edge",
        "--entrypoints.web.address=:80",
        "--entrypoints.websecure.address=:443",
      ]);
      expect(proxy.exitCode, proxy.stderr).toBe(0);

      const diagnosticHtml = await waitForProxyDiagnostic({
        domain,
        expectedCode: "resource_access_upstream_connect_failed",
        path: "/broken?token=secret",
        port: proxyHttpPort,
        requestId,
      });
      expect(diagnosticHtml).toContain(requestId);
      expect(diagnosticHtml).toContain("res_real");
      expect(diagnosticHtml).toContain("dep_real");
      expect(diagnosticHtml).toContain("dbnd_real");
      expect(diagnosticHtml).toContain("srv_real");
      expect(diagnosticHtml).toContain("dst_real");
      expect(diagnosticHtml).not.toContain("token=secret");

      const lookup = runShellCli(["resource", "access-failure", requestId], workspace.cliOptions);
      expectCliSuccess(lookup, "lookup real Traefik access failure evidence");
      const lookupBody = parseJson<{
        evidence?: {
          code?: string;
          route?: Record<string, string>;
        };
        relatedIds?: Record<string, string>;
        status: string;
      }>(lookup.stdout);
      expect(lookupBody).toMatchObject({
        status: "found",
        evidence: {
          code: "resource_access_upstream_connect_failed",
          route: {
            resourceId: "res_real",
            deploymentId: "dep_real",
            domainBindingId: "dbnd_real",
            serverId: "srv_real",
            destinationId: "dst_real",
            routeSource: "durable-domain",
            routeStatus: "applied",
            providerKey: "traefik",
          },
        },
        relatedIds: {
          resourceId: "res_real",
          deploymentId: "dep_real",
          domainBindingId: "dbnd_real",
          serverId: "srv_real",
          destinationId: "dst_real",
        },
      });
      expect(JSON.stringify(lookupBody)).not.toContain("token=secret");
    } finally {
      runDocker(["rm", "-f", badContainer]);
      runDocker(["rm", "-f", "appaloft-traefik"]);
      if (!existingNetwork) {
        runDocker(["network", "rm", "appaloft-edge"]);
      }
      await httpServer?.stop();
      cleanupWorkspace(workspace.workspaceDir);
    }
  }, 180000);
});
