import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AppaloftSdkFetch } from "@appaloft/sdk";
import {
  type CliControlPlaneProfile,
  createRemoteCliProgram,
  loginControlPlane,
  MemoryCliControlPlaneProfileStore,
  resolveCliExecutionTarget,
  runStandaloneControlPlaneCli,
  useControlPlaneProfile,
} from "../src";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function captureOutput() {
  let stdout = "";
  let stderr = "";

  return {
    stdout: {
      write: (chunk: string | Uint8Array) => {
        stdout += String(chunk);
        return true;
      },
    },
    stderr: {
      write: (chunk: string | Uint8Array) => {
        stderr += String(chunk);
        return true;
      },
    },
    read: () => ({ stderr, stdout }),
  };
}

async function captureProcessOutput<T>(callback: () => Promise<T>): Promise<{
  readonly result: T;
  readonly stderr: string;
  readonly stdout: string;
}> {
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  const originalExitCode = process.exitCode;
  let stdout = "";
  let stderr = "";

  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write;

  try {
    const result = await callback();
    return { result, stderr, stdout };
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.exitCode = originalExitCode;
  }
}

function profile(name: string, baseUrl = "http://127.0.0.1:4310"): CliControlPlaneProfile {
  return {
    name,
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
      version: "0.12.5-test",
    },
  };
}

function activeStore(profileName = "local") {
  const active = profile(profileName);
  return new MemoryCliControlPlaneProfileStore({
    activeProfile: active.name,
    profiles: {
      [active.name]: active,
    },
  });
}

function createControlPlaneFetch(
  requests: Request[],
  overrides?: Partial<Record<string, Response>>,
): AppaloftSdkFetch {
  return async (request) => {
    requests.push(request);
    const url = new URL(request.url);
    const override = overrides?.[url.pathname];
    if (override) {
      return override;
    }

    if (url.pathname === "/api/version") {
      return jsonResponse({
        name: "Appaloft",
        version: "0.12.5-test",
        apiVersion: "v1",
        mode: "self-hosted",
      });
    }

    if (url.pathname === "/api/organizations/current-context") {
      return jsonResponse({
        currentOrganization: {
          organizationId: "org_self_hosted",
          name: "Self Hosted",
          slug: "self-hosted",
          role: "owner",
        },
      });
    }

    if (url.pathname === "/api/projects") {
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
    }

    if (url.pathname === "/api/projects/prj_remote") {
      return jsonResponse({
        id: "prj_remote",
        name: "Remote Project",
        slug: "remote-project",
        lifecycleStatus: "active",
        createdAt: "2026-05-17T00:00:00.000Z",
      });
    }

    if (url.pathname === "/api/projects/prj_remote/rename") {
      return jsonResponse({
        id: "prj_remote",
      });
    }

    if (url.pathname === "/api/servers") {
      return jsonResponse({
        items: [
          {
            id: "srv_remote",
            name: "Remote Server",
            providerKey: "ssh",
            lifecycleStatus: "active",
            createdAt: "2026-05-17T00:00:00.000Z",
          },
        ],
      });
    }

    return jsonResponse(
      {
        code: "not_found",
        category: "user",
        message: "not found",
        retryable: false,
      },
      404,
    );
  };
}

