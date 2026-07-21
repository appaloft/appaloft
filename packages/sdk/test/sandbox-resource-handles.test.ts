import { describe, expect, test } from "bun:test";

import { AppaloftSdkRequestError, createAppaloftClient } from "../src";

const createInput = {
  source: { kind: "template", templateId: "sbt_python_node" },
  requestedIsolation: "gvisor",
  limits: {
    cpuMillis: 1_000,
    memoryBytes: 256 * 1024 * 1024,
    diskBytes: 512 * 1024 * 1024,
    maxProcesses: 16,
  },
  networkPolicy: { mode: "deny", rules: [] },
} as const;

describe("Sandbox SDK resource handles", () => {
  test("[TS-SDK-RESOURCE-001] carries Sandbox ownership into Agent and Run operations", async () => {
    const requests: Request[] = [];
    const appaloft = createAppaloftClient({
      baseUrl: "https://appaloft.example/api",
      fetch: async (request) => {
        requests.push(request);
        const path = new URL(request.url).pathname;
        if (path === "/api/sandboxes") {
          return Response.json({ sandboxId: "sbx_resource", status: "ready" }, { status: 201 });
        }
        if (path === "/api/sandboxes/sbx_resource/agent-runtimes") {
          return Response.json({
            sandboxId: "sbx_resource",
            runtimeId: "srt_resource",
            status: "ready",
          });
        }
        if (path === "/api/sandboxes/sbx_resource/agent-runtimes/srt_resource/runs") {
          return Response.json({
            sandboxId: "sbx_resource",
            runtimeId: "srt_resource",
            runId: "srun_resource",
            status: "queued",
          });
        }
        throw new Error(`Unexpected SDK request ${request.method} ${path}`);
      },
    });

    const sandbox = await appaloft.sandboxes.create(createInput);
    const agent = await sandbox.agents.create({ harness: "pi" });
    const run = await agent.runs.create({ task: "Analyze the workspace" });

    expect(sandbox).toMatchObject({ sandboxId: "sbx_resource", status: "ready" });
    expect(agent).toMatchObject({
      sandboxId: "sbx_resource",
      runtimeId: "srt_resource",
      status: "ready",
    });
    expect(run).toMatchObject({
      sandboxId: "sbx_resource",
      runtimeId: "srt_resource",
      runId: "srun_resource",
      status: "queued",
    });
    expect(await requests[1]?.json()).toEqual({
      harnessKey: "pi",
      harnessTemplateId: "aht_pi_managed_v1",
      idempotencyKey: expect.any(String),
    });
    expect(await requests[2]?.json()).toEqual({
      task: "Analyze the workspace",
      context: { mode: "fresh" },
      idempotencyKey: expect.any(String),
    });
  });

  test("[TS-SDK-RESOURCE-001] scopes file, exec and terminate calls to the Sandbox", async () => {
    const requests: Request[] = [];
    const appaloft = createAppaloftClient({
      baseUrl: "https://appaloft.example/api",
      fetch: async (request) => {
        requests.push(request);
        const path = new URL(request.url).pathname;
        if (path === "/api/sandboxes")
          return Response.json({ sandboxId: "sbx_job", status: "ready" }, { status: 201 });
        if (path.endsWith("/files/write")) return Response.json({ path: "job/input.txt" });
        if (path.endsWith("/files/read"))
          return Response.json({ contentBase64: "b2s=", sizeBytes: 2 });
        if (path.endsWith("/exec"))
          return Response.json({
            mode: "foreground",
            frames: [{ kind: "exit", sequence: 1, exitCode: 0 }],
          });
        if (path.endsWith("/terminate"))
          return Response.json({ sandboxId: "sbx_job", status: "terminated" });
        throw new Error(`Unexpected SDK request ${request.method} ${path}`);
      },
    });

    const sandbox = await appaloft.sandboxes.create(createInput);
    await sandbox.files.write({ path: "job/input.txt", contentBase64: "b2s=" });
    await sandbox.files.read({ path: "job/input.txt" });
    await sandbox.exec({ argv: ["python3", "job.py"], timeoutMs: 1_000 });
    await sandbox.terminate();

    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/api/sandboxes",
      "/api/sandboxes/sbx_job/files/write",
      "/api/sandboxes/sbx_job/files/read",
      "/api/sandboxes/sbx_job/exec",
      "/api/sandboxes/sbx_job/terminate",
    ]);
    expect(await requests[3]?.json()).toEqual({ argv: ["python3", "job.py"], timeoutMs: 1_000 });
  });

  test("[TS-SDK-RESOURCE-002] throws a safe structured request error", async () => {
    const appaloft = createAppaloftClient({
      baseUrl: "https://appaloft.example/api",
      fetch: async () =>
        Response.json(
          {
            error: {
              code: "sandbox_isolation_unsupported",
              category: "user",
              message: "Requested Sandbox isolation is unavailable",
              retryable: false,
              details: { requestedIsolation: "gvisor" },
            },
          },
          { status: 422 },
        ),
    });

    try {
      await appaloft.sandboxes.create(createInput);
      throw new Error("Expected Sandbox creation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AppaloftSdkRequestError);
      expect(error).toMatchObject({
        name: "AppaloftSdkRequestError",
        status: 422,
        code: "sandbox_isolation_unsupported",
        category: "user",
        retryable: false,
        details: { requestedIsolation: "gvisor" },
      });
    }
  });

  test("[TS-SDK-RESOURCE-003] retains the generated non-throwing operation facade", async () => {
    const appaloft = createAppaloftClient({
      baseUrl: "https://appaloft.example/api",
      fetch: async () => Response.json({ sandboxId: "sbx_operation", status: "ready" }),
    });

    const result = await appaloft.operations.sandboxes.create(createInput);

    expect(result).toEqual({
      ok: true,
      status: 200,
      data: { sandboxId: "sbx_operation", status: "ready" },
    });
  });
});
