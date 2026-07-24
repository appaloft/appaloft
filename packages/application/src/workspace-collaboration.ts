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
  type WorkspaceCollaborationHandoffState,
  WorkspaceCollaborationId,
  WorkspaceCollaborationLaneId,
  type WorkspaceCollaborationLanePurpose,
  WorkspaceCollaborationName,
  WorkspaceCollaborationParticipantId,
  type WorkspaceCollaborationParticipantRole,
  type WorkspaceCollaborationState,
  WorkspaceWriterLeaseId,
  type WorkspaceWriterLeaseState,
} from "@appaloft/core";
import {
  type ExecutionContext,
  type RepositoryContext,
  toRepositoryContext,
} from "./execution-context";
import {
  type Clock,
  type EventBus,
  type IdGenerator,
  type TerminalSessionAttachmentGrant,
  type TerminalSessionGateway,
} from "./ports";
import { type SandboxAgentNativeAttachDescriptor } from "./sandbox-agent-runtime";

export interface WorkspaceCollaborationRepository {
  save(
    context: RepositoryContext,
    collaboration: WorkspaceCollaboration,
    expectedRevision: number | null,
  ): Promise<Result<void>>;
  find(context: RepositoryContext, collaborationId: string): Promise<WorkspaceCollaboration | null>;
  list(context: RepositoryContext): Promise<WorkspaceCollaboration[]>;
}

function tenantKey(context: RepositoryContext): string {
  return context.tenant?.tenantId ?? "tenant_instance";
}

export class InMemoryWorkspaceCollaborationRepository implements WorkspaceCollaborationRepository {
  private readonly collaborations = new Map<string, WorkspaceCollaboration>();

  private key(context: RepositoryContext, collaborationId: string): string {
    return `${tenantKey(context)}:${collaborationId}`;
  }

  async save(
    context: RepositoryContext,
    collaboration: WorkspaceCollaboration,
    expectedRevision: number | null,
  ): Promise<Result<void>> {
    const key = this.key(context, collaboration.id.value);
    const current = this.collaborations.get(key);
    if (expectedRevision === null) {
      if (current) {
        return err(
          domainError.conflict("Workspace Collaboration already exists", {
            collaborationId: collaboration.id.value,
          }),
        );
      }
    } else if (!current || current.toState().revision !== expectedRevision) {
      return err(
        domainError.conflict("Workspace Collaboration changed concurrently", {
          collaborationId: collaboration.id.value,
          expectedRevision,
          revision: current?.toState().revision ?? -1,
        }),
      );
    }
    this.collaborations.set(key, WorkspaceCollaboration.rehydrate(collaboration.toState()));
    return ok(undefined);
  }

  async find(
    context: RepositoryContext,
    collaborationId: string,
  ): Promise<WorkspaceCollaboration | null> {
    const found = this.collaborations.get(this.key(context, collaborationId));
    return found ? WorkspaceCollaboration.rehydrate(found.toState()) : null;
  }

  async list(context: RepositoryContext): Promise<WorkspaceCollaboration[]> {
    const prefix = `${tenantKey(context)}:`;
    return [...this.collaborations.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, collaboration]) => WorkspaceCollaboration.rehydrate(collaboration.toState()));
  }
}

export interface WorkspaceCollaborationDependencies {
  repository: WorkspaceCollaborationRepository;
  sandboxReader: {
    show(
      context: ExecutionContext,
      workspaceId: string,
    ): Promise<Result<{ sandboxId: string; status: string; createdAt: string }>>;
  };
  agentReader: {
    showRuntime(
      context: ExecutionContext,
      workspaceId: string,
      runtimeId: string,
    ): Promise<Result<{ sandboxId: string; runtimeId: string; status: string }>>;
    showSourceArtifact(
      context: ExecutionContext,
      artifactId: string,
    ): Promise<
      Result<{
        artifactId: string;
        sandboxId: string;
        digest: string;
        status: string;
      }>
    >;
  };
  eventBus: EventBus;
  clock: Clock;
  idGenerator: IdGenerator;
  terminalAccess?: Pick<TerminalSessionGateway, "advanceAttachmentFence" | "issueAttachmentAccess">;
  agentAttach?: {
    issueAttachAccess(
      context: ExecutionContext,
      input: { sandboxId: string; runtimeId: string; expiresAt: string },
    ): Promise<Result<SandboxAgentNativeAttachDescriptor>>;
  };
}

