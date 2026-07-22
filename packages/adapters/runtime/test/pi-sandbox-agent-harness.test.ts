import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import {
  createExecutionContext,
  type SandboxExecResult,
  type SandboxProcessDescriptor,
} from "@appaloft/application";
import { ok } from "@appaloft/core";
import { PiSandboxAgentHarness, type PiSandboxExecutionPort } from "../src";

const context = createExecutionContext({
  entrypoint: "worker",
  requestId: "req_pi_harness",
  tenant: { tenantId: "tenant_pi" },
});

const modelAccess = {
  async issue() {
    return {
      capabilityId: "smc_test",
      baseUrl: "http://gateway/m/smc_test/token/v1",
      accessToken: "appaloft-scoped-capability",
      provider: "appaloft",
      model: "gpt-test",
      expiresAt: "2026-07-20T01:00:00.000Z",
    };
  },
  async revoke() {},
};

describe("PiSandboxAgentHarness", () => {
  test("[AGENT-PI-006] admits only the pinned Sandbox template and translates JSONL", async () => {
    let polls = 0;
    let captured: Parameters<PiSandboxExecutionPort["exec"]>[2] | undefined;
    const emitted: Array<{ type: string; data: Record<string, unknown>; processPoll: number }> = [];
    const files = new Map([
      [".appaloft-agent/srun_pi/stdout.jsonl", new TextEncoder().encode('{"type":"message","text":"done"}\n')],
      [".appaloft-agent/srun_pi/stderr.log", new Uint8Array()],
      [".appaloft-agent/srun_pi/exit-code", new TextEncoder().encode("0")],
    ]);
    const execution: PiSandboxExecutionPort = {
      async exec(_context, _sandboxId, input) {
        captured = input;
        return ok({ mode: "background", processId: "spr_pi" } satisfies SandboxExecResult);
      },
      async listProcesses() {
        polls += 1;
        return ok(
          polls === 1
            ? ([{ processId: "spr_pi", status: "running" }] satisfies SandboxProcessDescriptor[])
            : ([{ processId: "spr_pi", status: "exited", exitCode: 0 }] satisfies SandboxProcessDescriptor[]),
        );
      },
      async terminateProcess() {
        return ok(undefined);
      },
      async readFile(_context, _sandboxId, input) {
        return ok(files.get(input.path) ?? new Uint8Array());
      },
      async writeFile(_context, _sandboxId, input) {
        files.set(input.path, input.content);
        return ok({ path: input.path, sizeBytes: input.content.byteLength });
      },
      async removeFile() {
        return ok(undefined);
      },
    };
    const harness = new PiSandboxAgentHarness(execution, {
      templateId: "aht_pi_managed_v1",
      sandboxTemplateId: "stp_pi_pinned",
      version: "1.2.3",
      templateDigest: `sha256:${"a".repeat(64)}`,
      timeoutMs: 2_000,
      modelAccess,
    });

    expect(harness.admitSandbox({ kind: "template", templateId: "stp_pi_pinned" })).toBe(true);
    expect(harness.admitSandbox({ kind: "template", templateId: "stp_other" })).toBe(false);
    const result = await harness.execute({
      executionContext: context,
      sandboxId: "sbx_pi",
      runtimeId: "sar_pi",
      runId: "srun_pi",
      task: "Build it",
      context: { mode: "fresh" },
      requestApproval: async () => "rejected",
      emitEvent: async (event) => {
        emitted.push({ ...event, processPoll: polls });
      },
    });
    expect(captured?.background).toBe(true);
    expect(captured?.argv).toContain("--no-session");
    expect(captured?.argv).toContain("--offline");
    expect(captured?.argv).toContain("--no-extensions");
    expect(captured?.argv).toContain("--provider");
    expect(captured?.argv).toContain("appaloft");
    expect(captured?.argv).toContain("read,bash,edit,write,grep,find,ls");
    expect(captured?.argv).toContain("Build it");
    expect(emitted).toEqual([
      {
        type: "message",
        data: { type: "message", text: "done" },
        processPoll: 1,
      },
    ]);
    expect(result.events).toEqual([]);
    expect(result.outcomeDigest).toStartWith("sha256:");
  });

  test("[AGENT-RUN-003] cancellation terminates the active Sandbox process", async () => {
    let terminated: string | undefined;
    const execution: PiSandboxExecutionPort = {
      async exec() {
        return ok({ mode: "background", processId: "spr_cancel" });
      },
      async listProcesses() {
        return ok([{ processId: "spr_cancel", status: "running" }]);
      },
      async terminateProcess(_context, _sandboxId, processId) {
        terminated = processId;
        return ok(undefined);
      },
      async readFile() {
        return ok(new Uint8Array());
      },
      async writeFile(_context, _sandboxId, input) {
        return ok({ path: input.path, sizeBytes: input.content.byteLength });
      },
      async removeFile() {
        return ok(undefined);
      },
    };
    const harness = new PiSandboxAgentHarness(execution, {
      templateId: "aht_pi_managed_v1",
      sandboxTemplateId: "stp_pi_pinned",
      version: "1.2.3",
      templateDigest: `sha256:${"a".repeat(64)}`,
      timeoutMs: 2_000,
      modelAccess,
    });
    const running = harness.execute({
      executionContext: context,
      sandboxId: "sbx_pi",
      runtimeId: "sar_pi",
      runId: "srun_cancel",
      task: "Keep working",
      context: { mode: "fresh" },
      requestApproval: async () => "rejected",
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await harness.cancel({ sandboxId: "sbx_pi", runtimeId: "sar_pi", runId: "srun_cancel" });
    expect(terminated).toBe("spr_cancel");
    await expect(running).rejects.toThrow("pi_process_cancelled");
  });
});
