import { type SandboxId } from "../execution-sandbox";
import {
  type SandboxAgentRuntimeId,
  type SourceArtifactDigest,
  type SourceArtifactId,
} from "../sandbox-agent-runtime";
import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import { type CreatedAt, type ExpiresAt, type UpdatedAt } from "../shared/temporal";
import {
  type WorkspaceCollaborationHandoffId,
  type WorkspaceCollaborationId,
  type WorkspaceCollaborationLaneId,
  type WorkspaceCollaborationName,
  type WorkspaceCollaborationParticipantId,
  type WorkspaceWriterLeaseId,
} from "./values";

export type WorkspaceCollaborationStatus = "active" | "closed";
export type WorkspaceCollaborationParticipantRole = "owner" | "editor" | "reviewer" | "viewer";
export type WorkspaceCollaborationLanePurpose = "builder" | "reviewer" | "tester" | "custom";
export type WorkspaceCollaborationParticipantSubject =
  | { kind: "user"; subjectId: string }
  | { kind: "agent-runtime"; runtimeId: SandboxAgentRuntimeId };

export interface WorkspaceCollaborationParticipantState {
  id: WorkspaceCollaborationParticipantId;
  subject: WorkspaceCollaborationParticipantSubject;
  role: WorkspaceCollaborationParticipantRole;
  joinedAt: string;
}

export interface WorkspaceCollaborationLaneState {
  id: WorkspaceCollaborationLaneId;
  workspaceId: SandboxId;
  purpose: WorkspaceCollaborationLanePurpose;
  label: string;
  branch?: string;
  addedAt: string;
  archivedAt?: string;
}

export interface WorkspaceWriterLeaseState {
  id: WorkspaceWriterLeaseId;
  laneId: WorkspaceCollaborationLaneId;
  holderParticipantId: WorkspaceCollaborationParticipantId;
  generation: number;
  acquiredAt: string;
  expiresAt: ExpiresAt;
  releasedAt?: string;
}

export type WorkspaceCollaborationHandoffStatus = "offered" | "accepted" | "rejected" | "withdrawn";

export interface WorkspaceCollaborationHandoffState {
  id: WorkspaceCollaborationHandoffId;
  sourceLaneId: WorkspaceCollaborationLaneId;
  targetLaneId: WorkspaceCollaborationLaneId;
  artifactId: SourceArtifactId;
  expectedDigest: SourceArtifactDigest;
  status: WorkspaceCollaborationHandoffStatus;
  offeredBy: WorkspaceCollaborationParticipantId;
  offeredAt: string;
  resolvedBy?: WorkspaceCollaborationParticipantId;
  resolvedAt?: string;
}

export interface WorkspaceCollaborationState {
  id: WorkspaceCollaborationId;
  name: WorkspaceCollaborationName;
  status: WorkspaceCollaborationStatus;
  participants: WorkspaceCollaborationParticipantState[];
  lanes: WorkspaceCollaborationLaneState[];
  writerLeases: WorkspaceWriterLeaseState[];
  handoffs: WorkspaceCollaborationHandoffState[];
  revision: number;
  createdAt: CreatedAt;
  updatedAt?: UpdatedAt;
  closedAt?: string;
}

type ParticipantInput = Omit<WorkspaceCollaborationParticipantState, "joinedAt">;
type LaneInput = Omit<WorkspaceCollaborationLaneState, "addedAt" | "archivedAt">;

function safeLabel(value: string, field: string): Result<string> {
  const normalized = value.trim();
  if (!normalized || normalized.length > 160 || normalized.includes("\0")) {
    return err(
      domainError.validation(`Workspace Collaboration ${field} is invalid`, {
        phase: "workspace-collaboration-admission",
        field,
      }),
    );
  }
  return ok(normalized);
}

