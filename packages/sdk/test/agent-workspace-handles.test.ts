import { describe, expect, test } from "bun:test";

import {
  AppaloftWorkspaceCreateError,
  createAppaloftClient,
  defaultOpenCodeHarnessTemplateId,
} from "../src";

const sandboxInput = {
  source: { kind: "template", templateId: "sbt_opencode" },
  requestedIsolation: "gvisor",
  limits: {
    cpuMillis: 1_000,
    memoryBytes: 256 * 1024 * 1024,
    diskBytes: 512 * 1024 * 1024,
    maxProcesses: 16,
  },
  networkPolicy: { mode: "deny", rules: [] },
} as const;

describe("Agent Workspace SDK handles", () => {
  test("[AGENT-WS-SDK-013] composes Sandbox and OpenCode Runtime creation", async () => {
    const requests: Request[] = [];
    const appaloft = createAppaloftClient({
      baseUrl: "https://appaloft.example/api",
      fetch: async (request) => {
        requests.push(request);
        const path = new URL(request.url).pathname;
        if (path === "/api/sandboxes") {
          return Response.json({ sandboxId: "sbx_workspace", status: "ready" }, { status: 201 });
        }
        if (path === "/api/sandboxes/sbx_workspace/agent-runtimes") {
          return Response.json({
            sandboxId: "sbx_workspace",
            runtimeId: "sar_opencode",
            harnessKey: "opencode",
            status: "ready",
          });
        }
        if (path === "/api/sandboxes/sbx_workspace/agent-runtimes/sar_opencode/attach") {
          return Response.json({
            workspaceId: "sbx_workspace",
            runtimeId: "sar_opencode",
            transport: "native-attach",
            access: {
              visibility: "private",
              url: "https://attach.example.test/capability",
            },
            clientCommand: ["opencode", "attach", "https://attach.example.test/capability"],
          });
        }
        throw new Error(`Unexpected SDK request ${request.method} ${path}`);
      },
    });

    const workspace = await appaloft.workspaces.create({
      sandbox: sandboxInput,
      harness: "opencode",
    });

    expect(workspace).toMatchObject({
      workspaceId: "sbx_workspace",
      sandboxId: "sbx_workspace",
      agent: {
        runtimeId: "sar_opencode",
        harnessKey: "opencode",
      },
    });
    expect(await requests[1]?.json()).toEqual({
      harnessKey: "opencode",
      harnessTemplateId: defaultOpenCodeHarnessTemplateId,
      idempotencyKey: expect.any(String),
    });

    const attach = await workspace.agent.attach({
      expiresAt: "2026-07-24T10:00:00.000Z",
    });
    expect(attach).toMatchObject({
      transport: "native-attach",
      clientCommand: ["opencode", "attach", "https://attach.example.test/capability"],
    });
    expect(await requests[2]?.json()).toEqual({
      expiresAt: "2026-07-24T10:00:00.000Z",
    });
  });

  test("[AGENT-WS-SDK-013] preserves the created Sandbox id when Runtime creation fails", async () => {
    const appaloft = createAppaloftClient({
      baseUrl: "https://appaloft.example/api",
      fetch: async (request) => {
        const path = new URL(request.url).pathname;
        if (path === "/api/sandboxes") {
          return Response.json({ sandboxId: "sbx_partial", status: "ready" }, { status: 201 });
        }
        return Response.json(
          {
            error: {
              code: "sandbox_agent_harness_unavailable",
              category: "user",
              message: "OpenCode harness is not configured",
              retryable: false,
              details: {},
            },
          },
          { status: 422 },
        );
      },
    });

    try {
      await appaloft.workspaces.create({ sandbox: sandboxInput, harness: "opencode" });
      throw new Error("Expected Workspace creation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AppaloftWorkspaceCreateError);
      expect(error).toMatchObject({ workspaceId: "sbx_partial", sandboxId: "sbx_partial" });
    }
  });

  test("[AGENT-WS-SOURCE-014] materializes a repository before Runtime creation", async () => {
    const requests: Request[] = [];
    const appaloft = createAppaloftClient({
      baseUrl: "https://appaloft.example/api",
      fetch: async (request) => {
        requests.push(request);
        const path = new URL(request.url).pathname;
        if (path === "/api/sandboxes") {
          return Response.json({ sandboxId: "sbx_source", status: "ready" }, { status: 201 });
        }
        if (path === "/api/sandboxes/sbx_source/exec") {
          return Response.json({
            mode: "foreground",
            frames: [{ kind: "exit", exitCode: 0 }],
          });
        }
        if (path === "/api/sandboxes/sbx_source/agent-runtimes") {
          return Response.json({
            sandboxId: "sbx_source",
            runtimeId: "sar_source",
            harnessKey: "opencode",
            status: "ready",
          });
        }
        throw new Error(`Unexpected SDK request ${request.method} ${path}`);
      },
    });

    await appaloft.workspaces.create({
      sandbox: sandboxInput,
      harness: "opencode",
      source: {
        repository: "https://github.com/acme/web.git",
        ref: "main",
        branch: "agent/issue-123",
      },
    });

    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/api/sandboxes",
      "/api/sandboxes/sbx_source/exec",
      "/api/sandboxes/sbx_source/exec",
      "/api/sandboxes/sbx_source/agent-runtimes",
    ]);
    const createSandboxRequest = requests[0];
    if (!createSandboxRequest) throw new Error("Expected Sandbox create request");
    expect((await createSandboxRequest.json()).networkPolicy).toEqual({
      mode: "allowlist",
      rules: [
        { kind: "domain", value: "github.com", ports: [443] },
        { kind: "domain", value: "api.github.com", ports: [443] },
      ],
    });
    expect(await requests[1]?.json()).toEqual({
      argv: ["git", "clone", "--branch", "main", "--", "https://github.com/acme/web.git", "."],
    });
    expect(await requests[2]?.json()).toEqual({
      argv: ["git", "switch", "-c", "agent/issue-123"],
    });
  });

  test("[AGENT-WS-SOURCE-014] preserves recovery evidence when source materialization fails", async () => {
    const appaloft = createAppaloftClient({
      baseUrl: "https://appaloft.example/api",
      fetch: async (request) => {
        const path = new URL(request.url).pathname;
        if (path === "/api/sandboxes") {
          return Response.json(
            { sandboxId: "sbx_source_partial", status: "ready" },
            { status: 201 },
          );
        }
        if (path === "/api/sandboxes/sbx_source_partial/exec") {
          return Response.json({
            mode: "foreground",
            frames: [
              { kind: "stderr", data: "repository unavailable" },
              { kind: "exit", exitCode: 128 },
            ],
          });
        }
        throw new Error(`Unexpected SDK request ${request.method} ${path}`);
      },
    });

    await expect(
      appaloft.workspaces.create({
        sandbox: sandboxInput,
        harness: "opencode",
        source: { repository: "https://github.com/acme/missing.git" },
      }),
    ).rejects.toMatchObject({
      workspaceId: "sbx_source_partial",
      sandboxId: "sbx_source_partial",
      phase: "source-materialization",
    });
  });

  test("[AGENT-WS-FLOW-003] composes list/show from Sandbox and Runtime read models", async () => {
    const appaloft = createAppaloftClient({
      baseUrl: "https://appaloft.example/api",
      fetch: async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/api/sandboxes" && request.method === "GET") {
          return Response.json({
            items: [{ sandboxId: "sbx_workspace", status: "ready" }],
            total: 1,
          });
        }
        if (url.pathname === "/api/sandboxes/sbx_workspace") {
          return Response.json({ sandboxId: "sbx_workspace", status: "ready" });
        }
        if (url.pathname === "/api/sandboxes/sbx_workspace/agent-runtimes") {
          return Response.json({
            items: [
              {
                sandboxId: "sbx_workspace",
                runtimeId: "sar_workspace",
                harnessKey: "opencode",
                status: "ready",
              },
            ],
          });
        }
        throw new Error(`Unexpected SDK request ${request.method} ${url.pathname}`);
      },
    });

    const listed = await appaloft.workspaces.list();
    const shown = await appaloft.workspaces.show("sbx_workspace");

    expect(listed).toMatchObject({
      total: 1,
      items: [
        {
          workspaceId: "sbx_workspace",
          agentRuntimes: [{ runtimeId: "sar_workspace", harnessKey: "opencode" }],
        },
      ],
    });
    expect(shown).toMatchObject({
      workspaceId: "sbx_workspace",
      sandbox: { status: "ready" },
      agentRuntimes: [{ runtimeId: "sar_workspace" }],
    });
  });

  test("[AGENT-TASK-RUN-001][AGENT-TASK-RESUME-002][AGENT-TASK-CHECK-003][AGENT-TASK-DIFF-004][AGENT-TASK-PREVIEW-005][AGENT-TASK-ARTIFACT-006][AGENT-TASK-APPROVE-007][AGENT-TASK-PR-008] uses the canonical server Task Run operations", async () => {
    const requests: Array<{ method: string; path: string; body: Record<string, unknown> }> = [];
    const awaitingTask = {
      schemaVersion: "agent-task-run/v1",
      taskRunId: "srun_task",
      runId: "srun_task",
      runtimeId: "sar_task",
      workspaceId: "sbx_task",
      status: "awaiting-approval",
      plan: {
        checks: [{ name: "tests", argv: ["bun", "test"], required: true }],
        preview: {
          startArgv: ["bun", "run", "dev"],
          port: 3000,
          visibility: "private",
          expiresAt: "2026-07-24T00:00:00.000Z",
        },
        immutableReview: true,
        sourceRoot: ".",
      },
      agentRun: {
        sandboxId: "sbx_task",
        runtimeId: "sar_task",
        runId: "srun_task",
        status: "completed",
      },
      checks: [
        {
          name: "tests",
          required: true,
          status: "passed",
          exitCode: 0,
          output: "passed",
          truncated: false,
          redacted: false,
        },
      ],
      changes: {
        status: " M src/app.ts\n",
        stat: " src/app.ts | 2 ++\n",
        patch: "diff --git a/src/app.ts b/src/app.ts\n+preview\n",
        truncated: false,
        redacted: false,
      },
      developmentPreview: {
        exposureId: "sexp_task",
        port: 3000,
        visibility: "private",
        url: "https://preview.example",
        expiresAt: "2026-07-24T00:00:00.000Z",
      },
      sourceArtifact: { artifactId: "sart_task" },
      candidatePreview: { previewId: "sprev_task", url: "https://candidate.example" },
      createdAt: "2026-07-23T00:00:00.000Z",
      updatedAt: "2026-07-23T00:01:00.000Z",
    } as const;
    const appaloft = createAppaloftClient({
      baseUrl: "https://appaloft.example/api",
      fetch: async (request) => {
        const url = new URL(request.url);
        const path = url.pathname;
        const requestBody = request.method === "GET" ? "" : await request.clone().text();
        const body = requestBody ? (JSON.parse(requestBody) as Record<string, unknown>) : {};
        requests.push({ method: request.method, path, body });
        if (path === "/api/sandboxes" && request.method === "POST") {
          return Response.json({ sandboxId: "sbx_task", status: "ready" }, { status: 201 });
        }
        if (path === "/api/sandboxes/sbx_task/agent-runtimes") {
          return Response.json({
            sandboxId: "sbx_task",
            runtimeId: "sar_task",
            harnessKey: "opencode",
            status: "ready",
          });
        }
        if (path === "/api/sandboxes/sbx_task/agent-task-runs" && request.method === "POST") {
          return Response.json({ ...awaitingTask, status: "running" }, { status: 202 });
        }
        if (path === "/api/sandboxes/sbx_task/agent-task-runs" && request.method === "GET") {
          return Response.json({ items: [awaitingTask] });
        }
        if (path === "/api/sandboxes/sbx_task/agent-task-runs/srun_task/resume") {
          return Response.json(awaitingTask, { status: 202 });
        }
        if (path === "/api/sandboxes/sbx_task/agent-task-runs/srun_task/approve") {
          return Response.json({
            ...awaitingTask,
            status: "approved",
            approval: {
              actorKind: "user",
              actorId: "usr_reviewer",
              approvedAt: "2026-07-23T00:02:00.000Z",
            },
          });
        }
        if (path === "/api/sandboxes/sbx_task/agent-task-runs/srun_task/deliver") {
          return Response.json(
            {
              ...awaitingTask,
              status: "delivered",
              delivery: {
                remote: "origin",
                branch: "agent/issue-123",
                commitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                pullRequestUrl: "https://github.com/acme/web/pull/42",
              },
            },
            { status: 202 },
          );
        }
        if (path === "/api/sandboxes/sbx_task/agent-task-runs/srun_task") {
          return Response.json(awaitingTask);
        }
        throw new Error(`Unexpected SDK request ${request.method} ${path}`);
      },
    });
    const workspace = await appaloft.workspaces.create({
      sandbox: sandboxInput,
      harness: "opencode",
    });

    const task = await workspace.tasks.run({
      task: "Fix issue #123 and start a preview",
      checks: [{ name: "tests", argv: ["bun", "test"] }],
      preview: {
        startArgv: ["bun", "run", "dev"],
        port: 3000,
        expiresAt: "2026-07-24T00:00:00.000Z",
      },
      immutableReview: true,
    });
    expect(task.status).toBe("running");
    expect(await workspace.tasks.list()).toMatchObject({
      items: [{ taskRunId: "srun_task", status: "awaiting-approval" }],
    });
    expect(await workspace.tasks.show(task.taskRunId)).toEqual(awaitingTask);
    expect(await workspace.tasks.resume(task.taskRunId)).toEqual(awaitingTask);

    const approved = await workspace.tasks.approve(task.taskRunId);
    const delivered = await workspace.tasks.deliver(task.taskRunId, {
      commitMessage: "Fix issue #123",
      branch: "agent/issue-123",
      pullRequest: {
        provider: "github",
        title: "Fix issue #123",
        body: "Automated task result",
        base: "main",
      },
    });

    expect(approved.status).toBe("approved");
    expect(delivered).toMatchObject({
      status: "delivered",
      delivery: {
        remote: "origin",
        branch: "agent/issue-123",
        commitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        pullRequestUrl: "https://github.com/acme/web/pull/42",
      },
    });
    const createRequest = requests.find(
      (entry) =>
        entry.method === "POST" && entry.path === "/api/sandboxes/sbx_task/agent-task-runs",
    );
    expect(createRequest?.body).toMatchObject({
      runtimeId: "sar_task",
      task: "Fix issue #123 and start a preview",
      checks: [{ name: "tests", argv: ["bun", "test"], required: true }],
      immutableReview: true,
    });
    const deliveryRequest = requests.find((entry) => entry.path.endsWith("/deliver"));
    expect(deliveryRequest?.body).toMatchObject({
      branch: "agent/issue-123",
      remote: "origin",
      pullRequest: { provider: "github", title: "Fix issue #123", base: "main" },
    });
    expect(requests.some((entry) => entry.path.includes("/files/"))).toBe(false);
    expect(requests.some((entry) => entry.path.endsWith("/exec"))).toBe(false);
  });
});
