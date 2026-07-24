import {
  type RepositoryContext,
  type WorkspaceCollaborationRepository,
} from "@appaloft/application";
import {
  CreatedAt,
  domainError,
  ExpiresAt,
  err,
  ok,
  type Result,
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
} from "@appaloft/core";
import { type Kysely, type Selectable } from "kysely";
import { type Database } from "../schema";
import { normalizeTimestamp, resolveRepositoryExecutor } from "./shared";

type CollaborationRow = Selectable<Database["workspace_collaborations"]>;

type CollaborationJson = {
  name: string;
  participants: Array<{
    id: string;
    subject: { kind: "user"; subjectId: string } | { kind: "agent-runtime"; runtimeId: string };
    role: "owner" | "editor" | "reviewer" | "viewer";
    joinedAt: string;
  }>;
  lanes: Array<{
    id: string;
    workspaceId: string;
    purpose: "builder" | "reviewer" | "tester" | "custom";
    label: string;
    branch?: string;
    addedAt: string;
    archivedAt?: string;
  }>;
  writerLeases: Array<{
    id: string;
    laneId: string;
    holderParticipantId: string;
    generation: number;
    acquiredAt: string;
    expiresAt: string;
    releasedAt?: string;
  }>;
  handoffs: Array<{
    id: string;
    sourceLaneId: string;
    targetLaneId: string;
    artifactId: string;
    expectedDigest: string;
    status: "offered" | "accepted" | "rejected" | "withdrawn";
    offeredBy: string;
    offeredAt: string;
    resolvedBy?: string;
    resolvedAt?: string;
  }>;
  closedAt?: string;
};

function tenantId(context: RepositoryContext): string {
  return context.tenant?.tenantId ?? "tenant_instance";
}

function timestamp(value: string | Date | null | undefined): string {
  const normalized = normalizeTimestamp(value);
  if (!normalized) throw new Error("Workspace Collaboration timestamp is missing");
  return normalized;
}

function json<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

function serialize(collaboration: WorkspaceCollaboration): CollaborationJson {
  const state = collaboration.toState();
  return {
    name: state.name.value,
    participants: state.participants.map((participant) => ({
      id: participant.id.value,
      subject:
        participant.subject.kind === "user"
          ? { ...participant.subject }
          : { kind: "agent-runtime", runtimeId: participant.subject.runtimeId.value },
      role: participant.role,
      joinedAt: participant.joinedAt,
    })),
    lanes: state.lanes.map((lane) => ({
      id: lane.id.value,
      workspaceId: lane.workspaceId.value,
      purpose: lane.purpose,
      label: lane.label,
      ...(lane.branch ? { branch: lane.branch } : {}),
      addedAt: lane.addedAt,
      ...(lane.archivedAt ? { archivedAt: lane.archivedAt } : {}),
    })),
    writerLeases: state.writerLeases.map((lease) => ({
      id: lease.id.value,
      laneId: lease.laneId.value,
      holderParticipantId: lease.holderParticipantId.value,
      generation: lease.generation,
      acquiredAt: lease.acquiredAt,
      expiresAt: lease.expiresAt.value,
      ...(lease.releasedAt ? { releasedAt: lease.releasedAt } : {}),
    })),
    handoffs: state.handoffs.map((handoff) => ({
      id: handoff.id.value,
      sourceLaneId: handoff.sourceLaneId.value,
      targetLaneId: handoff.targetLaneId.value,
      artifactId: handoff.artifactId.value,
      expectedDigest: handoff.expectedDigest.value,
      status: handoff.status,
      offeredBy: handoff.offeredBy.value,
      offeredAt: handoff.offeredAt,
      ...(handoff.resolvedBy ? { resolvedBy: handoff.resolvedBy.value } : {}),
      ...(handoff.resolvedAt ? { resolvedAt: handoff.resolvedAt } : {}),
    })),
    ...(state.closedAt ? { closedAt: state.closedAt } : {}),
  };
}

