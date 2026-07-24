import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { ok } from "@appaloft/core";
import {
  createExecutionContext,
  InMemoryWorkspaceCollaborationRepository,
  IssueWorkspaceCollaborationTerminalAccessCommand,
  WorkspaceCollaborationService,
} from "../src";

const now = "2026-07-24T01:00:00.000Z";
const ownerContext = createExecutionContext({
  entrypoint: "http",
  actor: { kind: "user", id: "usr_owner" },
  principal: { kind: "user", actorId: "usr_owner", userId: "usr_owner" },
  tenant: {
    tenantId: "org_demo",
    organizationId: "org_demo",
    subjectId: "usr_owner",
  },
  requestId: "req_owner",
});
const editorContext = createExecutionContext({
  entrypoint: "http",
  actor: { kind: "user", id: "usr_editor" },
  principal: { kind: "user", actorId: "usr_editor", userId: "usr_editor" },
  tenant: {
    tenantId: "org_demo",
    organizationId: "org_demo",
    subjectId: "usr_editor",
  },
  requestId: "req_editor",
});
const reviewerContext = createExecutionContext({
  entrypoint: "http",
  actor: { kind: "user", id: "usr_reviewer" },
  principal: { kind: "user", actorId: "usr_reviewer", userId: "usr_reviewer" },
  tenant: {
    tenantId: "org_demo",
    organizationId: "org_demo",
    subjectId: "usr_reviewer",
  },
  requestId: "req_reviewer",
});

function harness() {
  const repository = new InMemoryWorkspaceCollaborationRepository();
  const published: string[] = [];
  const fences: Array<{ collaborationId: string; laneId: string; generation: number }> = [];
  const terminalIssues: Array<{
    sessionId: string;
    access: "observe" | "write";
    collaborationId: string;
    laneId: string;
    workspaceId: string;
    participantId: string;
    writerLeaseGeneration?: number;
  }> = [];
  const nativeAttachIssues: Array<{
    sandboxId: string;
    runtimeId: string;
    expiresAt: string;
  }> = [];
  let next = 0;
  const service = new WorkspaceCollaborationService({
    repository,
    sandboxReader: {
      show: async (_context, workspaceId) =>
        ok({
          sandboxId: workspaceId,
          status: "ready",
          createdAt: now,
        }),
    },
    agentReader: {
      showRuntime: async (_context, workspaceId, runtimeId) =>
        ok({
          sandboxId: workspaceId,
          runtimeId,
          status: "ready",
        }),
      showSourceArtifact: async (_context, artifactId) =>
        ok({
          artifactId,
          sandboxId: "sbx_builder",
          digest: `sha256:${"a".repeat(64)}`,
          status: "available",
        }),
    },
    eventBus: {
      publish: async (_context, events) => {
        published.push(...events.map((event) => event.type));
      },
    },
    clock: { now: () => now },
    idGenerator: {
      next: (prefix) => `${prefix}_${++next}`,
    },
    terminalAccess: {
      advanceAttachmentFence(input) {
        fences.push(input);
      },
      issueAttachmentAccess(input) {
        terminalIssues.push(input);
        return ok({
          ...input,
          transport: {
            kind: "websocket",
            path: `/api/terminal-sessions/${input.sessionId}/attach?access_token=test`,
          },
        });
      },
    },
    agentAttach: {
      async issueAttachAccess(_context, input) {
        nativeAttachIssues.push(input);
        return ok({
          workspaceId: input.sandboxId,
          runtimeId: input.runtimeId,
          transport: "native-attach",
          access: {
            exposureId: "sexp_native",
            port: 4096,
            visibility: "private",
            url: "https://attach.example.test",
            expiresAt: input.expiresAt,
          },
          clientCommand: ["opencode", "attach", "https://attach.example.test"],
        });
      },
    },
  });
  return {
    service,
    repository,
    published,
    fences,
    terminalIssues,
    nativeAttachIssues,
  };
}

