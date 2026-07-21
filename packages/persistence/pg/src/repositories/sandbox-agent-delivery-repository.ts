import {
  type CandidatePreviewRecord,
  type RepositoryContext,
  type SandboxAgentDeliveryRepository,
  type SandboxAgentRunEventRecord,
  type SandboxAgentRunRecord,
  type SandboxAgentRuntimeRecord,
} from "@appaloft/application";
import {
  AgentHarnessTemplateId,
  AgentRunContext,
  AgentRunOutcomeDigest,
  AgentTaskDigest,
  CreatedAt,
  ExpiresAt,
  PromotionCandidatePreviewId,
  PromotionDeploymentId,
  PromotionIdempotencyKey,
  PromotionResourceId,
  SandboxAgentApproval,
  SandboxAgentApprovalId,
  SandboxAgentApprovalRequestDigest,
  SandboxAgentRun,
  SandboxAgentRunId,
  SandboxAgentRunStatusValue,
  SandboxAgentRuntime,
  SandboxAgentRuntimeId,
  SandboxAgentRuntimeStatusValue,
  SandboxId,
  SandboxPromotion,
  SandboxPromotionId,
  SandboxPromotionStatusValue,
  SandboxPromotionTarget,
  SourceArtifact,
  SourceArtifactDigest,
  SourceArtifactId,
  SourceArtifactManifest,
  SourceArtifactReferenceCount,
  SourceArtifactRoot,
  SourceArtifactStatusValue,
  SourceArtifactStoreReference,
  UpdatedAt,
  WorkspaceRevision,
} from "@appaloft/core";
import { type Kysely, type Selectable, sql } from "kysely";
import { type Database } from "../schema";
import { normalizeTimestamp, resolveRepositoryExecutor } from "./shared";

type RuntimeRow = Selectable<Database["sandbox_agent_runtimes"]>;
type RunRow = Selectable<Database["sandbox_agent_runs"]>;
type EventRow = Selectable<Database["sandbox_agent_run_events"]>;
type ApprovalRow = Selectable<Database["sandbox_agent_approvals"]>;
type ArtifactRow = Selectable<Database["sandbox_source_artifacts"]>;
type PreviewRow = Selectable<Database["sandbox_candidate_previews"]>;
type PromotionRow = Selectable<Database["sandbox_promotions"]>;

const tenantId = (context: RepositoryContext) => context.tenant?.tenantId ?? "tenant_instance";
const json = <T>(value: unknown): T => (typeof value === "string" ? JSON.parse(value) : value) as T;
const timestamp = (value: string | Date | null | undefined): string => {
  const normalized = normalizeTimestamp(value);
  if (!normalized) throw new Error("Sandbox Agent delivery timestamp is missing");
  return normalized;
};

type RuntimeJson = { harnessTemplateId: string; activeRunId?: string };
function runtimeRecord(row: RuntimeRow): SandboxAgentRuntimeRecord {
  const state = json<RuntimeJson>(row.state);
  return {
    runtime: SandboxAgentRuntime.rehydrate({
      id: SandboxAgentRuntimeId.rehydrate(row.id),
      sandboxId: SandboxId.rehydrate(row.sandbox_id),
      harnessTemplateId: AgentHarnessTemplateId.rehydrate(state.harnessTemplateId),
      status: SandboxAgentRuntimeStatusValue.rehydrate(
        row.status as Parameters<typeof SandboxAgentRuntimeStatusValue.rehydrate>[0],
      ),
      createdAt: CreatedAt.rehydrate(timestamp(row.created_at)),
      updatedAt: UpdatedAt.rehydrate(timestamp(row.updated_at)),
      ...(state.activeRunId ? { activeRunId: SandboxAgentRunId.rehydrate(state.activeRunId) } : {}),
    }),
    harnessKey: row.harness_key,
    idempotencyKey: row.idempotency_key,
  };
}

