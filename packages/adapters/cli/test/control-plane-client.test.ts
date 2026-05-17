import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import { type AppaloftSdkFetch } from "@appaloft/sdk";
import {
  type CliControlPlaneProfile,
  loginControlPlane,
  MemoryCliControlPlaneProfileStore,
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

  test("[CONTROL-PLANE-CLI-006][CONTROL-PLANE-CLI-010] project list and show dispatch through the generated SDK route when a remote profile is active", async () => {
    const requests: Request[] = [];
    const store = activeStore();
    const listOutput = captureOutput();
    const showOutput = captureOutput();

    const listed = await runStandaloneControlPlaneCli({
      argv: ["node", "appaloft", "project", "list"],
      fetch: createControlPlaneFetch(requests),
      store,
      stderr: listOutput.stderr,
      stdout: listOutput.stdout,
    });
    const shown = await runStandaloneControlPlaneCli({
      argv: ["node", "appaloft", "project", "show", "prj_remote"],
      fetch: createControlPlaneFetch(requests),
      store,
      stderr: showOutput.stderr,
      stdout: showOutput.stdout,
    });

    expect(listed).toEqual({ handled: true, exitCode: 0 });
    expect(shown).toEqual({ handled: true, exitCode: 0 });
    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      ["GET /api/projects", "GET /api/projects/prj_remote"],
    );
    expect(listOutput.read().stdout).toContain("prj_remote");
    expect(showOutput.read().stdout).toContain("Remote Project");
  });

  test("[CONTROL-PLANE-CLI-007] project commands stay on the local CLI path when no remote profile is active", async () => {
    const result = await runStandaloneControlPlaneCli({
      argv: ["node", "appaloft", "project", "list"],
      store: new MemoryCliControlPlaneProfileStore(),
    });

    expect(result).toEqual({ handled: false });
  });

  test("[CONTROL-PLANE-CLI-008] unsupported remote project mutation fails before local mutation", async () => {
    const requests: Request[] = [];
    const output = captureOutput();

    const result = await runStandaloneControlPlaneCli({
      argv: ["node", "appaloft", "project", "rename", "prj_remote", "--name", "Renamed"],
      fetch: createControlPlaneFetch(requests),
      store: activeStore(),
      stderr: output.stderr,
      stdout: output.stdout,
    });

    expect(result).toEqual({ handled: true, exitCode: 1 });
    expect(requests).toHaveLength(0);
    expect(output.read().stderr).toContain("control_plane_unsupported");
  });

  test("[CONTROL-PLANE-CLI-011] remote dispatch errors do not fall back to local execution", async () => {
    const output = captureOutput();

    const result = await runStandaloneControlPlaneCli({
      argv: ["node", "appaloft", "project", "list"],
      fetch: createControlPlaneFetch([], {
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
      store: activeStore(),
      stderr: output.stderr,
      stdout: output.stdout,
    });

    expect(result).toEqual({ handled: true, exitCode: 1 });
    expect(output.read().stderr).toContain("product_auth_missing");
    expect(output.read().stderr).toContain("remote-operation-dispatch");
  });
});
