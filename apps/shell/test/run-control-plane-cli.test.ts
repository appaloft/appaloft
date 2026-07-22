import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";
import { randomInt } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runShellCli } from "../src/run";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

async function listenOnAvailableTestPort(server: ReturnType<typeof createServer>): Promise<number> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const port = randomInt(40_000, 60_000);
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
          server.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server.off("error", onError);
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, "127.0.0.1");
      });
      return port;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") {
        throw error;
      }
    }
  }
  throw new Error("Unable to allocate a test HTTP port");
}

const originalArgv = process.argv;
const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const originalStdoutWrite = process.stdout.write;
const originalExit = process.exit;

async function writeActiveProfile(
  appaloftHome: string,
  baseUrl = "http://127.0.0.1:4310",
): Promise<void> {
  await writeFile(
    join(appaloftHome, "profiles.json"),
    `${JSON.stringify(
      {
        activeProfile: "local",
        profiles: {
          local: {
            name: "local",
            mode: "self-hosted",
            baseUrl,
            auth: {
              kind: "bearer",
              token: "tok_remote_secret_1234",
            },
            createdAt: "2026-05-17T00:00:00.000Z",
            updatedAt: "2026-05-17T00:00:00.000Z",
            lastHandshake: {
              checkedAt: "2026-05-17T00:00:00.000Z",
              apiVersion: "v1",
            },
          },
        },
      },
      null,
      2,
    )}\n`,
  );
}

afterEach(() => {
  process.argv = originalArgv;
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
  process.stdout.write = originalStdoutWrite;
  process.exit = originalExit;
});

