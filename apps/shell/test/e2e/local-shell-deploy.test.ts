import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = String(3400 + Math.floor(Math.random() * 200));
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
      YUNDU_APP_VERSION: "0.1.0-local-shell-test",
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

function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
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

async function waitForApp(url: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // app not ready yet
    }

    await Bun.sleep(250);
  }

  throw new Error(`Timed out waiting for app ${url}`);
}

describe("local shell deployment e2e", () => {
  test.skip("deploys a host-process app on the current machine and exposes logs", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "yundu-local-shell-"));
    const dataDir = join(workspaceDir, ".yundu", "data");
    const pgliteDataDir = join(dataDir, "pglite");
    const appPort = 4300 + Math.floor(Math.random() * 100);
    const appUrl = `http://127.0.0.1:${appPort}/health`;
    let serverProcess: Bun.Subprocess | null = null;

    try {
      const deployment = runCli(
        [
          "deploy",
          fixtureDir,
          "--method",
          "workspace-commands",
          "--build",
          "bun build.mjs",
          "--start",
          "node dist/server.js",
          "--port",
          String(appPort),
          "--health-path",
          "/health",
        ],
        {
          dataDir,
          pgliteDataDir,
        },
      );
      expect(deployment.exitCode).toBe(0);
      const deploymentId = parseJson<{ id: string }>(deployment.stdout).id;

      await waitForApp(appUrl);

      const appResponse = await fetch(appUrl);
      expect(appResponse.ok).toBe(true);
      expect(await appResponse.json()).toEqual(
        expect.objectContaining({
          status: "ok",
          port: appPort,
        }),
      );

      const logs = runCli(["logs", deploymentId], {
        dataDir,
        pgliteDataDir,
      });
      expect(logs.exitCode).toBe(0);
      expect(logs.stdout).toContain("Application is reachable");

      serverProcess = Bun.spawn([process.execPath, "run", "src/index.ts", "serve"], {
        cwd: shellRoot,
        env: {
          ...process.env,
          YUNDU_DATABASE_DRIVER: "pglite",
          YUNDU_DATA_DIR: dataDir,
          YUNDU_PGLITE_DATA_DIR: pgliteDataDir,
          YUNDU_HTTP_HOST: "127.0.0.1",
          YUNDU_HTTP_PORT: port,
          YUNDU_APP_VERSION: "0.1.0-local-shell-test",
          YUNDU_WEB_STATIC_DIR: "",
        },
        stdout: "ignore",
        stderr: "ignore",
      });

      await waitForHealth(`${baseUrl}/api/health`);

      const deploymentsResponse = await fetch(`${baseUrl}/api/deployments`);
      expect(deploymentsResponse.ok).toBe(true);
      expect(
        (
          (await deploymentsResponse.json()) as {
            items: Array<{
              id: string;
              status: string;
              runtimePlan: {
                execution: {
                  kind: string;
                  port?: number;
                };
              };
            }>;
          }
        ).items,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: deploymentId,
            status: "succeeded",
            runtimePlan: expect.objectContaining({
              execution: expect.objectContaining({
                kind: "host-process",
                port: appPort,
              }),
            }),
          }),
        ]),
      );
    } finally {
      serverProcess?.kill();
      await serverProcess?.exited;
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 30000);
});
