import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  createExecutionContext,
  type SandboxExecResult,
  type SandboxProcessDescriptor,
} from "@appaloft/application";
import { err, ok } from "@appaloft/core";

import {
  OpenCodeSandboxAgentHarness,
  type OpenCodeSandboxExecutionPort,
} from "../src";

const context = createExecutionContext({
  entrypoint: "worker",
  requestId: "req_opencode_harness",
  tenant: { tenantId: "tenant_opencode" },
});

describe("OpenCodeSandboxAgentHarness", () => {
  test("[AGENT-OPENCODE-011] prepares one pinned loopback server and translates attached JSON runs", async () => {
    const files = new Map<string, Uint8Array>();
    const calls: Parameters<OpenCodeSandboxExecutionPort["exec"]>[2][] = [];
    let runPolls = 0;
    const execution: OpenCodeSandboxExecutionPort = {
      async exec(_context, _sandboxId, input) {
        calls.push(input);
        if (input.argv.includes("--version")) {
          return ok({
            mode: "foreground",
            frames: [
              { kind: "stdout", sequence: 1, data: "1.1.60\n" },
              { kind: "exit", sequence: 2, exitCode: 0 },
            ],
          } satisfies SandboxExecResult);
        }
        if (input.argv.includes("serve")) {
          return ok({ mode: "background", processId: "spr_server" } satisfies SandboxExecResult);
        }
        files.set(
          "app/.appaloft-agent/srun_open/stdout.jsonl",
          new TextEncoder().encode(
            '{"type":"text","sessionID":"ses_open","part":{"text":"done"}}\n',
          ),
        );
        files.set("app/.appaloft-agent/srun_open/stderr.log", new Uint8Array());
        files.set("app/.appaloft-agent/srun_open/exit-code", new TextEncoder().encode("0"));
        return ok({ mode: "background", processId: "spr_run" } satisfies SandboxExecResult);
      },
      async listProcesses() {
        runPolls += 1;
        return ok(
          runPolls < 3
            ? ([
                { processId: "spr_server", status: "running" },
                { processId: "spr_run", status: "running" },
              ] satisfies SandboxProcessDescriptor[])
            : ([
                { processId: "spr_server", status: "running" },
                { processId: "spr_run", status: "exited", exitCode: 0 },
              ] satisfies SandboxProcessDescriptor[]),
        );
      },
      async terminateProcess() {
        return ok(undefined);
      },
      async readFile(_context, _sandboxId, input) {
        const value = files.get(input.path);
        return value
          ? ok(value)
          : err({
              code: "sandbox_file_not_found",
              category: "user",
              message: "missing",
              retryable: false,
              details: {},
            });
      },
      async writeFile(_context, _sandboxId, input) {
        files.set(input.path, input.content);
        return ok({ path: input.path, sizeBytes: input.content.byteLength });
      },
      async removeFile(_context, _sandboxId, input) {
        files.delete(input.path);
        return ok(undefined);
      },
    };
    const harness = new OpenCodeSandboxAgentHarness(execution, {
      templateId: "aht_opencode_managed_v1",
      sandboxTemplateId: "stp_opencode_pinned",
      version: "1.1.60",
      templateDigest: `sha256:${"b".repeat(64)}`,
      cwd: "app",
      port: 4096,
      startupPollIntervalMs: 1,
    });

    expect(
      harness.admitSandbox({ kind: "template", templateId: "stp_opencode_pinned" }),
    ).toBe(true);
    expect(harness.interaction).toEqual({
      transport: "native-attach",
      command: ["opencode", "attach", "http://127.0.0.1:4096", "--dir", "/workspace/app"],
      sessionRecovery: "native-session-store",
      serverPort: 4096,
    });

    await harness.prepareRuntime?.({
      executionContext: context,
      sandboxId: "sbx_open",
      runtimeId: "sar_open",
    });
    const emitted: Array<{ type: string; data: Record<string, unknown> }> = [];
    const result = await harness.execute({
      executionContext: context,
      sandboxId: "sbx_open",
      runtimeId: "sar_open",
      runId: "srun_open",
      task: "Build it",
      context: { mode: "fresh" },
      requestApproval: async () => "rejected",
      emitEvent: async (event) => {
        emitted.push(event);
      },
    });

    const server = calls.find(
      (call) => Array.isArray(call.argv) && call.argv.includes("serve"),
    );
    expect(server).toMatchObject({
      background: true,
      argv: expect.arrayContaining([
        "HOME=/workspace",
        "XDG_DATA_HOME=/workspace/.local/share",
        "serve",
        "--hostname",
        "127.0.0.1",
        "--port",
        "4096",
      ]),
    });
    const run = calls.find((call) => Array.isArray(call.argv) && call.argv.includes("run"));
    expect(run?.argv).toEqual(
      expect.arrayContaining([
        "run",
        "--attach",
        "http://127.0.0.1:4096",
        "--dir",
        "/workspace/app",
        "--format",
        "json",
        "--auto",
        "Build it",
      ]),
    );
    expect(run?.cwd).toBe("app");
    expect(emitted).toEqual([
      {
        type: "text",
        data: {
          type: "text",
          sessionID: "ses_open",
          part: { text: "done" },
        },
      },
    ]);
    expect(result.outcomeDigest).toStartWith("sha256:");
    expect(new TextDecoder().decode(files.get(".appaloft-agent/sar_open/opencode-process-id"))).toBe(
      "spr_server",
    );
  });

  test("[AGENT-WS-OPEN-008] cancellation stops the attached client and runtime termination stops the server", async () => {
    const terminated: string[] = [];
    const files = new Map<string, Uint8Array>([
      [
        ".appaloft-agent/sar_open/opencode-process-id",
        new TextEncoder().encode("spr_server"),
      ],
    ]);
    const execution: OpenCodeSandboxExecutionPort = {
      async exec() {
        return ok({ mode: "background", processId: "spr_run" });
      },
      async listProcesses() {
        return ok([
          { processId: "spr_server", status: "running" },
          { processId: "spr_run", status: "running" },
        ]);
      },
      async terminateProcess(_context, _sandboxId, processId) {
        terminated.push(processId);
        return ok(undefined);
      },
      async readFile(_context, _sandboxId, input) {
        return ok(files.get(input.path) ?? new Uint8Array());
      },
      async writeFile(_context, _sandboxId, input) {
        files.set(input.path, input.content);
        return ok({ path: input.path, sizeBytes: input.content.byteLength });
      },
      async removeFile(_context, _sandboxId, input) {
        files.delete(input.path);
        return ok(undefined);
      },
    };
    const harness = new OpenCodeSandboxAgentHarness(execution, {
      templateId: "aht_opencode_managed_v1",
      sandboxTemplateId: "stp_opencode_pinned",
      version: "1.1.60",
      templateDigest: `sha256:${"b".repeat(64)}`,
      startupPollIntervalMs: 1,
    });

    const running = harness.execute({
      executionContext: context,
      sandboxId: "sbx_open",
      runtimeId: "sar_open",
      runId: "srun_cancel",
      task: "Keep working",
      context: { mode: "continue", parentRunId: "srun_parent" },
      requestApproval: async () => "rejected",
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await harness.cancel({
      sandboxId: "sbx_open",
      runtimeId: "sar_open",
      runId: "srun_cancel",
    });
    await expect(running).rejects.toThrow("opencode_process_cancelled");
    await harness.terminateRuntime?.({
      executionContext: context,
      sandboxId: "sbx_open",
      runtimeId: "sar_open",
    });

    expect(terminated).toEqual(["spr_run", "spr_server"]);
  });
});