export interface WorkspaceCollaborationParticipantDescriptor {
  participantId: string;
  subject: { kind: "user"; subjectId: string } | { kind: "agent-runtime"; runtimeId: string };
  role: WorkspaceCollaborationParticipantRole;
  joinedAt: string;
}

export interface WorkspaceWriterLeaseDescriptor {
  leaseId: string;
  holderParticipantId: string;
  generation: number;
  acquiredAt: string;
  expiresAt: string;
}

export interface WorkspaceCollaborationLaneDescriptor {
  laneId: string;
  workspaceId: string;
  purpose: WorkspaceCollaborationLanePurpose;
  label: string;
  branch?: string;
  addedAt: string;
  writerLease?: WorkspaceWriterLeaseDescriptor;
}

export interface WorkspaceCollaborationHandoffDescriptor {
  handoffId: string;
  sourceLaneId: string;
  targetLaneId: string;
  artifactId: string;
  expectedDigest: string;
  status: WorkspaceCollaborationHandoffState["status"];
  offeredByParticipantId: string;
  offeredAt: string;
  resolvedByParticipantId?: string;
  resolvedAt?: string;
}

export interface WorkspaceCollaborationDescriptor {
  schemaVersion: "workspace-collaboration/v1";
  collaborationId: string;
  name: string;
  status: WorkspaceCollaborationState["status"];
  revision: number;
  participants: WorkspaceCollaborationParticipantDescriptor[];
  lanes: WorkspaceCollaborationLaneDescriptor[];
  handoffs: WorkspaceCollaborationHandoffDescriptor[];
  createdAt: string;
  updatedAt?: string;
}

export interface WorkspaceCollaborationList {
  schemaVersion: "workspace-collaborations.list/v1";
  items: WorkspaceCollaborationDescriptor[];
}

export interface WorkspaceLaneAccessAuthorization {
  schemaVersion: "workspace-collaboration.lane-access/v1";
  collaborationId: string;
  laneId: string;
  workspaceId: string;
  participantId: string;
  access: "observe" | "write";
  writerLease?: WorkspaceWriterLeaseDescriptor;
}

function writerLeaseDescriptor(lease: WorkspaceWriterLeaseState): WorkspaceWriterLeaseDescriptor {
  return {
    leaseId: lease.id.value,
    holderParticipantId: lease.holderParticipantId.value,
    generation: lease.generation,
    acquiredAt: lease.acquiredAt,
    expiresAt: lease.expiresAt.value,
  };
}

function descriptor(
  collaboration: WorkspaceCollaboration,
  now: string,
): WorkspaceCollaborationDescriptor {
  const state = collaboration.toState();
  const at = UpdatedAt.rehydrate(now);
  return {
    schemaVersion: "workspace-collaboration/v1",
    collaborationId: state.id.value,
    name: state.name.value,
    status: state.status,
    revision: state.revision,
    participants: state.participants.map((participant) => ({
      participantId: participant.id.value,
      subject:
        participant.subject.kind === "user"
          ? { ...participant.subject }
          : { kind: "agent-runtime", runtimeId: participant.subject.runtimeId.value },
      role: participant.role,
      joinedAt: participant.joinedAt,
    })),
    lanes: state.lanes
      .filter((lane) => !lane.archivedAt)
      .map((lane) => {
        const lease = collaboration.currentWriter(lane.id, at);
        return {
          laneId: lane.id.value,
          workspaceId: lane.workspaceId.value,
          purpose: lane.purpose,
          label: lane.label,
          ...(lane.branch ? { branch: lane.branch } : {}),
          addedAt: lane.addedAt,
          ...(lease ? { writerLease: writerLeaseDescriptor(lease) } : {}),
        };
      }),
    handoffs: state.handoffs.map((handoff) => ({
      handoffId: handoff.id.value,
      sourceLaneId: handoff.sourceLaneId.value,
      targetLaneId: handoff.targetLaneId.value,
      artifactId: handoff.artifactId.value,
      expectedDigest: handoff.expectedDigest.value,
      status: handoff.status,
      offeredByParticipantId: handoff.offeredBy.value,
      offeredAt: handoff.offeredAt,
      ...(handoff.resolvedBy ? { resolvedByParticipantId: handoff.resolvedBy.value } : {}),
      ...(handoff.resolvedAt ? { resolvedAt: handoff.resolvedAt } : {}),
    })),
    createdAt: state.createdAt.value,
    ...(state.updatedAt ? { updatedAt: state.updatedAt.value } : {}),
  };
}

