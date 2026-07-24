import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  ExpiresAt,
  SandboxAgentRuntimeId,
  SandboxId,
  SourceArtifactDigest,
  SourceArtifactId,
  UpdatedAt,
  WorkspaceCollaboration,
  WorkspaceCollaborationHandoffId,
  WorkspaceCollaborationId,
  WorkspaceCollaborationLaneId,
  WorkspaceCollaborationName,
  WorkspaceCollaborationParticipantId,
  WorkspaceWriterLeaseId,
} from "../src";

const createdAt = CreatedAt.rehydrate("2026-07-24T00:00:00.000Z");
const updatedAt = UpdatedAt.rehydrate("2026-07-24T00:01:00.000Z");
const ownerId = WorkspaceCollaborationParticipantId.rehydrate("wcp_owner");
const editorId = WorkspaceCollaborationParticipantId.rehydrate("wcp_editor");
const reviewerId = WorkspaceCollaborationParticipantId.rehydrate("wcp_reviewer");
const builderLaneId = WorkspaceCollaborationLaneId.rehydrate("wcl_builder");
const reviewLaneId = WorkspaceCollaborationLaneId.rehydrate("wcl_review");

function collaboration() {
  return WorkspaceCollaboration.create({
    id: WorkspaceCollaborationId.rehydrate("wco_demo"),
    name: WorkspaceCollaborationName.rehydrate("Issue 123"),
    creator: {
      id: ownerId,
      subject: { kind: "user", subjectId: "usr_owner" },
      role: "owner",
    },
    firstLane: {
      id: builderLaneId,
      workspaceId: SandboxId.rehydrate("sbx_builder"),
      purpose: "builder",
      label: "implementation",
      branch: "feature/issue-123",
    },
    createdAt,
  })._unsafeUnwrap();
}

