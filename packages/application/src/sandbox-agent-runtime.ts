import {
  AgentHarnessTemplateId,
  CreatedAt,
  domainError,
  ExpiresAt,
  err,
  ok,
  PromotionCandidatePreviewId,
  type Result,
  SandboxAgentApproval,
  type SandboxAgentApprovalCapability,
  SandboxAgentApprovalId,
  SandboxAgentRun,
  SandboxAgentRunId,
  SandboxAgentRuntime,
  SandboxAgentRuntimeId,
  SandboxId,
  SandboxPromotion,
  SandboxPromotionId,
  type SandboxPromotionTargetState,
  SourceArtifact,
  SourceArtifactDigest,
  SourceArtifactId,
  SourceArtifactManifest,
  type SourceArtifactManifestEntry,
  SourceArtifactStoreReference,
  UpdatedAt,
  WorkspaceRevision,
} from "@appaloft/core";
import {
  type ExecutionContext,
  type RepositoryContext,
  toRepositoryContext,
} from "./execution-context";
import { type ControlPlaneSecretProtector } from "./ports";

export interface SandboxAgentHarnessEvent {
  type: string;
  data: Record<string, unknown>;
}

export interface SandboxAgentHarnessInteraction {
  transport: "managed-terminal" | "native-attach";
  command: readonly string[];
  sessionRecovery: "managed-run-lineage" | "native-session-store";
  serverPort?: number;
}

export type SandboxAgentSandboxSource =
  | { kind: "image"; image: string }
  | { kind: "snapshot"; snapshotId: string }
  | { kind: "template"; templateId: string };

export interface SandboxAgentHarness {
  readonly key: string;
  readonly templateId: string;
  readonly version: string;
  readonly templateDigest: string;
  readonly interaction?: SandboxAgentHarnessInteraction;
  admitSandbox?(source: SandboxAgentSandboxSource): boolean;
  prepareRuntime?(input: {
    executionContext: ExecutionContext;
    sandboxId: string;
    runtimeId: string;
  }): Promise<void>;
  terminateRuntime?(input: {
    executionContext: ExecutionContext;
    sandboxId: string;
    runtimeId: string;
  }): Promise<void>;
  execute(input: {
    executionContext: ExecutionContext;
    sandboxId: string;
    runtimeId: string;
    runId: string;
    task: string;
    context: { mode: "fresh" } | { mode: "continue"; parentRunId: string };
    emitEvent?(event: SandboxAgentHarnessEvent): Promise<void>;
    requestApproval(input: {
      capability: SandboxAgentApprovalCapability;
      requestDigest: string;
      destination?: string;
      expiresAt: string;
    }): Promise<"approved" | "rejected">;
  }): Promise<{
    events: readonly SandboxAgentHarnessEvent[];
    outcomeDigest: string;
    usage?: { inputTokens?: number; outputTokens?: number };
  }>;
  cancel(input: { sandboxId: string; runtimeId: string; runId: string }): Promise<void>;
}

export class SandboxAgentHarnessRegistry {
  private readonly harnesses = new Map<string, SandboxAgentHarness>();

  constructor(harnesses: readonly SandboxAgentHarness[] = []) {
    for (const harness of harnesses) this.register(harness);
  }

  register(harness: SandboxAgentHarness): void {
    this.harnesses.set(harness.key, harness);
  }

  resolve(key: string): SandboxAgentHarness | null {
    return this.harnesses.get(key) ?? null;
  }
}

export interface SandboxAgentRuntimeRecord {
  runtime: SandboxAgentRuntime;
  harnessKey: string;
  idempotencyKey: string;
}

export interface SandboxAgentRunRecord {
  run: SandboxAgentRun;
  sandboxId: string;
  taskEnvelope: string;
  idempotencyKey: string;
}

export interface SandboxAgentRunEventRecord {
  eventId: string;
  runId: string;
  sequence: number;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export type SandboxAgentRunEventEnvelope =
  | {
      kind: "event";
      schemaVersion: "sandbox-agent.run-events/v1";
      cursor: string;
      runId: string;
      sequence: number;
      occurredAt: string;
      eventType: string;
      data: Record<string, unknown>;
    }
  | {
      kind: "error";
      schemaVersion: "sandbox-agent.run-events/v1";
      runId: string;
      code: "cursor-gap" | "stream-failed";
      retryable: boolean;
    }
  | {
      kind: "closed";
      schemaVersion: "sandbox-agent.run-events/v1";
      runId: string;
      reason: "terminal" | "aborted";
    };

export interface SandboxAgentRunEventStream extends AsyncIterable<SandboxAgentRunEventEnvelope> {
  close(): Promise<void>;
}

export type StreamSandboxAgentRunEventsResult = {
  mode: "stream";
  runId: string;
  stream: SandboxAgentRunEventStream;
};

export interface CandidatePreviewRecord {
  previewId: string;
  artifactId: string;
  artifactDigest: string;
  status: "creating" | "ready" | "failed" | "expired" | "deleted";
  url?: string;
  expiresAt: string;
  verified: boolean;
}

export interface SandboxAgentDeliveryRepository {
  saveRuntime(context: RepositoryContext, record: SandboxAgentRuntimeRecord): Promise<void>;
  claimRuntime(
    context: RepositoryContext,
    record: SandboxAgentRuntimeRecord,
  ): Promise<{ claimed: boolean; activeRunId?: string }>;
  findRuntime(
    context: RepositoryContext,
    runtimeId: string,
  ): Promise<SandboxAgentRuntimeRecord | null>;
  listRuntimes(context: RepositoryContext, sandboxId: string): Promise<SandboxAgentRuntimeRecord[]>;
  findRuntimeByIdempotencyKey(
    context: RepositoryContext,
    sandboxId: string,
    key: string,
  ): Promise<SandboxAgentRuntimeRecord | null>;
  saveRun(context: RepositoryContext, record: SandboxAgentRunRecord): Promise<void>;
  findRun(context: RepositoryContext, runId: string): Promise<SandboxAgentRunRecord | null>;
  listRuns(context: RepositoryContext, runtimeId: string): Promise<SandboxAgentRunRecord[]>;
  findRunByIdempotencyKey(
    context: RepositoryContext,
    runtimeId: string,
    key: string,
  ): Promise<SandboxAgentRunRecord | null>;
  appendRunEvents(
    context: RepositoryContext,
    runId: string,
    events: readonly SandboxAgentRunEventRecord[],
  ): Promise<void>;
  listRunEvents(context: RepositoryContext, runId: string): Promise<SandboxAgentRunEventRecord[]>;
  saveApproval(context: RepositoryContext, approval: SandboxAgentApproval): Promise<void>;
  findApproval(
    context: RepositoryContext,
    approvalId: string,
  ): Promise<SandboxAgentApproval | null>;
  findApprovalByRequest(
    context: RepositoryContext,
    runId: string,
    requestDigest: string,
  ): Promise<SandboxAgentApproval | null>;
  listApprovals(context: RepositoryContext, runId: string): Promise<SandboxAgentApproval[]>;
  saveArtifact(context: RepositoryContext, artifact: SourceArtifact): Promise<void>;
  findArtifact(context: RepositoryContext, artifactId: string): Promise<SourceArtifact | null>;
  findArtifactByDigest(
    context: RepositoryContext,
    sandboxId: string,
    digest: string,
  ): Promise<SourceArtifact | null>;
  listArtifacts(context: RepositoryContext, sandboxId: string): Promise<SourceArtifact[]>;
  savePreview(context: RepositoryContext, preview: CandidatePreviewRecord): Promise<void>;
  findPreview(
    context: RepositoryContext,
    previewId: string,
  ): Promise<CandidatePreviewRecord | null>;
  savePromotion(context: RepositoryContext, promotion: SandboxPromotion): Promise<void>;
  findPromotion(context: RepositoryContext, promotionId: string): Promise<SandboxPromotion | null>;
  listPromotions(context: RepositoryContext, sandboxId: string): Promise<SandboxPromotion[]>;
}

function tenantKey(context: RepositoryContext): string {
  return context.tenant?.tenantId ?? "tenant_instance";
}

export class InMemorySandboxAgentDeliveryRepository implements SandboxAgentDeliveryRepository {
  private readonly runtimes = new Map<string, SandboxAgentRuntimeRecord>();
  private readonly runs = new Map<string, SandboxAgentRunRecord>();
  private readonly events = new Map<string, SandboxAgentRunEventRecord[]>();
  private readonly approvals = new Map<string, SandboxAgentApproval>();
  private readonly artifacts = new Map<string, SourceArtifact>();
  private readonly previews = new Map<string, CandidatePreviewRecord>();
  private readonly promotions = new Map<string, SandboxPromotion>();

  private key(context: RepositoryContext, id: string): string {
    return `${tenantKey(context)}:${id}`;
  }