function actorSubjectIds(context: ExecutionContext): string[] {
  return [
    context.tenant?.subjectId,
    context.principal?.userId,
    context.principal?.actorId,
    context.actor?.id,
  ].filter(
    (value, index, values): value is string => Boolean(value) && values.indexOf(value) === index,
  );
}

export class WorkspaceCollaborationService {
  constructor(private readonly dependencies: WorkspaceCollaborationDependencies) {}

  async create(
    context: ExecutionContext,
    input: {
      name: string;
      workspaceId: string;
      lanePurpose: WorkspaceCollaborationLanePurpose;
      laneLabel: string;
      branch?: string;
    },
  ): Promise<Result<WorkspaceCollaborationDescriptor>> {
    const actorSubjectId = actorSubjectIds(context)[0];
    if (!actorSubjectId) {
      return err(domainError.conflict("Workspace Collaboration requires an authenticated subject"));
    }
    const workspace = await this.dependencies.sandboxReader.show(context, input.workspaceId);
    if (workspace.isErr()) return err(workspace.error);
    if (["terminated", "expired"].includes(workspace.value.status)) {
      return err(
        domainError.conflict("Workspace Collaboration requires an active Workspace", {
          workspaceId: input.workspaceId,
          status: workspace.value.status,
        }),
      );
    }
    const now = this.dependencies.clock.now();
    const id = WorkspaceCollaborationId.create(this.dependencies.idGenerator.next("wco"));
    const participantId = WorkspaceCollaborationParticipantId.create(
      this.dependencies.idGenerator.next("wcp"),
    );
    const laneId = WorkspaceCollaborationLaneId.create(this.dependencies.idGenerator.next("wcl"));
    const name = WorkspaceCollaborationName.create(input.name);
    const sandboxId = SandboxId.create(input.workspaceId);
    const createdAt = CreatedAt.create(now);
    for (const value of [id, participantId, laneId, name, sandboxId, createdAt]) {
      if (value.isErr()) return err(value.error);
    }
    const collaboration = WorkspaceCollaboration.create({
      id: id._unsafeUnwrap(),
      name: name._unsafeUnwrap(),
      creator: {
        id: participantId._unsafeUnwrap(),
        subject: { kind: "user", subjectId: actorSubjectId },
        role: "owner",
      },
      firstLane: {
        id: laneId._unsafeUnwrap(),
        workspaceId: sandboxId._unsafeUnwrap(),
        purpose: input.lanePurpose,
        label: input.laneLabel,
        ...(input.branch ? { branch: input.branch } : {}),
      },
      createdAt: createdAt._unsafeUnwrap(),
    });
    if (collaboration.isErr()) return err(collaboration.error);
    const saved = await this.dependencies.repository.save(
      toRepositoryContext(context),
      collaboration.value,
      null,
    );
    if (saved.isErr()) return err(saved.error);
    await this.publish(context, collaboration.value);
    return ok(descriptor(collaboration.value, now));
  }

  async list(context: ExecutionContext): Promise<Result<WorkspaceCollaborationList>> {
    const collaborations = await this.dependencies.repository.list(toRepositoryContext(context));
    return ok({
      schemaVersion: "workspace-collaborations.list/v1",
      items: collaborations.map((item) => descriptor(item, this.dependencies.clock.now())),
    });
  }

  async show(
    context: ExecutionContext,
    collaborationId: string,
  ): Promise<Result<WorkspaceCollaborationDescriptor>> {
    const loaded = await this.load(context, collaborationId);
    return loaded.map((collaboration) => descriptor(collaboration, this.dependencies.clock.now()));
  }