type RunJson = {
  context: { mode: "fresh" } | { mode: "continue"; parentRunId: string };
  taskDigest: string;
  outcomeDigest?: string;
};
function runRecord(row: RunRow): SandboxAgentRunRecord {
  const state = json<RunJson>(row.state);
  return {
    run: SandboxAgentRun.rehydrate({
      id: SandboxAgentRunId.rehydrate(row.id),
      runtimeId: SandboxAgentRuntimeId.rehydrate(row.runtime_id),
      context: AgentRunContext.rehydrate(
        state.context.mode === "fresh"
          ? { mode: "fresh" }
          : {
              mode: "continue",
              parentRunId: SandboxAgentRunId.rehydrate(state.context.parentRunId),
            },
      ),
      taskDigest: AgentTaskDigest.rehydrate(state.taskDigest),
      status: SandboxAgentRunStatusValue.rehydrate(
        row.status as Parameters<typeof SandboxAgentRunStatusValue.rehydrate>[0],
      ),
      createdAt: CreatedAt.rehydrate(timestamp(row.created_at)),
      updatedAt: UpdatedAt.rehydrate(timestamp(row.updated_at)),
      ...(state.outcomeDigest
        ? { outcomeDigest: AgentRunOutcomeDigest.rehydrate(state.outcomeDigest) }
        : {}),
    }),
    sandboxId: row.sandbox_id,
    taskEnvelope: row.task_envelope,
    idempotencyKey: row.idempotency_key,
  };
}

type ArtifactJson = {
  manifest: ReturnType<SourceArtifactManifest["entries"]>;
  sourceRoot: string;
  workspaceRevision: string;
  storeReference: string;
  referenceCount: number;
};
function artifact(row: ArtifactRow): SourceArtifact {
  const state = json<ArtifactJson>(row.state);
  return SourceArtifact.rehydrate({
    id: SourceArtifactId.rehydrate(row.id),
    sandboxId: SandboxId.rehydrate(row.sandbox_id),
    digest: SourceArtifactDigest.rehydrate(row.digest),
    manifest: SourceArtifactManifest.rehydrate(state.manifest),
    sourceRoot: SourceArtifactRoot.rehydrate(state.sourceRoot),
    workspaceRevision: WorkspaceRevision.rehydrate(state.workspaceRevision),
    storeReference: SourceArtifactStoreReference.rehydrate(state.storeReference),
    status: SourceArtifactStatusValue.rehydrate(
      row.status as Parameters<typeof SourceArtifactStatusValue.rehydrate>[0],
    ),
    referenceCount: SourceArtifactReferenceCount.rehydrate(state.referenceCount),
    createdAt: CreatedAt.rehydrate(timestamp(row.created_at)),
  });
}

type PromotionJson = {
  candidatePreviewId: string;
  target: ReturnType<SandboxPromotionTarget["toState"]>;
  acceptedIdempotencyKey?: string;
  resourceId?: string;
  deploymentId?: string;
};
function promotion(row: PromotionRow): SandboxPromotion {
  const state = json<PromotionJson>(row.state);
  return SandboxPromotion.rehydrate({
    id: SandboxPromotionId.rehydrate(row.id),
    sandboxId: SandboxId.rehydrate(row.sandbox_id),
    artifactId: SourceArtifactId.rehydrate(row.artifact_id),
    artifactDigest: SourceArtifactDigest.rehydrate(row.artifact_digest),
    candidatePreviewId: PromotionCandidatePreviewId.rehydrate(state.candidatePreviewId),
    target: SandboxPromotionTarget.rehydrate(state.target),
    status: SandboxPromotionStatusValue.rehydrate(
      row.status as Parameters<typeof SandboxPromotionStatusValue.rehydrate>[0],
    ),
    createdAt: CreatedAt.rehydrate(timestamp(row.created_at)),
    updatedAt: UpdatedAt.rehydrate(timestamp(row.updated_at)),
    expiresAt: ExpiresAt.rehydrate(timestamp(row.expires_at)),
    ...(state.acceptedIdempotencyKey
      ? { acceptedIdempotencyKey: PromotionIdempotencyKey.rehydrate(state.acceptedIdempotencyKey) }
      : {}),
    ...(state.resourceId ? { resourceId: PromotionResourceId.rehydrate(state.resourceId) } : {}),
    ...(state.deploymentId
      ? { deploymentId: PromotionDeploymentId.rehydrate(state.deploymentId) }
      : {}),
  });
}

