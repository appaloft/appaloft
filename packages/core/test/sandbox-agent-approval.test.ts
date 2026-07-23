import { describe, expect, test } from "bun:test";

import {
  CreatedAt,
  ExpiresAt,
  SandboxAgentApproval,
  SandboxAgentApprovalId,
  SandboxAgentApprovalRequestDigest,
  SandboxAgentRunId,
  SandboxAgentRuntimeId,
  UpdatedAt,
} from "../src";

const DIGEST_A = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DIGEST_B = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const createdAt = CreatedAt.rehydrate("2026-07-20T00:00:00.000Z");
const expiresAt = ExpiresAt.rehydrate("2026-07-20T01:00:00.000Z");
const beforeExpiry = UpdatedAt.rehydrate("2026-07-20T00:30:00.000Z");
const atExpiry = UpdatedAt.rehydrate("2026-07-20T01:00:00.000Z");
const afterExpiry = UpdatedAt.rehydrate("2026-07-20T01:00:01.000Z");

function createRequestedApproval(input?: {
  requestDigest?: string;
  destination?: string;
  expiresAt?: ExpiresAt;
}) {
  return SandboxAgentApproval.create({
    id: SandboxAgentApprovalId.rehydrate("saap_demo"),
    runtimeId: SandboxAgentRuntimeId.rehydrate("sar_demo"),
    runId: SandboxAgentRunId.rehydrate("srun_demo"),
    sandboxId: "sbx_demo",
    capability: "network",
    requestDigest: input?.requestDigest ?? DIGEST_A,
    ...(input?.destination !== undefined ? { destination: input.destination } : {}),
    createdAt,
    expiresAt: input?.expiresAt ?? expiresAt,
  });
}