  async addParticipant(
    context: ExecutionContext,
    collaborationId: string,
    input: {
      subject:
        | { kind: "user"; subjectId: string }
        | { kind: "agent-runtime"; runtimeId: string; workspaceId: string };
      role: WorkspaceCollaborationParticipantRole;
    },
  ): Promise<Result<WorkspaceCollaborationDescriptor>> {
    const loaded = await this.loadForMutation(context, collaborationId);
    if (loaded.isErr()) return err(loaded.error);
    const actor = this.actorParticipant(loaded.value.aggregate, context);
    if (actor.isErr()) return err(actor.error);
    if (input.subject.kind === "agent-runtime") {
      const agentSubject = input.subject;
      const runtime = await this.dependencies.agentReader.showRuntime(
        context,
        agentSubject.workspaceId,
        agentSubject.runtimeId,
      );
      if (runtime.isErr()) return err(runtime.error);
      const lane = loaded.value.aggregate
        .toState()
        .lanes.find(
          (candidate) =>
            !candidate.archivedAt && candidate.workspaceId.value === agentSubject.workspaceId,
        );
      if (!lane || runtime.value.sandboxId !== agentSubject.workspaceId) {
        return err(
          domainError.conflict("Agent Runtime must belong to a Collaboration Lane Workspace", {
            runtimeId: agentSubject.runtimeId,
            workspaceId: agentSubject.workspaceId,
          }),
        );
      }
    }
    const participantId = WorkspaceCollaborationParticipantId.create(
      this.dependencies.idGenerator.next("wcp"),
    );
    if (participantId.isErr()) return err(participantId.error);
    const changed = loaded.value.aggregate.addParticipant({
      actorId: actor.value,
      participant: {
        id: participantId.value,
        subject:
          input.subject.kind === "user"
            ? { ...input.subject }
            : {
                kind: "agent-runtime",
                runtimeId: SandboxAgentRuntimeId.rehydrate(input.subject.runtimeId),
              },
        role: input.role,
      },
      at: UpdatedAt.rehydrate(this.dependencies.clock.now()),
    });
    if (changed.isErr()) return err(changed.error);
    return this.saveMutation(context, loaded.value);
  }

  async changeParticipantRole(
    context: ExecutionContext,
    collaborationId: string,
    input: { participantId: string; role: WorkspaceCollaborationParticipantRole },
  ): Promise<Result<WorkspaceCollaborationDescriptor>> {
    const loaded = await this.loadForMutation(context, collaborationId);
    if (loaded.isErr()) return err(loaded.error);
    const actor = this.actorParticipant(loaded.value.aggregate, context);
    if (actor.isErr()) return err(actor.error);
    const changed = loaded.value.aggregate.changeParticipantRole({
      actorId: actor.value,
      participantId: WorkspaceCollaborationParticipantId.rehydrate(input.participantId),
      role: input.role,
      at: UpdatedAt.rehydrate(this.dependencies.clock.now()),
    });
    if (changed.isErr()) return err(changed.error);
    return this.saveMutation(context, loaded.value);
  }

  async removeParticipant(
    context: ExecutionContext,
    collaborationId: string,
    participantId: string,
  ): Promise<Result<WorkspaceCollaborationDescriptor>> {
    const loaded = await this.loadForMutation(context, collaborationId);
    if (loaded.isErr()) return err(loaded.error);
    const actor = this.actorParticipant(loaded.value.aggregate, context);
    if (actor.isErr()) return err(actor.error);
    const changed = loaded.value.aggregate.removeParticipant({
      actorId: actor.value,
      participantId: WorkspaceCollaborationParticipantId.rehydrate(participantId),
      at: UpdatedAt.rehydrate(this.dependencies.clock.now()),
    });
    if (changed.isErr()) return err(changed.error);
    return this.saveMutation(context, loaded.value);
  }

  async addLane(
    context: ExecutionContext,
    collaborationId: string,
    input: {
      workspaceId: string;
      purpose: WorkspaceCollaborationLanePurpose;
      label: string;
      branch?: string;
    },
  ): Promise<Result<WorkspaceCollaborationDescriptor>> {
    const workspace = await this.dependencies.sandboxReader.show(context, input.workspaceId);
    if (workspace.isErr()) return err(workspace.error);
    if (["terminated", "expired"].includes(workspace.value.status)) {
      return err(
        domainError.conflict("Collaboration Lane requires an active Workspace", {
          workspaceId: input.workspaceId,
          status: workspace.value.status,
        }),
      );
    }
    const loaded = await this.loadForMutation(context, collaborationId);
    if (loaded.isErr()) return err(loaded.error);
    const actor = this.actorParticipant(loaded.value.aggregate, context);
    if (actor.isErr()) return err(actor.error);
    const laneId = WorkspaceCollaborationLaneId.create(this.dependencies.idGenerator.next("wcl"));
    const workspaceId = SandboxId.create(input.workspaceId);
    if (laneId.isErr()) return err(laneId.error);
    if (workspaceId.isErr()) return err(workspaceId.error);
    const changed = loaded.value.aggregate.addLane({
      actorId: actor.value,
      lane: {
        id: laneId.value,
        workspaceId: workspaceId.value,
        purpose: input.purpose,
        label: input.label,
        ...(input.branch ? { branch: input.branch } : {}),
      },
      at: UpdatedAt.rehydrate(this.dependencies.clock.now()),
    });
    if (changed.isErr()) return err(changed.error);
    return this.saveMutation(context, loaded.value);
  }