function rehydrate(row: CollaborationRow): WorkspaceCollaboration {
  const state = json<CollaborationJson>(row.state);
  return WorkspaceCollaboration.rehydrate({
    id: WorkspaceCollaborationId.rehydrate(row.id),
    name: WorkspaceCollaborationName.rehydrate(state.name),
    status: row.status as "active" | "closed",
    revision: row.revision,
    participants: state.participants.map((participant) => ({
      id: WorkspaceCollaborationParticipantId.rehydrate(participant.id),
      subject:
        participant.subject.kind === "user"
          ? { ...participant.subject }
          : {
              kind: "agent-runtime",
              runtimeId: SandboxAgentRuntimeId.rehydrate(participant.subject.runtimeId),
            },
      role: participant.role,
      joinedAt: participant.joinedAt,
    })),
    lanes: state.lanes.map((lane) => ({
      id: WorkspaceCollaborationLaneId.rehydrate(lane.id),
      workspaceId: SandboxId.rehydrate(lane.workspaceId),
      purpose: lane.purpose,
      label: lane.label,
      ...(lane.branch ? { branch: lane.branch } : {}),
      addedAt: lane.addedAt,
      ...(lane.archivedAt ? { archivedAt: lane.archivedAt } : {}),
    })),
    writerLeases: state.writerLeases.map((lease) => ({
      id: WorkspaceWriterLeaseId.rehydrate(lease.id),
      laneId: WorkspaceCollaborationLaneId.rehydrate(lease.laneId),
      holderParticipantId: WorkspaceCollaborationParticipantId.rehydrate(lease.holderParticipantId),
      generation: lease.generation,
      acquiredAt: lease.acquiredAt,
      expiresAt: ExpiresAt.rehydrate(lease.expiresAt),
      ...(lease.releasedAt ? { releasedAt: lease.releasedAt } : {}),
    })),
    handoffs: state.handoffs.map((handoff) => ({
      id: WorkspaceCollaborationHandoffId.rehydrate(handoff.id),
      sourceLaneId: WorkspaceCollaborationLaneId.rehydrate(handoff.sourceLaneId),
      targetLaneId: WorkspaceCollaborationLaneId.rehydrate(handoff.targetLaneId),
      artifactId: SourceArtifactId.rehydrate(handoff.artifactId),
      expectedDigest: SourceArtifactDigest.rehydrate(handoff.expectedDigest),
      status: handoff.status,
      offeredBy: WorkspaceCollaborationParticipantId.rehydrate(handoff.offeredBy),
      offeredAt: handoff.offeredAt,
      ...(handoff.resolvedBy
        ? {
            resolvedBy: WorkspaceCollaborationParticipantId.rehydrate(handoff.resolvedBy),
          }
        : {}),
      ...(handoff.resolvedAt ? { resolvedAt: handoff.resolvedAt } : {}),
    })),
    createdAt: CreatedAt.rehydrate(timestamp(row.created_at)),
    updatedAt: UpdatedAt.rehydrate(timestamp(row.updated_at)),
    ...(state.closedAt ? { closedAt: state.closedAt } : {}),
  });
}

function concurrentConflict(collaborationId: string, expectedRevision: number, revision: number) {
  return domainError.conflict("Workspace Collaboration changed concurrently", {
    collaborationId,
    expectedRevision,
    revision,
  });
}

export class PgWorkspaceCollaborationRepository implements WorkspaceCollaborationRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async save(
    context: RepositoryContext,
    collaboration: WorkspaceCollaboration,
    expectedRevision: number | null,
  ): Promise<Result<void>> {
    const state = collaboration.toState();
    const executor = resolveRepositoryExecutor(this.db, context);
    if (expectedRevision === null) {
      const inserted = await executor
        .insertInto("workspace_collaborations")
        .values({
          tenant_id: tenantId(context),
          id: state.id.value,
          status: state.status,
          revision: state.revision,
          state: serialize(collaboration),
          created_at: state.createdAt.value,
          updated_at: state.updatedAt?.value ?? state.createdAt.value,
        })
        .onConflict((conflict) => conflict.columns(["tenant_id", "id"]).doNothing())
        .executeTakeFirst();
      if (Number(inserted.numInsertedOrUpdatedRows ?? 0) === 0) {
        const current = await this.find(context, state.id.value);
        return err(concurrentConflict(state.id.value, -1, current?.toState().revision ?? -1));
      }
      return ok(undefined);
    }

    const updated = await executor
      .updateTable("workspace_collaborations")
      .set({
        status: state.status,
        revision: state.revision,
        state: serialize(collaboration),
        updated_at: state.updatedAt?.value ?? state.createdAt.value,
      })
      .where("tenant_id", "=", tenantId(context))
      .where("id", "=", state.id.value)
      .where("revision", "=", expectedRevision)
      .executeTakeFirst();
    if (Number(updated.numUpdatedRows ?? 0) === 0) {
      const current = await this.find(context, state.id.value);
      return err(
        concurrentConflict(state.id.value, expectedRevision, current?.toState().revision ?? -1),
      );
    }
    return ok(undefined);
  }

  async find(
    context: RepositoryContext,
    collaborationId: string,
  ): Promise<WorkspaceCollaboration | null> {
    const row = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("workspace_collaborations")
      .selectAll()
      .where("tenant_id", "=", tenantId(context))
      .where("id", "=", collaborationId)
      .executeTakeFirst();
    return row ? rehydrate(row) : null;
  }

  async list(context: RepositoryContext): Promise<WorkspaceCollaboration[]> {
    return (
      await resolveRepositoryExecutor(this.db, context)
        .selectFrom("workspace_collaborations")
        .selectAll()
        .where("tenant_id", "=", tenantId(context))
        .orderBy("updated_at", "desc")
        .execute()
    ).map(rehydrate);
  }
}