  async saveRuntime(context: RepositoryContext, record: SandboxAgentRuntimeRecord): Promise<void> {
    this.runtimes.set(this.key(context, record.runtime.id.value), record);
  }

  async claimRuntime(
    context: RepositoryContext,
    record: SandboxAgentRuntimeRecord,
  ): Promise<{ claimed: boolean; activeRunId?: string }> {
    const current = this.runtimes.get(this.key(context, record.runtime.id.value));
    const currentActiveRunId = current?.runtime.toState().activeRunId?.value;
    const requestedRunId = record.runtime.toState().activeRunId?.value;
    if (currentActiveRunId && currentActiveRunId !== requestedRunId) {
      return { claimed: false, activeRunId: currentActiveRunId };
    }
    await this.saveRuntime(context, record);
    return { claimed: true, ...(requestedRunId ? { activeRunId: requestedRunId } : {}) };
  }

  async findRuntime(
    context: RepositoryContext,
    runtimeId: string,
  ): Promise<SandboxAgentRuntimeRecord | null> {
    return this.runtimes.get(this.key(context, runtimeId)) ?? null;
  }

  async listRuntimes(
    context: RepositoryContext,
    sandboxId: string,
  ): Promise<SandboxAgentRuntimeRecord[]> {
    const prefix = `${tenantKey(context)}:`;
    return [...this.runtimes.entries()]
      .filter(
        ([key, record]) =>
          key.startsWith(prefix) && record.runtime.toState().sandboxId.value === sandboxId,
      )
      .map(([, record]) => record);
  }

  async findRuntimeByIdempotencyKey(
    context: RepositoryContext,
    sandboxId: string,
    key: string,
  ): Promise<SandboxAgentRuntimeRecord | null> {
    return (
      (await this.listRuntimes(context, sandboxId)).find(
        (record) => record.idempotencyKey === key,
      ) ?? null
    );
  }

  async saveRun(context: RepositoryContext, record: SandboxAgentRunRecord): Promise<void> {
    this.runs.set(this.key(context, record.run.id.value), record);
  }

  async findRun(context: RepositoryContext, runId: string): Promise<SandboxAgentRunRecord | null> {
    return this.runs.get(this.key(context, runId)) ?? null;
  }

  async listRuns(context: RepositoryContext, runtimeId: string): Promise<SandboxAgentRunRecord[]> {
    const prefix = `${tenantKey(context)}:`;
    return [...this.runs.entries()]
      .filter(
        ([key, record]) =>
          key.startsWith(prefix) && record.run.toState().runtimeId.value === runtimeId,
      )
      .map(([, record]) => record);
  }

  async findRunByIdempotencyKey(
    context: RepositoryContext,
    runtimeId: string,
    key: string,
  ): Promise<SandboxAgentRunRecord | null> {
    return (
      (await this.listRuns(context, runtimeId)).find((record) => record.idempotencyKey === key) ??
      null
    );
  }

  async appendRunEvents(
    context: RepositoryContext,
    runId: string,
    events: readonly SandboxAgentRunEventRecord[],
  ): Promise<void> {
    const key = this.key(context, runId);
    const current = this.events.get(key) ?? [];
    this.events.set(key, [...current, ...events].slice(-1_000));
  }

  async listRunEvents(
    context: RepositoryContext,
    runId: string,
  ): Promise<SandboxAgentRunEventRecord[]> {
    return [...(this.events.get(this.key(context, runId)) ?? [])];
  }

  async saveApproval(context: RepositoryContext, approval: SandboxAgentApproval): Promise<void> {
    this.approvals.set(this.key(context, approval.id.value), approval);
  }

  async findApproval(
    context: RepositoryContext,
    approvalId: string,
  ): Promise<SandboxAgentApproval | null> {
    return this.approvals.get(this.key(context, approvalId)) ?? null;
  }

  async findApprovalByRequest(
    context: RepositoryContext,
    runId: string,
    requestDigest: string,
  ): Promise<SandboxAgentApproval | null> {
    const prefix = `${tenantKey(context)}:`;
    return (
      [...this.approvals.entries()].find(
        ([key, approval]) =>
          key.startsWith(prefix) &&
          approval.toState().runId.value === runId &&
          approval.toState().requestDigest.value === requestDigest,
      )?.[1] ?? null
    );
  }

  async listApprovals(context: RepositoryContext, runId: string): Promise<SandboxAgentApproval[]> {
    const prefix = `${tenantKey(context)}:`;
    return [...this.approvals.entries()]
      .filter(
        ([key, approval]) => key.startsWith(prefix) && approval.toState().runId.value === runId,
      )
      .map(([, approval]) => approval);
  }

  async saveArtifact(context: RepositoryContext, artifact: SourceArtifact): Promise<void> {
    this.artifacts.set(this.key(context, artifact.id.value), artifact);
  }

  async findArtifact(
    context: RepositoryContext,
    artifactId: string,
  ): Promise<SourceArtifact | null> {
    return this.artifacts.get(this.key(context, artifactId)) ?? null;
  }

  async findArtifactByDigest(
    context: RepositoryContext,
    sandboxId: string,
    digest: string,
  ): Promise<SourceArtifact | null> {
    return (
      (await this.listArtifacts(context, sandboxId)).find(
        (artifact) => artifact.toState().digest.value === digest,
      ) ?? null
    );
  }

  async listArtifacts(context: RepositoryContext, sandboxId: string): Promise<SourceArtifact[]> {
    const prefix = `${tenantKey(context)}:`;
    return [...this.artifacts.entries()]
      .filter(
        ([key, artifact]) =>
          key.startsWith(prefix) && artifact.toState().sandboxId.value === sandboxId,
      )
      .map(([, artifact]) => artifact);
  }

  async savePreview(context: RepositoryContext, preview: CandidatePreviewRecord): Promise<void> {
    this.previews.set(this.key(context, preview.previewId), { ...preview });
  }

  async findPreview(
    context: RepositoryContext,
    previewId: string,
  ): Promise<CandidatePreviewRecord | null> {
    const preview = this.previews.get(this.key(context, previewId));
    return preview ? { ...preview } : null;
  }

  async savePromotion(context: RepositoryContext, promotion: SandboxPromotion): Promise<void> {
    this.promotions.set(this.key(context, promotion.id.value), promotion);
  }

  async findPromotion(
    context: RepositoryContext,
    promotionId: string,
  ): Promise<SandboxPromotion | null> {
    return this.promotions.get(this.key(context, promotionId)) ?? null;
  }