  async acquireWriterLease(
    context: ExecutionContext,
    collaborationId: string,
    input: { laneId: string; expiresAt: string },
  ): Promise<Result<WorkspaceCollaborationDescriptor>> {
    const loaded = await this.loadForMutation(context, collaborationId);
    if (loaded.isErr()) return err(loaded.error);
    const actor = this.actorParticipant(loaded.value.aggregate, context);
    if (actor.isErr()) return err(actor.error);
    const laneId = WorkspaceCollaborationLaneId.create(input.laneId);
    const leaseId = WorkspaceWriterLeaseId.create(this.dependencies.idGenerator.next("wwl"));
    const expiresAt = ExpiresAt.create(input.expiresAt);
    if (laneId.isErr()) return err(laneId.error);
    if (leaseId.isErr()) return err(leaseId.error);
    if (expiresAt.isErr()) return err(expiresAt.error);
    const changed = loaded.value.aggregate.acquireWriterLease({
      actorId: actor.value,
      laneId: laneId.value,
      leaseId: leaseId.value,
      expiresAt: expiresAt.value,
      at: UpdatedAt.rehydrate(this.dependencies.clock.now()),
    });
    if (changed.isErr()) return err(changed.error);
    const saved = await this.saveMutation(context, loaded.value);
    this.advanceFenceFromDescriptor(saved, input.laneId);
    return saved;
  }

  async renewWriterLease(
    context: ExecutionContext,
    collaborationId: string,
    input: {
      laneId: string;
      expectedGeneration: number;
      expiresAt: string;
    },
  ): Promise<Result<WorkspaceCollaborationDescriptor>> {
    const loaded = await this.loadForMutation(context, collaborationId);
    if (loaded.isErr()) return err(loaded.error);
    const actor = this.actorParticipant(loaded.value.aggregate, context);
    if (actor.isErr()) return err(actor.error);
    const expiresAt = ExpiresAt.create(input.expiresAt);
    if (expiresAt.isErr()) return err(expiresAt.error);
    const changed = loaded.value.aggregate.renewWriterLease({
      actorId: actor.value,
      laneId: WorkspaceCollaborationLaneId.rehydrate(input.laneId),
      expectedGeneration: input.expectedGeneration,
      expiresAt: expiresAt.value,
      at: UpdatedAt.rehydrate(this.dependencies.clock.now()),
    });
    if (changed.isErr()) return err(changed.error);
    const saved = await this.saveMutation(context, loaded.value);
    this.advanceFenceFromDescriptor(saved, input.laneId);
    return saved;
  }

  async transferWriterLease(
    context: ExecutionContext,
    collaborationId: string,
    input: {
      laneId: string;
      expectedGeneration: number;
      toParticipantId: string;
      expiresAt: string;
    },
  ): Promise<Result<WorkspaceCollaborationDescriptor>> {
    const loaded = await this.loadForMutation(context, collaborationId);
    if (loaded.isErr()) return err(loaded.error);
    const actor = this.actorParticipant(loaded.value.aggregate, context);
    if (actor.isErr()) return err(actor.error);
    const expiresAt = ExpiresAt.create(input.expiresAt);
    if (expiresAt.isErr()) return err(expiresAt.error);
    const changed = loaded.value.aggregate.transferWriterLease({
      actorId: actor.value,
      laneId: WorkspaceCollaborationLaneId.rehydrate(input.laneId),
      expectedGeneration: input.expectedGeneration,
      toParticipantId: WorkspaceCollaborationParticipantId.rehydrate(input.toParticipantId),
      leaseId: WorkspaceWriterLeaseId.rehydrate(this.dependencies.idGenerator.next("wwl")),
      expiresAt: expiresAt.value,
      at: UpdatedAt.rehydrate(this.dependencies.clock.now()),
    });
    if (changed.isErr()) return err(changed.error);
    const saved = await this.saveMutation(context, loaded.value);
    this.advanceFenceFromDescriptor(saved, input.laneId);
    return saved;
  }