function eventRecord(row: EventRow): SandboxAgentRunEventRecord {
  return {
    eventId: row.event_id,
    runId: row.run_id,
    sequence: row.sequence,
    type: row.type,
    data: json(row.data),
    createdAt: timestamp(row.created_at),
  };
}
function approval(row: ApprovalRow): SandboxAgentApproval {
  const state = json<{ destination?: string; resolvedBy?: string }>(row.state);
  return SandboxAgentApproval.rehydrate({
    id: SandboxAgentApprovalId.rehydrate(row.id),
    runtimeId: SandboxAgentRuntimeId.rehydrate(row.runtime_id),
    runId: SandboxAgentRunId.rehydrate(row.run_id),
    sandboxId: row.sandbox_id,
    capability: row.capability as Parameters<typeof SandboxAgentApproval.create>[0]["capability"],
    requestDigest: SandboxAgentApprovalRequestDigest.rehydrate(row.request_digest),
    status: row.status as Parameters<typeof SandboxAgentApproval.rehydrate>[0]["status"],
    createdAt: CreatedAt.rehydrate(timestamp(row.created_at)),
    updatedAt: UpdatedAt.rehydrate(timestamp(row.updated_at)),
    expiresAt: ExpiresAt.rehydrate(timestamp(row.expires_at)),
    ...(state.destination ? { destination: state.destination } : {}),
    ...(state.resolvedBy ? { resolvedBy: state.resolvedBy } : {}),
  });
}
function previewRecord(row: PreviewRow): CandidatePreviewRecord {
  const state = json<{ url?: string; verified: boolean }>(row.state);
  return {
    previewId: row.id,
    artifactId: row.artifact_id,
    artifactDigest: row.artifact_digest,
    status: row.status as CandidatePreviewRecord["status"],
    expiresAt: timestamp(row.expires_at),
    verified: state.verified,
    ...(state.url ? { url: state.url } : {}),
  };
}

