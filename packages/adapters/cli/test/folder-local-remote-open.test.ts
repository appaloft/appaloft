import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { type AppaloftSdkFetch } from "@appaloft/sdk";

import { createRemoteCliProgram } from "../src";
import { folderOccupancyIdentity } from "../src/folder-project-link.js";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestKey(request: Request): string {
  return `${request.method} ${new URL(request.url).pathname}`;
}

async function captureProcessOutput<T>(callback: () => Promise<T>): Promise<{
  readonly result: T;
  readonly text: string;
}> {
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  const originalExitCode = process.exitCode;
  let text = "";
  const capture = ((chunk: string | Uint8Array) => {
    text += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stdout.write = capture;
  process.stderr.write = capture;
  try {
    const result = await callback();
    return { result, text };
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.exitCode = originalExitCode ?? 0;
  }
}

function hostingerFolderLocalFetch(input: {
  readonly requests: Request[];
  readonly projectId: string;
  readonly projectName: string;
  readonly leftover?: {
    readonly sandboxId: string;
    readonly commitSha?: string;
    readonly runtimeId?: string;
  };
}): AppaloftSdkFetch {
  return async (request) => {
    input.requests.push(request);
    const url = new URL(request.url);
    const path = url.pathname;

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
    if (path === "/api/servers") {
      return jsonResponse({
        items: [
          {
            id: "srv_4lifk0yrcecy",
            name: "hostinger",
            providerKey: "hostinger",
            lifecycleStatus: "active",
            createdAt: "2026-08-20T00:00:00.000Z",
          },
        ],
      });
    }
    if (path === "/api/projects") {
      if (request.method === "POST") {
        return jsonResponse({ id: input.projectId, name: input.projectName }, 201);
      }
      return jsonResponse({
        items: [
          {
            id: input.projectId,
            name: input.projectName,
            slug: input.projectName,
            lifecycleStatus: "active",
            createdAt: "2026-08-20T00:00:00.000Z",
          },
        ],
      });
    }
    if (path === `/api/projects/${input.projectId}`) {
      return jsonResponse({
        id: input.projectId,
        name: input.projectName,
        slug: input.projectName,
        lifecycleStatus: "active",
        createdAt: "2026-08-20T00:00:00.000Z",
      });
    }
    if (path.startsWith("/api/repository-bindings/")) {
      return jsonResponse({
        projectId: input.projectId,
        repositoryIdentity: decodeURIComponent(path.slice("/api/repository-bindings/".length)),
        status: "active",
      });
    }
    if (path === "/api/sandboxes" && request.method === "GET") {
      return jsonResponse({
        items: input.leftover
          ? [
              {
                sandboxId: input.leftover.sandboxId,
                status: input.leftover.runtimeId ? "ready" : "creating",
                occupancy: {
                  repositoryIdentity: folderOccupancyIdentity(input.projectName),
                  commitSha: input.leftover.commitSha ?? "cafef00d00000000000000000000000000000000",
                  branch: "local",
                },
                ...(input.leftover.runtimeId ? { runtimeId: input.leftover.runtimeId } : {}),
              },
            ]
          : [],
      });
    }
    if (path === "/api/sandboxes" && request.method === "POST") {
      const body = (await request.clone().json()) as {
        readonly source?: { readonly kind?: string; readonly repository?: string };
      };
      if (
        body.source?.kind !== "template" ||
        typeof body.source.repository === "string" ||
        body.source.kind === "git"
      ) {
        return jsonResponse(
          {
            code: "workspace_open_folder_local_git_forbidden",
            category: "user",
            message: "folder.local occupy must not create a git-sourced sandbox",
            retryable: false,
          },
          409,
        );
      }
      return jsonResponse({ sandboxId: "sbx_folder_local", status: "ready" }, 202);
    }
    if (path === "/api/sandboxes/sbx_partial/resume" && request.method === "POST") {
      return jsonResponse({ sandboxId: "sbx_partial", status: "ready" });
    }
    if (path === "/api/sandboxes/sbx_partial/terminate" && request.method === "POST") {
      return jsonResponse({ sandboxId: "sbx_partial", status: "terminated" });
    }
    if (path.endsWith("/agent-runtimes") && request.method === "POST") {
      const sandboxId = path.split("/")[3] ?? "sbx_folder_local";
      return jsonResponse(
        {
          runtimeId: `sar_${sandboxId}`,
          sandboxId,
          harnessKey: "opencode",
          status: "ready",
        },
        201,
      );
    }
    if (path.endsWith("/exec") && request.method === "POST") {
      const body = (await request.clone().json()) as { argv?: unknown };
      const argv = Array.isArray(body.argv) ? body.argv.map(String) : [];
      if (
        argv[0] === "git" ||
        argv.includes("clone") ||
        argv.includes("fetch") ||
        argv.includes("init")
      ) {
        return jsonResponse(
          {
            code: "workspace_open_folder_local_git_forbidden",
            category: "user",
            message: "folder.local occupy must not exec git on the remote disk",
            retryable: false,
          },
          409,
        );
      }
      return jsonResponse({ mode: "foreground", frames: [{ kind: "exit", exitCode: 0 }] });
    }
    if (path === "/api/workspaces/open") {
      return jsonResponse(
        {
          code: "workspace_open_folder_local_required",
          category: "user",
          message: "logged-in folder.local occupy must not POST /workspaces/open",
          retryable: false,
        },
        409,
      );
    }
    if (path === "/api/resources" || path === "/api/preview-environments") {
      return jsonResponse({ items: [] });
    }

    return jsonResponse(
      { code: "not_found", category: "user", message: "not found", retryable: false },
      404,
    );
  };
}

describe("logged-in folder.local remote occupy", () => {
  test("[FOLDER-ONBOARD-007][WS-REMOTE-PROGRESS-201] logged-in code --no-attach never POSTs workspaces.open or git", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "nux-code-silence-cwd-"));
    const home = await mkdtemp(join(tmpdir(), "nux-code-silence-home-"));
    const requests: Request[] = [];
    const projectName = basename(emptyDir);
    const program = createRemoteCliProgram({
      version: "0.12.5-test",
      profile: {
        name: "cloud",
        mode: "self-hosted",
        baseUrl: "https://api.example.test",
        auth: { kind: "bearer", token: "tok_remote" },
        createdAt: "2026-08-20T00:00:00.000Z",
        updatedAt: "2026-08-20T00:00:00.000Z",
      },
      fetch: hostingerFolderLocalFetch({
        requests,
        projectId: "prj_7fky4yjn1l1c",
        projectName,
      }),
      now: () => "2026-08-20T00:00:00.000Z",
      environment: { APPALOFT_TOKEN: "token", APPALOFT_HOME: home, HOME: home },
      terminalIO: {
        stdin: { isTTY: false, on: () => undefined },
        stdout: { isTTY: false, write: () => true },
        stderr: { isTTY: false, write: () => true },
      },
    });

    const originalExitCode = process.exitCode;
    const previousCwd = process.cwd();
    let captured: { text: string };
    try {
      process.chdir(emptyDir);
      captured = await captureProcessOutput(() =>
        program.parseAsync(["node", "appaloft", "code", "--no-attach"]),
      );
    } finally {
      process.chdir(previousCwd);
      process.exitCode = originalExitCode ?? 0;
      await rm(emptyDir, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
    }

    const paths = requests.map(requestKey);
    expect(paths).not.toContain("POST /api/workspaces/open");
    expect(paths.some((path) => path.endsWith("/exec"))).toBe(false);
    expect(paths).toContain("POST /api/sandboxes");
    expect(paths.some((path) => path.endsWith("/agent-runtimes"))).toBe(true);
    const createBody = (await requests
      .find((request) => requestKey(request) === "POST /api/sandboxes")
      ?.clone()
      .json()) as { readonly source?: { readonly kind?: string; readonly templateId?: string } };
    expect(createBody.source?.kind).toBe("template");
    expect(createBody.source?.templateId).toBe("stp_appaloft_remote_opencode");
    expect(createBody).not.toHaveProperty("repository");
    expect(captured.text).not.toContain("workspace_open_source_materialization_failed");
    expect(captured.text).not.toContain("Workspace source materialization failed");
    expect(captured.text).not.toContain("workspace_open_partial_recovery_required");
    expect(captured.text).not.toContain("use --new");
    expect(captured.text.toLowerCase()).not.toContain("occupancy");
    expect(process.exitCode === undefined || process.exitCode === 0).toBe(true);
  });

  test("[FOLDER-ONBOARD-007] leftover logged-in code --no-attach resumes without clone or --new", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "nux-code-silence-partial-"));
    const home = await mkdtemp(join(tmpdir(), "nux-code-silence-partial-home-"));
    const requests: Request[] = [];
    const projectName = basename(emptyDir);
    const program = createRemoteCliProgram({
      version: "0.12.5-test",
      profile: {
        name: "cloud",
        mode: "self-hosted",
        baseUrl: "https://api.example.test",
        auth: { kind: "bearer", token: "tok_remote" },
        createdAt: "2026-08-20T00:00:00.000Z",
        updatedAt: "2026-08-20T00:00:00.000Z",
      },
      fetch: hostingerFolderLocalFetch({
        requests,
        projectId: "prj_7fky4yjn1l1c",
        projectName,
        leftover: { sandboxId: "sbx_partial" },
      }),
      now: () => "2026-08-20T00:00:00.000Z",
      environment: { APPALOFT_TOKEN: "token", APPALOFT_HOME: home, HOME: home },
      terminalIO: {
        stdin: { isTTY: false, on: () => undefined },
        stdout: { isTTY: false, write: () => true },
        stderr: { isTTY: false, write: () => true },
      },
    });

    const originalExitCode = process.exitCode;
    const previousCwd = process.cwd();
    let captured: { text: string };
    try {
      process.chdir(emptyDir);
      captured = await captureProcessOutput(() =>
        program.parseAsync(["node", "appaloft", "code", "--no-attach"]),
      );
    } finally {
      process.chdir(previousCwd);
      process.exitCode = originalExitCode ?? 0;
      await rm(emptyDir, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
    }

    const paths = requests.map(requestKey);
    expect(paths).not.toContain("POST /api/workspaces/open");
    expect(paths.some((path) => path.endsWith("/exec"))).toBe(false);
    expect(paths).toContain("POST /api/sandboxes/sbx_partial/resume");
    expect(paths).toContain("POST /api/sandboxes/sbx_partial/agent-runtimes");
    expect(captured.text).not.toContain("workspace_open_source_materialization_failed");
    expect(captured.text).not.toContain("workspace_open_partial_recovery_required");
    expect(captured.text).not.toContain("use --new");
    expect(process.exitCode === undefined || process.exitCode === 0).toBe(true);
  });
});
