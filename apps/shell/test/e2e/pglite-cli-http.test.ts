import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = String(3200 + Math.floor(Math.random() * 200));
const baseUrl = `http://127.0.0.1:${port}`;
const shellRoot = new URL("../..", import.meta.url).pathname;
const fixtureDir = new URL("../fixtures/local-http-app", import.meta.url).pathname;

function runCli(
  args: string[],
  options: {
    dataDir: string;
    pgliteDataDir: string;
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
      YUNDU_PGLITE_DATA_DIR: options.pgliteDataDir,
      YUNDU_HTTP_HOST: "127.0.0.1",
      YUNDU_HTTP_PORT: port,
      YUNDU_APP_VERSION: "0.1.0-pglite-test",
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

async function waitForHealth(url: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // server not ready yet
    }

    await Bun.sleep(250);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

describe("shell embedded pglite e2e", () => {
  test("serves readiness and stored data from embedded pglite", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "yundu-shell-pglite-"));
    const dataDir = join(workspaceDir, ".yundu", "data");
    const pgliteDataDir = join(dataDir, "pglite");
    let serverProcess: Bun.Subprocess | null = null;
    let doctorOutput:
      | {
          readiness: {
            status: string;
            details?: Record<string, string>;
          };
        }
      | undefined;

    try {
      const suffix = crypto.randomUUID().slice(0, 6);
      const project = runCli(["project", "create", "--name", `Embedded ${suffix}`], {
        dataDir,
        pgliteDataDir,
      });
      const projectId = parseJson<{ id: string }>(project.stdout).id;
      expect(project.exitCode).toBe(0);

      const server = runCli(
        [
          "server",
          "register",
          "--name",
          `embedded-${suffix}`,
          "--host",
          "127.0.0.1",
          "--provider",
          "generic-ssh",
        ],
        {
          dataDir,
          pgliteDataDir,
        },
      );
      const serverId = parseJson<{ id: string }>(server.stdout).id;
      expect(server.exitCode).toBe(0);

      const environment = runCli(
        ["env", "create", "--project", projectId, "--name", "local", "--kind", "local"],
        {
          dataDir,
          pgliteDataDir,
        },
      );
      const environmentId = parseJson<{ id: string }>(environment.stdout).id;
      expect(environment.exitCode).toBe(0);

      expect(
        runCli(
          [
            "env",
            "set",
            environmentId,
            "PUBLIC_SITE_NAME",
            "embedded-yundu",
            "--kind",
            "plain-config",
            "--exposure",
            "build-time",
          ],
          {
            dataDir,
            pgliteDataDir,
          },
        ).exitCode,
      ).toBe(0);

      const deployment = runCli(
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
        ],
        {
          dataDir,
          pgliteDataDir,
        },
      );
      expect(deployment.exitCode).toBe(0);
      expect(parseJson<{ id: string }>(deployment.stdout).id).toBeTruthy();

      const doctor = runCli(["doctor"], {
        dataDir,
        pgliteDataDir,
      });
      expect(doctor.exitCode).toBe(0);
      doctorOutput = parseJson(doctor.stdout);

      serverProcess = Bun.spawn([process.execPath, "run", "src/index.ts", "serve"], {
        cwd: shellRoot,
        env: {
          ...process.env,
          YUNDU_DATABASE_DRIVER: "pglite",
          YUNDU_DATA_DIR: dataDir,
          YUNDU_PGLITE_DATA_DIR: pgliteDataDir,
          YUNDU_HTTP_HOST: "127.0.0.1",
          YUNDU_HTTP_PORT: port,
          YUNDU_APP_VERSION: "0.1.0-pglite-test",
          YUNDU_WEB_STATIC_DIR: "",
        },
        stdout: "ignore",
        stderr: "ignore",
      });

      await waitForHealth(`${baseUrl}/api/health`);

      expect(doctorOutput?.readiness.details).toEqual(
        expect.objectContaining({
          databaseDriver: "pglite",
          databaseMode: "embedded",
          databaseLocation: pgliteDataDir,
        }),
      );

      const httpProjectResponse = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: `HTTP ${suffix}`,
        }),
      });
      const healthResponse = await fetch(`${baseUrl}/api/health`);
      const readinessResponse = await fetch(`${baseUrl}/api/readiness`);
      const projectsResponse = await fetch(`${baseUrl}/api/projects`);
      const environmentsResponse = await fetch(`${baseUrl}/api/environments`);
      const deploymentsResponse = await fetch(`${baseUrl}/api/deployments`);
      const corsHealthResponse = await fetch(`${baseUrl}/api/health`, {
        headers: {
          Origin: "http://localhost:4173",
        },
      });
      const rpcPreflightResponse = await fetch(`${baseUrl}/api/rpc/environments/list`, {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:4173",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type",
        },
      });
      const rpcEnvironmentsResponse = await fetch(`${baseUrl}/api/rpc/environments/list`, {
        method: "POST",
        headers: {
          Origin: "http://localhost:4173",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          json: {},
        }),
      });
      const rpcDeploymentsResponse = await fetch(`${baseUrl}/api/rpc/deployments/list`, {
        method: "POST",
        headers: {
          Origin: "http://localhost:4173",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          json: {},
        }),
      });

      expect(httpProjectResponse.status).toBe(201);
      expect(healthResponse.ok).toBe(true);
      expect(readinessResponse.ok).toBe(true);
      expect(projectsResponse.ok).toBe(true);
      expect(environmentsResponse.ok).toBe(true);
      expect(deploymentsResponse.ok).toBe(true);
      expect(corsHealthResponse.ok).toBe(true);
      expect(rpcPreflightResponse.status).toBe(204);
      expect(rpcEnvironmentsResponse.ok).toBe(true);
      expect(rpcDeploymentsResponse.ok).toBe(true);
      expect(corsHealthResponse.headers.get("access-control-allow-origin")).toBe(
        "http://localhost:4173",
      );
      expect(rpcPreflightResponse.headers.get("access-control-allow-origin")).toBe(
        "http://localhost:4173",
      );
      expect(rpcPreflightResponse.headers.get("access-control-allow-methods")).toContain("POST");
      expect(rpcPreflightResponse.headers.get("access-control-allow-headers")).toContain(
        "content-type",
      );
      expect(rpcEnvironmentsResponse.headers.get("access-control-allow-origin")).toBe(
        "http://localhost:4173",
      );
      expect(rpcDeploymentsResponse.headers.get("access-control-allow-origin")).toBe(
        "http://localhost:4173",
      );

      expect(
        (await readinessResponse.json()) as {
          status: string;
          details?: Record<string, string>;
        },
      ).toEqual(
        expect.objectContaining({
          status: "ready",
          details: expect.objectContaining({
            databaseDriver: "pglite",
          }),
        }),
      );

      expect(
        (
          (await projectsResponse.json()) as {
            items: Array<{ id: string; name: string }>;
          }
        ).items,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: expect.stringContaining("Embedded"),
          }),
          expect.objectContaining({
            name: `HTTP ${suffix}`,
          }),
        ]),
      );
      expect(
        (
          (await environmentsResponse.json()) as {
            items: Array<{
              name: string;
              maskedVariables: Array<{ key: string }>;
            }>;
          }
        ).items,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "local",
            maskedVariables: expect.arrayContaining([
              expect.objectContaining({ key: "PUBLIC_SITE_NAME" }),
            ]),
          }),
        ]),
      );
      const deployments = (
        (await deploymentsResponse.json()) as {
          items: Array<{ status: string; logCount: number }>;
        }
      ).items;
      expect(
        (
          (await rpcEnvironmentsResponse.json()) as {
            json: {
              items: Array<{ name: string }>;
            };
          }
        ).json.items,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "local",
          }),
        ]),
      );
      expect(
        (
          (await rpcDeploymentsResponse.json()) as {
            json: {
              items: Array<{ status: string }>;
            };
          }
        ).json.items,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            status: "succeeded",
          }),
        ]),
      );
      expect(deployments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            status: "succeeded",
            logCount: expect.any(Number),
          }),
        ]),
      );
      expect(deployments.some((deploymentItem) => deploymentItem.logCount > 0)).toBe(true);
    } finally {
      serverProcess?.kill();
      await serverProcess?.exited;
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 30000);
});