describe("shell CLI remote control-plane pre-dispatch", () => {
  test("[CONTROL-PLANE-CLI-006] remote project list returns before local shell composition or SSH PGlite sync", async () => {
    const appaloftHome = await mkdtemp(join(tmpdir(), "appaloft-cli-remote-"));
    const requests: Request[] = [];
    let stdout = "";

    await writeActiveProfile(appaloftHome);

    process.argv = ["node", "appaloft", "project", "list"];
    process.env = {
      ...originalEnv,
      APPALOFT_HOME: appaloftHome,
    };
    globalThis.fetch = (async (request: Request) => {
      requests.push(request);
      const path = new URL(request.url).pathname;
      if (path === "/api/version") {
        return jsonResponse({
          name: "Appaloft",
          version: "0.12.5-test",
          apiVersion: "v1",
          mode: "self-hosted",
        });
      }

      if (path === "/api/organizations/current-context") {
        return jsonResponse({
          currentOrganization: {
            organizationId: "org_self_hosted",
            name: "Self Hosted",
            slug: "self-hosted",
            role: "owner",
          },
        });
      }

      return jsonResponse({
        items: [
          {
            id: "prj_remote",
            name: "Remote Project",
            slug: "remote-project",
            lifecycleStatus: "active",
            createdAt: "2026-05-17T00:00:00.000Z",
          },
        ],
      });
    }) as typeof fetch;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += String(chunk);
      return true;
    }) as typeof process.stdout.write;
    process.exit = ((code?: string | number | null) => {
      throw new Error(`process.exit(${String(code)})`);
    }) as typeof process.exit;

    await runShellCli();

    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/api/version",
      "/api/organizations/current-context",
      "/api/projects",
    ]);
    expect(stdout).toContain("prj_remote");
    expect(process.env.APPALOFT_PGLITE_DATA_DIR).toBeUndefined();
  });

  test("[CONTROL-PLANE-CLI-006][CONTROL-PLANE-CLI-010] remote project mutation uses SDK dispatch before local shell composition", async () => {
    const appaloftHome = await mkdtemp(join(tmpdir(), "appaloft-cli-remote-"));
    const requests: Array<{ body: unknown; method: string; path: string }> = [];
    let stdout = "";

    await writeActiveProfile(appaloftHome);

    process.argv = ["node", "appaloft", "project", "rename", "prj_remote", "--name", "Renamed"];
    process.env = {
      ...originalEnv,
      APPALOFT_HOME: appaloftHome,
    };
    globalThis.fetch = (async (request: Request) => {
      const path = new URL(request.url).pathname;
      requests.push({
        method: request.method,
        path,
        body: request.body ? await request.clone().json() : null,
      });
      if (path === "/api/version") {
        return jsonResponse({
          name: "Appaloft",
          version: "0.12.5-test",
          apiVersion: "v1",
          mode: "self-hosted",
        });
      }

      if (path === "/api/organizations/current-context") {
        return jsonResponse({
          currentOrganization: {
            organizationId: "org_self_hosted",
            name: "Self Hosted",
            slug: "self-hosted",
            role: "owner",
          },
        });
      }

      return jsonResponse({
        id: "prj_remote",
      });
    }) as typeof fetch;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += String(chunk);
      return true;
    }) as typeof process.stdout.write;
    process.exit = ((code?: string | number | null) => {
      throw new Error(`process.exit(${String(code)})`);
    }) as typeof process.exit;

    await runShellCli();

    expect(requests).toEqual([
      {
        method: "GET",
        path: "/api/version",
        body: null,
      },
      {
        method: "GET",
        path: "/api/organizations/current-context",
        body: null,
      },
      {
        method: "POST",
        path: "/api/projects/prj_remote/rename",
        body: {
          projectId: "prj_remote",
          name: "Renamed",
        },
      },
    ]);
    expect(stdout).toContain("prj_remote");
    expect(process.env.APPALOFT_PGLITE_DATA_DIR).toBeUndefined();
  });

  test("[CONTROL-PLANE-CLI-006][CONTROL-PLANE-CLI-020][DEP-RES-PG-IMPORT-CLI-001] process entrypoint preserves dependency import stdin", async () => {
    const appaloftHome = await mkdtemp(join(tmpdir(), "appaloft-cli-remote-stdin-"));
    const connectionUrlPath = join(appaloftHome, "connection-url");
    const requests: Array<{ body: unknown; method: string; path: string }> = [];
    const server = createServer(async (request, response) => {
      const path = request.url ? new URL(request.url, "http://127.0.0.1").pathname : "/";
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const bodyText = Buffer.concat(chunks).toString("utf8");
      requests.push({
        method: request.method ?? "GET",
        path,
        body: bodyText ? JSON.parse(bodyText) : null,
      });
      response.setHeader("content-type", "application/json");
      if (path === "/api/version") {
        response.end(
          JSON.stringify({
            name: "Appaloft",
            version: "0.12.5-test",
            apiVersion: "v1",
            mode: "self-hosted",
          }),
        );
        return;
      }
      if (path === "/api/organizations/current-context") {
        response.end(
          JSON.stringify({
            currentOrganization: {
              organizationId: "org_self_hosted",
              name: "Self Hosted",
              slug: "self-hosted",
              role: "owner",
            },
          }),
        );
        return;
      }
      response.end(JSON.stringify({ id: "rsi_imported" }));
    });
    const port = await listenOnAvailableTestPort(server);

    try {
      await writeActiveProfile(appaloftHome, `http://127.0.0.1:${port}`);
      await writeFile(connectionUrlPath, "postgres://app:secret@db.example.com/app\n", {
        mode: 0o600,
      });
      const child = Bun.spawn(
        [
          "bun",
          "run",
          "--cwd",
          "apps/shell",
          "src/index.ts",
          "dependency",
          "import",
          "--kind",
          "postgres",
          "--project",
          "prj_remote",
          "--environment",
          "env_production",
          "--name",
          "External Postgres",
          "--connection-url-stdin",
        ],
        {
          cwd: join(import.meta.dir, "../../.."),
          env: {
            ...process.env,
            APPALOFT_HOME: appaloftHome,
            OTEL_SDK_DISABLED: "true",
          },
          stdin: Bun.file(connectionUrlPath),
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);

      expect(exitCode).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).not.toContain("secret");
      expect(requests.at(-1)).toMatchObject({
        method: "POST",
        path: "/api/dependency-resources/import",
        body: {
          connectionUrl: "postgres://app:secret@db.example.com/app",
        },
      });

      const rotateChild = Bun.spawn(
        [
          "bun",
          "run",
          "--cwd",
          "apps/shell",
          "src/index.ts",
          "dependency",
          "rotate-connection",
          "rsi_imported",
          "--connection-url-stdin",
        ],
        {
          cwd: join(import.meta.dir, "../../.."),
          env: {
            ...process.env,
            APPALOFT_HOME: appaloftHome,
            OTEL_SDK_DISABLED: "true",
          },
          stdin: Bun.file(connectionUrlPath),
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const [rotateExitCode, rotateStdout, rotateStderr] = await Promise.all([
        rotateChild.exited,
        new Response(rotateChild.stdout).text(),
        new Response(rotateChild.stderr).text(),
      ]);
      expect(rotateExitCode).toBe(0);
      expect(rotateStderr).toBe("");
      expect(rotateStdout).not.toContain("secret");
      expect(requests.at(-1)).toMatchObject({
        method: "POST",
        path: "/api/dependency-resources/rsi_imported/connection",
        body: {
          dependencyResourceId: "rsi_imported",
          connectionUrl: "postgres://app:secret@db.example.com/app",
        },
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }, 15000);
});
