import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";
import { randomInt } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { domainError, err, ok } from "@appaloft/core";
import {
  resetOccupancyCliStartupReport,
  SHELL_OCCUPANCY_PROGRESS,
} from "../src/occupancy-cli-progress";
import { runShellCli } from "../src/run";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
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
const originalStderrWrite = process.stderr.write;
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

async function writeOccupancyAttachProfiles(appaloftHome: string, baseUrl: string): Promise<void> {
  await writeFile(
    join(appaloftHome, "profiles.json"),
    `${JSON.stringify(
      {
        activeProfile: "cloud",
        profiles: {
          cloud: {
            name: "cloud",
            mode: "cloud",
            baseUrl,
            auth: {
              kind: "product-session",
              cookie: "appaloft.session=active-occupancy-cookie",
            },
            createdAt: "2026-08-17T00:00:00.000Z",
            updatedAt: "2026-08-17T00:00:00.000Z",
            lastHandshake: {
              checkedAt: "2026-08-17T00:00:00.000Z",
              apiVersion: "v1",
            },
          },
          mcp: {
            name: "mcp",
            mode: "cloud",
            baseUrl,
            auth: {
              kind: "bearer",
              token: "tok_stale_mcp_profile",
            },
            createdAt: "2026-06-22T00:00:00.000Z",
            updatedAt: "2026-06-22T00:00:00.000Z",
            lastHandshake: {
              checkedAt: "2026-06-22T00:00:00.000Z",
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
  process.stderr.write = originalStderrWrite;
  process.exit = originalExit;
  resetOccupancyCliStartupReport();
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

  test("[WS-REMOTE-SKILL-017] occupancy remote-stdio uses the active profile when --profile is omitted", async () => {
    const appaloftHome = await mkdtemp(join(tmpdir(), "appaloft-cli-occupancy-mcp-"));
    const pingPath = join(appaloftHome, "ping.jsonl");
    const requests: Array<{
      authorization: string | undefined;
      cookie: string | undefined;
      path: string;
    }> = [];
    const server = createServer(async (request, response) => {
      const path = request.url ? new URL(request.url, "http://127.0.0.1").pathname : "/";
      requests.push({
        path,
        authorization: headerValue(request.headers["authorization"]),
        cookie: headerValue(request.headers.cookie),
      });
      response.setHeader("content-type", "application/json");
      response.end('{"jsonrpc":"2.0","id":1,"result":{}}');
    });
    const port = await listenOnAvailableTestPort(server);

    try {
      await writeOccupancyAttachProfiles(appaloftHome, `http://127.0.0.1:${port}`);
      await writeFile(pingPath, '{"jsonrpc":"2.0","id":1,"method":"ping"}\n', { mode: 0o600 });
      const child = Bun.spawn(
        ["bun", "run", "--cwd", "apps/shell", "src/index.ts", "mcp", "remote-stdio"],
        {
          cwd: join(import.meta.dir, "../../.."),
          env: {
            ...process.env,
            APPALOFT_HOME: appaloftHome,
            OTEL_SDK_DISABLED: "true",
            APPALOFT_CONTROL_PLANE_URL: "",
            APPALOFT_AUTH_COOKIE: "",
          },
          stdin: Bun.file(pingPath),
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
      expect(requests).toEqual([
        {
          path: "/mcp",
          authorization: undefined,
          cookie: "appaloft.session=active-occupancy-cookie",
        },
      ]);
      expect(stdout).toContain('"id":1');
      expect(stdout).not.toContain("tok_stale_mcp_profile");
      expect(stdout).not.toContain("active-occupancy-cookie");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }, 15000);

  test("[WS-REMOTE-LOGIN-001] unauthenticated code is login-required before local composition", async () => {
    const appaloftHome = await mkdtemp(join(tmpdir(), "appaloft-cli-code-login-"));
    const originalStderrWrite = process.stderr.write;
    let stderr = "";
    process.argv = ["node", "appaloft", "code", "--no-attach"];
    process.env = {
      ...originalEnv,
      APPALOFT_HOME: appaloftHome,
    };
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += String(chunk);
      return true;
    }) as typeof process.stderr.write;
    process.exit = ((code?: string | number | null) => {
      throw new Error(`process.exit(${String(code)})`);
    }) as typeof process.exit;

    await expect(runShellCli()).rejects.toThrow("process.exit(1)");
    process.stderr.write = originalStderrWrite;
    expect(stderr).toContain(SHELL_OCCUPANCY_PROGRESS.openingRemoteSession);
    expect(stderr).toContain("Sign in before opening a remote Agent session");
    expect(stderr).toContain("Run appaloft login");
    expect(stderr).not.toContain("No enrolled Server");
    expect(stderr).not.toContain("ECONNREFUSED");
    expect(stderr).not.toContain("appaloft-backend");
  });

  test("[WS-REMOTE-PROGRESS-191] unauthenticated code writes progress before PGlite sync or composition", async () => {
    const appaloftHome = await mkdtemp(join(tmpdir(), "appaloft-cli-code-progress-"));
    const events: string[] = [];
    const progress: string[] = [];
    process.argv = ["node", "appaloft", "code", "--no-attach"];
    process.env = {
      ...originalEnv,
      APPALOFT_HOME: appaloftHome,
    };
    process.stderr.write = (() => true) as typeof process.stderr.write;
    process.exit = ((code?: string | number | null) => {
      throw new Error(`process.exit(${String(code)})`);
    }) as typeof process.exit;

    await expect(
      runShellCli(undefined, undefined, {
        writeProgress: (message) => {
          progress.push(message);
          events.push("progress");
        },
        prepareRemotePgliteStateSync: async () => {
          events.push("pglite");
          return ok(null);
        },
        createShellComposition: async () => {
          events.push("compose");
          return err(
            domainError.infra("test composition must not start before progress", {
              phase: "test-occupancy-progress",
            }),
          );
        },
      }),
    ).rejects.toThrow("process.exit(1)");

    expect(progress).toEqual([SHELL_OCCUPANCY_PROGRESS.openingRemoteSession]);
    expect(events[0]).toBe("progress");
    expect(events).not.toContain("pglite");
    expect(events).not.toContain("compose");
  });

  test("[WS-REMOTE-PROGRESS-191] logged-in local code writes progress and skips PGlite before composition", async () => {
    const appaloftHome = await mkdtemp(join(tmpdir(), "appaloft-cli-code-pglite-skip-"));
    const events: string[] = [];
    const progress: string[] = [];
    process.argv = ["node", "appaloft", "code", "--no-attach"];
    process.env = {
      ...originalEnv,
      APPALOFT_HOME: appaloftHome,
      APPALOFT_TOKEN: "tok_progress",
      APPALOFT_CONTROL_PLANE_MODE: "none",
    };
    process.stderr.write = (() => true) as typeof process.stderr.write;
    process.exit = ((code?: string | number | null) => {
      throw new Error(`process.exit(${String(code)})`);
    }) as typeof process.exit;

    await expect(
      runShellCli(undefined, undefined, {
        writeProgress: (message) => {
          progress.push(message);
          events.push("progress");
        },
        prepareRemotePgliteStateSync: async () => {
          events.push("pglite");
          throw new Error("remote code must not prepare local PGlite");
        },
        createShellComposition: async () => {
          expect(progress).toEqual([SHELL_OCCUPANCY_PROGRESS.openingRemoteSession]);
          events.push("compose");
          return err(
            domainError.infra("stop after proving progress-before-composition", {
              phase: "test-occupancy-progress",
            }),
          );
        },
      }),
    ).rejects.toThrow("process.exit(1)");

    expect(events[0]).toBe("progress");
    expect(events).toContain("compose");
    expect(events).not.toContain("pglite");
    expect(events.indexOf("progress")).toBeLessThan(events.indexOf("compose"));
  });

  test("[WS-REMOTE-DEPLOY-057] unauthenticated Cloud deploy is login-required before local composition", async () => {
    const appaloftHome = await mkdtemp(join(tmpdir(), "appaloft-cli-deploy-login-"));
    const originalStderrWrite = process.stderr.write;
    let stderr = "";
    process.argv = ["node", "appaloft", "deploy"];
    process.env = {
      ...originalEnv,
      APPALOFT_HOME: appaloftHome,
      APPALOFT_CONTROL_PLANE_MODE: "cloud",
      APPALOFT_CONTROL_PLANE_URL: "https://app.appaloft.com",
    };
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += String(chunk);
      return true;
    }) as typeof process.stderr.write;
    process.exit = ((code?: string | number | null) => {
      throw new Error(`process.exit(${String(code)})`);
    }) as typeof process.exit;

    await expect(runShellCli()).rejects.toThrow("process.exit(1)");
    process.stderr.write = originalStderrWrite;
    expect(stderr).toContain("Sign in before deploying");
    expect(stderr).toContain("Run appaloft login");
    expect(stderr).not.toContain("ECONNREFUSED");
    expect(stderr).not.toContain("127.0.0.1");
    expect(stderr).not.toContain("at ");
  });

  test("[WS-REMOTE-CA-033] unauthenticated workspace --json is login-required", async () => {
    const appaloftHome = await mkdtemp(join(tmpdir(), "appaloft-cli-workspace-login-"));
    let stdout = "";
    process.argv = ["node", "appaloft", "workspace", "--json"];
    process.env = {
      ...originalEnv,
      APPALOFT_HOME: appaloftHome,
    };
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += String(chunk);
      return true;
    }) as typeof process.stdout.write;

    await runShellCli();
    expect(stdout).toContain("login-required");
    expect(stdout).toContain("Run appaloft login");
    expect(stdout).not.toContain('"status": "ready"');
    expect(stdout).not.toContain("appaloft-backend");
  });
});