export class PgSandboxAgentDeliveryRepository implements SandboxAgentDeliveryRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async saveRuntime(context: RepositoryContext, record: SandboxAgentRuntimeRecord): Promise<void> {
    const state = record.runtime.toState();
    await resolveRepositoryExecutor(this.db, context)
      .insertInto("sandbox_agent_runtimes")
      .values({
        tenant_id: tenantId(context),
        id: state.id.value,
        sandbox_id: state.sandboxId.value,
        harness_key: record.harnessKey,
        idempotency_key: record.idempotencyKey,
        status: state.status.value,
        state: {
          harnessTemplateId: state.harnessTemplateId.value,
          ...(state.activeRunId ? { activeRunId: state.activeRunId.value } : {}),
        },
        created_at: state.createdAt.value,
        updated_at: state.updatedAt?.value ?? state.createdAt.value,
      })
      .onConflict((conflict) =>
        conflict.columns(["tenant_id", "id"]).doUpdateSet({
          status: state.status.value,
          state: {
            harnessTemplateId: state.harnessTemplateId.value,
            ...(state.activeRunId ? { activeRunId: state.activeRunId.value } : {}),
          },
          updated_at: state.updatedAt?.value ?? state.createdAt.value,
        }),
      )
      .execute();
  }
  async claimRuntime(context: RepositoryContext, record: SandboxAgentRuntimeRecord) {
    const state = record.runtime.toState();
    const requestedRunId = state.activeRunId?.value;
    if (!requestedRunId) return { claimed: false };
    const result = await resolveRepositoryExecutor(this.db, context)
      .updateTable("sandbox_agent_runtimes")
      .set({
        status: state.status.value,
        state: {
          harnessTemplateId: state.harnessTemplateId.value,
          activeRunId: requestedRunId,
        },
        updated_at: state.updatedAt?.value ?? state.createdAt.value,
      })
      .where("tenant_id", "=", tenantId(context))
      .where("id", "=", state.id.value)
      .where((expression) =>
        expression.or([
          sql<boolean>`state ->> 'activeRunId' IS NULL`,
          sql<boolean>`state ->> 'activeRunId' = ${requestedRunId}`,
        ]),
      )
      .executeTakeFirst();
    if (result.numUpdatedRows > 0n) return { claimed: true, activeRunId: requestedRunId };
    const current = await this.findRuntime(context, state.id.value);
    const activeRunId = current?.runtime.toState().activeRunId?.value;
    return {
      claimed: false,
      ...(activeRunId ? { activeRunId } : {}),
    };
  }
  async findRuntime(context: RepositoryContext, id: string) {
    const row = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("sandbox_agent_runtimes")
      .selectAll()
      .where("tenant_id", "=", tenantId(context))
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? runtimeRecord(row) : null;
  }
  async listRuntimes(context: RepositoryContext, sandboxId: string) {
    return (
      await resolveRepositoryExecutor(this.db, context)
        .selectFrom("sandbox_agent_runtimes")
        .selectAll()
        .where("tenant_id", "=", tenantId(context))
        .where("sandbox_id", "=", sandboxId)
        .orderBy("created_at", "desc")
        .execute()
    ).map(runtimeRecord);
  }
  async findRuntimeByIdempotencyKey(context: RepositoryContext, sandboxId: string, key: string) {
    const row = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("sandbox_agent_runtimes")
      .selectAll()
      .where("tenant_id", "=", tenantId(context))
      .where("sandbox_id", "=", sandboxId)
      .where("idempotency_key", "=", key)
      .executeTakeFirst();
    return row ? runtimeRecord(row) : null;
  }

  async saveRun(context: RepositoryContext, record: SandboxAgentRunRecord): Promise<void> {
    const state = record.run.toState();
    const runContext = state.context.toState();
    const serialized = {
      context:
        runContext.mode === "fresh"
          ? { mode: "fresh" as const }
          : { mode: "continue" as const, parentRunId: runContext.parentRunId.value },
      taskDigest: state.taskDigest.value,
      ...(state.outcomeDigest ? { outcomeDigest: state.outcomeDigest.value } : {}),
    };
    await resolveRepositoryExecutor(this.db, context)
      .insertInto("sandbox_agent_runs")
      .values({
        tenant_id: tenantId(context),
        id: state.id.value,
        runtime_id: state.runtimeId.value,
        sandbox_id: record.sandboxId,
        idempotency_key: record.idempotencyKey,
        status: state.status.value,
        task_envelope: record.taskEnvelope,
        state: serialized,
        created_at: state.createdAt.value,
        updated_at: state.updatedAt?.value ?? state.createdAt.value,
      })
      .onConflict((conflict) =>
        conflict.columns(["tenant_id", "id"]).doUpdateSet({
          status: state.status.value,
          state: serialized,
          updated_at: state.updatedAt?.value ?? state.createdAt.value,
        }),
      )
      .execute();
  }
  async findRun(context: RepositoryContext, id: string) {
    const row = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("sandbox_agent_runs")
      .selectAll()
      .where("tenant_id", "=", tenantId(context))
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? runRecord(row) : null;
  }
  async listRuns(context: RepositoryContext, runtimeId: string) {
    return (
      await resolveRepositoryExecutor(this.db, context)
        .selectFrom("sandbox_agent_runs")
        .selectAll()
        .where("tenant_id", "=", tenantId(context))
        .where("runtime_id", "=", runtimeId)
        .orderBy("created_at", "desc")
        .execute()
    ).map(runRecord);
  }
  async findRunByIdempotencyKey(context: RepositoryContext, runtimeId: string, key: string) {
    const row = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("sandbox_agent_runs")
      .selectAll()
      .where("tenant_id", "=", tenantId(context))
      .where("runtime_id", "=", runtimeId)
      .where("idempotency_key", "=", key)
      .executeTakeFirst();
    return row ? runRecord(row) : null;
  }
  async appendRunEvents(
    context: RepositoryContext,
    _runId: string,
    events: readonly SandboxAgentRunEventRecord[],
  ) {
    if (events.length === 0) return;
    await resolveRepositoryExecutor(this.db, context)
      .insertInto("sandbox_agent_run_events")
      .values(
        events.map((event) => ({
          tenant_id: tenantId(context),
          event_id: event.eventId,
          run_id: event.runId,
          sequence: event.sequence,
          type: event.type,
          data: event.data,
          created_at: event.createdAt,
        })),
      )
      .onConflict((conflict) => conflict.columns(["tenant_id", "event_id"]).doNothing())
      .execute();
  }
  async listRunEvents(context: RepositoryContext, runId: string) {
    return (
      await resolveRepositoryExecutor(this.db, context)
        .selectFrom("sandbox_agent_run_events")
        .selectAll()
        .where("tenant_id", "=", tenantId(context))
        .where("run_id", "=", runId)
        .orderBy("sequence", "asc")
        .execute()
    ).map(eventRecord);
  }

  async saveApproval(context: RepositoryContext, value: SandboxAgentApproval) {
    const state = value.toState();
    const serialized = {
      ...(state.destination ? { destination: state.destination } : {}),
      ...(state.resolvedBy ? { resolvedBy: state.resolvedBy } : {}),
    };
    await resolveRepositoryExecutor(this.db, context)
      .insertInto("sandbox_agent_approvals")
      .values({
        tenant_id: tenantId(context),
        id: state.id.value,
        runtime_id: state.runtimeId.value,
        run_id: state.runId.value,
        sandbox_id: state.sandboxId,
        capability: state.capability,
        request_digest: state.requestDigest.value,
        status: state.status,
        state: serialized,
        created_at: state.createdAt.value,
        updated_at: state.updatedAt?.value ?? state.createdAt.value,
        expires_at: state.expiresAt.value,
      })
      .onConflict((conflict) =>
        conflict.columns(["tenant_id", "id"]).doUpdateSet({
          status: state.status,
          state: serialized,
          updated_at: state.updatedAt?.value ?? state.createdAt.value,
        }),
      )
      .execute();
  }
  async findApproval(context: RepositoryContext, id: string) {
    const row = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("sandbox_agent_approvals")
      .selectAll()
      .where("tenant_id", "=", tenantId(context))
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? approval(row) : null;
  }
  async findApprovalByRequest(context: RepositoryContext, runId: string, requestDigest: string) {
    const row = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("sandbox_agent_approvals")
      .selectAll()
      .where("tenant_id", "=", tenantId(context))
      .where("run_id", "=", runId)
      .where("request_digest", "=", requestDigest)
      .executeTakeFirst();
    return row ? approval(row) : null;
  }
  async listApprovals(context: RepositoryContext, runId: string) {
    return (
      await resolveRepositoryExecutor(this.db, context)
        .selectFrom("sandbox_agent_approvals")
        .selectAll()
        .where("tenant_id", "=", tenantId(context))
        .where("run_id", "=", runId)
        .orderBy("created_at", "desc")
        .execute()
    ).map(approval);
  }

  async saveArtifact(context: RepositoryContext, value: SourceArtifact) {
    const state = value.toState();
    const serialized = {
      manifest: state.manifest.entries(),
      sourceRoot: state.sourceRoot.value,
      workspaceRevision: state.workspaceRevision.value,
      storeReference: state.storeReference.value,
      referenceCount: state.referenceCount.value,
    };
    await resolveRepositoryExecutor(this.db, context)
      .insertInto("sandbox_source_artifacts")
      .values({
        tenant_id: tenantId(context),
        id: state.id.value,
        sandbox_id: state.sandboxId.value,
        digest: state.digest.value,
        status: state.status.value,
        state: serialized,
        created_at: state.createdAt.value,
      })
      .onConflict((conflict) =>
        conflict
          .columns(["tenant_id", "id"])
          .doUpdateSet({ status: state.status.value, state: serialized }),
      )
      .execute();
  }
  async findArtifact(context: RepositoryContext, id: string) {
    const row = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("sandbox_source_artifacts")
      .selectAll()
      .where("tenant_id", "=", tenantId(context))
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? artifact(row) : null;
  }
  async findArtifactByDigest(context: RepositoryContext, sandboxId: string, digest: string) {
    const row = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("sandbox_source_artifacts")
      .selectAll()
      .where("tenant_id", "=", tenantId(context))
      .where("sandbox_id", "=", sandboxId)
      .where("digest", "=", digest)
      .executeTakeFirst();
    return row ? artifact(row) : null;
  }
  async listArtifacts(context: RepositoryContext, sandboxId: string) {
    return (
      await resolveRepositoryExecutor(this.db, context)
        .selectFrom("sandbox_source_artifacts")
        .selectAll()
        .where("tenant_id", "=", tenantId(context))
        .where("sandbox_id", "=", sandboxId)
        .orderBy("created_at", "desc")
        .execute()
    ).map(artifact);
  }

  async savePreview(context: RepositoryContext, value: CandidatePreviewRecord) {
    await resolveRepositoryExecutor(this.db, context)
      .insertInto("sandbox_candidate_previews")
      .values({
        tenant_id: tenantId(context),
        id: value.previewId,
        artifact_id: value.artifactId,
        artifact_digest: value.artifactDigest,
        status: value.status,
        state: { verified: value.verified, ...(value.url ? { url: value.url } : {}) },
        expires_at: value.expiresAt,
      })
      .onConflict((conflict) =>
        conflict.columns(["tenant_id", "id"]).doUpdateSet({
          status: value.status,
          state: { verified: value.verified, ...(value.url ? { url: value.url } : {}) },
          expires_at: value.expiresAt,
        }),
      )
      .execute();
  }
  async findPreview(context: RepositoryContext, id: string) {
    const row = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("sandbox_candidate_previews")
      .selectAll()
      .where("tenant_id", "=", tenantId(context))
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? previewRecord(row) : null;
  }

  async savePromotion(context: RepositoryContext, value: SandboxPromotion) {
    const state = value.toState();
    const serialized = {
      candidatePreviewId: state.candidatePreviewId.value,
      target: state.target.toState(),
      ...(state.acceptedIdempotencyKey
        ? { acceptedIdempotencyKey: state.acceptedIdempotencyKey.value }
        : {}),
      ...(state.resourceId ? { resourceId: state.resourceId.value } : {}),
      ...(state.deploymentId ? { deploymentId: state.deploymentId.value } : {}),
    };
    await resolveRepositoryExecutor(this.db, context)
      .insertInto("sandbox_promotions")
      .values({
        tenant_id: tenantId(context),
        id: state.id.value,
        sandbox_id: state.sandboxId.value,
        artifact_id: state.artifactId.value,
        artifact_digest: state.artifactDigest.value,
        status: state.status.value,
        state: serialized,
        created_at: state.createdAt.value,
        updated_at: state.updatedAt?.value ?? state.createdAt.value,
        expires_at: state.expiresAt.value,
      })
      .onConflict((conflict) =>
        conflict.columns(["tenant_id", "id"]).doUpdateSet({
          status: state.status.value,
          state: serialized,
          updated_at: state.updatedAt?.value ?? state.createdAt.value,
        }),
      )
      .execute();
  }
  async findPromotion(context: RepositoryContext, id: string) {
    const row = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("sandbox_promotions")
      .selectAll()
      .where("tenant_id", "=", tenantId(context))
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? promotion(row) : null;
  }
  async listPromotions(context: RepositoryContext, sandboxId: string) {
    return (
      await resolveRepositoryExecutor(this.db, context)
        .selectFrom("sandbox_promotions")
        .selectAll()
        .where("tenant_id", "=", tenantId(context))
        .where("sandbox_id", "=", sandboxId)
        .orderBy("created_at", "desc")
        .execute()
    ).map(promotion);
  }
}