function safeBranch(value?: string): Result<string | undefined> {
  const normalized = value?.trim();
  if (!normalized) return ok(undefined);
  if (
    normalized.length > 512 ||
    normalized.startsWith("-") ||
    normalized.includes("\0") ||
    /[\s~^:?*[\\]/u.test(normalized) ||
    normalized.includes("..") ||
    normalized.endsWith(".") ||
    normalized.endsWith("/")
  ) {
    return err(
      domainError.validation("Workspace Collaboration branch is invalid", {
        phase: "workspace-collaboration-admission",
        field: "branch",
      }),
    );
  }
  return ok(normalized);
}

function subjectKey(subject: WorkspaceCollaborationParticipantSubject): string {
  return subject.kind === "user"
    ? `user:${subject.subjectId.trim()}`
    : `agent-runtime:${subject.runtimeId.value}`;
}

function copyParticipant(
  participant: WorkspaceCollaborationParticipantState,
): WorkspaceCollaborationParticipantState {
  return {
    ...participant,
    subject:
      participant.subject.kind === "user"
        ? { ...participant.subject }
        : { kind: "agent-runtime", runtimeId: participant.subject.runtimeId },
  };
}

export class WorkspaceCollaboration extends AggregateRoot<
  WorkspaceCollaborationState,
  WorkspaceCollaborationId
> {
  private constructor(state: WorkspaceCollaborationState) {
    super(state);
  }

  static create(input: {
    id: WorkspaceCollaborationId;
    name: WorkspaceCollaborationName;
    creator: ParticipantInput;
    firstLane: LaneInput;
    createdAt: CreatedAt;
  }): Result<WorkspaceCollaboration> {
    if (input.creator.role !== "owner") {
      return err(
        domainError.invariant("Workspace Collaboration creator must be an owner", {
          phase: "workspace-collaboration-create",
        }),
      );
    }
    const subject = WorkspaceCollaboration.validateSubject(input.creator.subject);
    if (subject.isErr()) return err(subject.error);
    const lane = WorkspaceCollaboration.normalizeLane(input.firstLane, input.createdAt.value);
    if (lane.isErr()) return err(lane.error);
    const aggregate = new WorkspaceCollaboration({
      id: input.id,
      name: input.name,
      status: "active",
      participants: [{ ...input.creator, subject: subject.value, joinedAt: input.createdAt.value }],
      lanes: [lane.value],
      writerLeases: [],
      handoffs: [],
      revision: 0,
      createdAt: input.createdAt,
    });
    aggregate.recordDomainEvent("workspace-collaboration.created", input.createdAt, {
      creatorParticipantId: input.creator.id.value,
      firstLaneId: input.firstLane.id.value,
      workspaceId: input.firstLane.workspaceId.value,
    });
    return ok(aggregate);
  }

  static rehydrate(state: WorkspaceCollaborationState): WorkspaceCollaboration {
    return new WorkspaceCollaboration({
      ...state,
      participants: state.participants.map(copyParticipant),
      lanes: state.lanes.map((lane) => ({ ...lane })),
      writerLeases: state.writerLeases.map((lease) => ({ ...lease })),
      handoffs: state.handoffs.map((handoff) => ({ ...handoff })),
    });
  }

  toState(): WorkspaceCollaborationState {
    return {
      ...this.state,
      participants: this.state.participants.map(copyParticipant),
      lanes: this.state.lanes.map((lane) => ({ ...lane })),
      writerLeases: this.state.writerLeases.map((lease) => ({ ...lease })),
      handoffs: this.state.handoffs.map((handoff) => ({ ...handoff })),
    };
  }

  addParticipant(input: {
    actorId: WorkspaceCollaborationParticipantId;
    participant: ParticipantInput;
    at: UpdatedAt;
  }): Result<void> {
    const authorized = this.requireOwner(input.actorId);
    if (authorized.isErr()) return authorized;
    if (this.participant(input.participant.id)) {
      return err(
        domainError.conflict("Workspace Collaboration participant already exists", {
          participantId: input.participant.id.value,
        }),
      );
    }
    const subject = WorkspaceCollaboration.validateSubject(input.participant.subject);
    if (subject.isErr()) return err(subject.error);
    const key = subjectKey(subject.value);
    if (this.state.participants.some((participant) => subjectKey(participant.subject) === key)) {
      return err(
        domainError.conflict("Workspace Collaboration subject is already a participant", {
          subject: key,
        }),
      );
    }
    this.state.participants.push({
      ...input.participant,
      subject: subject.value,
      joinedAt: input.at.value,
    });
    this.touch(input.at);
    this.recordDomainEvent("workspace-collaboration.participant-added", input.at, {
      participantId: input.participant.id.value,
      subjectKind: input.participant.subject.kind,
      role: input.participant.role,
    });
    return ok(undefined);
  }

  changeParticipantRole(input: {
    actorId: WorkspaceCollaborationParticipantId;
    participantId: WorkspaceCollaborationParticipantId;
    role: WorkspaceCollaborationParticipantRole;
    at: UpdatedAt;
  }): Result<void> {
    const authorized = this.requireOwner(input.actorId);
    if (authorized.isErr()) return authorized;
    const participant = this.participant(input.participantId);
    if (!participant) {
      return err(
        domainError.notFound("WorkspaceCollaborationParticipant", input.participantId.value),
      );
    }
    if (
      participant.role === "owner" &&
      input.role !== "owner" &&
      this.state.participants.filter((candidate) => candidate.role === "owner").length === 1
    ) {
      return err(
        domainError.invariant("Workspace Collaboration must keep at least one owner", {
          participantId: input.participantId.value,
        }),
      );
    }
    if (participant.role === input.role) return ok(undefined);
    const previousRole = participant.role;
    participant.role = input.role;
    this.touch(input.at);
    this.recordDomainEvent("workspace-collaboration.participant-role-changed", input.at, {
      participantId: input.participantId.value,
      previousRole,
      role: input.role,
    });
    return ok(undefined);
  }

  removeParticipant(input: {
    actorId: WorkspaceCollaborationParticipantId;
    participantId: WorkspaceCollaborationParticipantId;
    at: UpdatedAt;
  }): Result<void> {
    const authorized = this.requireOwner(input.actorId);
    if (authorized.isErr()) return authorized;
    const index = this.state.participants.findIndex(
      (participant) => participant.id.value === input.participantId.value,
    );
    if (index < 0) {
      return err(
        domainError.notFound("WorkspaceCollaborationParticipant", input.participantId.value),
      );
    }
    const participant = this.state.participants[index] as WorkspaceCollaborationParticipantState;
    if (
      participant.role === "owner" &&
      this.state.participants.filter((candidate) => candidate.role === "owner").length === 1
    ) {
      return err(
        domainError.invariant("Workspace Collaboration must keep at least one owner", {
          participantId: input.participantId.value,
        }),
      );
    }
    const activeLease = this.state.writerLeases.find(
      (lease) =>
        !lease.releasedAt &&
        lease.holderParticipantId.value === input.participantId.value &&
        lease.expiresAt.toDate() > input.at.toDate(),
    );
    if (activeLease) {
      return err(
        domainError.conflict("Participant holds an active writer lease", {
          participantId: input.participantId.value,
          laneId: activeLease.laneId.value,
          generation: activeLease.generation,
        }),
      );
    }
    this.state.participants.splice(index, 1);
    this.touch(input.at);
    this.recordDomainEvent("workspace-collaboration.participant-removed", input.at, {
      participantId: input.participantId.value,
    });
    return ok(undefined);
  }

  addLane(input: {
    actorId: WorkspaceCollaborationParticipantId;
    lane: LaneInput;
    at: UpdatedAt;
  }): Result<void> {
    const authorized = this.requireRole(input.actorId, ["owner", "editor"]);
    if (authorized.isErr()) return err(authorized.error);
    if (this.lane(input.lane.id)) {
      return err(
        domainError.conflict("Workspace Collaboration Lane already exists", {
          laneId: input.lane.id.value,
        }),
      );
    }
    if (
      this.state.lanes.some(
        (lane) => !lane.archivedAt && lane.workspaceId.value === input.lane.workspaceId.value,
      )
    ) {
      return err(
        domainError.conflict("Workspace already belongs to an active Collaboration Lane", {
          workspaceId: input.lane.workspaceId.value,
        }),
      );
    }
    const lane = WorkspaceCollaboration.normalizeLane(input.lane, input.at.value);
    if (lane.isErr()) return err(lane.error);
    this.state.lanes.push(lane.value);
    this.touch(input.at);
    this.recordDomainEvent("workspace-collaboration.lane-added", input.at, {
      laneId: input.lane.id.value,
      workspaceId: input.lane.workspaceId.value,
      purpose: input.lane.purpose,
    });
    return ok(undefined);
  }

  archiveLane(input: {
    actorId: WorkspaceCollaborationParticipantId;
    laneId: WorkspaceCollaborationLaneId;
    at: UpdatedAt;
  }): Result<void> {
    const authorized = this.requireRole(input.actorId, ["owner", "editor"]);
    if (authorized.isErr()) return err(authorized.error);
    const lane = this.requireLane(input.laneId);
    if (lane.isErr()) return err(lane.error);
    if (this.state.lanes.filter((candidate) => !candidate.archivedAt).length === 1) {
      return err(
        domainError.invariant("Workspace Collaboration must keep at least one active Lane", {
          laneId: input.laneId.value,
        }),
      );
    }
    const current = this.latestLease(input.laneId);
    if (current && !current.releasedAt && current.expiresAt.toDate() > input.at.toDate()) {
      return err(
        domainError.conflict("Cannot archive a Lane with an active writer lease", {
          laneId: input.laneId.value,
          generation: current.generation,
        }),
      );
    }
    const openHandoff = this.state.handoffs.find(
      (handoff) =>
        handoff.status === "offered" &&
        (handoff.sourceLaneId.value === input.laneId.value ||
          handoff.targetLaneId.value === input.laneId.value),
    );
    if (openHandoff) {
      return err(
        domainError.conflict("Cannot archive a Lane with an offered handoff", {
          laneId: input.laneId.value,
          handoffId: openHandoff.id.value,
        }),
      );
    }
    lane.value.archivedAt = input.at.value;
    this.touch(input.at);
    this.recordDomainEvent("workspace-collaboration.lane-archived", input.at, {
      laneId: input.laneId.value,
      workspaceId: lane.value.workspaceId.value,
    });
    return ok(undefined);
  }

  acquireWriterLease(input: {
    actorId: WorkspaceCollaborationParticipantId;
    laneId: WorkspaceCollaborationLaneId;
    leaseId: WorkspaceWriterLeaseId;
    expiresAt: ExpiresAt;
    at: UpdatedAt;
  }): Result<WorkspaceWriterLeaseState> {
    const authorized = this.requireRole(input.actorId, ["owner", "editor", "reviewer"]);
    if (authorized.isErr()) return err(authorized.error);
    const lane = this.requireLane(input.laneId);
    if (lane.isErr()) return err(lane.error);
    if (input.expiresAt.toDate() <= input.at.toDate()) {
      return err(
        domainError.validation("Writer lease expiry must be after acquisition", {
          laneId: input.laneId.value,
        }),
      );
    }
    const current = this.latestLease(input.laneId);
    if (current && !current.releasedAt && current.expiresAt.toDate() > input.at.toDate()) {
      if (current.holderParticipantId.value === input.actorId.value) {
        return ok({ ...current });
      }
      return err(
        domainError.conflict("Workspace Collaboration Lane already has an active writer", {
          laneId: input.laneId.value,
          holderParticipantId: current.holderParticipantId.value,
          generation: current.generation,
          expiresAt: current.expiresAt.value,
        }),
      );
    }
    const lease: WorkspaceWriterLeaseState = {
      id: input.leaseId,
      laneId: input.laneId,
      holderParticipantId: input.actorId,
      generation: (current?.generation ?? 0) + 1,
      acquiredAt: input.at.value,
      expiresAt: input.expiresAt,
    };
    this.state.writerLeases.push(lease);
    this.touch(input.at);
    this.recordDomainEvent("workspace-collaboration.writer-lease-acquired", input.at, {
      laneId: input.laneId.value,
      holderParticipantId: input.actorId.value,
      generation: lease.generation,
      expiresAt: input.expiresAt.value,
    });
    return ok({ ...lease });
  }

  renewWriterLease(input: {
    actorId: WorkspaceCollaborationParticipantId;
    laneId: WorkspaceCollaborationLaneId;
    expectedGeneration: number;
    expiresAt: ExpiresAt;
    at: UpdatedAt;
  }): Result<WorkspaceWriterLeaseState> {
    const current = this.requireCurrentLease(input.laneId, input.expectedGeneration, input.at);
    if (current.isErr()) return err(current.error);
    if (current.value.holderParticipantId.value !== input.actorId.value) {
      return err(
        domainError.conflict("Only the current writer may renew the lease", {
          laneId: input.laneId.value,
          holderParticipantId: current.value.holderParticipantId.value,
          generation: current.value.generation,
        }),
      );
    }
    if (input.expiresAt.toDate() <= input.at.toDate()) {
      return err(domainError.validation("Writer lease expiry must be after renewal"));
    }
    current.value.expiresAt = input.expiresAt;
    this.touch(input.at);
    this.recordDomainEvent("workspace-collaboration.writer-lease-renewed", input.at, {
      laneId: input.laneId.value,
      holderParticipantId: input.actorId.value,
      generation: current.value.generation,
      expiresAt: input.expiresAt.value,
    });
    return ok({ ...current.value });
  }

  releaseWriterLease(input: {
    actorId: WorkspaceCollaborationParticipantId;
    laneId: WorkspaceCollaborationLaneId;
    expectedGeneration: number;
    at: UpdatedAt;
  }): Result<void> {
    const current = this.requireCurrentLease(input.laneId, input.expectedGeneration, input.at);
    if (current.isErr()) return err(current.error);
    const actor = this.participant(input.actorId);
    if (
      current.value.holderParticipantId.value !== input.actorId.value &&
      actor?.role !== "owner"
    ) {
      return err(
        domainError.conflict("Only the current writer or an owner may release the lease", {
          laneId: input.laneId.value,
          holderParticipantId: current.value.holderParticipantId.value,
          generation: current.value.generation,
        }),
      );
    }
    current.value.releasedAt = input.at.value;
    this.touch(input.at);
    this.recordDomainEvent("workspace-collaboration.writer-lease-released", input.at, {
      laneId: input.laneId.value,
      holderParticipantId: current.value.holderParticipantId.value,
      generation: current.value.generation,
      releasedBy: input.actorId.value,
    });
    return ok(undefined);
  }

  transferWriterLease(input: {
    actorId: WorkspaceCollaborationParticipantId;
    laneId: WorkspaceCollaborationLaneId;
    expectedGeneration: number;
    toParticipantId: WorkspaceCollaborationParticipantId;
    leaseId: WorkspaceWriterLeaseId;
    expiresAt: ExpiresAt;
    at: UpdatedAt;
  }): Result<WorkspaceWriterLeaseState> {
    const current = this.requireCurrentLease(input.laneId, input.expectedGeneration, input.at);
    if (current.isErr()) return err(current.error);
    const actor = this.participant(input.actorId);
    if (
      current.value.holderParticipantId.value !== input.actorId.value &&
      actor?.role !== "owner"
    ) {
      return err(
        domainError.conflict("Only the current writer or an owner may transfer the lease", {
          laneId: input.laneId.value,
          holderParticipantId: current.value.holderParticipantId.value,
          generation: current.value.generation,
        }),
      );
    }
    const target = this.requireRole(input.toParticipantId, ["owner", "editor", "reviewer"]);
    if (target.isErr()) return err(target.error);
    if (input.expiresAt.toDate() <= input.at.toDate()) {
      return err(domainError.validation("Transferred writer lease expiry must be in the future"));
    }
    current.value.releasedAt = input.at.value;
    const lease: WorkspaceWriterLeaseState = {
      id: input.leaseId,
      laneId: input.laneId,
      holderParticipantId: input.toParticipantId,
      generation: current.value.generation + 1,
      acquiredAt: input.at.value,
      expiresAt: input.expiresAt,
    };
    this.state.writerLeases.push(lease);
    this.touch(input.at);
    this.recordDomainEvent("workspace-collaboration.writer-lease-transferred", input.at, {
      laneId: input.laneId.value,
      fromParticipantId: current.value.holderParticipantId.value,
      toParticipantId: input.toParticipantId.value,
      generation: lease.generation,
      expiresAt: input.expiresAt.value,
    });
    return ok({ ...lease });
  }

  offerHandoff(input: {
    actorId: WorkspaceCollaborationParticipantId;
    handoffId: WorkspaceCollaborationHandoffId;
    sourceLaneId: WorkspaceCollaborationLaneId;
    targetLaneId: WorkspaceCollaborationLaneId;
    artifactId: SourceArtifactId;
    expectedDigest: SourceArtifactDigest;
    at: UpdatedAt;
  }): Result<WorkspaceCollaborationHandoffState> {
    const source = this.requireLane(input.sourceLaneId);
    if (source.isErr()) return err(source.error);
    const target = this.requireLane(input.targetLaneId);
    if (target.isErr()) return err(target.error);
    if (input.sourceLaneId.value === input.targetLaneId.value) {
      return err(
        domainError.validation("Candidate handoff requires distinct source and target Lanes"),
      );
    }
    const lease = this.latestLease(input.sourceLaneId);
    if (
      !lease ||
      lease.releasedAt ||
      lease.expiresAt.toDate() <= input.at.toDate() ||
      lease.holderParticipantId.value !== input.actorId.value
    ) {
      return err(
        domainError.conflict("Only the current source Lane writer may offer a handoff", {
          sourceLaneId: input.sourceLaneId.value,
          ...(lease
            ? {
                holderParticipantId: lease.holderParticipantId.value,
                generation: lease.generation,
              }
            : {}),
        }),
      );
    }
    if (this.state.handoffs.some((handoff) => handoff.id.value === input.handoffId.value)) {
      return err(
        domainError.conflict("Workspace Collaboration handoff already exists", {
          handoffId: input.handoffId.value,
        }),
      );
    }
    const handoff: WorkspaceCollaborationHandoffState = {
      id: input.handoffId,
      sourceLaneId: input.sourceLaneId,
      targetLaneId: input.targetLaneId,
      artifactId: input.artifactId,
      expectedDigest: input.expectedDigest,
      status: "offered",
      offeredBy: input.actorId,
      offeredAt: input.at.value,
    };
    this.state.handoffs.push(handoff);
    this.touch(input.at);
    this.recordDomainEvent("workspace-collaboration.handoff-offered", input.at, {
      handoffId: input.handoffId.value,
      sourceLaneId: input.sourceLaneId.value,
      targetLaneId: input.targetLaneId.value,
      artifactId: input.artifactId.value,
      expectedDigest: input.expectedDigest.value,
      offeredBy: input.actorId.value,
    });
    return ok({ ...handoff });
  }

  resolveHandoff(input: {
    actorId: WorkspaceCollaborationParticipantId;
    handoffId: WorkspaceCollaborationHandoffId;
    decision: "accept" | "reject";
    at: UpdatedAt;
  }): Result<WorkspaceCollaborationHandoffState> {
    const participant = this.requireRole(input.actorId, ["owner", "reviewer"]);
    if (participant.isErr()) return err(participant.error);
    const handoff = this.state.handoffs.find(
      (candidate) => candidate.id.value === input.handoffId.value,
    );
    if (!handoff) {
      return err(domainError.notFound("WorkspaceCollaborationHandoff", input.handoffId.value));
    }
    if (handoff.status !== "offered") {
      return err(
        domainError.conflict("Workspace Collaboration handoff is already resolved", {
          handoffId: input.handoffId.value,
          status: handoff.status,
        }),
      );
    }
    handoff.status = input.decision === "accept" ? "accepted" : "rejected";
    handoff.resolvedBy = input.actorId;
    handoff.resolvedAt = input.at.value;
    this.touch(input.at);
    this.recordDomainEvent("workspace-collaboration.handoff-resolved", input.at, {
      handoffId: input.handoffId.value,
      status: handoff.status,
      resolvedBy: input.actorId.value,
    });
    return ok({ ...handoff });
  }

  close(input: { actorId: WorkspaceCollaborationParticipantId; at: UpdatedAt }): Result<void> {
    const authorized = this.requireOwner(input.actorId);
    if (authorized.isErr()) return authorized;
    const activeLease = this.state.writerLeases.find(
      (lease) => !lease.releasedAt && lease.expiresAt.toDate() > input.at.toDate(),
    );
    if (activeLease) {
      return err(
        domainError.conflict("Release active writer leases before closing Collaboration", {
          laneId: activeLease.laneId.value,
          generation: activeLease.generation,
        }),
      );
    }
    const offered = this.state.handoffs.find((handoff) => handoff.status === "offered");
    if (offered) {
      return err(
        domainError.conflict("Resolve offered handoffs before closing Collaboration", {
          handoffId: offered.id.value,
        }),
      );
    }
    this.state.status = "closed";
    this.state.closedAt = input.at.value;
    this.touch(input.at);
    this.recordDomainEvent("workspace-collaboration.closed", input.at, {
      participantCount: this.state.participants.length,
      laneCount: this.state.lanes.filter((lane) => !lane.archivedAt).length,
    });
    return ok(undefined);
  }

  currentWriter(
    laneId: WorkspaceCollaborationLaneId,
    at: UpdatedAt,
  ): WorkspaceWriterLeaseState | null {
    const lease = this.latestLease(laneId);
    return lease && !lease.releasedAt && lease.expiresAt.toDate() > at.toDate()
      ? { ...lease }
      : null;
  }

  private static validateSubject(
    subject: WorkspaceCollaborationParticipantSubject,
  ): Result<WorkspaceCollaborationParticipantSubject> {
    if (subject.kind === "agent-runtime") return ok({ ...subject });
    const subjectId = subject.subjectId.trim();
    if (!subjectId || subjectId.length > 160 || !/^[a-zA-Z0-9][a-zA-Z0-9_.:@-]*$/.test(subjectId)) {
      return err(
        domainError.validation("Workspace Collaboration user subject is invalid", {
          phase: "workspace-collaboration-admission",
          field: "subjectId",
        }),
      );
    }
    return ok({ kind: "user", subjectId });
  }

  private static normalizeLane(
    lane: LaneInput,
    addedAt: string,
  ): Result<WorkspaceCollaborationLaneState> {
    const label = safeLabel(lane.label, "label");
    if (label.isErr()) return err(label.error);
    const branch = safeBranch(lane.branch);
    if (branch.isErr()) return err(branch.error);
    return ok({
      ...lane,
      label: label.value,
      ...(branch.value ? { branch: branch.value } : {}),
      addedAt,
    });
  }

  private participant(
    participantId: WorkspaceCollaborationParticipantId,
  ): WorkspaceCollaborationParticipantState | undefined {
    return this.state.participants.find(
      (participant) => participant.id.value === participantId.value,
    );
  }

  private lane(laneId: WorkspaceCollaborationLaneId): WorkspaceCollaborationLaneState | undefined {
    return this.state.lanes.find((lane) => lane.id.value === laneId.value);
  }

  private requireLane(
    laneId: WorkspaceCollaborationLaneId,
  ): Result<WorkspaceCollaborationLaneState> {
    const active = this.requireActive();
    if (active.isErr()) return err(active.error);
    const lane = this.lane(laneId);
    if (!lane || lane.archivedAt) {
      return err(domainError.notFound("WorkspaceCollaborationLane", laneId.value));
    }
    return ok(lane);
  }

  private requireOwner(actorId: WorkspaceCollaborationParticipantId): Result<void> {
    return this.requireRole(actorId, ["owner"]).map(() => undefined);
  }

  private requireRole(
    actorId: WorkspaceCollaborationParticipantId,
    roles: WorkspaceCollaborationParticipantRole[],
  ): Result<WorkspaceCollaborationParticipantState> {
    const active = this.requireActive();
    if (active.isErr()) return err(active.error);
    const participant = this.participant(actorId);
    if (!participant) {
      return err(domainError.notFound("WorkspaceCollaborationParticipant", actorId.value));
    }
    if (!roles.includes(participant.role)) {
      return err(
        domainError.conflict("Workspace Collaboration participant role is not permitted", {
          participantId: actorId.value,
          role: participant.role,
        }),
      );
    }
    return ok(participant);
  }

  private requireActive(): Result<void> {
    return this.state.status === "active"
      ? ok(undefined)
      : err(
          domainError.conflict("Workspace Collaboration is closed", {
            collaborationId: this.id.value,
          }),
        );
  }

  private latestLease(laneId: WorkspaceCollaborationLaneId): WorkspaceWriterLeaseState | undefined {
    return this.state.writerLeases
      .filter((lease) => lease.laneId.value === laneId.value)
      .sort((left, right) => right.generation - left.generation)[0];
  }

  private requireCurrentLease(
    laneId: WorkspaceCollaborationLaneId,
    expectedGeneration: number,
    at: UpdatedAt,
  ): Result<WorkspaceWriterLeaseState> {
    const lane = this.requireLane(laneId);
    if (lane.isErr()) return err(lane.error);
    const current = this.latestLease(laneId);
    if (
      !current ||
      current.releasedAt ||
      current.expiresAt.toDate() <= at.toDate() ||
      current.generation !== expectedGeneration
    ) {
      return err(
        domainError.conflict("Workspace Collaboration writer lease is stale or unavailable", {
          laneId: laneId.value,
          generation: current?.generation ?? 0,
          expectedGeneration,
        }),
      );
    }
    return ok(current);
  }

  private touch(at: UpdatedAt): void {
    this.state.updatedAt = at;
    this.state.revision += 1;
  }
}