  async releaseWriterLease(
    context: ExecutionContext,
    collaborationId: string,
    input: { laneId: string; expectedGeneration: number },
  ): Promise<Result<WorkspaceCollaborationDescriptor>> {
    const loaded = await this.loadForMutation(context, collaborationId);
    if (loaded.isErr()) return err(loaded.error);
    const actor = this.actorParticipant(loaded.value.aggregate, context);
    if (actor.isErr()) return err(actor.error);
    const changed = loaded.value.aggregate.releaseWriterLease({
      actorId: actor.value,
      laneId: WorkspaceCollaborationLaneId.rehydrate(input.laneId),
      expectedGeneration: input.expectedGeneration,
      at: UpdatedAt.rehydrate(this.dependencies.clock.now()),
    });
    if (changed.isErr()) return err(changed.error);
    const saved = await this.saveMutation(context, loaded.value);
    if (saved.isOk()) {
      this.dependencies.terminalAccess?.advanceAttachmentFence?.({
        collaborationId,
        laneId: input.laneId,
        generation: input.expectedGeneration + 1,
      });
    }
    return saved;
  }

  async archiveLane(
    context: ExecutionContext,
    collaborationId: string,
    laneId: string,
  ): Promise<Result<WorkspaceCollaborationDescriptor>> {
    const loaded = await this.loadForMutation(context, collaborationId);
    if (loaded.isErr()) return err(loaded.error);
    const actor = this.actorParticipant(loaded.value.aggregate, context);
    if (actor.isErr()) return err(actor.error);
    const changed = loaded.value.aggregate.archiveLane({
      actorId: actor.value,
      laneId: WorkspaceCollaborationLaneId.rehydrate(laneId),
      at: UpdatedAt.rehydrate(this.dependencies.clock.now()),
    });
    if (changed.isErr()) return err(changed.error);
    return this.saveMutation(context, loaded.value);
  }

  async offerHandoff(
    context: ExecutionContext,
    collaborationId: string,
    input: {
      sourceLaneId: string;
      targetLaneId: string;
      artifactId: string;
      expectedDigest: string;
    },
  ): Promise<Result<WorkspaceCollaborationDescriptor>> {
    const loaded = await this.loadForMutation(context, collaborationId);
    if (loaded.isErr()) return err(loaded.error);
    const actor = this.actorParticipant(loaded.value.aggregate, context);
    if (actor.isErr()) return err(actor.error);
    const state = loaded.value.aggregate.toState();
    const sourceLane = state.lanes.find(
      (lane) => lane.id.value === input.sourceLaneId && !lane.archivedAt,
    );
    if (!sourceLane) {
      return err(domainError.notFound("WorkspaceCollaborationLane", input.sourceLaneId));
    }
    const artifact = await this.dependencies.agentReader.showSourceArtifact(
      context,
      input.artifactId,
    );
    if (artifact.isErr()) return err(artifact.error);
    if (
      artifact.value.sandboxId !== sourceLane.workspaceId.value ||
      artifact.value.digest !== input.expectedDigest ||
      artifact.value.status !== "available"
    ) {
      return err(
        domainError.conflict("Source Artifact does not match the handoff source and digest", {
          artifactId: input.artifactId,
          sourceWorkspaceId: sourceLane.workspaceId.value,
          artifactWorkspaceId: artifact.value.sandboxId,
          artifactStatus: artifact.value.status,
        }),
      );
    }
    const digest = SourceArtifactDigest.create(input.expectedDigest);
    const artifactId = SourceArtifactId.create(input.artifactId);
    if (digest.isErr()) return err(digest.error);
    if (artifactId.isErr()) return err(artifactId.error);
    const changed = loaded.value.aggregate.offerHandoff({
      actorId: actor.value,
      handoffId: WorkspaceCollaborationHandoffId.rehydrate(
        this.dependencies.idGenerator.next("wch"),
      ),
      sourceLaneId: WorkspaceCollaborationLaneId.rehydrate(input.sourceLaneId),
      targetLaneId: WorkspaceCollaborationLaneId.rehydrate(input.targetLaneId),
      artifactId: artifactId.value,
      expectedDigest: digest.value,
      at: UpdatedAt.rehydrate(this.dependencies.clock.now()),
    });
    if (changed.isErr()) return err(changed.error);
    return this.saveMutation(context, loaded.value);
  }

