import { describe, expect, test } from "bun:test";
import {
  AgentHarnessTemplateId,
  CreatedAt,
  SandboxAgentRun,
  SandboxAgentRunId,
  SandboxAgentRuntime,
  SandboxAgentRuntimeId,
  SandboxId,
  UpdatedAt,
} from "../src";

const createdAt = CreatedAt.rehydrate("2026-07-20T00:00:00.000Z");
const updatedAt = UpdatedAt.rehydrate("2026-07-20T00:00:01.000Z");

describe("Sandbox Agent Runtime", () => {
  test("[AGENT-CORE-001] owns one active Run claim and releases it idempotently", () => {
    const runtime = SandboxAgentRuntime.create({
      id: SandboxAgentRuntimeId.rehydrate("sar_demo"),
      sandboxId: SandboxId.rehydrate("sbx_demo"),
      harnessTemplateId: AgentHarnessTemplateId.rehydrate("aht_pi_1"),
      createdAt,
    })._unsafeUnwrap();
    runtime.markReady({ at: updatedAt })._unsafeUnwrap();

    const first = SandboxAgentRunId.rehydrate("srun_first");
    const second = SandboxAgentRunId.rehydrate("srun_second");
    runtime.claimRun({ runId: first, at: updatedAt })._unsafeUnwrap();

    const busy = runtime.claimRun({ runId: second, at: updatedAt });
    expect(busy.isErr()).toBe(true);
    expect(busy._unsafeUnwrapErr().details).toMatchObject({ activeRunId: "srun_first" });

    runtime.releaseRun({ runId: first, at: updatedAt })._unsafeUnwrap();
    runtime.releaseRun({ runId: first, at: updatedAt })._unsafeUnwrap();
    runtime.claimRun({ runId: second, at: updatedAt })._unsafeUnwrap();
    expect(runtime.toState().activeRunId?.value).toBe("srun_second");
  });

  test("[AGENT-LINEAGE-002] keeps fresh and explicit continuation lineage", () => {
    const fresh = SandboxAgentRun.create({
      id: SandboxAgentRunId.rehydrate("srun_fresh"),
      runtimeId: SandboxAgentRuntimeId.rehydrate("sar_demo"),
      context: { mode: "fresh" },
      taskDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      createdAt,
    })._unsafeUnwrap();
    fresh.start({ at: updatedAt })._unsafeUnwrap();
    fresh.complete({ at: updatedAt, outcomeDigest: "sha256:done" })._unsafeUnwrap();

    const continued = SandboxAgentRun.create({
      id: SandboxAgentRunId.rehydrate("srun_continued"),
      runtimeId: SandboxAgentRuntimeId.rehydrate("sar_demo"),
      context: { mode: "continue", parentRunId: fresh.id },
      taskDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      createdAt,
    })._unsafeUnwrap();

    expect(continued.toState().context.mode).toBe("continue");
    expect(continued.toState().context.parentRunId?.value).toBe("srun_fresh");
    expect(fresh.toState().status.value).toBe("completed");
  });
});