describe("Workspace Collaboration", () => {
  test("[COLLAB-CREATE-001][COLLAB-LANE-002] coordinates existing Workspace references without owning lifecycle", () => {
    const aggregate = collaboration();

    expect(aggregate.toState()).toMatchObject({
      status: "active",
      participants: [
        {
          role: "owner",
          subject: { kind: "user", subjectId: "usr_owner" },
        },
      ],
      lanes: [
        {
          purpose: "builder",
          branch: "feature/issue-123",
        },
      ],
    });

    const added = aggregate.addLane({
      actorId: ownerId,
      lane: {
        id: reviewLaneId,
        workspaceId: SandboxId.rehydrate("sbx_review"),
        purpose: "reviewer",
        label: "review",
      },
      at: updatedAt,
    });
    expect(added.isOk()).toBe(true);
    expect(aggregate.toState().lanes.map((lane) => lane.workspaceId.value)).toEqual([
      "sbx_builder",
      "sbx_review",
    ]);

    const duplicateWorkspace = aggregate.addLane({
      actorId: ownerId,
      lane: {
        id: WorkspaceCollaborationLaneId.rehydrate("wcl_duplicate"),
        workspaceId: SandboxId.rehydrate("sbx_review"),
        purpose: "tester",
        label: "duplicate",
      },
      at: updatedAt,
    });
    expect(duplicateWorkspace.isErr()).toBe(true);
    expect(duplicateWorkspace._unsafeUnwrapErr().code).toBe("conflict");
  });

  test("[COLLAB-MEMBER-003] manages human and Agent Runtime participants while preserving an owner", () => {
    const aggregate = collaboration();
    aggregate
      .addParticipant({
        actorId: ownerId,
        participant: {
          id: editorId,
          subject: {
            kind: "agent-runtime",
            runtimeId: SandboxAgentRuntimeId.rehydrate("sar_editor"),
          },
          role: "editor",
        },
        at: updatedAt,
      })
      ._unsafeUnwrap();

    const finalOwner = aggregate.changeParticipantRole({
      actorId: ownerId,
      participantId: ownerId,
      role: "viewer",
      at: updatedAt,
    });
    expect(finalOwner.isErr()).toBe(true);
    expect(finalOwner._unsafeUnwrapErr().code).toBe("invariant_violation");

    aggregate
      .changeParticipantRole({
        actorId: ownerId,
        participantId: editorId,
        role: "owner",
        at: updatedAt,
      })
      ._unsafeUnwrap();
    aggregate
      .changeParticipantRole({
        actorId: editorId,
        participantId: ownerId,
        role: "viewer",
        at: updatedAt,
      })
      ._unsafeUnwrap();
    expect(aggregate.toState().participants.filter((item) => item.role === "owner")).toHaveLength(
      1,
    );
  });

  test("[COLLAB-LEASE-004][COLLAB-TRANSFER-005] fences a Lane with one monotonic writer lease", () => {
    const aggregate = collaboration();
    aggregate
      .addParticipant({
        actorId: ownerId,
        participant: {
          id: editorId,
          subject: { kind: "user", subjectId: "usr_editor" },
          role: "editor",
        },
        at: updatedAt,
      })
      ._unsafeUnwrap();
    aggregate
      .addParticipant({
        actorId: ownerId,
        participant: {
          id: reviewerId,
          subject: { kind: "user", subjectId: "usr_reviewer" },
          role: "reviewer",
        },
        at: updatedAt,
      })
      ._unsafeUnwrap();

    const first = aggregate.acquireWriterLease({
      actorId: editorId,
      laneId: builderLaneId,
      leaseId: WorkspaceWriterLeaseId.rehydrate("wwl_first"),
      expiresAt: ExpiresAt.rehydrate("2026-07-24T00:11:00.000Z"),
      at: updatedAt,
    });
    expect(first._unsafeUnwrap()).toMatchObject({
      generation: 1,
      holderParticipantId: editorId,
    });

    const competing = aggregate.acquireWriterLease({
      actorId: reviewerId,
      laneId: builderLaneId,
      leaseId: WorkspaceWriterLeaseId.rehydrate("wwl_competing"),
      expiresAt: ExpiresAt.rehydrate("2026-07-24T00:11:00.000Z"),
      at: updatedAt,
    });
    expect(competing.isErr()).toBe(true);
    expect(competing._unsafeUnwrapErr().details).toMatchObject({
      holderParticipantId: "wcp_editor",
      generation: 1,
    });

    const transferred = aggregate.transferWriterLease({
      actorId: editorId,
      laneId: builderLaneId,
      expectedGeneration: 1,
      toParticipantId: reviewerId,
      leaseId: WorkspaceWriterLeaseId.rehydrate("wwl_second"),
      expiresAt: ExpiresAt.rehydrate("2026-07-24T00:12:00.000Z"),
      at: updatedAt,
    });
    expect(transferred._unsafeUnwrap()).toMatchObject({
      generation: 2,
      holderParticipantId: reviewerId,
    });

    const staleRelease = aggregate.releaseWriterLease({
      actorId: editorId,
      laneId: builderLaneId,
      expectedGeneration: 1,
      at: updatedAt,
    });
    expect(staleRelease.isErr()).toBe(true);
    expect(staleRelease._unsafeUnwrapErr().details?.generation).toBe(2);
  });

  test("[COLLAB-LANE-002][COLLAB-LEASE-004] renews, releases, archives and closes only from a safe state", () => {
    const aggregate = collaboration();
    aggregate
      .addLane({
        actorId: ownerId,
        lane: {
          id: reviewLaneId,
          workspaceId: SandboxId.rehydrate("sbx_review"),
          purpose: "reviewer",
          label: "review",
        },
        at: updatedAt,
      })
      ._unsafeUnwrap();
    aggregate
      .acquireWriterLease({
        actorId: ownerId,
        laneId: builderLaneId,
        leaseId: WorkspaceWriterLeaseId.rehydrate("wwl_lifecycle"),
        expiresAt: ExpiresAt.rehydrate("2026-07-24T00:11:00.000Z"),
        at: updatedAt,
      })
      ._unsafeUnwrap();

    expect(
      aggregate
        .renewWriterLease({
          actorId: ownerId,
          laneId: builderLaneId,
          expectedGeneration: 1,
          expiresAt: ExpiresAt.rehydrate("2026-07-24T00:21:00.000Z"),
          at: updatedAt,
        })
        ._unsafeUnwrap().expiresAt.value,
    ).toBe("2026-07-24T00:21:00.000Z");
    expect(aggregate.close({ actorId: ownerId, at: updatedAt }).isErr()).toBe(true);

    aggregate
      .releaseWriterLease({
        actorId: ownerId,
        laneId: builderLaneId,
        expectedGeneration: 1,
        at: updatedAt,
      })
      ._unsafeUnwrap();
    aggregate
      .archiveLane({
        actorId: ownerId,
        laneId: reviewLaneId,
        at: updatedAt,
      })
      ._unsafeUnwrap();
    aggregate.close({ actorId: ownerId, at: updatedAt })._unsafeUnwrap();

    expect(aggregate.toState()).toMatchObject({
      status: "closed",
      closedAt: updatedAt.value,
    });
    expect(
      aggregate
        .addLane({
          actorId: ownerId,
          lane: {
            id: WorkspaceCollaborationLaneId.rehydrate("wcl_after_close"),
            workspaceId: SandboxId.rehydrate("sbx_after_close"),
            purpose: "custom",
            label: "closed",
          },
          at: updatedAt,
        })
        .isErr(),
    ).toBe(true);
  });

  test("[COLLAB-HANDOFF-009][COLLAB-REVIEW-010] records immutable digest-bound handoff resolution exactly once", () => {
    const aggregate = collaboration();
    aggregate
      .addParticipant({
        actorId: ownerId,
        participant: {
          id: reviewerId,
          subject: { kind: "user", subjectId: "usr_reviewer" },
          role: "reviewer",
        },
        at: updatedAt,
      })
      ._unsafeUnwrap();
    aggregate
      .addLane({
        actorId: ownerId,
        lane: {
          id: reviewLaneId,
          workspaceId: SandboxId.rehydrate("sbx_review"),
          purpose: "reviewer",
          label: "review",
        },
        at: updatedAt,
      })
      ._unsafeUnwrap();
    aggregate
      .acquireWriterLease({
        actorId: ownerId,
        laneId: builderLaneId,
        leaseId: WorkspaceWriterLeaseId.rehydrate("wwl_handoff"),
        expiresAt: ExpiresAt.rehydrate("2026-07-24T00:11:00.000Z"),
        at: updatedAt,
      })
      ._unsafeUnwrap();

    aggregate
      .offerHandoff({
        actorId: ownerId,
        handoffId: WorkspaceCollaborationHandoffId.rehydrate("wch_candidate"),
        sourceLaneId: builderLaneId,
        targetLaneId: reviewLaneId,
        artifactId: SourceArtifactId.rehydrate("sart_candidate"),
        expectedDigest: SourceArtifactDigest.rehydrate(`sha256:${"a".repeat(64)}`),
        at: updatedAt,
      })
      ._unsafeUnwrap();

    aggregate
      .resolveHandoff({
        actorId: reviewerId,
        handoffId: WorkspaceCollaborationHandoffId.rehydrate("wch_candidate"),
        decision: "accept",
        at: updatedAt,
      })
      ._unsafeUnwrap();
    expect(aggregate.toState().handoffs[0]).toMatchObject({
      status: "accepted",
      resolvedBy: reviewerId,
    });

    const secondResolution = aggregate.resolveHandoff({
      actorId: reviewerId,
      handoffId: WorkspaceCollaborationHandoffId.rehydrate("wch_candidate"),
      decision: "reject",
      at: updatedAt,
    });
    expect(secondResolution.isErr()).toBe(true);
    expect(secondResolution._unsafeUnwrapErr().code).toBe("conflict");
  });
});