  async resolveHandoff(
    context: ExecutionContext,
    collaborationId: string,
    input: { handoffId: string; decision: "accept" | "reject" },
  ): Promise<Result<WorkspaceCollaborationDescriptor>> {
    const loaded = await this.loadForMutation(context, collaborationId);
    if (loaded.isErr()) return err(loaded.error);
    const actor = this.actorParticipant(loaded.value.aggregate, context);
    if (actor.isErr()) return err(actor.error);
    const changed = loaded.value.aggregate.resolveHandoff({
      actorId: actor.value,
      handoffId: WorkspaceCollaborationHandoffId.rehydrate(input.handoffId),
      decision: input.decision,
      at: UpdatedAt.rehydrate(this.dependencies.clock.now()),
    });
    if (changed.isErr()) return err(changed.error);
    return this.saveMutation(context, loaded.value);
  }

  async close(
    context: ExecutionContext,
    collaborationId: string,
  ): Promise<Result<WorkspaceCollaborationDescriptor>> {
    const loaded = await this.loadForMutation(context, collaborationId);
    if (loaded.isErr()) return err(loaded.error);
    const actor = this.actorParticipant(loaded.value.aggregate, context);
    if (actor.isErr()) return err(actor.error);
    const changed = loaded.value.aggregate.close({
      actorId: actor.value,
      at: UpdatedAt.rehydrate(this.dependencies.clock.now()),
    });
    if (changed.isErr()) return err(changed.error);
    return this.saveMutation(context, loaded.value);
  }

  async authorizeLaneAccess(
    context: ExecutionContext,
    input: {
      collaborationId: string;
      laneId: string;
      access: "observe" | "write";
      expectedGeneration?: number;
    },
  ): Promise<Result<WorkspaceLaneAccessAuthorization>> {
    const loaded = await this.load(context, input.collaborationId);
    if (loaded.isErr()) return err(loaded.error);
    const actor = this.actorParticipant(loaded.value, context);
    if (actor.isErr()) return err(actor.error);
    const state = loaded.value.toState();
    const lane = state.lanes.find(
      (candidate) => candidate.id.value === input.laneId && !candidate.archivedAt,
    );
    if (!lane) return err(domainError.notFound("WorkspaceCollaborationLane", input.laneId));
    if (input.access === "observe") {
      return ok({
        schemaVersion: "workspace-collaboration.lane-access/v1",
        collaborationId: input.collaborationId,
        laneId: input.laneId,
        workspaceId: lane.workspaceId.value,
        participantId: actor.value.value,
        access: "observe",
      });
    }
    const current = loaded.value.currentWriter(
      lane.id,
      UpdatedAt.rehydrate(this.dependencies.clock.now()),
    );
    if (
      !current ||
      current.holderParticipantId.value !== actor.value.value ||
      current.generation !== input.expectedGeneration
    ) {
      return err(
        domainError.conflict("Current writer lease is required for Lane write access", {
          laneId: input.laneId,
          participantId: actor.value.value,
          generation: current?.generation ?? 0,
          expectedGeneration: input.expectedGeneration ?? 0,
        }),
      );
    }
    return ok({
      schemaVersion: "workspace-collaboration.lane-access/v1",
      collaborationId: input.collaborationId,
      laneId: input.laneId,
      workspaceId: lane.workspaceId.value,
      participantId: actor.value.value,
      access: "write",
      writerLease: writerLeaseDescriptor(current),
    });
  }

  async issueTerminalAccess(
    context: ExecutionContext,
    input: {
      collaborationId: string;
      laneId: string;
      sessionId: string;
      access: "observe" | "write";
      expectedGeneration?: number;
    },
  ): Promise<Result<TerminalSessionAttachmentGrant>> {
    const terminalAccess = this.dependencies.terminalAccess;
    if (!terminalAccess?.issueAttachmentAccess) {
      return err(
        domainError.terminalSessionNotConfigured(
          "Workspace Collaboration terminal attachment issuer is unavailable",
          {
            collaborationId: input.collaborationId,
            laneId: input.laneId,
          },
        ),
      );
    }
    const authorized = await this.authorizeLaneAccess(context, {
      collaborationId: input.collaborationId,
      laneId: input.laneId,
      access: input.access,
      ...(input.expectedGeneration !== undefined
        ? { expectedGeneration: input.expectedGeneration }
        : {}),
    });
    if (authorized.isErr()) return err(authorized.error);
    return terminalAccess.issueAttachmentAccess({
      sessionId: input.sessionId,
      access: input.access,
      collaborationId: input.collaborationId,
      laneId: input.laneId,
      workspaceId: authorized.value.workspaceId,
      participantId: authorized.value.participantId,
      ...(authorized.value.writerLease
        ? { writerLeaseGeneration: authorized.value.writerLease.generation }
        : {}),
    });
  }

