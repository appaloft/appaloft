import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { request } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const enabled = process.env.YUNDU_E2E_PROXY_DOCKER === "true";
const shellRoot = new URL("../..", import.meta.url).pathname;
const fixtureDir = new URL("../fixtures/docker-express-hello", import.meta.url).pathname;

function runCli(
  args: string[],
  options: {
    dataDir: string;
    pgliteDataDir: string;
    proxyHttpPort: number;
    proxyHttpsPort: number;
  },
): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const result = Bun.spawnSync([process.execPath, "run", "src/index.ts", ...args], {
    cwd: shellRoot,
    env: {
      ...process.env,
      YUNDU_DATABASE_DRIVER: "pglite",
      YUNDU_DATA_DIR: options.dataDir,
      YUNDU_EDGE_HTTP_PORT: String(options.proxyHttpPort),
      YUNDU_EDGE_HTTPS_PORT: String(options.proxyHttpsPort),
      YUNDU_HTTP_HOST: "127.0.0.1",
      YUNDU_HTTP_PORT: "0",
      YUNDU_PGLITE_DATA_DIR: options.pgliteDataDir,
      YUNDU_WEB_STATIC_DIR: "",
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

function runDocker(args: string[]): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const result = Bun.spawnSync(["docker", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

type DeploymentSummary = {
  id: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId: string;
};

async function reservePort(): Promise<number> {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to reserve a TCP port"));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolvePort(port);
      });
    });
    server.on("error", reject);
  });
}