describe("CLI remote control-plane client", () => {
  test("[CONTROL-PLANE-CLI-001][CONTROL-PLANE-CLI-004][CONTROL-PLANE-CLI-009] auth login writes an active redacted self-hosted profile after handshake", async () => {
    const requests: Request[] = [];
    const store = new MemoryCliControlPlaneProfileStore();
    const output = captureOutput();

    const result = await runStandaloneControlPlaneCli({
      argv: [
        "node",
        "appaloft",
        "auth",
        "login",
        "--url",
        "http://127.0.0.1:4310",
        "--profile",
        "local",
      ],
      env: {
        APPALOFT_TOKEN: "tok_remote_secret_1234",
      },
      fetch: createControlPlaneFetch(requests),
      now: () => "2026-05-17T00:00:00.000Z",
      store,
      stderr: output.stderr,
      stdout: output.stdout,
    });

    const stored = await store.read();
    const rendered = output.read();

    expect(result).toEqual({ handled: true, exitCode: 0 });
    expect(stored.isOk()).toBe(true);
    expect(stored._unsafeUnwrap().activeProfile).toBe("local");
    expect(stored._unsafeUnwrap().profiles.local?.baseUrl).toBe("http://127.0.0.1:4310");
    expect(stored._unsafeUnwrap().profiles.local?.currentOrganization).toMatchObject({
      organizationId: "org_self_hosted",
      slug: "self-hosted",
    });
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/api/version",
      "/api/organizations/current-context",
    ]);
    expect(requests[1]?.headers.get("authorization")).toBe("Bearer tok_remote_secret_1234");
    expect(rendered.stdout).toContain("***1234");
    expect(rendered.stdout).not.toContain("tok_remote_secret_1234");
    expect(rendered.stderr).toBe("");
  });

  test("[CONTROL-PLANE-CLI-002] failed login does not write a profile", async () => {
    const requests: Request[] = [];
    const store = new MemoryCliControlPlaneProfileStore();

    const result = await loginControlPlane(
      {
        url: "http://127.0.0.1:4310",
        profile: "local",
      },
      {
        env: {
          APPALOFT_TOKEN: "tok_remote_secret_1234",
        },
        fetch: createControlPlaneFetch(requests, {
          "/api/organizations/current-context": jsonResponse(
            {
              code: "product_auth_missing",
              category: "user",
              message: "login required",
              retryable: false,
            },
            401,
          ),
        }),
        now: () => "2026-05-17T00:00:00.000Z",
        store,
      },
    );
    const stored = await store.read();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "product_auth_missing",
      details: {
        phase: "control-plane-auth",
        status: 401,
      },
    });
    expect(stored._unsafeUnwrap()).toEqual({ profiles: {} });
  });

  test("[CONTROL-PLANE-CLI-003][CONTROL-PLANE-CLI-005] logout removes credentials and context use switches the active profile locally", async () => {
    const local = profile("local");
    const staging = profile("staging", "http://staging.example.test");
    const store = new MemoryCliControlPlaneProfileStore({
      activeProfile: local.name,
      profiles: {
        [local.name]: local,
        [staging.name]: staging,
      },
    });

    const switched = await useControlPlaneProfile("staging", { store });
    const logoutOutput = captureOutput();
    const loggedOut = await runStandaloneControlPlaneCli({
      argv: ["node", "appaloft", "auth", "logout", "--profile", "staging"],
      store,
      stderr: logoutOutput.stderr,
      stdout: logoutOutput.stdout,
    });
    const stored = await store.read();

    expect(switched._unsafeUnwrap()).toMatchObject({
      name: "staging",
      active: true,
    });
    expect(loggedOut).toEqual({ handled: true, exitCode: 0 });
    expect(stored._unsafeUnwrap().activeProfile).toBe("local");
    expect(stored._unsafeUnwrap().profiles.staging).toBeUndefined();
    expect(logoutOutput.read().stdout).not.toContain("tok_remote_secret_1234");
  });

  test("[CONTROL-PLANE-CLI-006][CONTROL-PLANE-CLI-010] project list/show dispatch through the generated SDK route when a remote profile is active", async () => {
    const requests: Request[] = [];
    const program = createRemoteCliProgram({
      version: "0.12.5-test",
      profile: profile("local"),
      fetch: createControlPlaneFetch(requests),
      now: () => "2026-05-17T00:00:00.000Z",
    });

    const listed = await captureProcessOutput(() =>
      program.parseAsync(["node", "appaloft", "project", "list"]),
    );
    const shown = await captureProcessOutput(() =>
      program.parseAsync(["node", "appaloft", "project", "show", "prj_remote"]),
    );

    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      [
        "GET /api/version",
        "GET /api/organizations/current-context",
        "GET /api/projects",
        "GET /api/projects/prj_remote",
      ],
    );
    expect(listed.stdout).toContain("prj_remote");
    expect(shown.stdout).toContain("Remote Project");
  });

  test("[CONTROL-PLANE-CLI-007][CONTROL-PLANE-MODE-003] no trusted remote source preserves the local CLI path", async () => {
    const result = await resolveCliExecutionTarget({
      argv: ["node", "appaloft", "project", "list"],
      store: new MemoryCliControlPlaneProfileStore(),
    });

    expect(result._unsafeUnwrap()).toMatchObject({
      kind: "local",
      diagnostics: {
        effectiveMode: "none",
      },
    });
  });

  test("[CONTROL-PLANE-CLI-006][CONTROL-PLANE-CLI-010] project mutations dispatch through the generated SDK route when remote-capable", async () => {
    const requests: Request[] = [];
    const program = createRemoteCliProgram({
      version: "0.12.5-test",
      profile: profile("local"),
      fetch: createControlPlaneFetch(requests),
      now: () => "2026-05-17T00:00:00.000Z",
    });

    await captureProcessOutput(() =>
      program.parseAsync([
        "node",
        "appaloft",
        "project",
        "rename",
        "prj_remote",
        "--name",
        "Renamed",
      ]),
    );

    expect(requests.map((entry) => `${entry.method} ${new URL(entry.url).pathname}`)).toEqual([
      "GET /api/version",
      "GET /api/organizations/current-context",
      "POST /api/projects/prj_remote/rename",
    ]);
    expect(await requests[2]?.json()).toMatchObject({
      projectId: "prj_remote",
      name: "Renamed",
    });
  });

  test("[CONTROL-PLANE-CLI-006][CONTROL-PLANE-CLI-010] generated SDK dispatch covers non-project operations", async () => {
    const requests: Request[] = [];
    const program = createRemoteCliProgram({
      version: "0.12.5-test",
      profile: profile("local"),
      fetch: createControlPlaneFetch(requests),
      now: () => "2026-05-17T00:00:00.000Z",
    });

    const listed = await captureProcessOutput(() =>
      program.parseAsync(["node", "appaloft", "server", "list"]),
    );

    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      ["GET /api/version", "GET /api/organizations/current-context", "GET /api/servers"],
    );
    expect(listed.stdout).toContain("srv_remote");
  });

  test("[CONTROL-PLANE-CLI-011] remote dispatch errors do not fall back to local execution", async () => {
    const requests: Request[] = [];
    const program = createRemoteCliProgram({
      version: "0.12.5-test",
      profile: profile("local"),
      fetch: createControlPlaneFetch(requests, {
        "/api/projects": jsonResponse(
          {
            code: "product_auth_missing",
            category: "user",
            message: "login required",
            retryable: false,
          },
          401,
        ),
      }),
      now: () => "2026-05-17T00:00:00.000Z",
    });

    const output = await captureProcessOutput(async () => {
      await expect(
        program.parseAsync(["node", "appaloft", "project", "list"]),
      ).rejects.toBeDefined();
    });

    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      ["GET /api/version", "GET /api/organizations/current-context", "GET /api/projects"],
    );
    expect(output.stderr).toContain("product_auth_missing");
    expect(output.stderr).toContain("remote-operation-dispatch");
  });

  test("[CONTROL-PLANE-MODE-002][CONTROL-PLANE-MODE-005] explicit none and config none preserve pure local mode even with an active profile", async () => {
    const configHome = await mkdtemp(join(tmpdir(), "appaloft-control-plane-config-"));
    await writeFile(
      join(configHome, "appaloft.yml"),
      ["controlPlane:", "  mode: none", ""].join("\n"),
    );

    const store = activeStore();
    const fromFlag = await resolveCliExecutionTarget({
      argv: ["node", "appaloft", "--control-plane-mode", "none", "project", "list"],
      cwd: configHome,
      store,
    });
    const fromConfig = await resolveCliExecutionTarget({
      argv: ["node", "appaloft", "project", "list"],
      cwd: configHome,
      store,
    });

    expect(fromFlag._unsafeUnwrap()).toMatchObject({
      kind: "local",
      argv: ["node", "appaloft", "project", "list"],
      diagnostics: {
        source: "cli",
        requestedMode: "none",
        effectiveMode: "none",
      },
    });
    expect(fromConfig._unsafeUnwrap()).toMatchObject({
      kind: "local",
      diagnostics: {
        source: "config",
        requestedMode: "none",
        effectiveMode: "none",
      },
    });
  });

  test("[CONTROL-PLANE-MODE-004] env self-hosted URL and token select an ephemeral remote target without profile write", async () => {
    const store = new MemoryCliControlPlaneProfileStore();
    const result = await resolveCliExecutionTarget({
      argv: ["node", "appaloft", "server", "list"],
      env: {
        APPALOFT_CONTROL_PLANE_MODE: "self-hosted",
        APPALOFT_CONTROL_PLANE_URL: "http://127.0.0.1:4310",
        APPALOFT_TOKEN: "tok_remote_secret_1234",
      },
      store,
      now: () => "2026-05-17T00:00:00.000Z",
    });
    const stored = await store.read();

    expect(result._unsafeUnwrap()).toMatchObject({
      kind: "remote",
      profile: {
        baseUrl: "http://127.0.0.1:4310",
        auth: {
          kind: "bearer",
          token: "tok_remote_secret_1234",
        },
      },
      diagnostics: {
        source: "env",
        requestedMode: "self-hosted",
      },
    });
    expect(stored._unsafeUnwrap()).toEqual({ profiles: {} });
  });

  test("[CONTROL-PLANE-CLI-008] explicit remote mode for local-only deploy fails before local mutation", async () => {
    const result = await resolveCliExecutionTarget({
      argv: ["node", "appaloft", "--control-plane-mode", "self-hosted", "deploy", "."],
      store: activeStore(),
    });

    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "control_plane_unsupported",
      details: {
        phase: "control-plane-resolution",
        command: "deploy",
      },
    });
  });

  test("[CONTROL-PLANE-CLI-008] explicit remote mode for terminal attach local gateway fails before local mutation", async () => {
    const result = await resolveCliExecutionTarget({
      argv: [
        "node",
        "appaloft",
        "--control-plane-mode",
        "self-hosted",
        "server",
        "terminal",
        "srv_1",
      ],
      store: activeStore(),
    });

    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "control_plane_unsupported",
      details: {
        phase: "control-plane-resolution",
        command: "server terminal",
      },
    });
  });

  test("[CONTROL-PLANE-MODE-004] explicit remote mode must match the selected profile mode", async () => {
    const store = activeStore();
    const result = await resolveCliExecutionTarget({
      argv: ["node", "appaloft", "--control-plane-mode", "cloud", "project", "list"],
      store,
    });

    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "control-plane-resolution",
        profile: "local",
        profileMode: "self-hosted",
        requestedMode: "cloud",
      },
    });
  });
});