  async issueNativeAgentAttach(
    context: ExecutionContext,
    input: {
      collaborationId: string;
      laneId: string;
      runtimeId: string;
      expiresAt: string;
      expectedGeneration: number;
    },
  ): Promise<Result<SandboxAgentNativeAttachDescriptor>> {
    if (!this.dependencies.agentAttach) {
      return err(
        domainError.conflict("Workspace Collaboration native agent attach is unavailable", {
          collaborationId: input.collaborationId,
          laneId: input.laneId,
        }),
      );
    }
    const authorized = await this.authorizeLaneAccess(context, {
      collaborationId: input.collaborationId,
      laneId: input.laneId,
      access: "write",
      expectedGeneration: input.expectedGeneration,
    });
    if (authorized.isErr()) return err(authorized.error);
    return this.dependencies.agentAttach.issueAttachAccess(context, {
      sandboxId: authorized.value.workspaceId,
      runtimeId: input.runtimeId,
      expiresAt: input.expiresAt,
    });
  }

  private async load(
    context: ExecutionContext,
    collaborationId: string,
  ): Promise<Result<WorkspaceCollaboration>> {
    const collaboration = await this.dependencies.repository.find(
      toRepositoryContext(context),
      collaborationId,
    );
    return collaboration
      ? ok(collaboration)
      : err(domainError.notFound("WorkspaceCollaboration", collaborationId));
  }

  private async loadForMutation(
    context: ExecutionContext,
    collaborationId: string,
  ): Promise<
    Result<{
      aggregate: WorkspaceCollaboration;
      expectedRevision: number;
    }>
  > {
    return (await this.load(context, collaborationId)).map((aggregate) => ({
      expectedRevision: aggregate.toState().revision,
      aggregate,
    }));
  }

  private actorParticipant(
    collaboration: WorkspaceCollaboration,
    context: ExecutionContext,
  ): Result<WorkspaceCollaborationParticipantId> {
    const subjects = actorSubjectIds(context);
    const participant = collaboration
      .toState()
      .participants.find((candidate) =>
        candidate.subject.kind === "user"
          ? subjects.includes(candidate.subject.subjectId)
          : subjects.includes(candidate.subject.runtimeId.value),
      );
    return participant
      ? ok(participant.id)
      : err(
          domainError.conflict("Actor is not a Workspace Collaboration participant", {
            collaborationId: collaboration.id.value,
          }),
        );
  }

  private async saveMutation(
    context: ExecutionContext,
    loaded: { aggregate: WorkspaceCollaboration; expectedRevision: number },
  ): Promise<Result<WorkspaceCollaborationDescriptor>> {
    const saved = await this.dependencies.repository.save(
      toRepositoryContext(context),
      loaded.aggregate,
      loaded.expectedRevision,
    );
    if (saved.isErr()) return err(saved.error);
    await this.publish(context, loaded.aggregate);
    return ok(descriptor(loaded.aggregate, this.dependencies.clock.now()));
  }

  private async publish(
    context: ExecutionContext,
    collaboration: WorkspaceCollaboration,
  ): Promise<void> {
    const events = collaboration.pullDomainEvents();
    if (events.length > 0) await this.dependencies.eventBus.publish(context, events);
  }

  private advanceFenceFromDescriptor(
    result: Result<WorkspaceCollaborationDescriptor>,
    laneId: string,
  ): void {
    if (result.isErr()) return;
    const generation = result.value.lanes.find((lane) => lane.laneId === laneId)?.writerLease
      ?.generation;
    if (generation === undefined) return;
    this.dependencies.terminalAccess?.advanceAttachmentFence?.({
      collaborationId: result.value.collaborationId,
      laneId,
      generation,
    });
  }
}