async function requestThroughProxy(input: { port: number; domain: string; path: string }): Promise<{
  statusCode: number;
  body: string;
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
            statusCode: response.statusCode ?? 0,
            body,
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

async function waitForProxy(input: { port: number; domain: string }): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await requestThroughProxy({
        port: input.port,
        domain: input.domain,
        path: "/health",
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

describe("docker edge proxy e2e", () => {
  if (!enabled) {
    test("is opt-in because it needs Docker and host ports", () => {
      expect(enabled).toBe(false);
    });
    return;
  }

  test("deploys a Dockerfile app through the default Traefik proxy", async () => {
    const dockerVersion = runDocker(["version", "--format", "{{.Server.Version}}"]);
    expect(dockerVersion.exitCode, dockerVersion.stderr).toBe(0);

    const existingProxy = runDocker(["inspect", "yundu-traefik"]);
    if (existingProxy.exitCode === 0) {
      console.warn("Skipping proxy e2e because yundu-traefik already exists.");
      return;
    }

    const existingNetwork = runDocker(["network", "inspect", "yundu-edge"]).exitCode === 0;
    const workspaceDir = mkdtempSync(join(tmpdir(), "yundu-proxy-e2e-"));
    const dataDir = join(workspaceDir, ".yundu", "data");
    const pgliteDataDir = join(dataDir, "pglite");
    const proxyHttpPort = await reservePort();
    const proxyHttpsPort = await reservePort();
    const appPort = await reservePort();
    const domain = `proxy-e2e-${crypto.randomUUID().slice(0, 8)}.test`;
    let deploymentId: string | undefined;

    try {
      const deployment = runCli(
        [
          "deploy",
          fixtureDir,
          "--method",
          "dockerfile",
          "--port",
          String(appPort),
          "--health-path",
          "/health",
          "--domains",
          domain,
          "--tls-mode",
          "disabled",
        ],
        {
          dataDir,
          pgliteDataDir,
          proxyHttpPort,
          proxyHttpsPort,
        },
      );
      expect(deployment.exitCode, `${deployment.stdout}\n${deployment.stderr}`).toBe(0);
      deploymentId = parseJson<{ id: string }>(deployment.stdout).id;

      const body = await waitForProxy({
        port: proxyHttpPort,
        domain,
      });
      expect(JSON.parse(body)).toEqual(
        expect.objectContaining({
          message: "hello from express",
          port: appPort,
          status: "ok",
        }),
      );

      const logs = runCli(["logs", deploymentId], {
        dataDir,
        pgliteDataDir,
        proxyHttpPort,
        proxyHttpsPort,
      });
      expect(logs.exitCode).toBe(0);
      expect(logs.stdout).toContain("Ensure Traefik edge proxy on Docker network yundu-edge");
      expect(logs.stdout).toContain("Traefik edge proxy is ready");
    } finally {
      if (deploymentId) {
        runCli(["rollback", deploymentId], {
          dataDir,
          pgliteDataDir,
          proxyHttpPort,
          proxyHttpsPort,
        });
        runDocker(["image", "rm", "-f", `yundu-image-${deploymentId}`]);
      }

      runDocker(["rm", "-f", "yundu-traefik"]);
      if (!existingNetwork) {
        runDocker(["network", "rm", "yundu-edge"]);
      }
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 180000);

  test("[ROUTE-TLS-WORKFLOW-002] reaches a service through a durable domain binding route", async () => {
    const dockerVersion = runDocker(["version", "--format", "{{.Server.Version}}"]);
    expect(dockerVersion.exitCode, dockerVersion.stderr).toBe(0);

    const existingProxy = runDocker(["inspect", "yundu-traefik"]);
    if (existingProxy.exitCode === 0) {
      console.warn("Skipping proxy workflow e2e because yundu-traefik already exists.");
      return;
    }

    const existingNetwork = runDocker(["network", "inspect", "yundu-edge"]).exitCode === 0;
    const workspaceDir = mkdtempSync(join(tmpdir(), "yundu-proxy-domain-workflow-e2e-"));
    const dataDir = join(workspaceDir, ".yundu", "data");
    const pgliteDataDir = join(dataDir, "pglite");
    const proxyHttpPort = await reservePort();
    const proxyHttpsPort = await reservePort();
    const appPort = await reservePort();
    const suffix = crypto.randomUUID().slice(0, 8);
    const bootstrapDomain = `proxy-bootstrap-${suffix}.test`;
    const durableDomain = `proxy-workflow-${suffix}.test`;
    const deploymentIds: string[] = [];

    try {
      const initialDeployment = runCli(
        [
          "deploy",
          fixtureDir,
          "--method",
          "dockerfile",
          "--port",
          String(appPort),
          "--health-path",
          "/health",
          "--domains",
          bootstrapDomain,
          "--tls-mode",
          "disabled",
        ],
        {
          dataDir,
          pgliteDataDir,
          proxyHttpPort,
          proxyHttpsPort,
        },
      );
      expect(
        initialDeployment.exitCode,
        `${initialDeployment.stdout}\n${initialDeployment.stderr}`,
      ).toBe(0);
      const initialDeploymentId = parseJson<{ id: string }>(initialDeployment.stdout).id;
      deploymentIds.push(initialDeploymentId);

      const listedDeployments = runCli(["deployments", "list"], {
        dataDir,
        pgliteDataDir,
        proxyHttpPort,
        proxyHttpsPort,
      });
      expect(listedDeployments.exitCode).toBe(0);
      const initialContext = parseJson<{ items: DeploymentSummary[] }>(
        listedDeployments.stdout,
      ).items.find((deployment) => deployment.id === initialDeploymentId);
      expect(initialContext).toBeDefined();
      if (!initialContext) {
        throw new Error(`Deployment ${initialDeploymentId} was not listed`);
      }

      const createdBinding = runCli(
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
        {
          dataDir,
          pgliteDataDir,
          proxyHttpPort,
          proxyHttpsPort,
        },
      );
      expect(createdBinding.exitCode, createdBinding.stderr).toBe(0);
      const domainBindingId = parseJson<{ id: string }>(createdBinding.stdout).id;

      const confirmed = runCli(["domain-binding", "confirm-ownership", domainBindingId], {
        dataDir,
        pgliteDataDir,
        proxyHttpPort,
        proxyHttpsPort,
      });
      expect(confirmed.exitCode, confirmed.stderr).toBe(0);

      const redeployed = runCli(
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
        {
          dataDir,
          pgliteDataDir,
          proxyHttpPort,
          proxyHttpsPort,
        },
      );
      expect(redeployed.exitCode, `${redeployed.stdout}\n${redeployed.stderr}`).toBe(0);
      deploymentIds.push(parseJson<{ id: string }>(redeployed.stdout).id);

      const body = await waitForProxy({
        port: proxyHttpPort,
        domain: durableDomain,
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
        runCli(["rollback", deploymentId], {
          dataDir,
          pgliteDataDir,
          proxyHttpPort,
          proxyHttpsPort,
        });
        runDocker(["image", "rm", "-f", `yundu-image-${deploymentId}`]);
      }

      runDocker(["rm", "-f", "yundu-traefik"]);
      if (!existingNetwork) {
        runDocker(["network", "rm", "yundu-edge"]);
      }
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 180000);
});
