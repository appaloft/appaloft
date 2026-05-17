import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
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

const originalArgv = process.argv;
const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const originalStdoutWrite = process.stdout.write;
const originalExit = process.exit;

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

    await writeFile(
      join(appaloftHome, "profiles.json"),
      `${JSON.stringify(
        {
          activeProfile: "local",
          profiles: {
            local: {
              name: "local",
              mode: "self-hosted",
              baseUrl: "http://127.0.0.1:4310",
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

    process.argv = ["node", "appaloft", "project", "list"];
    process.env = {
      ...originalEnv,
      APPALOFT_HOME: appaloftHome,
    };
    globalThis.fetch = (async (request: Request) => {
      requests.push(request);
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

    expect(requests.map((request) => new URL(request.url).pathname)).toEqual(["/api/projects"]);
    expect(stdout).toContain("prj_remote");
    expect(process.env.APPALOFT_PGLITE_DATA_DIR).toBeUndefined();
  });
});