  async listPromotions(context: RepositoryContext, sandboxId: string): Promise<SandboxPromotion[]> {
    const prefix = `${tenantKey(context)}:`;
    return [...this.promotions.entries()]
      .filter(
        ([key, promotion]) =>
          key.startsWith(prefix) && promotion.toState().sandboxId.value === sandboxId,
      )
      .map(([, promotion]) => promotion);
  }
}

export interface SandboxAgentDeliveryDependencies {
  repository: SandboxAgentDeliveryRepository;
  sandboxReader: {
    show(
      context: ExecutionContext,
      sandboxId: string,
    ): Promise<{
      sandboxId: string;
      status: string;
      workspaceRevision: string;
      source: SandboxAgentSandboxSource;
    }>;
  };
  harnessRegistry: SandboxAgentHarnessRegistry;
  workQueue: {
    enqueue(
      context: ExecutionContext,
      item: { kind: "sandbox-agent-run" | "sandbox-promotion"; id: string },
    ): Promise<void>;
  };
  artifactCapture: {
    capture(
      context: ExecutionContext,
      input: { artifactId: string; sandboxId: string; sourceRoot: string },
    ): Promise<{
      digest: string;
      workspaceRevision: string;
      storeReference: string;
      entries: readonly SourceArtifactManifestEntry[];
    }>;
    delete(
      context: ExecutionContext,
      input: { artifactId: string; storeReference: string },
    ): Promise<void>;
  };
  previewProvider: {
    create(
      context: ExecutionContext,
      input: {
        previewId: string;
        artifactId: string;
        artifactDigest: string;
        storeReference: string;
      },
    ): Promise<{
      previewId: string;
      artifactDigest: string;
      status: "creating" | "ready" | "failed";
      url?: string;
      expiresAt: string;
      verified: boolean;
    }>;
    delete(context: ExecutionContext, input: { previewId: string }): Promise<void>;
  };
  promotionTarget: {
    createResource(
      context: ExecutionContext,
      input: {
        promotionId: string;
        artifactId: string;
        artifactDigest: string;
        storeReference: string;
        target: SandboxPromotionTargetState;
      },
    ): Promise<{ resourceId: string }>;
    createDeployment(
      context: ExecutionContext,
      input: {
        promotionId: string;
        resourceId: string;
        artifactId: string;
        artifactDigest: string;
        storeReference: string;
        target: SandboxPromotionTargetState;
      },
    ): Promise<{ deploymentId: string }>;
    readProof(
      context: ExecutionContext,
      input: {
        promotionId: string;
        resourceId: string;
        deploymentId: string;
      },
    ): Promise<{ verdict: "verified" | "failed" | "pending"; reasonCode?: string }>;
  };
  taskProtector: Pick<ControlPlaneSecretProtector, "protect" | "unprotect">;
  clock: { now(): string };
  idGenerator: { next(prefix: string): string };
}

export interface SandboxAgentRuntimeDescriptor {
  runtimeId: string;
  sandboxId: string;
  harnessKey: string;
  harnessTemplateId: string;
  status: string;
  interaction?: SandboxAgentHarnessInteraction;
  activeRunId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SandboxAgentRunDescriptor {
  runId: string;
  runtimeId: string;
  sandboxId: string;
  status: string;
  context: { mode: "fresh" } | { mode: "continue"; parentRunId: string };
  outcomeDigest?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SandboxAgentApprovalDescriptor {
  approvalId: string;
  sandboxId: string;
  runtimeId: string;
  runId: string;
  capability: SandboxAgentApprovalCapability;
  requestDigest: string;
  destination?: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  updatedAt?: string;
  resolvedBy?: string;
}

export interface SourceArtifactDescriptor {
  artifactId: string;
  sandboxId: string;
  digest: string;
  sourceRoot: string;
  workspaceRevision: string;
  status: string;
  referenceCount: number;
  manifest: SourceArtifactManifestEntry[];
  createdAt: string;
}

export interface SandboxPromotionDescriptor {
  promotionId: string;
  sandboxId: string;
  artifactId: string;
  artifactDigest: string;
  candidatePreviewId: string;
  target: SandboxPromotionTargetState;
  status: string;
  resourceId?: string;
  deploymentId?: string;
  proofVerdict: "verified" | "failed" | "pending" | null;
  createdAt: string;
  updatedAt?: string;
  expiresAt: string;
}

const sensitiveKey = /authorization|credential|password|secret|token/i;

function redact(value: unknown, key = "", depth = 0): unknown {
  if (sensitiveKey.test(key)) return "[REDACTED]";
  if (depth > 8) return "[TRUNCATED]";
  if (typeof value === "string") return value.length > 4_096 ? `${value.slice(0, 4_096)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redact(item, "", depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([entryKey, entryValue]) => [entryKey, redact(entryValue, entryKey, depth + 1)]),
    );
  }
  return value;
}

function runtimeDescriptor(
  record: SandboxAgentRuntimeRecord,
  interaction?: SandboxAgentHarnessInteraction,
): SandboxAgentRuntimeDescriptor {
  const state = record.runtime.toState();
  return {
    runtimeId: state.id.value,
    sandboxId: state.sandboxId.value,
    harnessKey: record.harnessKey,
    harnessTemplateId: state.harnessTemplateId.value,
    status: state.status.value,
    ...(interaction ? { interaction } : {}),
    ...(state.activeRunId ? { activeRunId: state.activeRunId.value } : {}),
    createdAt: state.createdAt.value,
    ...(state.updatedAt ? { updatedAt: state.updatedAt.value } : {}),
  };
}

function runDescriptor(record: SandboxAgentRunRecord): SandboxAgentRunDescriptor {
  const state = record.run.toState();
  const context = state.context.toState();
  return {
    runId: state.id.value,
    runtimeId: state.runtimeId.value,
    sandboxId: record.sandboxId,
    status: state.status.value,
    context:
      context.mode === "fresh"
        ? { mode: "fresh" }
        : { mode: "continue", parentRunId: context.parentRunId.value },
    ...(state.outcomeDigest ? { outcomeDigest: state.outcomeDigest.value } : {}),
    createdAt: state.createdAt.value,
    ...(state.updatedAt ? { updatedAt: state.updatedAt.value } : {}),
  };
}

function approvalDescriptor(approval: SandboxAgentApproval): SandboxAgentApprovalDescriptor {
  const state = approval.toState();
  return {
    approvalId: state.id.value,
    sandboxId: state.sandboxId,
    runtimeId: state.runtimeId.value,
    runId: state.runId.value,
    capability: state.capability,
    requestDigest: state.requestDigest.value,
    ...(state.destination ? { destination: state.destination } : {}),
    status: state.status,
    createdAt: state.createdAt.value,
    expiresAt: state.expiresAt.value,
    ...(state.updatedAt ? { updatedAt: state.updatedAt.value } : {}),
    ...(state.resolvedBy ? { resolvedBy: state.resolvedBy } : {}),
  };
}

export class SandboxAgentApprovalPendingError extends Error {
  constructor(readonly approvalId: string) {
    super("sandbox_agent_approval_pending");
  }
}

function artifactDescriptor(artifact: SourceArtifact): SourceArtifactDescriptor {
  const state = artifact.toState();
  return {
    artifactId: state.id.value,
    sandboxId: state.sandboxId.value,
    digest: state.digest.value,
    sourceRoot: state.sourceRoot.value,
    workspaceRevision: state.workspaceRevision.value,
    status: state.status.value,
    referenceCount: state.referenceCount.value,
    manifest: state.manifest.entries(),
    createdAt: state.createdAt.value,
  };
}

function promotionDescriptor(promotion: SandboxPromotion): SandboxPromotionDescriptor {
  const state = promotion.toState();
  return {
    promotionId: state.id.value,
    sandboxId: state.sandboxId.value,
    artifactId: state.artifactId.value,
    artifactDigest: state.artifactDigest.value,
    candidatePreviewId: state.candidatePreviewId.value,
    target: state.target.toState(),
    status: state.status.value,
    ...(state.resourceId ? { resourceId: state.resourceId.value } : {}),
    ...(state.deploymentId ? { deploymentId: state.deploymentId.value } : {}),
    proofVerdict: state.status.value === "completed" ? "verified" : null,
    createdAt: state.createdAt.value,
    ...(state.updatedAt ? { updatedAt: state.updatedAt.value } : {}),
    expiresAt: state.expiresAt.value,
  };
}

function asCreatedAt(value: string): Result<CreatedAt> {
  return CreatedAt.create(value);
}

function asUpdatedAt(value: string): Result<UpdatedAt> {
  return UpdatedAt.create(value);
}

function infrastructureError(error: unknown): ReturnType<typeof domainError.conflict> {
  return domainError.conflict("Sandbox Agent delivery adapter failed", {
    code: "sandbox_agent_delivery_adapter_failed",
    cause: error instanceof Error ? error.message.slice(0, 256) : "unknown",
  });
}

function requireExternalApprovalActor(context: ExecutionContext): Result<void> {
  const kind = context.principal?.kind ?? context.actor?.kind;
  if (kind === "deploy-token") {
    return err(
      domainError.conflict(
        "Sandbox runtime identities cannot resolve approval or promotion intent",
        {
          code: "sandbox_agent_external_approval_required",
        },
      ),
    );
  }
  return ok(undefined);
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return `sha256:${[...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

export class SandboxAgentDeliveryService {
  constructor(private readonly dependencies: SandboxAgentDeliveryDependencies) {}

  async createRuntime(
    context: ExecutionContext,
    input: {
      sandboxId: string;
      harnessKey: string;
      harnessTemplateId: string;
      idempotencyKey: string;
    },
  ): Promise<Result<SandboxAgentRuntimeDescriptor>> {
    const repositoryContext = toRepositoryContext(context);
    const existing = await this.dependencies.repository.findRuntimeByIdempotencyKey(
      repositoryContext,
      input.sandboxId,
      input.idempotencyKey,
    );
    if (existing) {
      return ok(
        runtimeDescriptor(
          existing,
          this.dependencies.harnessRegistry.resolve(existing.harnessKey)?.interaction,
        ),
      );
    }
    const sandbox = await this.dependencies.sandboxReader.show(context, input.sandboxId);
    if (sandbox.status !== "ready") {
      return err(domainError.conflict("Sandbox must be ready before Runtime creation"));
    }
    const harness = this.dependencies.harnessRegistry.resolve(input.harnessKey);
    if (!harness) return err(domainError.notFound("SandboxAgentHarness", input.harnessKey));
    if (harness.templateId !== input.harnessTemplateId) {
      return err(domainError.conflict("Sandbox Agent harness template mismatch"));
    }
    if (harness.admitSandbox && !harness.admitSandbox(sandbox.source)) {
      return err(
        domainError.conflict("Sandbox was not created from the pinned Agent harness template", {
          code: "sandbox_agent_template_admission_failed",
        }),
      );
    }
    const runtimeId = SandboxAgentRuntimeId.create(this.dependencies.idGenerator.next("sar"));
    if (runtimeId.isErr()) return err(runtimeId.error);
    const sandboxId = SandboxId.create(input.sandboxId);
    if (sandboxId.isErr()) return err(sandboxId.error);
    const templateId = AgentHarnessTemplateId.create(input.harnessTemplateId);
    if (templateId.isErr()) return err(templateId.error);
    const createdAt = asCreatedAt(this.dependencies.clock.now());
    if (createdAt.isErr()) return err(createdAt.error);
    const runtime = SandboxAgentRuntime.create({
      id: runtimeId.value,
      sandboxId: sandboxId.value,
      harnessTemplateId: templateId.value,
      createdAt: createdAt.value,
    });
    if (runtime.isErr()) return err(runtime.error);
    const record = {
      runtime: runtime.value,
      harnessKey: input.harnessKey,
      idempotencyKey: input.idempotencyKey,
    };
    if (harness.prepareRuntime) {
      try {
        await harness.prepareRuntime({
          executionContext: context,
          sandboxId: input.sandboxId,
          runtimeId: runtimeId.value.value,
        });
      } catch (error) {
        const failedAt = asUpdatedAt(this.dependencies.clock.now());
        if (failedAt.isErr()) return err(failedAt.error);
        const failed = runtime.value.markFailed({ at: failedAt.value });
        if (failed.isErr()) return err(failed.error);
        await this.dependencies.repository.saveRuntime(repositoryContext, record);
        return err(infrastructureError(error));
      }
    }
    const updatedAt = asUpdatedAt(this.dependencies.clock.now());
    if (updatedAt.isErr()) return err(updatedAt.error);
    const ready = runtime.value.markReady({ at: updatedAt.value });
    if (ready.isErr()) return err(ready.error);
    try {
      await this.dependencies.repository.saveRuntime(repositoryContext, record);
    } catch (error) {
      const raced = await this.dependencies.repository.findRuntimeByIdempotencyKey(
        repositoryContext,
        input.sandboxId,
        input.idempotencyKey,
      );
      if (!raced) return err(infrastructureError(error));
      return ok(
        runtimeDescriptor(
          raced,
          this.dependencies.harnessRegistry.resolve(raced.harnessKey)?.interaction,
        ),
      );
    }
    return ok(runtimeDescriptor(record, harness.interaction));
  }

  async listRuntimes(
    context: ExecutionContext,
    sandboxId: string,
  ): Promise<Result<{ items: SandboxAgentRuntimeDescriptor[] }>> {
    const items = await this.dependencies.repository.listRuntimes(
      toRepositoryContext(context),
      sandboxId,
    );
    return ok({
      items: items.map((record) =>
        runtimeDescriptor(
          record,
          this.dependencies.harnessRegistry.resolve(record.harnessKey)?.interaction,
        ),
      ),
    });
  }

  async showRuntime(
    context: ExecutionContext,
    sandboxId: string,
    runtimeId: string,
  ): Promise<Result<SandboxAgentRuntimeDescriptor>> {
    const record = await this.dependencies.repository.findRuntime(
      toRepositoryContext(context),
      runtimeId,
    );
    if (!record || record.runtime.toState().sandboxId.value !== sandboxId) {
      return err(domainError.notFound("SandboxAgentRuntime", runtimeId));
    }
    return ok(
      runtimeDescriptor(
        record,
        this.dependencies.harnessRegistry.resolve(record.harnessKey)?.interaction,
      ),
    );
  }

  async terminateRuntime(
    context: ExecutionContext,
    sandboxId: string,
    runtimeId: string,
  ): Promise<Result<SandboxAgentRuntimeDescriptor>> {
    const repositoryContext = toRepositoryContext(context);
    const record = await this.dependencies.repository.findRuntime(repositoryContext, runtimeId);
    if (!record || record.runtime.toState().sandboxId.value !== sandboxId) {
      return err(domainError.notFound("SandboxAgentRuntime", runtimeId));
    }
    const state = record.runtime.toState();
    if (state.activeRunId) {
      const cancelled = await this.cancelRun(context, runtimeId, state.activeRunId.value);
      if (cancelled.isErr()) return err(cancelled.error);
    }
    const harness = this.dependencies.harnessRegistry.resolve(record.harnessKey);
    if (harness?.terminateRuntime) {
      try {
        await harness.terminateRuntime({
          executionContext: context,
          sandboxId,
          runtimeId,
        });
      } catch (error) {
        return err(infrastructureError(error));
      }
    }
    const at = asUpdatedAt(this.dependencies.clock.now());
    if (at.isErr()) return err(at.error);
    const terminated = record.runtime.terminate({ at: at.value });
    if (terminated.isErr()) return err(terminated.error);
    await this.dependencies.repository.saveRuntime(repositoryContext, record);
    return ok(runtimeDescriptor(record, harness?.interaction));
  }

  async createRun(
    context: ExecutionContext,
    input: {
      sandboxId: string;
      runtimeId: string;
      task: string;
      context: { mode: "fresh" } | { mode: "continue"; parentRunId: string };
      idempotencyKey: string;
    },
  ): Promise<Result<SandboxAgentRunDescriptor>> {
    const repositoryContext = toRepositoryContext(context);
    const existing = await this.dependencies.repository.findRunByIdempotencyKey(
      repositoryContext,
      input.runtimeId,
      input.idempotencyKey,
    );
    if (existing) {
      if (!existing.run.toState().status.isTerminal()) {
        await this.dependencies.workQueue.enqueue(context, {
          kind: "sandbox-agent-run",
          id: existing.run.id.value,
        });
      }
      return ok(runDescriptor(existing));
    }
    const runtimeRecord = await this.dependencies.repository.findRuntime(
      repositoryContext,
      input.runtimeId,
    );
    if (!runtimeRecord) return err(domainError.notFound("SandboxAgentRuntime", input.runtimeId));
    if (runtimeRecord.runtime.toState().sandboxId.value !== input.sandboxId) {
      return err(domainError.resourceContextMismatch("Runtime does not belong to Sandbox"));
    }
    let parentRunId: SandboxAgentRunId | undefined;
    if (input.context.mode === "continue") {
      const parent = await this.dependencies.repository.findRun(
        repositoryContext,
        input.context.parentRunId,
      );
      if (!parent || parent.run.toState().runtimeId.value !== input.runtimeId) {
        return err(domainError.notFound("SandboxAgentRun", input.context.parentRunId));
      }
      if (!parent.run.toState().status.isTerminal()) {
        return err(domainError.conflict("Continued Run requires a terminal parent Run"));
      }
      parentRunId = parent.run.id;
    }
    const runId = SandboxAgentRunId.create(this.dependencies.idGenerator.next("srun"));
    if (runId.isErr()) return err(runId.error);
    const runtimeId = SandboxAgentRuntimeId.create(input.runtimeId);
    if (runtimeId.isErr()) return err(runtimeId.error);
    const createdAt = asCreatedAt(this.dependencies.clock.now());
    if (createdAt.isErr()) return err(createdAt.error);
    const runContext =
      input.context.mode === "fresh"
        ? ({ mode: "fresh" } as const)
        : parentRunId
          ? ({ mode: "continue", parentRunId } as const)
          : undefined;
    if (!runContext) return err(domainError.conflict("Continued Run parent was not resolved"));
    const run = SandboxAgentRun.create({
      id: runId.value,
      runtimeId: runtimeId.value,
      context: runContext,
      taskDigest: await sha256(input.task),
      createdAt: createdAt.value,
    });
    if (run.isErr()) return err(run.error);
    const updatedAt = asUpdatedAt(this.dependencies.clock.now());
    if (updatedAt.isErr()) return err(updatedAt.error);
    const claimed = runtimeRecord.runtime.claimRun({ runId: runId.value, at: updatedAt.value });
    if (claimed.isErr()) return err(claimed.error);
    const protectedTask = await this.dependencies.taskProtector.protect(
      { purpose: "sandbox-agent-task" },
      input.task,
    );
    if (protectedTask.isErr()) return err(protectedTask.error);
    const record = {
      run: run.value,
      sandboxId: input.sandboxId,
      taskEnvelope: protectedTask.value.envelope,
      idempotencyKey: input.idempotencyKey,
    };
    const persistedClaim = await this.dependencies.repository.claimRuntime(
      repositoryContext,
      runtimeRecord,
    );
    if (!persistedClaim.claimed) {
      return err(
        domainError.conflict("Sandbox Agent Runtime is busy", {
          code: "sandbox_agent_runtime_busy",
          ...(persistedClaim.activeRunId ? { activeRunId: persistedClaim.activeRunId } : {}),
        }),
      );
    }
    try {
      await this.dependencies.repository.saveRun(repositoryContext, record);
    } catch (error) {
      const releasedAt = asUpdatedAt(this.dependencies.clock.now());
      if (releasedAt.isOk()) {
        runtimeRecord.runtime.releaseRun({ runId: runId.value, at: releasedAt.value });
        await this.dependencies.repository.saveRuntime(repositoryContext, runtimeRecord);
      }
      return err(infrastructureError(error));
    }
    try {
      await this.dependencies.workQueue.enqueue(context, {
        kind: "sandbox-agent-run",
        id: runId.value.value,
      });
    } catch (error) {
      return err(infrastructureError(error));
    }
    return ok(runDescriptor(record));
  }

  private async requestRunApproval(
    context: ExecutionContext,
    record: SandboxAgentRunRecord,
    input: {
      capability: SandboxAgentApprovalCapability;
      requestDigest: string;
      destination?: string;
      expiresAt: string;
    },
  ): Promise<"approved" | "rejected"> {
    const repositoryContext = toRepositoryContext(context);
    const existing = await this.dependencies.repository.findApprovalByRequest(
      repositoryContext,
      record.run.id.value,
      input.requestDigest,
    );
    const now = asUpdatedAt(this.dependencies.clock.now());
    if (now.isErr()) throw new Error(now.error.message);
    if (existing) {
      const state = existing.toState();
      if (state.status === "requested" && now.value.toDate() >= state.expiresAt.toDate()) {
        existing.expire({ at: now.value });
        await this.dependencies.repository.saveApproval(repositoryContext, existing);
        return "rejected";
      }
      if (state.status === "approved") {
        if (record.run.toState().status.value === "waiting-approval") {
          const resumed = record.run.resume({ at: now.value });
          if (resumed.isErr()) throw new Error(resumed.error.message);
          await this.dependencies.repository.saveRun(repositoryContext, record);
        }
        return "approved";
      }
      if (state.status === "rejected" || state.status === "expired") return "rejected";
      throw new SandboxAgentApprovalPendingError(existing.id.value);
    }
    const approvalId = SandboxAgentApprovalId.create(this.dependencies.idGenerator.next("saa"));
    if (approvalId.isErr()) throw new Error(approvalId.error.message);
    const expiresAt = ExpiresAt.create(input.expiresAt);
    if (expiresAt.isErr() || expiresAt.value.toDate() <= now.value.toDate()) {
      throw new Error("sandbox_agent_approval_expiry_invalid");
    }
    const createdAt = asCreatedAt(this.dependencies.clock.now());
    if (createdAt.isErr()) throw new Error(createdAt.error.message);
    const approval = SandboxAgentApproval.create({
      id: approvalId.value,
      runtimeId: record.run.toState().runtimeId,
      runId: record.run.id,
      sandboxId: record.sandboxId,
      capability: input.capability,
      requestDigest: input.requestDigest,
      ...(input.destination ? { destination: input.destination } : {}),
      createdAt: createdAt.value,
      expiresAt: expiresAt.value,
    });
    if (approval.isErr()) throw new Error(approval.error.message);
    const waiting = record.run.waitForApproval({ at: now.value });
    if (waiting.isErr()) throw new Error(waiting.error.message);
    await this.dependencies.repository.saveApproval(repositoryContext, approval.value);
    await this.dependencies.repository.saveRun(repositoryContext, record);
    throw new SandboxAgentApprovalPendingError(approval.value.id.value);
  }

  async listApprovals(
    context: ExecutionContext,
    runId: string,
  ): Promise<Result<{ items: SandboxAgentApprovalDescriptor[] }>> {
    const repositoryContext = toRepositoryContext(context);
    if (!(await this.dependencies.repository.findRun(repositoryContext, runId))) {
      return err(domainError.notFound("SandboxAgentRun", runId));
    }
    const items = await this.dependencies.repository.listApprovals(repositoryContext, runId);
    return ok({ items: items.map(approvalDescriptor) });
  }

  async showApproval(
    context: ExecutionContext,
    approvalId: string,
  ): Promise<Result<SandboxAgentApprovalDescriptor>> {
    const approval = await this.dependencies.repository.findApproval(
      toRepositoryContext(context),
      approvalId,
    );
    return approval
      ? ok(approvalDescriptor(approval))
      : err(domainError.notFound("SandboxAgentApproval", approvalId));
  }

  async resolveApproval(
    context: ExecutionContext,
    input: { approvalId: string; decision: "approve" | "reject" },
  ): Promise<Result<SandboxAgentApprovalDescriptor>> {
    const actor = requireExternalApprovalActor(context);
    if (actor.isErr()) return err(actor.error);
    const repositoryContext = toRepositoryContext(context);
    const approval = await this.dependencies.repository.findApproval(
      repositoryContext,
      input.approvalId,
    );
    if (!approval) return err(domainError.notFound("SandboxAgentApproval", input.approvalId));
    const at = asUpdatedAt(this.dependencies.clock.now());
    if (at.isErr()) return err(at.error);
    const actorId = context.principal?.actorId ?? context.actor?.id ?? "local-operator";
    const resolved = approval.resolve({ decision: input.decision, actorId, at: at.value });
    if (resolved.isErr()) return err(resolved.error);
    await this.dependencies.repository.saveApproval(repositoryContext, approval);
    await this.dependencies.workQueue.enqueue(context, {
      kind: "sandbox-agent-run",
      id: approval.toState().runId.value,
    });
    return ok(approvalDescriptor(approval));
  }

  async reconcileRun(
    context: ExecutionContext,
    runId: string,
  ): Promise<Result<SandboxAgentRunDescriptor>> {
    const repositoryContext = toRepositoryContext(context);
    const record = await this.dependencies.repository.findRun(repositoryContext, runId);
    if (!record) return err(domainError.notFound("SandboxAgentRun", runId));
    if (record.run.toState().status.isTerminal()) return ok(runDescriptor(record));
    const runtimeRecord = await this.dependencies.repository.findRuntime(
      repositoryContext,
      record.run.toState().runtimeId.value,
    );
    if (!runtimeRecord)
      return err(domainError.notFound("SandboxAgentRuntime", record.run.toState().runtimeId.value));
    const harness = this.dependencies.harnessRegistry.resolve(runtimeRecord.harnessKey);
    if (!harness) return err(domainError.notFound("SandboxAgentHarness", runtimeRecord.harnessKey));
    const at = asUpdatedAt(this.dependencies.clock.now());
    if (at.isErr()) return err(at.error);
    if (record.run.toState().status.value === "accepted") {
      const started = record.run.start({ at: at.value });
      if (started.isErr()) return err(started.error);
      await this.dependencies.repository.saveRun(repositoryContext, record);
    } else if (record.run.toState().status.value !== "waiting-approval") {
      return err(
        domainError.conflict("Sandbox Agent Run cannot reconcile", {
          status: record.run.toState().status.value,
        }),
      );
    }
    try {
      const task = await this.dependencies.taskProtector.unprotect(
        { purpose: "sandbox-agent-task" },
        record.taskEnvelope,
      );
      if (task.isErr()) throw new Error(`sandbox_agent_task_unprotect_failed:${task.error.code}`);
      const contextState = record.run.toState().context.toState();
      const persistedEvents = await this.dependencies.repository.listRunEvents(
        repositoryContext,
        runId,
      );
      let nextSequence = persistedEvents.at(-1)?.sequence ?? 0;
      let remainingEvents = Math.max(1_000 - persistedEvents.length, 0);
      const persistHarnessEvents = async (events: readonly SandboxAgentHarnessEvent[]) => {
        const accepted = events.slice(0, remainingEvents);
        if (accepted.length === 0) return;
        const createdAt = this.dependencies.clock.now();
        const records = accepted.map((event) => {
          const sequence = ++nextSequence;
          return {
            eventId: `${runId}:${sequence}`,
            runId,
            sequence,
            type: event.type.slice(0, 120),
            data: redact(event.data) as Record<string, unknown>,
            createdAt,
          };
        });
        remainingEvents -= records.length;
        await this.dependencies.repository.appendRunEvents(repositoryContext, runId, records);
      };
      const result = await harness.execute({
        executionContext: context,
        sandboxId: record.sandboxId,
        runtimeId: runtimeRecord.runtime.id.value,
        runId,
        task: task.value.plaintext,
        context:
          contextState.mode === "fresh"
            ? { mode: "fresh" }
            : { mode: "continue", parentRunId: contextState.parentRunId.value },
        emitEvent: (event) => persistHarnessEvents([event]),
        requestApproval: (approvalInput) => this.requestRunApproval(context, record, approvalInput),
      });
      const currentRecord =
        (await this.dependencies.repository.findRun(repositoryContext, runId)) ?? record;
      const currentRuntimeRecord =
        (await this.dependencies.repository.findRuntime(
          repositoryContext,
          currentRecord.run.toState().runtimeId.value,
        )) ?? runtimeRecord;
      if (currentRecord.run.toState().status.isTerminal()) {
        const releasedAt = asUpdatedAt(this.dependencies.clock.now());
        if (releasedAt.isErr()) return err(releasedAt.error);
        const released = currentRuntimeRecord.runtime.releaseRun({
          runId: currentRecord.run.id,
          at: releasedAt.value,
        });
        if (released.isErr()) return err(released.error);
        await this.dependencies.repository.saveRuntime(repositoryContext, currentRuntimeRecord);
        return ok(runDescriptor(currentRecord));
      }
      await persistHarnessEvents(result.events);
      const completedAt = asUpdatedAt(this.dependencies.clock.now());
      if (completedAt.isErr()) return err(completedAt.error);
      const completed = currentRecord.run.complete({
        at: completedAt.value,
        outcomeDigest: result.outcomeDigest,
      });
      if (completed.isErr()) return err(completed.error);
      const released = currentRuntimeRecord.runtime.releaseRun({
        runId: currentRecord.run.id,
        at: completedAt.value,
      });
      if (released.isErr()) return err(released.error);
      await this.dependencies.repository.saveRun(repositoryContext, currentRecord);
      await this.dependencies.repository.saveRuntime(repositoryContext, currentRuntimeRecord);
      return ok(runDescriptor(currentRecord));
    } catch (error) {
      if (error instanceof SandboxAgentApprovalPendingError) {
        return err(
          domainError.conflict("Sandbox Agent Run is waiting for approval", {
            code: "sandbox_agent_approval_pending",
            approvalId: error.approvalId,
            retryable: true,
          }),
        );
      }
      const currentRecord =
        (await this.dependencies.repository.findRun(repositoryContext, runId)) ?? record;
      const currentRuntimeRecord =
        (await this.dependencies.repository.findRuntime(
          repositoryContext,
          currentRecord.run.toState().runtimeId.value,
        )) ?? runtimeRecord;
      const failedAt = asUpdatedAt(this.dependencies.clock.now());
      if (failedAt.isErr()) return err(failedAt.error);
      if (currentRecord.run.toState().status.value === "cancelled") {
        currentRuntimeRecord.runtime.releaseRun({
          runId: currentRecord.run.id,
          at: failedAt.value,
        });
        await this.dependencies.repository.saveRuntime(repositoryContext, currentRuntimeRecord);
        return ok(runDescriptor(currentRecord));
      }
      currentRecord.run.fail({ at: failedAt.value, code: "sandbox_agent_harness_failed" });
      currentRuntimeRecord.runtime.releaseRun({
        runId: currentRecord.run.id,
        at: failedAt.value,
      });
      await this.dependencies.repository.saveRun(repositoryContext, currentRecord);
      await this.dependencies.repository.saveRuntime(repositoryContext, currentRuntimeRecord);
      return err(infrastructureError(error));
    }
  }

  async listRuns(
    context: ExecutionContext,
    runtimeId: string,
  ): Promise<Result<{ items: SandboxAgentRunDescriptor[] }>> {
    const items = await this.dependencies.repository.listRuns(
      toRepositoryContext(context),
      runtimeId,
    );
    return ok({ items: items.map(runDescriptor) });
  }

  async cancelRun(
    context: ExecutionContext,
    runtimeId: string,
    runId: string,
  ): Promise<Result<SandboxAgentRunDescriptor>> {
    const repositoryContext = toRepositoryContext(context);
    const record = await this.dependencies.repository.findRun(repositoryContext, runId);
    if (!record || record.run.toState().runtimeId.value !== runtimeId) {
      return err(domainError.notFound("SandboxAgentRun", runId));
    }
    const runtimeRecord = await this.dependencies.repository.findRuntime(
      repositoryContext,
      runtimeId,
    );
    if (!runtimeRecord) return err(domainError.notFound("SandboxAgentRuntime", runtimeId));
    const harness = this.dependencies.harnessRegistry.resolve(runtimeRecord.harnessKey);
    if (harness && !record.run.toState().status.isTerminal()) {
      try {
        await harness.cancel({ sandboxId: record.sandboxId, runtimeId, runId });
      } catch (error) {
        return err(infrastructureError(error));
      }
    }
    const at = asUpdatedAt(this.dependencies.clock.now());
    if (at.isErr()) return err(at.error);
    const cancelled = record.run.cancel({ at: at.value });
    if (cancelled.isErr()) return err(cancelled.error);
    const released = runtimeRecord.runtime.releaseRun({ runId: record.run.id, at: at.value });
    if (released.isErr()) return err(released.error);
    await this.dependencies.repository.saveRun(repositoryContext, record);
    await this.dependencies.repository.saveRuntime(repositoryContext, runtimeRecord);
    return ok(runDescriptor(record));
  }

  async showRun(
    context: ExecutionContext,
    runtimeId: string,
    runId: string,
  ): Promise<Result<SandboxAgentRunDescriptor>> {
    const record = await this.dependencies.repository.findRun(toRepositoryContext(context), runId);
    if (!record || record.run.toState().runtimeId.value !== runtimeId) {
      return err(domainError.notFound("SandboxAgentRun", runId));
    }
    return ok(runDescriptor(record));
  }

  async listRunEvents(
    context: ExecutionContext,
    runId: string,
    input: { afterSequence?: number; limit?: number },
  ): Promise<Result<{ items: SandboxAgentRunEventRecord[]; nextSequence: number | null }>> {
    const repositoryContext = toRepositoryContext(context);
    if (!(await this.dependencies.repository.findRun(repositoryContext, runId))) {
      return err(domainError.notFound("SandboxAgentRun", runId));
    }
    const after = input.afterSequence ?? 0;
    const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
    const all = await this.dependencies.repository.listRunEvents(repositoryContext, runId);
    const items = all.filter((event) => event.sequence > after).slice(0, limit);
    return ok({ items, nextSequence: items.at(-1)?.sequence ?? null });
  }

  async streamRunEvents(
    context: ExecutionContext,
    runId: string,
    input: { afterSequence?: number; limit?: number },
    signal?: AbortSignal,
  ): Promise<Result<StreamSandboxAgentRunEventsResult>> {
    const repositoryContext = toRepositoryContext(context);
    if (!(await this.dependencies.repository.findRun(repositoryContext, runId))) {
      return err(domainError.notFound("SandboxAgentRun", runId));
    }
    const repository = this.dependencies.repository;
    const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
    const initialSequence = input.afterSequence ?? 0;
    let closed = false;
    const stream: SandboxAgentRunEventStream = {
      close: async () => {
        closed = true;
      },
      async *[Symbol.asyncIterator]() {
        let cursor = initialSequence;
        while (!closed) {
          if (signal?.aborted) {
            yield {
              kind: "closed",
              schemaVersion: "sandbox-agent.run-events/v1",
              runId,
              reason: "aborted",
            };
            return;
          }
          const [record, all] = await Promise.all([
            repository.findRun(repositoryContext, runId),
            repository.listRunEvents(repositoryContext, runId),
          ]);
          if (!record) {
            yield {
              kind: "error",
              schemaVersion: "sandbox-agent.run-events/v1",
              runId,
              code: "stream-failed",
              retryable: false,
            };
            return;
          }
          const first = all[0];
          if (first && first.sequence > cursor + 1) {
            yield {
              kind: "error",
              schemaVersion: "sandbox-agent.run-events/v1",
              runId,
              code: "cursor-gap",
              retryable: false,
            };
            return;
          }
          for (const event of all
            .filter((candidate) => candidate.sequence > cursor)
            .slice(0, limit)) {
            cursor = event.sequence;
            yield {
              kind: "event",
              schemaVersion: "sandbox-agent.run-events/v1",
              cursor: String(event.sequence),
              runId,
              sequence: event.sequence,
              occurredAt: event.createdAt,
              eventType: event.type,
              data: event.data,
            };
          }
          if (all.some((event) => event.sequence > cursor)) continue;
          if (record.run.toState().status.isTerminal()) {
            yield {
              kind: "closed",
              schemaVersion: "sandbox-agent.run-events/v1",
              runId,
              reason: "terminal",
            };
            return;
          }
          await new Promise<void>((resolve) => {
            const onAbort = () => {
              clearTimeout(timeout);
              resolve();
            };
            const timeout = setTimeout(() => {
              signal?.removeEventListener("abort", onAbort);
              resolve();
            }, 50);
            signal?.addEventListener("abort", onAbort, { once: true });
          });
        }
      },
    };
    return ok({ mode: "stream", runId, stream });
  }

  async createSourceArtifact(
    context: ExecutionContext,
    input: { sandboxId: string; sourceRoot: string },
  ): Promise<Result<SourceArtifactDescriptor>> {
    const sandbox = await this.dependencies.sandboxReader.show(context, input.sandboxId);
    if (sandbox.status !== "ready")
      return err(domainError.conflict("Sandbox must be ready to capture Artifact"));
    const repositoryContext = toRepositoryContext(context);
    const runtimes = await this.dependencies.repository.listRuntimes(
      repositoryContext,
      input.sandboxId,
    );
    if (runtimes.some((record) => record.runtime.toState().activeRunId)) {
      return err(domainError.conflict("Source Artifact capture requires an idle Sandbox"));
    }
    const artifactId = SourceArtifactId.create(this.dependencies.idGenerator.next("sart"));
    if (artifactId.isErr()) return err(artifactId.error);
    let captured: Awaited<
      ReturnType<SandboxAgentDeliveryDependencies["artifactCapture"]["capture"]>
    >;
    try {
      captured = await this.dependencies.artifactCapture.capture(context, {
        artifactId: artifactId.value.value,
        ...input,
      });
    } catch (error) {
      return err(infrastructureError(error));
    }
    const sandboxId = SandboxId.create(input.sandboxId);
    const digest = SourceArtifactDigest.create(captured.digest);
    const manifest = SourceArtifactManifest.create(captured.entries);
    const revision = WorkspaceRevision.create(captured.workspaceRevision);
    const storeReference = SourceArtifactStoreReference.create(captured.storeReference);
    const createdAt = asCreatedAt(this.dependencies.clock.now());
    for (const candidate of [
      artifactId,
      sandboxId,
      digest,
      manifest,
      revision,
      storeReference,
      createdAt,
    ]) {
      if (candidate.isErr()) return err(candidate.error);
    }
    const existing = await this.dependencies.repository.findArtifactByDigest(
      repositoryContext,
      input.sandboxId,
      digest._unsafeUnwrap().value,
    );
    if (existing) {
      try {
        await this.dependencies.artifactCapture.delete(context, {
          artifactId: artifactId._unsafeUnwrap().value,
          storeReference: storeReference._unsafeUnwrap().value,
        });
      } catch (error) {
        return err(infrastructureError(error));
      }
      return ok(artifactDescriptor(existing));
    }
    const artifact = SourceArtifact.create({
      id: artifactId._unsafeUnwrap(),
      sandboxId: sandboxId._unsafeUnwrap(),
      digest: digest._unsafeUnwrap(),
      manifest: manifest._unsafeUnwrap(),
      sourceRoot: input.sourceRoot,
      workspaceRevision: revision._unsafeUnwrap(),
      storeReference: storeReference._unsafeUnwrap(),
      createdAt: createdAt._unsafeUnwrap(),
    });
    if (artifact.isErr()) return err(artifact.error);
    try {
      await this.dependencies.repository.saveArtifact(repositoryContext, artifact.value);
    } catch (error) {
      const raced = await this.dependencies.repository.findArtifactByDigest(
        repositoryContext,
        input.sandboxId,
        digest._unsafeUnwrap().value,
      );
      if (!raced) return err(infrastructureError(error));
      await this.dependencies.artifactCapture.delete(context, {
        artifactId: artifactId._unsafeUnwrap().value,
        storeReference: storeReference._unsafeUnwrap().value,
      });
      return ok(artifactDescriptor(raced));
    }
    return ok(artifactDescriptor(artifact.value));
  }

  async createCandidatePreview(
    context: ExecutionContext,
    input: { artifactId: string },
  ): Promise<Result<CandidatePreviewRecord>> {
    const repositoryContext = toRepositoryContext(context);
    const artifact = await this.dependencies.repository.findArtifact(
      repositoryContext,
      input.artifactId,
    );
    if (artifact?.toState().status.value !== "available") {
      return err(domainError.notFound("SourceArtifact", input.artifactId));
    }
    const state = artifact.toState();
    const previewIdResult = PromotionCandidatePreviewId.create(
      this.dependencies.idGenerator.next("sprev"),
    );
    if (previewIdResult.isErr()) return err(previewIdResult.error);
    try {
      const result = await this.dependencies.previewProvider.create(context, {
        previewId: previewIdResult.value.value,
        artifactId: state.id.value,
        artifactDigest: state.digest.value,
        storeReference: state.storeReference.value,
      });
      if (
        result.artifactDigest !== state.digest.value ||
        result.previewId !== previewIdResult.value.value
      ) {
        return err(domainError.conflict("Candidate Preview does not match Source Artifact"));
      }
      const preview: CandidatePreviewRecord = {
        previewId: result.previewId,
        artifactId: state.id.value,
        artifactDigest: result.artifactDigest,
        status: result.status,
        ...(result.url ? { url: result.url } : {}),
        expiresAt: result.expiresAt,
        verified: result.verified,
      };
      await this.dependencies.repository.savePreview(repositoryContext, preview);
      return ok(preview);
    } catch (error) {
      return err(infrastructureError(error));
    }
  }

  async listSourceArtifacts(
    context: ExecutionContext,
    sandboxId: string,
  ): Promise<Result<{ items: SourceArtifactDescriptor[] }>> {
    const artifacts = await this.dependencies.repository.listArtifacts(
      toRepositoryContext(context),
      sandboxId,
    );
    return ok({ items: artifacts.map(artifactDescriptor) });
  }

  async showSourceArtifact(
    context: ExecutionContext,
    artifactId: string,
  ): Promise<Result<SourceArtifactDescriptor>> {
    const artifact = await this.dependencies.repository.findArtifact(
      toRepositoryContext(context),
      artifactId,
    );
    return artifact
      ? ok(artifactDescriptor(artifact))
      : err(domainError.notFound("SourceArtifact", artifactId));
  }

  async deleteSourceArtifact(
    context: ExecutionContext,
    artifactId: string,
  ): Promise<Result<SourceArtifactDescriptor>> {
    const repositoryContext = toRepositoryContext(context);
    const artifact = await this.dependencies.repository.findArtifact(repositoryContext, artifactId);
    if (!artifact) return err(domainError.notFound("SourceArtifact", artifactId));
    if (artifact.toState().status.value === "deleted") return ok(artifactDescriptor(artifact));
    const deleted = artifact.delete();
    if (deleted.isErr()) return err(deleted.error);
    try {
      await this.dependencies.artifactCapture.delete(context, {
        artifactId,
        storeReference: artifact.toState().storeReference.value,
      });
    } catch (error) {
      return err(infrastructureError(error));
    }
    await this.dependencies.repository.saveArtifact(repositoryContext, artifact);
    return ok(artifactDescriptor(artifact));
  }

  async showCandidatePreview(
    context: ExecutionContext,
    previewId: string,
  ): Promise<Result<CandidatePreviewRecord>> {
    const repositoryContext = toRepositoryContext(context);
    const preview = await this.dependencies.repository.findPreview(repositoryContext, previewId);
    if (
      preview &&
      preview.status === "ready" &&
      new Date(preview.expiresAt) <= new Date(this.dependencies.clock.now())
    ) {
      const expired = { ...preview, status: "expired" as const, verified: false };
      await this.dependencies.repository.savePreview(repositoryContext, expired);
      return ok(expired);
    }
    return preview
      ? ok(preview)
      : err(domainError.notFound("PromotionCandidatePreview", previewId));
  }

  async deleteCandidatePreview(
    context: ExecutionContext,
    previewId: string,
  ): Promise<Result<CandidatePreviewRecord>> {
    const repositoryContext = toRepositoryContext(context);
    const preview = await this.dependencies.repository.findPreview(repositoryContext, previewId);
    if (!preview) return err(domainError.notFound("PromotionCandidatePreview", previewId));
    try {
      await this.dependencies.previewProvider.delete(context, { previewId });
    } catch (error) {
      return err(infrastructureError(error));
    }
    const deleted = { ...preview, status: "deleted" as const, verified: false };
    await this.dependencies.repository.savePreview(repositoryContext, deleted);
    return ok(deleted);
  }

  async planPromotion(
    context: ExecutionContext,
    input: {
      sandboxId: string;
      artifactId: string;
      expectedArtifactDigest: string;
      candidatePreviewId: string;
      target: SandboxPromotionTargetState;
    },
  ): Promise<Result<SandboxPromotionDescriptor>> {
    const repositoryContext = toRepositoryContext(context);
    const artifact = await this.dependencies.repository.findArtifact(
      repositoryContext,
      input.artifactId,
    );
    if (!artifact || artifact.toState().sandboxId.value !== input.sandboxId) {
      return err(domainError.notFound("SourceArtifact", input.artifactId));
    }
    if (artifact.toState().digest.value !== input.expectedArtifactDigest) {
      return err(domainError.conflict("Sandbox Promotion artifact digest mismatch"));
    }
    const preview = await this.dependencies.repository.findPreview(
      repositoryContext,
      input.candidatePreviewId,
    );
    if (
      !preview ||
      preview.artifactId !== input.artifactId ||
      preview.artifactDigest !== input.expectedArtifactDigest ||
      preview.status !== "ready" ||
      !preview.verified ||
      new Date(preview.expiresAt) <= new Date(this.dependencies.clock.now())
    ) {
      return err(domainError.conflict("Verified Candidate Preview is required"));
    }
    const promotionId = SandboxPromotionId.create(this.dependencies.idGenerator.next("sprom"));
    const sandboxId = SandboxId.create(input.sandboxId);
    const artifactId = SourceArtifactId.create(input.artifactId);
    const digest = SourceArtifactDigest.create(input.expectedArtifactDigest);
    const previewId = PromotionCandidatePreviewId.create(input.candidatePreviewId);
    const createdAt = asCreatedAt(this.dependencies.clock.now());
    const expiry = new Date(this.dependencies.clock.now());
    expiry.setMinutes(expiry.getMinutes() + 30);
    const expiresAt = ExpiresAt.create(expiry);
    for (const candidate of [
      promotionId,
      sandboxId,
      artifactId,
      digest,
      previewId,
      createdAt,
      expiresAt,
    ]) {
      if (candidate.isErr()) return err(candidate.error);
    }
    const promotion = SandboxPromotion.plan({
      id: promotionId._unsafeUnwrap(),
      sandboxId: sandboxId._unsafeUnwrap(),
      artifactId: artifactId._unsafeUnwrap(),
      artifactDigest: digest._unsafeUnwrap(),
      candidatePreviewId: previewId._unsafeUnwrap(),
      target: input.target,
      createdAt: createdAt._unsafeUnwrap(),
      expiresAt: expiresAt._unsafeUnwrap(),
    });
    if (promotion.isErr()) return err(promotion.error);
    await this.dependencies.repository.savePromotion(repositoryContext, promotion.value);
    return ok(promotionDescriptor(promotion.value));
  }

  async acceptPromotion(
    context: ExecutionContext,
    input: { promotionId: string; expectedArtifactDigest: string; idempotencyKey: string },
  ): Promise<Result<SandboxPromotionDescriptor>> {
    const actor = requireExternalApprovalActor(context);
    if (actor.isErr()) return err(actor.error);
    const repositoryContext = toRepositoryContext(context);
    const promotion = await this.dependencies.repository.findPromotion(
      repositoryContext,
      input.promotionId,
    );
    if (!promotion) return err(domainError.notFound("SandboxPromotion", input.promotionId));
    const digest = SourceArtifactDigest.create(input.expectedArtifactDigest);
    const at = asUpdatedAt(this.dependencies.clock.now());
    if (digest.isErr()) return err(digest.error);
    if (at.isErr()) return err(at.error);
    const previouslyAcceptedKey = promotion.toState().acceptedIdempotencyKey?.value;
    const accepted = promotion.accept({
      expectedArtifactDigest: digest.value,
      idempotencyKey: input.idempotencyKey,
      at: at.value,
    });
    if (accepted.isErr()) return err(accepted.error);
    if (previouslyAcceptedKey === input.idempotencyKey) {
      await this.dependencies.workQueue.enqueue(context, {
        kind: "sandbox-promotion",
        id: input.promotionId,
      });
      return ok(promotionDescriptor(promotion));
    }
    const artifact = await this.dependencies.repository.findArtifact(
      repositoryContext,
      promotion.toState().artifactId.value,
    );
    if (!artifact)
      return err(domainError.notFound("SourceArtifact", promotion.toState().artifactId.value));
    const protectedReference = artifact.protectReference();
    if (protectedReference.isErr()) return err(protectedReference.error);
    await this.dependencies.repository.saveArtifact(repositoryContext, artifact);
    await this.dependencies.repository.savePromotion(repositoryContext, promotion);
    await this.dependencies.workQueue.enqueue(context, {
      kind: "sandbox-promotion",
      id: input.promotionId,
    });
    return ok(promotionDescriptor(promotion));
  }

  async reconcilePromotion(
    context: ExecutionContext,
    promotionId: string,
  ): Promise<Result<SandboxPromotionDescriptor>> {
    const repositoryContext = toRepositoryContext(context);
    const promotion = await this.dependencies.repository.findPromotion(
      repositoryContext,
      promotionId,
    );
    if (!promotion) return err(domainError.notFound("SandboxPromotion", promotionId));
    if (promotion.toState().status.value === "completed") return ok(promotionDescriptor(promotion));
    const artifact = await this.dependencies.repository.findArtifact(
      repositoryContext,
      promotion.toState().artifactId.value,
    );
    if (!artifact)
      return err(domainError.notFound("SourceArtifact", promotion.toState().artifactId.value));
    try {
      let state = promotion.toState();
      if (!state.resourceId) {
        const result = await this.dependencies.promotionTarget.createResource(context, {
          promotionId,
          artifactId: state.artifactId.value,
          artifactDigest: state.artifactDigest.value,
          storeReference: artifact.toState().storeReference.value,
          target: state.target.toState(),
        });
        const at = asUpdatedAt(this.dependencies.clock.now());
        if (at.isErr()) return err(at.error);
        const recorded = promotion.recordResource({ resourceId: result.resourceId, at: at.value });
        if (recorded.isErr()) return err(recorded.error);
        await this.dependencies.repository.savePromotion(repositoryContext, promotion);
        state = promotion.toState();
      }
      if (!state.deploymentId) {
        const resourceId = state.resourceId?.value;
        if (!resourceId) return err(domainError.conflict("Promotion Resource was not recorded"));
        const result = await this.dependencies.promotionTarget.createDeployment(context, {
          promotionId,
          resourceId,
          artifactId: state.artifactId.value,
          artifactDigest: state.artifactDigest.value,
          storeReference: artifact.toState().storeReference.value,
          target: state.target.toState(),
        });
        const at = asUpdatedAt(this.dependencies.clock.now());
        if (at.isErr()) return err(at.error);
        const recorded = promotion.recordDeployment({
          deploymentId: result.deploymentId,
          at: at.value,
        });
        if (recorded.isErr()) return err(recorded.error);
        await this.dependencies.repository.savePromotion(repositoryContext, promotion);
        state = promotion.toState();
      }
      const resourceId = state.resourceId?.value;
      const deploymentId = state.deploymentId?.value;
      if (!resourceId || !deploymentId) {
        return err(domainError.conflict("Promotion delivery attempt was not recorded"));
      }
      const proof = await this.dependencies.promotionTarget.readProof(context, {
        promotionId,
        resourceId,
        deploymentId,
      });
      const at = asUpdatedAt(this.dependencies.clock.now());
      if (at.isErr()) return err(at.error);
      if (proof.verdict === "verified") {
        const completed = promotion.markVerified({ at: at.value });
        if (completed.isErr()) return err(completed.error);
      } else if (proof.verdict === "failed") {
        const failed = promotion.markFailed({
          at: at.value,
          code: proof.reasonCode ?? "deployment_proof_failed",
        });
        if (failed.isErr()) return err(failed.error);
      }
      await this.dependencies.repository.savePromotion(repositoryContext, promotion);
      return ok(promotionDescriptor(promotion));
    } catch (error) {
      const at = asUpdatedAt(this.dependencies.clock.now());
      if (at.isOk()) {
        promotion.markFailed({ at: at.value, code: "sandbox_promotion_adapter_failed" });
        await this.dependencies.repository.savePromotion(repositoryContext, promotion);
      }
      return err(infrastructureError(error));
    }
  }

  async showPromotion(
    context: ExecutionContext,
    promotionId: string,
  ): Promise<Result<SandboxPromotionDescriptor>> {
    const promotion = await this.dependencies.repository.findPromotion(
      toRepositoryContext(context),
      promotionId,
    );
    return promotion
      ? ok(promotionDescriptor(promotion))
      : err(domainError.notFound("SandboxPromotion", promotionId));
  }

  async listPromotions(
    context: ExecutionContext,
    sandboxId: string,
  ): Promise<Result<{ items: SandboxPromotionDescriptor[] }>> {
    const promotions = await this.dependencies.repository.listPromotions(
      toRepositoryContext(context),
      sandboxId,
    );
    return ok({ items: promotions.map(promotionDescriptor) });
  }

  async retryPromotion(
    context: ExecutionContext,
    promotionId: string,
    idempotencyKey: string,
  ): Promise<Result<SandboxPromotionDescriptor>> {
    const actor = requireExternalApprovalActor(context);
    if (actor.isErr()) return err(actor.error);
    const repositoryContext = toRepositoryContext(context);
    const promotion = await this.dependencies.repository.findPromotion(
      repositoryContext,
      promotionId,
    );
    if (!promotion) return err(domainError.notFound("SandboxPromotion", promotionId));
    const at = asUpdatedAt(this.dependencies.clock.now());
    if (at.isErr()) return err(at.error);
    const retried = promotion.retry({ idempotencyKey, at: at.value });
    if (retried.isErr()) return err(retried.error);
    await this.dependencies.repository.savePromotion(repositoryContext, promotion);
    await this.dependencies.workQueue.enqueue(context, {
      kind: "sandbox-promotion",
      id: promotionId,
    });
    return ok(promotionDescriptor(promotion));
  }
}