async function seeded() {
  const result = harness();
  const collaboration = await result.service.create(ownerContext, {
    name: "Issue 123",
    workspaceId: "sbx_builder",
    lanePurpose: "builder",
    laneLabel: "implementation",
    branch: "feature/issue-123",
  });
  expect(collaboration.isOk()).toBe(true);
  return {
    ...result,
    collaborationId: collaboration._unsafeUnwrap().collaborationId,
    builderLaneId: collaboration._unsafeUnwrap().lanes[0]?.laneId as string,
  };
}

describe("Workspace Collaboration application service", () => {
  test("[COLLAB-SURFACE-013] parses strict terminal access input with a session id", () => {
    expect(
      IssueWorkspaceCollaborationTerminalAccessCommand.create({
        collaborationId: "wsc_demo",
        laneId: "wln_builder",
        sessionId: "term_builder",
        access: "write",
        expectedGeneration: 1,
      }).isOk(),
    ).toBe(true);
    expect(
      IssueWorkspaceCollaborationTerminalAccessCommand.create({
        collaborationId: "wsc_demo",
        laneId: "wln_builder",
        sessionId: "term_builder",
        access: "write",
      }).isErr(),
    ).toBe(true);
  });

  test("[COLLAB-CREATE-001][COLLAB-LANE-002][COLLAB-AUDIT-012] validates Workspace references and publishes safe events", async () => {
    const { service, collaborationId, published } = await seeded();

    const added = await service.addLane(ownerContext, collaborationId, {
      workspaceId: "sbx_review",
      purpose: "reviewer",
      label: "review",
    });
    expect(added.isOk()).toBe(true);
    expect(added._unsafeUnwrap().lanes.map((lane) => lane.workspaceId)).toEqual([
      "sbx_builder",
      "sbx_review",
    ]);
    expect(published).toContain("workspace-collaboration.created");
    expect(published).toContain("workspace-collaboration.lane-added");
    expect(JSON.stringify(added._unsafeUnwrap())).not.toContain("prompt");
  });

  test("[COLLAB-MEMBER-003][COLLAB-NATIVE-008] derives the actor from ExecutionContext and exposes writer authorization", async () => {
    const { service, collaborationId, builderLaneId, fences, terminalIssues, nativeAttachIssues } =
      await seeded();
    await service
      .addParticipant(ownerContext, collaborationId, {
        subject: { kind: "user", subjectId: "usr_editor" },
        role: "editor",
      })
      .then((result) => result._unsafeUnwrap());
    await service
      .addParticipant(ownerContext, collaborationId, {
        subject: { kind: "user", subjectId: "usr_reviewer" },
        role: "reviewer",
      })
      .then((result) => result._unsafeUnwrap());

    const lease = await service.acquireWriterLease(editorContext, collaborationId, {
      laneId: builderLaneId,
      expiresAt: "2026-07-24T01:10:00.000Z",
    });
    expect(lease.isOk()).toBe(true);
    const generation = lease._unsafeUnwrap().lanes.find((lane) => lane.laneId === builderLaneId)
      ?.writerLease?.generation;
    expect(generation).toBe(1);
    if (generation === undefined) throw new Error("writer lease generation is missing");

    const writer = await service.authorizeLaneAccess(editorContext, {
      collaborationId,
      laneId: builderLaneId,
      access: "write",
      expectedGeneration: generation,
    });
    expect(writer._unsafeUnwrap()).toMatchObject({
      access: "write",
      workspaceId: "sbx_builder",
    });

    const viewerWrite = await service.authorizeLaneAccess(reviewerContext, {
      collaborationId,
      laneId: builderLaneId,
      access: "write",
      expectedGeneration: generation,
    });
    expect(viewerWrite.isErr()).toBe(true);

    const observer = await service.authorizeLaneAccess(reviewerContext, {
      collaborationId,
      laneId: builderLaneId,
      access: "observe",
    });
    expect(observer._unsafeUnwrap().access).toBe("observe");

    const observerTerminal = await service.issueTerminalAccess(reviewerContext, {
      collaborationId,
      laneId: builderLaneId,
      sessionId: "term_shared",
      access: "observe",
    });
    expect(observerTerminal._unsafeUnwrap()).toMatchObject({
      access: "observe",
      workspaceId: "sbx_builder",
    });
    const writerTerminal = await service.issueTerminalAccess(editorContext, {
      collaborationId,
      laneId: builderLaneId,
      sessionId: "term_shared",
      access: "write",
      expectedGeneration: generation,
    });
    expect(writerTerminal._unsafeUnwrap()).toMatchObject({
      access: "write",
      writerLeaseGeneration: 1,
    });
    expect(fences).toContainEqual({
      collaborationId,
      laneId: builderLaneId,
      generation: 1,
    });
    expect(terminalIssues).toHaveLength(2);

    const nativeAttach = await service.issueNativeAgentAttach(editorContext, {
      collaborationId,
      laneId: builderLaneId,
      runtimeId: "sar_opencode",
      expiresAt: "2026-07-24T01:30:00.000Z",
      expectedGeneration: generation,
    });
    expect(nativeAttach._unsafeUnwrap()).toMatchObject({
      workspaceId: "sbx_builder",
      runtimeId: "sar_opencode",
      transport: "native-attach",
    });
    expect(nativeAttachIssues).toEqual([
      {
        sandboxId: "sbx_builder",
        runtimeId: "sar_opencode",
        expiresAt: "2026-07-24T01:30:00.000Z",
      },
    ]);
  });

  test("[COLLAB-LEASE-004][COLLAB-TRANSFER-005] repository compare-and-swap allows exactly one concurrent writer", async () => {
    const { service, collaborationId, builderLaneId } = await seeded();
    await service
      .addParticipant(ownerContext, collaborationId, {
        subject: { kind: "user", subjectId: "usr_editor" },
        role: "editor",
      })
      .then((result) => result._unsafeUnwrap());
    await service
      .addParticipant(ownerContext, collaborationId, {
        subject: { kind: "user", subjectId: "usr_reviewer" },
        role: "reviewer",
      })
      .then((result) => result._unsafeUnwrap());

    const [editor, reviewer] = await Promise.all([
      service.acquireWriterLease(editorContext, collaborationId, {
        laneId: builderLaneId,
        expiresAt: "2026-07-24T01:10:00.000Z",
      }),
      service.acquireWriterLease(reviewerContext, collaborationId, {
        laneId: builderLaneId,
        expiresAt: "2026-07-24T01:10:00.000Z",
      }),
    ]);
    expect([editor.isOk(), reviewer.isOk()].filter(Boolean)).toHaveLength(1);
    expect([editor.isErr(), reviewer.isErr()].filter(Boolean)).toHaveLength(1);
  });

  test("[COLLAB-HANDOFF-009][COLLAB-REVIEW-010] verifies Source Artifact ownership and digest before review handoff", async () => {
    const { service, collaborationId, builderLaneId } = await seeded();
    const review = await service.addLane(ownerContext, collaborationId, {
      workspaceId: "sbx_review",
      purpose: "reviewer",
      label: "review",
    });
    const reviewLaneId = review
      ._unsafeUnwrap()
      .lanes.find((lane) => lane.workspaceId === "sbx_review")?.laneId as string;
    await service
      .addParticipant(ownerContext, collaborationId, {
        subject: { kind: "user", subjectId: "usr_reviewer" },
        role: "reviewer",
      })
      .then((result) => result._unsafeUnwrap());
    await service
      .acquireWriterLease(ownerContext, collaborationId, {
        laneId: builderLaneId,
        expiresAt: "2026-07-24T01:10:00.000Z",
      })
      .then((result) => result._unsafeUnwrap());

    const offered = await service.offerHandoff(ownerContext, collaborationId, {
      sourceLaneId: builderLaneId,
      targetLaneId: reviewLaneId,
      artifactId: "sart_candidate",
      expectedDigest: `sha256:${"a".repeat(64)}`,
    });
    expect(offered.isOk()).toBe(true);
    const handoffId = offered._unsafeUnwrap().handoffs[0]?.handoffId as string;

    const accepted = await service.resolveHandoff(reviewerContext, collaborationId, {
      handoffId,
      decision: "accept",
    });
    expect(accepted._unsafeUnwrap().handoffs[0]).toMatchObject({
      handoffId,
      status: "accepted",
      resolvedByParticipantId: expect.any(String),
    });
  });
});