describe("SandboxAgentApprovalRequestDigest", () => {
  test("[CORE-SBX-APPR-002] rejects invalid approval request digests", () => {
    expect(SandboxAgentApprovalRequestDigest.create("").isErr()).toBe(true);
    expect(SandboxAgentApprovalRequestDigest.create("sha256:deadbeef").isErr()).toBe(true);
    expect(
      SandboxAgentApprovalRequestDigest.create("md5:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").isErr(),
    ).toBe(true);
    expect(
      SandboxAgentApprovalRequestDigest.create(
        "SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      )._unsafeUnwrap().value,
    ).toBe(DIGEST_A);
  });
});

describe("SandboxAgentApproval", () => {
  test("[CORE-SBX-APPR-001] creates a requested approval and emits the requested event", () => {
    const created = createRequestedApproval({ destination: " https://example.test/callback " });
    expect(created.isOk()).toBe(true);

    const approval = created._unsafeUnwrap();
    expect(approval.toState().status).toBe("requested");
    expect(approval.toState().destination).toBe("https://example.test/callback");
    expect(approval.toState().requestDigest.value).toBe(DIGEST_A);
    expect(approval.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: "sandbox-agent-approval-requested",
        aggregateId: "saap_demo",
        payload: expect.objectContaining({
          runId: "srun_demo",
          capability: "network",
          requestDigest: DIGEST_A,
          destination: "https://example.test/callback",
          expiresAt: expiresAt.value,
        }),
      }),
    ]);
  });

  test("[CORE-SBX-APPR-002] rejects create when request digest is invalid", () => {
    const created = createRequestedApproval({ requestDigest: "not-a-digest" });
    expect(created.isErr()).toBe(true);
    expect(created._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      message: "Agent approval request digest is invalid",
    });
  });

  test("[CORE-SBX-APPR-003] rejects invalid destinations", () => {
    const withNull = createRequestedApproval({ destination: "https://example.test/\0path" });
    expect(withNull.isErr()).toBe(true);
    expect(withNull._unsafeUnwrapErr().message).toBe("Agent approval destination is invalid");

    const tooLong = createRequestedApproval({
      destination: `https://example.test/${"a".repeat(512)}`,
    });
    expect(tooLong.isErr()).toBe(true);
    expect(tooLong._unsafeUnwrapErr().message).toBe("Agent approval destination is invalid");
  });

  test("[CORE-SBX-APPR-004] approves a requested approval before expiry", () => {
    const approval = createRequestedApproval()._unsafeUnwrap();
    approval.pullDomainEvents();

    const resolved = approval.resolve({
      decision: "approve",
      actorId: " usr_operator ",
      at: beforeExpiry,
    });

    expect(resolved.isOk()).toBe(true);
    expect(approval.toState().status).toBe("approved");
    expect(approval.toState().resolvedBy).toBe("usr_operator");
    expect(approval.toState().updatedAt?.value).toBe(beforeExpiry.value);
    expect(approval.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: "sandbox-agent-approval-resolved",
        payload: {
          decision: "approve",
          resolvedBy: "usr_operator",
        },
      }),
    ]);
  });

  test("[CORE-SBX-APPR-005] rejects a requested approval before expiry", () => {
    const approval = createRequestedApproval()._unsafeUnwrap();
    approval.pullDomainEvents();

    const resolved = approval.resolve({
      decision: "reject",
      actorId: "usr_reviewer",
      at: beforeExpiry,
    });

    expect(resolved.isOk()).toBe(true);
    expect(approval.toState().status).toBe("rejected");
    expect(approval.toState().resolvedBy).toBe("usr_reviewer");
    expect(approval.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: "sandbox-agent-approval-resolved",
        payload: {
          decision: "reject",
          resolvedBy: "usr_reviewer",
        },
      }),
    ]);
  });

  test("[CORE-SBX-APPR-006] rejects resolve after a different terminal decision", () => {
    const approval = createRequestedApproval()._unsafeUnwrap();
    approval
      .resolve({
        decision: "approve",
        actorId: "usr_a",
        at: beforeExpiry,
      })
      ._unsafeUnwrap();

    const again = approval.resolve({
      decision: "reject",
      actorId: "usr_b",
      at: UpdatedAt.rehydrate("2026-07-20T00:31:00.000Z"),
    });

    expect(again.isErr()).toBe(true);
    expect(again._unsafeUnwrapErr()).toMatchObject({
      code: "conflict",
      message: "Agent approval is already terminal",
    });
    expect(approval.toState().status).toBe("approved");
    expect(approval.toState().resolvedBy).toBe("usr_a");
  });

  test("[CORE-SBX-APPR-007] treats resolve at expiry as expired and fail-closed", () => {
    const approval = createRequestedApproval()._unsafeUnwrap();
    approval.pullDomainEvents();

    const resolved = approval.resolve({
      decision: "approve",
      actorId: "usr_late",
      at: atExpiry,
    });

    expect(resolved.isErr()).toBe(true);
    expect(resolved._unsafeUnwrapErr()).toMatchObject({
      code: "conflict",
      message: "Agent approval has expired",
    });
    expect(approval.toState().status).toBe("expired");
    expect(approval.toState().resolvedBy).toBeUndefined();
    expect(approval.pullDomainEvents()).toEqual([]);
  });

  test("[CORE-SBX-APPR-008] treats repeated identical resolve as an idempotent no-op", () => {
    const approval = createRequestedApproval()._unsafeUnwrap();
    approval
      .resolve({
        decision: "approve",
        actorId: "usr_a",
        at: beforeExpiry,
      })
      ._unsafeUnwrap();
    approval.pullDomainEvents();

    const again = approval.resolve({
      decision: "approve",
      actorId: "usr_other",
      at: UpdatedAt.rehydrate("2026-07-20T00:45:00.000Z"),
    });

    expect(again.isOk()).toBe(true);
    expect(approval.toState().status).toBe("approved");
    expect(approval.toState().resolvedBy).toBe("usr_a");
    expect(approval.pullDomainEvents()).toEqual([]);
  });

  test("[CORE-SBX-APPR-009] rejects expire before the expiry instant", () => {
    const approval = createRequestedApproval()._unsafeUnwrap();

    const expired = approval.expire({ at: beforeExpiry });
    expect(expired.isErr()).toBe(true);
    expect(expired._unsafeUnwrapErr()).toMatchObject({
      code: "conflict",
      message: "Agent approval has not expired",
    });
    expect(approval.toState().status).toBe("requested");
  });

  test("[CORE-SBX-APPR-010] expires a requested approval at or after expiry", () => {
    const onTime = createRequestedApproval()._unsafeUnwrap();
    onTime.pullDomainEvents();
    expect(onTime.expire({ at: atExpiry }).isOk()).toBe(true);
    expect(onTime.toState().status).toBe("expired");
    expect(onTime.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: "sandbox-agent-approval-expired",
        aggregateId: "saap_demo",
      }),
    ]);

    const late = createRequestedApproval({ requestDigest: DIGEST_B })._unsafeUnwrap();
    expect(late.expire({ at: afterExpiry }).isOk()).toBe(true);
    expect(late.toState().status).toBe("expired");
    expect(late.expire({ at: afterExpiry }).isOk()).toBe(true);
  });

  test("[CORE-SBX-APPR-011] rejects expire after the approval is already resolved", () => {
    const approval = createRequestedApproval()._unsafeUnwrap();
    approval
      .resolve({
        decision: "reject",
        actorId: "usr_a",
        at: beforeExpiry,
      })
      ._unsafeUnwrap();

    const expired = approval.expire({ at: afterExpiry });
    expect(expired.isErr()).toBe(true);
    expect(expired._unsafeUnwrapErr()).toMatchObject({
      code: "conflict",
      message: "Resolved Agent approval cannot expire",
    });
    expect(approval.toState().status).toBe("rejected");
  });

  test("[CORE-SBX-APPR-012] rejects invalid resolve actors", () => {
    const emptyActor = createRequestedApproval()._unsafeUnwrap();
    expect(
      emptyActor
        .resolve({
          decision: "approve",
          actorId: "   ",
          at: beforeExpiry,
        })
        .isErr(),
    ).toBe(true);
    expect(emptyActor.toState().status).toBe("requested");

    const longActor = createRequestedApproval()._unsafeUnwrap();
    const tooLong = longActor.resolve({
      decision: "approve",
      actorId: "a".repeat(161),
      at: beforeExpiry,
    });
    expect(tooLong.isErr()).toBe(true);
    expect(tooLong._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      message: "Agent approval actor is invalid",
    });
    expect(longActor.toState().status).toBe("requested");
  });

  test("[CORE-SBX-APPR-013] rehydrates sealed terminal state without inventing events", () => {
    const approval = SandboxAgentApproval.rehydrate({
      id: SandboxAgentApprovalId.rehydrate("saap_rehydrated"),
      runtimeId: SandboxAgentRuntimeId.rehydrate("sar_demo"),
      runId: SandboxAgentRunId.rehydrate("srun_demo"),
      sandboxId: "sbx_demo",
      capability: "promotion",
      requestDigest: SandboxAgentApprovalRequestDigest.rehydrate(DIGEST_A),
      status: "approved",
      createdAt,
      expiresAt,
      updatedAt: beforeExpiry,
      resolvedBy: "usr_a",
    });

    expect(approval.toState().status).toBe("approved");
    expect(approval.pullDomainEvents()).toEqual([]);
    expect(
      approval
        .resolve({
          decision: "reject",
          actorId: "usr_b",
          at: beforeExpiry,
        })
        .isErr(),
    ).toBe(true);
  });
});
