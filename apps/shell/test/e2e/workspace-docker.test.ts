import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const shellRoot = new URL("../..", import.meta.url).pathname;
const fixtureDir = new URL("../fixtures/workspace-http-app", import.meta.url).pathname;

interface CliOptions {
  dataDir: string;
  pgliteDataDir: string;
}

function runCli(
  args: string[],
  options: CliOptions,
): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const result = Bun.spawnSync([process.execPath, "run", "src/index.ts", ...args], {
    cwd: shellRoot,
    env: {
      ...process.env,
      OTEL_SDK_DISABLED: "true",
      YUNDU_DATABASE_DRIVER: "pglite",
      YUNDU_DATA_DIR: options.dataDir,
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
  const objectStart = raw.indexOf("{");
  const arrayStart = raw.indexOf("[");
  const start =
    objectStart < 0 ? arrayStart : arrayStart < 0 ? objectStart : Math.min(objectStart, arrayStart);
  if (start < 0) {
    throw new SyntaxError("No JSON payload found");
  }

  const opening = raw[start];
  const closing = opening === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = inString;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === opening) {
      depth += 1;
      continue;
    }

    if (char === closing) {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(raw.slice(start, index + 1)) as T;
      }
    }
  }

  throw new SyntaxError("Unterminated JSON payload");
}

function expectCliSuccess(result: ReturnType<typeof runCli>, label: string): void {
  expect(result.exitCode, `${label}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(0);
}

function dockerName(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
}

async function reservePort(): Promise<number> {
  const { createServer } = await import("node:net");

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

describe("workspace Docker quick deploy e2e", () => {
  test("quick deploys a workspace app without Dockerfile by generating Dockerfile.yundu", async () => {
    expect(existsSync(join(fixtureDir, "Dockerfile"))).toBe(false);

    const dockerVersion = runDocker(["version", "--format", "{{.Server.Version}}"]);
    expect(dockerVersion.exitCode, dockerVersion.stderr).toBe(0);

    const workspaceDir = mkdtempSync(join(tmpdir(), "yundu-workspace-docker-"));
    const dataDir = join(workspaceDir, ".yundu", "data");
    const pgliteDataDir = join(dataDir, "pglite");
    const appPort = await reservePort();
    const suffix = crypto.randomUUID().slice(0, 8);
    let deploymentId: string | undefined;

    try {
      const project = runCli(["project", "create", "--name", `Workspace Docker ${suffix}`], {
        dataDir,
        pgliteDataDir,
      });
      expectCliSuccess(project, "create project");
      const projectId = parseJson<{ id: string }>(project.stdout).id;

      const server = runCli(
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
        { dataDir, pgliteDataDir },
      );
      expectCliSuccess(server, "register local server");
      const serverId = parseJson<{ id: string }>(server.stdout).id;

      const environment = runCli(
        ["env", "create", "--project", projectId, "--name", "local", "--kind", "local"],
        { dataDir, pgliteDataDir },
      );
      expectCliSuccess(environment, "create environment");
      const environmentId = parseJson<{ id: string }>(environment.stdout).id;

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
          "--port",
          String(appPort),
          "--health-path",
          "/health",
        ],
        { dataDir, pgliteDataDir },
      );
      expectCliSuccess(deployment, "quick deploy workspace commands");
      deploymentId = parseJson<{ id: string }>(deployment.stdout).id;

      const logs = runCli(["logs", deploymentId], { dataDir, pgliteDataDir });
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
        dataDir,
        "runtime",
        "local-deployments",
        deploymentId,
        "Dockerfile.yundu",
      );
      expect(existsSync(generatedDockerfile)).toBe(true);
      const dockerfileText = await Bun.file(generatedDockerfile).text();
      expect(dockerfileText).toContain("FROM node:22-alpine");
      expect(dockerfileText).toContain('RUN ["sh","-lc","node build.mjs"]');
      expect(dockerfileText).toContain('CMD ["sh","-lc","node dist/server.js"]');

      const deployments = runCli(["deployments", "list"], { dataDir, pgliteDataDir });
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
      if (deploymentId) {
        runCli(["rollback", deploymentId], { dataDir, pgliteDataDir });
        runDocker(["rm", "-f", dockerName(`yundu-${deploymentId}`)]);
        runDocker(["image", "rm", "-f", dockerName(`yundu-image-${deploymentId}`)]);
      }
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 180000);
});
