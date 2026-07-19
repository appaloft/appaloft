import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  ArchivedAt,
  BuildStrategyKindValue,
  CommandText,
  ConfigKey,
  ConfigScopeValue,
  ConfigValueText,
  CreatedAt,
  DeactivatedAt,
  DependencyResourceProviderRealizationAttemptId,
  DependencyResourceProviderRealizationStatusValue,
  DependencyResourceProviderResourceHandle,
  DependencyResourceSecretRef,
  DependencyResourceSourceModeValue,
  Deployment,
  DeploymentByIdSpec,
  DeploymentDependencyRuntimeSecretRef,
  DeploymentId,
  DeploymentPhaseValue,
  type DeploymentSelectionSpec,
  DeploymentTarget,
  DeploymentTargetByIdSpec,
  DeploymentTargetDescriptor,
  DeploymentTargetId,
  DeploymentTargetName,
  DeploymentTimelineJournalEntry,
  Destination,
  DestinationId,
  DestinationKindValue,
  DestinationName,
  DetectSummary,
  DisplayNameText,
  DockerComposeFilePath,
  DockerfilePath,
  domainError,
  EdgeProxyKindValue,
  Environment,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  EnvironmentSnapshotId,
  ErrorCodeText,
  ExecutionResult,
  ExecutionStatusValue,
  ExecutionStrategyKindValue,
  ExitCode,
  err,
  FinishedAt,
  GeneratedAt,
  HostAddress,
  ImageReference,
  LogLevelValue,
  MessageText,
  OccurredAt,
  ok,
  PackagingModeValue,
  PlanStepText,
  PortNumber,
  Project,
  ProjectId,
  ProjectName,
  ProviderKey,
  Resource,
  ResourceBinding,
  ResourceBindingId,
  ResourceBindingScopeValue,
  ResourceBindingSecretRef,
  ResourceBindingSecretVersion,
  ResourceBindingTargetName,
  ResourceByIdSpec,
  ResourceExposureModeValue,
  ResourceGeneratedAccessModeValue,
  ResourceId,
  ResourceInjectionModeValue,
  ResourceInstance,
  ResourceInstanceId,
  ResourceInstanceKindValue,
  ResourceInstanceName,
  ResourceKindValue,
  ResourceName,
  ResourceNetworkProtocolValue,
  ResourceSlug,
  ResourceStorageAttachmentId,
  ResourceStorageMountModeValue,
  type Result,
  type RollbackPlan,
  RoutePathPrefix,
  RuntimeExecutionPlan,
  RuntimeNameText,
  RuntimePlan,
  RuntimePlanId,
  RuntimePlanStrategyValue,
  SourceBaseDirectory,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
  StartedAt,
  StaticPublishDirectory,
  StorageDestinationPath,
  StorageVolumeId,
  StorageVolumeKindValue,
  TargetKindValue,
  UpdatedAt,
  UpsertDeploymentSpec,
  UpsertDeploymentTargetSpec,
  UpsertDestinationSpec,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  UpsertResourceBindingSpec,
  UpsertResourceInstanceSpec,
  UpsertResourceSpec,
  VariableExposureValue,
  VariableKindValue,
  Version,
  VersionReference,
} from "@appaloft/core";
import {
  CapturedEventBus,
  FakeDependencyResourceBackupProvider,
  FakeDependencyResourceSecretStore,
  FakeManagedDependencyProvider,
  FixedClock,
  MemoryDependencyResourceBackupRepository,
  MemoryDependencyResourceRepository,
  MemoryDeploymentReadModel,
  MemoryDeploymentRepository,
  MemoryDestinationRepository,
  MemoryEnvironmentProfileDecisionStore,
  MemoryEnvironmentRepository,
  MemoryProjectRepository,
  MemoryResourceDependencyBindingReadModel,
  MemoryResourceDependencyBindingRepository,
  MemoryResourceRepository,
  MemoryServerRepository,
  NoopLogger,
  PassThroughMutationCoordinator,
  SequenceIdGenerator,
  TestControlPlaneSecretProtector,
} from "@appaloft/testkit";

const testSecretProtector = new TestControlPlaneSecretProtector();
const testProtectedSecret = (value: string) =>
  `appaloft-test-secret:v1:${Buffer.from(value, "utf8").toString("base64url")}`;

const unavailableSecretProtector: ControlPlaneSecretProtector = {
  activeKeyId: () => null,
  inspect: () => ({ state: "unreadable" }),
  protect: async () =>
    err({
      code: "control_plane_secret_keyring_unavailable",
      category: "infra",
      message: "Control-plane secret keyring is unavailable; operation was blocked",
      retryable: false,
      details: { phase: "control-plane-secret-materialization" },
    }),
  unprotect: async () =>
    err({
      code: "control_plane_secret_keyring_unavailable",
      category: "infra",
      message: "Control-plane secret keyring is unavailable; deployment was blocked",
      retryable: false,
      details: { phase: "control-plane-secret-materialization" },
    }),
  rewrap: async () =>
    err({
      code: "control_plane_secret_keyring_unavailable",
      category: "infra",
      message: "Control-plane secret keyring is unavailable; rotation was blocked",
      retryable: false,
      details: { phase: "control-plane-secret-rotation" },
    }),
};

import { DeploymentTimelineProgressRecorder } from "../src/deployment-progress-recorder";
import {
  type DurableWorkClaimInput,
  type DurableWorkClaimResult,
  type DurableWorkCompletionInput,
  type DurableWorkCompletionResult,
  type DurableWorkDeliveryCandidateFilter,
  type DurableWorkEventRecord,
  type DurableWorkItemRecord,
  type DurableWorkListFilter,
  type DurableWorkQueueAdapter,
  drainDurableWorkOnce,
} from "../src/durable-work";
import {
  createExecutionContext,
  type ExecutionContext,
  type RepositoryContext,
  toRepositoryContext,
} from "../src/execution-context";
import { CreateDeploymentCommand } from "../src/operations/deployments/create-deployment.command";
import {
  type ScheduledRuntimePrunePolicyListFilter,
  type ScheduledRuntimePrunePolicyRecord,
  type ScheduledRuntimePrunePolicyRepository,
} from "../src/operations/servers/scheduled-runtime-prune.service";
import {
  type ControlPlaneSecretProtector,
  type DefaultAccessDomainProvider,
  type DefaultAccessDomainRequest,
  type DeploymentConfigReader,
  type DeploymentConfigSnapshot,
  type DeploymentContextDefaultsPolicy,
  type DeploymentProgressRecorder,
  type DeploymentProgressReporter,
  type DomainRouteBindingCandidate,
  type DomainRouteBindingReader,
  type ExecutionBackend,
  type OperationCheckRequest,
  type OperationGuardDecision,
  type OperationGuardPort,
  type ProcessAttemptRecord,
  type ProcessAttemptRecorder,
  type ProviderDescriptor,
  type ProviderRegistry,
  type RuntimePlanResolver,
  type RuntimeTargetBackend,
  type RuntimeTargetBackendRegistry,
  type RuntimeTargetCapability,
  type ServerAppliedRouteDesiredStateReader,
  type ServerAppliedRouteDesiredStateRecord,
  type ServerAppliedRouteDesiredStateTarget,
  type ServerAppliedRouteStateSelectionSpec,
  type ServerAppliedRouteStateSelectionSpecVisitor,
  type SourceDetector,
  type SourceVersionDetector,
} from "../src/ports";
import {
  BindResourceDependencyUseCase,
  CreateDependencyResourceBackupUseCase,
  CreateDeploymentUseCase,
  DefaultAccessDomainRuntimePlanResolver,
  DeploymentContextBootstrapService,
  DeploymentContextDefaultsFactory,
  DeploymentContextResolver,
  DeploymentDurableWorkHandler,
  DeploymentFactory,
  DeploymentLifecycleService,
  DeploymentSnapshotFactory,
  ProvisionDependencyResourceUseCase,
  RestoreDependencyResourceBackupUseCase,
  RuntimePlanResolutionInputBuilder,
} from "../src/use-cases";

class StaticSourceDetector implements SourceDetector {
  async detect(_context: ExecutionContext, locator: string) {
    const source = SourceDescriptor.rehydrate({
      kind: SourceKindValue.rehydrate("local-folder"),
      locator: SourceLocator.rehydrate(locator),
      displayName: DisplayNameText.rehydrate("workspace"),
    });

    return ok({
      source,
      reasoning: ["detected local folder workspace"],
    });
  }
}

class StaticUnknownSourceVersionDetector implements SourceVersionDetector {
  calls = 0;

  async detect(_context: ExecutionContext, _input: Parameters<SourceVersionDetector["detect"]>[1]) {
    this.calls += 1;
    return ok({
      version: Version.unknown(),
      reasoning: ["runtime target will report Docker image digest"],
    });
  }
}

class StaticRuntimePlanResolver implements RuntimePlanResolver {
  async resolve(_context: ExecutionContext, input: Parameters<RuntimePlanResolver["resolve"]>[1]) {
    return RuntimePlan.create({
      id: RuntimePlanId.rehydrate(input.id),
      source: input.source,
      buildStrategy: BuildStrategyKindValue.rehydrate("dockerfile"),
      packagingMode: PackagingModeValue.rehydrate("all-in-one-docker"),
      execution: RuntimeExecutionPlan.rehydrate({
        kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
        image: ImageReference.rehydrate("demo:test"),
        port: PortNumber.rehydrate(3000),
      }),
      target: DeploymentTargetDescriptor.rehydrate({
        kind: input.server.targetKind,
        providerKey: input.server.providerKey,
        serverIds: [input.server.id],
        metadata: {
          snapshotId: input.environmentSnapshot.toState().id.value,
        },
      }),
      detectSummary: DetectSummary.rehydrate(input.detectedReasoning.join(" | ")),
      steps: [
        PlanStepText.rehydrate("package workspace"),
        PlanStepText.rehydrate("ship image"),
        PlanStepText.rehydrate("verify health"),
      ],
      generatedAt: GeneratedAt.rehydrate(input.generatedAt),
    });
  }
}

class CapturingRuntimePlanResolver implements RuntimePlanResolver {
  public input?: Parameters<RuntimePlanResolver["resolve"]>[1];

  async resolve(context: ExecutionContext, input: Parameters<RuntimePlanResolver["resolve"]>[1]) {
    this.input = input;
    return new StaticRuntimePlanResolver().resolve(context, input);
  }
}

class StaticDefaultAccessDomainProvider implements DefaultAccessDomainProvider {
  public readonly calls: DefaultAccessDomainRequest[] = [];

  async generate(_context: ExecutionContext, input: DefaultAccessDomainRequest) {
    this.calls.push(input);
    return ok({
      kind: "generated" as const,
      domain: {
        hostname: "web.203-0-113-10.sslip.io",
        scheme: "https" as const,
        providerKey: "sslip",
      },
    });
  }
}

class StaticServerAppliedRouteDesiredStateReader implements ServerAppliedRouteDesiredStateReader {
  public targets: ServerAppliedRouteDesiredStateTarget[] = [];

  constructor(private readonly record: ServerAppliedRouteDesiredStateRecord | null) {}

  async findOne(
    spec: ServerAppliedRouteStateSelectionSpec,
  ): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>> {
    const unsupported: Result<ServerAppliedRouteDesiredStateRecord | null> = err(
      domainError.validation("Unsupported route-state selection spec for test reader", {
        phase: "test-double",
      }),
    );

    return spec.accept(unsupported, {
      visitServerAppliedRouteStateByTarget: (_query, targetSpec) => {
        this.targets.push(targetSpec.target);
        return ok(this.record);
      },
      visitServerAppliedRouteStateByRouteSetId: () => unsupported,
      visitServerAppliedRouteStateBySourceFingerprint: () => unsupported,
    } satisfies ServerAppliedRouteStateSelectionSpecVisitor<
      Result<ServerAppliedRouteDesiredStateRecord | null>
    >);
  }
}

class StaticDomainRouteBindingReader implements DomainRouteBindingReader {
  public targets: Parameters<DomainRouteBindingReader["listDeployableBindings"]>[1][] = [];

  constructor(private readonly bindings: DomainRouteBindingCandidate[]) {}

  async listDeployableBindings(
    _context: Parameters<DomainRouteBindingReader["listDeployableBindings"]>[0],
    input: Parameters<DomainRouteBindingReader["listDeployableBindings"]>[1],
  ): Promise<DomainRouteBindingCandidate[]> {
    this.targets.push(input);
    return this.bindings;
  }
}

class HermeticExecutionBackend implements ExecutionBackend {
  async execute(
    _context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    deployment.applyExecutionResult(
      FinishedAt.rehydrate("2026-01-01T00:03:00.000Z"),
      ExecutionResult.rehydrate({
        exitCode: ExitCode.rehydrate(0),
        status: ExecutionStatusValue.rehydrate("succeeded"),
        retryable: false,
        timeline: [
          DeploymentTimelineJournalEntry.rehydrate({
            timestamp: OccurredAt.rehydrate("2026-01-01T00:02:00.000Z"),
            phase: DeploymentPhaseValue.rehydrate("deploy"),
            level: LogLevelValue.rehydrate("info"),
            message: MessageText.rehydrate("Hermetic execution backend applied runtime plan"),
          }),
        ],
      }),
    );

    return ok({ deployment });
  }

  async rollback(
    _context: ExecutionContext,
    deployment: Deployment,
    _plan: RollbackPlan,
  ): Promise<Result<{ deployment: Deployment }>> {
    deployment.applyExecutionResult(
      FinishedAt.rehydrate("2026-01-01T00:04:00.000Z"),
      ExecutionResult.rehydrate({
        exitCode: ExitCode.rehydrate(0),
        status: ExecutionStatusValue.rehydrate("rolled-back"),
        retryable: false,
        timeline: [
          DeploymentTimelineJournalEntry.rehydrate({
            timestamp: OccurredAt.rehydrate("2026-01-01T00:04:00.000Z"),
            phase: DeploymentPhaseValue.rehydrate("rollback"),
            level: LogLevelValue.rehydrate("info"),
            message: MessageText.rehydrate("Hermetic rollback completed"),
          }),
        ],
      }),
    );

    return ok({ deployment });
  }

  async cancel(): Promise<Result<{ timeline: DeploymentTimelineJournalEntry[] }>> {
    return ok({
      timeline: [
        DeploymentTimelineJournalEntry.rehydrate({
          timestamp: OccurredAt.rehydrate("2026-01-01T00:04:00.000Z"),
          phase: DeploymentPhaseValue.rehydrate("deploy"),
          level: LogLevelValue.rehydrate("warn"),
          message: MessageText.rehydrate("Hermetic cancellation completed"),
        }),
      ],
    });
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

class DeferredExecutionBackend extends HermeticExecutionBackend {
  readonly started = deferred<Deployment>();
  readonly release = deferred<void>();
  readonly completed = deferred<void>();

  override async execute(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    this.started.resolve(deployment);
    await this.release.promise;
    const result = await super.execute(context, deployment);
    this.completed.resolve();
    return result;
  }
}

class DurableProgressDeferredExecutionBackend extends HermeticExecutionBackend {
  readonly started = deferred<Deployment>();
  readonly release = deferred<void>();
  readonly completed = deferred<void>();
  readonly reported = deferred<void>();

  constructor(private readonly progressRecorder: () => DeploymentProgressRecorder) {
    super();
  }

  override async execute(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    const deploymentId = deployment.toState().id.value;
    const recorded = await this.progressRecorder().record(context, {
      timestamp: "2026-01-01T00:02:30.000Z",
      deploymentId,
      source: "appaloft",
      phase: "deploy",
      level: "info",
      status: "running",
      message: "Runtime container was started",
      step: {
        current: 4,
        total: 5,
        label: "Start runtime",
      },
    });
    if (recorded.isErr()) {
      this.reported.reject(recorded.error);
    } else {
      this.reported.resolve();
    }

    this.started.resolve(deployment);
    await this.release.promise;
    const result = await super.execute(context, deployment);
    this.completed.resolve();
    return result;
  }
}

class CountingExecutionBackend extends HermeticExecutionBackend {
  calls = 0;
  lastContext?: ExecutionContext;

  override async execute(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    this.calls += 1;
    this.lastContext = context;
    return super.execute(context, deployment);
  }
}

class HermeticRuntimeTargetBackend
  extends HermeticExecutionBackend
  implements RuntimeTargetBackend
{
  readonly descriptor: RuntimeTargetBackend["descriptor"];

  constructor(
    capabilities: RuntimeTargetCapability[] = [
      "runtime.apply",
      "runtime.verify",
      "runtime.dependency-secrets",
      "runtime.logs",
      "runtime.health",
      "runtime.cleanup",
      "proxy.route",
    ],
  ) {
    super();
    this.descriptor = {
      key: "single-server-generic-ssh",
      providerKey: "generic-ssh",
      targetKinds: ["single-server" as const],
      capabilities,
    };
  }
}

class StaticRuntimeTargetBackendRegistry implements RuntimeTargetBackendRegistry {
  private readonly backend: HermeticRuntimeTargetBackend;

  constructor(
    private readonly supported = true,
    capabilities?: RuntimeTargetCapability[],
  ) {
    this.backend = new HermeticRuntimeTargetBackend(capabilities);
  }

  find(input: Parameters<RuntimeTargetBackendRegistry["find"]>[0]): Result<RuntimeTargetBackend> {
    if (this.supported) {
      return ok(this.backend);
    }

    return err(
      domainError.runtimeTargetUnsupported("Runtime target backend is not registered", {
        phase: "runtime-target-resolution",
        targetKind: input.targetKind,
        providerKey: input.providerKey,
        missingCapability: input.requiredCapabilities?.[0] ?? "runtime.apply",
      }),
    );
  }
}

class FailingStaticPackageExecutionBackend extends HermeticExecutionBackend {
  async execute(): Promise<Result<{ deployment: Deployment }>> {
    return err(
      domainError.provider(
        "Static artifact package failed",
        {
          phase: "image-build",
          step: "static-package",
          runtimePlanStrategy: "static",
          publishDirectory: "/dist",
        },
        true,
      ),
    );
  }
}

class CapacityExhaustedExecutionBackend extends HermeticExecutionBackend {
  async execute(
    _context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    deployment.applyExecutionResult(
      FinishedAt.rehydrate("2026-01-01T00:03:00.000Z"),
      ExecutionResult.rehydrate({
        exitCode: ExitCode.rehydrate(1),
        status: ExecutionStatusValue.rehydrate("failed"),
        retryable: true,
        errorCode: ErrorCodeText.rehydrate("runtime_target_resource_exhausted"),
        timeline: [
          DeploymentTimelineJournalEntry.rehydrate({
            timestamp: OccurredAt.rehydrate("2026-01-01T00:02:00.000Z"),
            phase: DeploymentPhaseValue.rehydrate("deploy"),
            level: LogLevelValue.rehydrate("error"),
            message: MessageText.rehydrate("Docker run failed with safe capacity signal"),
          }),
        ],
        metadata: {
          phase: "runtime-target-apply",
          step: "docker-run",
          capacityResource: "disk",
          capacitySignal: "disk-space-exhausted",
          capacityInspectCommand: "appaloft server capacity inspect srv_demo",
          capacityPruneCommand: "appaloft server capacity prune srv_demo --dry-run",
        },
      }),
    );

    return ok({ deployment });
  }
}

class CancelFailingExecutionBackend extends HermeticExecutionBackend {
  override async cancel(): Promise<Result<{ timeline: DeploymentTimelineJournalEntry[] }>> {
    return err(
      domainError.conflict("Hermetic cancellation failed", {
        phase: "runtime-execution",
        causeCode: "hermetic_cancel_failed",
      }),
    );
  }
}

class RecordingProcessAttemptRecorder implements ProcessAttemptRecorder {
  readonly records: ProcessAttemptRecord[] = [];

  async record(
    _context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>> {
    this.records.push(attempt);
    return ok(attempt);
  }
}

class RecordingDurableWorkAdapter implements DurableWorkQueueAdapter {
  readonly items = new Map<string, DurableWorkItemRecord>();
  readonly events: DurableWorkEventRecord[] = [];
  readonly claims: DurableWorkClaimInput[] = [];
  readonly completions: DurableWorkCompletionInput[] = [];

  async recordItem(
    _context: RepositoryContext,
    item: DurableWorkItemRecord,
  ): Promise<Result<DurableWorkItemRecord>> {
    this.items.set(item.id, item);
    return ok(item);
  }

  async appendEvent(
    _context: RepositoryContext,
    event: DurableWorkEventRecord,
  ): Promise<Result<DurableWorkEventRecord>> {
    this.events.push(event);
    return ok(event);
  }

  async findItem(
    _context: RepositoryContext,
    id: string,
  ): Promise<Result<DurableWorkItemRecord | null>> {
    return ok(this.items.get(id) ?? null);
  }

  async listItems(
    _context: RepositoryContext,
    filter: DurableWorkListFilter = {},
  ): Promise<Result<DurableWorkItemRecord[]>> {
    return ok(
      Array.from(this.items.values()).filter((item) => {
        const matchesDeployment = filter.deploymentId
          ? item.deploymentId === filter.deploymentId
          : true;
        const matchesStatus = filter.status ? item.status === filter.status : true;
        const matchesOperation = filter.operationKey
          ? item.operationKey === filter.operationKey
          : true;
        return matchesDeployment && matchesStatus && matchesOperation;
      }),
    );
  }

  async listEvents(
    _context: RepositoryContext,
    workItemId: string,
  ): Promise<Result<DurableWorkEventRecord[]>> {
    return ok(this.events.filter((event) => event.workItemId === workItemId));
  }

  async listDueCandidates(
    _context: RepositoryContext,
    filter: DurableWorkDeliveryCandidateFilter,
  ): Promise<Result<DurableWorkItemRecord[]>> {
    return ok(
      Array.from(this.items.values()).filter((item) => {
        const matchesStatus = item.status === "pending" || item.status === "retry-scheduled";
        const matchesTime = item.availableAt <= filter.now;
        const matchesOperation = filter.operationKey
          ? item.operationKey === filter.operationKey
          : true;
        return matchesStatus && matchesTime && matchesOperation;
      }),
    );
  }

  async claimDue(
    _context: RepositoryContext,
    input: DurableWorkClaimInput,
  ): Promise<Result<DurableWorkClaimResult>> {
    this.claims.push(input);
    const item = this.items.get(input.workItemId);
    if (!item) {
      return ok({ status: "not-found", workItemId: input.workItemId });
    }
    if (item.status !== "pending" && item.status !== "retry-scheduled") {
      return ok({ status: "refused", reason: "not-claimable", workItem: item });
    }
    const claimed: DurableWorkItemRecord = {
      ...item,
      status: "running",
      attemptCount: item.attemptCount + 1,
      leaseOwner: input.workerId,
      leaseExpiresAt: input.leaseExpiresAt,
      phase: "worker-claim",
      step: "claimed",
      startedAt: input.claimedAt,
      updatedAt: input.claimedAt,
    };
    this.items.set(item.id, claimed);
    return ok({ status: "claimed", workItem: claimed });
  }

  async complete(
    _context: RepositoryContext,
    input: DurableWorkCompletionInput,
  ): Promise<Result<DurableWorkCompletionResult>> {
    this.completions.push(input);
    const item = this.items.get(input.workItemId);
    if (!item) {
      return ok({ status: "not-found", workItemId: input.workItemId });
    }
    if (item.status !== "running") {
      return ok({ status: "not-running", workItem: item });
    }
    const { leaseOwner: _leaseOwner, leaseExpiresAt: _leaseExpiresAt, ...itemWithoutLease } = item;
    const completed: DurableWorkItemRecord = {
      ...itemWithoutLease,
      status: input.status,
      ...(input.phase ? { phase: input.phase } : {}),
      ...(input.step ? { step: input.step } : {}),
      updatedAt: input.completedAt,
      finishedAt: input.completedAt,
    };
    this.items.set(item.id, completed);
    return ok({ status: "completed", workItem: completed });
  }
}

class NoopDeploymentProgressReporter implements DeploymentProgressReporter {
  report(): void {}
}

class DenyingOperationGuardPort implements OperationGuardPort {
  readonly requests: OperationCheckRequest[] = [];

  async checkOperation(
    _context: ExecutionContext,
    request: OperationCheckRequest,
  ): Promise<OperationGuardDecision> {
    this.requests.push(request);
    return {
      allowed: false,
      checks: [
        {
          allowed: false,
          checkKey: "test.quota",
          kind: "quota",
          reason: "test-operation-denied",
        },
      ],
      deniedBy: {
        checkKey: "test.quota",
        kind: "quota",
      },
      reason: "test-operation-denied",
    };
  }
}

class NullDeploymentConfigReader implements DeploymentConfigReader {
  async read() {
    return ok(null);
  }
}

class StaticDeploymentConfigReader implements DeploymentConfigReader {
  constructor(private readonly config: DeploymentConfigSnapshot) {}

  async read() {
    return ok(this.config);
  }
}

class MemoryScheduledRuntimePrunePolicyRepository implements ScheduledRuntimePrunePolicyRepository {
  readonly items = new Map<string, ScheduledRuntimePrunePolicyRecord>();

  async findOne(
    _context: ReturnType<typeof toRepositoryContext>,
    policyId: string,
  ): Promise<Result<ScheduledRuntimePrunePolicyRecord | null>> {
    return ok(this.items.get(policyId) ?? null);
  }

  async list(
    context: ReturnType<typeof toRepositoryContext>,
    filter: ScheduledRuntimePrunePolicyListFilter = {},
  ) {
    const records = await this.listRecords(context, {
      ...filter,
      enabledOnly: filter.enabledOnly ?? true,
    });
    if (records.isErr()) {
      return err(records.error);
    }

    return ok(
      records.value.map((record) => ({
        id: record.id,
        version: record.version,
        scope: record.scope,
        serverId: record.serverId,
        retentionDays: record.retentionDays,
        destructive: record.destructive,
        categories: record.categories,
        retryOnFailure: record.retryOnFailure,
      })),
    );
  }

  async listRecords(
    _context: ReturnType<typeof toRepositoryContext>,
    filter: ScheduledRuntimePrunePolicyListFilter = {},
  ): Promise<Result<ScheduledRuntimePrunePolicyRecord[]>> {
    return ok(
      Array.from(this.items.values()).filter((record) => {
        const matchesEnabled = filter.enabledOnly === true ? record.enabled : true;
        const matchesServer = filter.serverId
          ? record.serverId === filter.serverId || record.serverId === "*"
          : true;
        const matchesScope = filter.scopes ? filter.scopes.includes(record.scope) : true;
        return matchesEnabled && matchesServer && matchesScope;
      }),
    );
  }

  async upsert(
    _context: ReturnType<typeof toRepositoryContext>,
    record: ScheduledRuntimePrunePolicyRecord,
  ): Promise<Result<ScheduledRuntimePrunePolicyRecord>> {
    this.items.set(record.id, record);
    return ok(record);
  }
}

class StaticProviderRegistry implements ProviderRegistry {
  private readonly providers: ProviderDescriptor[] = [
    {
      key: "local-shell",
      title: "Local Shell",
      category: "deploy-target",
      capabilities: ["single-server"],
    },
    {
      key: "generic-ssh",
      title: "Generic SSH",
      category: "deploy-target",
      capabilities: ["single-server"],
    },
  ];

  list(): ProviderDescriptor[] {
    return [...this.providers];
  }

  findByKey(key: string): ProviderDescriptor | null {
    for (const provider of this.providers) {
      if (provider.key === key) {
        return provider;
      }
    }

    return null;
  }
}

class ExplicitContextRequiredPolicy implements DeploymentContextDefaultsPolicy {
  decide() {
    return ok({
      project: { mode: "required" as const },
      server: { mode: "required" as const },
      destination: { mode: "required" as const },
      environment: { mode: "required" as const },
      resource: { mode: "required" as const },
    });
  }
}

class LocalEmbeddedDefaultsPolicy implements DeploymentContextDefaultsPolicy {
  decide() {
    return ok({
      project: {
        mode: "reuse-or-create" as const,
        preset: "local-project" as const,
      },
      server: {
        mode: "reuse-or-create" as const,
        preset: "local-server" as const,
      },
      destination: {
        mode: "reuse-or-create" as const,
        preset: "local-destination" as const,
      },
      environment: {
        mode: "reuse-or-create" as const,
        preset: "local-environment" as const,
      },
      resource: {
        mode: "reuse-or-create" as const,
        preset: "local-resource" as const,
      },
    });
  }
}

function unwrapDeploymentCreateResult(result: Result<{ id: string }> | { id: string }): {
  id: string;
} {
  let current: unknown = result;
  while (current && typeof current === "object") {
    const candidate = current as { isOk?: unknown; _unsafeUnwrap?: unknown };
    if (typeof candidate._unsafeUnwrap !== "function") {
      break;
    }
    if (typeof candidate.isOk === "function") {
      expect(candidate.isOk()).toBe(true);
    }
    current = (candidate._unsafeUnwrap as () => unknown)();
  }
  return current as { id: string };
}

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    entrypoint: "cli",
    requestId: "req_test",
    tracer: {
      startActiveSpan(_name, _options, callback) {
        return Promise.resolve(
          callback({
            addEvent() {},
            recordError() {},
            setAttribute() {},
            setAttributes() {},
            setStatus() {},
          }),
        );
      },
    },
  });
}

async function createDeploymentFixture(
  defaultsPolicy: DeploymentContextDefaultsPolicy = new LocalEmbeddedDefaultsPolicy(),
  options: {
    runtimePlanResolver?: RuntimePlanResolver;
    executionBackend?: ExecutionBackend;
    runtimeTargetBackendRegistry?: RuntimeTargetBackendRegistry;
    edgeProxyKind?: "traefik" | "caddy";
    serverProviderKey?: string;
    serverTargetKind?: "single-server" | "orchestrator-cluster";
    domainRouteBindingReader?: DomainRouteBindingReader;
    serverAppliedRouteDesiredStateReader?: ServerAppliedRouteDesiredStateReader;
    deploymentConfigReader?: DeploymentConfigReader;
    processAttemptRecorder?: ProcessAttemptRecorder;
    durableWorkQueueAdapter?: DurableWorkQueueAdapter;
    operationGuardPort?: OperationGuardPort;
    environmentProfileDecisionReadModel?: MemoryEnvironmentProfileDecisionStore;
    sourceVersionDetector?: SourceVersionDetector;
    controlPlaneSecretProtector?: ControlPlaneSecretProtector;
  } = {},
) {
  const projects = new MemoryProjectRepository();
  const servers = new MemoryServerRepository();
  const destinations = new MemoryDestinationRepository();
  const environments = new MemoryEnvironmentRepository();
  const resources = new MemoryResourceRepository();
  const deployments = new MemoryDeploymentRepository();
  const deploymentReadModel = new MemoryDeploymentReadModel(deployments);
  const dependencyResources = new MemoryDependencyResourceRepository();
  const dependencyResourceSecretStore = new FakeDependencyResourceSecretStore();
  const dependencyBindings = new MemoryResourceDependencyBindingRepository();
  const dependencyResourceBackups = new MemoryDependencyResourceBackupRepository();
  const dependencyResourceBackupProvider = new FakeDependencyResourceBackupProvider();
  const managedDependencyProvider = new FakeManagedDependencyProvider();
  const dependencyBindingReadModel = new MemoryResourceDependencyBindingReadModel(
    dependencyBindings,
    dependencyResources,
  );
  const clock = new FixedClock("2026-01-01T00:00:00.000Z");
  const idGenerator = new SequenceIdGenerator();
  const eventBus = new CapturedEventBus();
  const logger = new NoopLogger();
  const defaultsFactory = new DeploymentContextDefaultsFactory(clock, idGenerator);
  const context = createTestContext();
  const repositoryContext = toRepositoryContext(context);
  const project = Project.create({
    id: ProjectId.rehydrate("prj_demo"),
    name: ProjectName.rehydrate("Demo"),
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();
  const server = DeploymentTarget.register({
    id: DeploymentTargetId.rehydrate("srv_demo"),
    name: DeploymentTargetName.rehydrate("demo-server"),
    host: HostAddress.rehydrate("127.0.0.1"),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate(options.serverProviderKey ?? "generic-ssh"),
    targetKind: TargetKindValue.rehydrate(options.serverTargetKind ?? "single-server"),
    ...(options.edgeProxyKind
      ? { edgeProxyKind: EdgeProxyKindValue.rehydrate(options.edgeProxyKind) }
      : {}),
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();
  if (options.edgeProxyKind) {
    server.markEdgeProxyReady({
      completedAt: UpdatedAt.rehydrate(clock.now()),
    });
  }
  const destination = Destination.register({
    id: DestinationId.rehydrate("dst_demo"),
    serverId: DeploymentTargetId.rehydrate("srv_demo"),
    name: DestinationName.rehydrate("default"),
    kind: DestinationKindValue.rehydrate("generic"),
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();
  const environment = Environment.create({
    id: EnvironmentId.rehydrate("env_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    name: EnvironmentName.rehydrate("production"),
    kind: EnvironmentKindValue.rehydrate("production"),
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();
  const resource = Resource.create({
    id: ResourceId.rehydrate("res_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    destinationId: DestinationId.rehydrate("dst_demo"),
    name: ResourceName.rehydrate("web"),
    kind: ResourceKindValue.rehydrate("application"),
    sourceBinding: {
      kind: SourceKindValue.rehydrate("local-folder"),
      locator: SourceLocator.rehydrate("."),
      displayName: DisplayNameText.rehydrate("workspace"),
    },
    runtimeProfile: {
      strategy: RuntimePlanStrategyValue.rehydrate("auto"),
      runtimeName: RuntimeNameText.rehydrate("www"),
    },
    networkProfile: {
      internalPort: PortNumber.rehydrate(3000),
      upstreamProtocol: ResourceNetworkProtocolValue.rehydrate("http"),
      exposureMode: ResourceExposureModeValue.rehydrate("reverse-proxy"),
    },
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();

  await projects.upsert(repositoryContext, project, UpsertProjectSpec.fromProject(project));
  await servers.upsert(
    repositoryContext,
    server,
    UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
  );
  await destinations.upsert(
    repositoryContext,
    destination,
    UpsertDestinationSpec.fromDestination(destination),
  );
  await environments.upsert(
    repositoryContext,
    environment,
    UpsertEnvironmentSpec.fromEnvironment(environment),
  );
  await resources.upsert(repositoryContext, resource, UpsertResourceSpec.fromResource(resource));

  const createDeploymentUseCase = new CreateDeploymentUseCase(
    deployments,
    new DeploymentContextResolver(projects, servers, destinations, environments, resources),
    new DeploymentContextBootstrapService(
      options.deploymentConfigReader ?? new NullDeploymentConfigReader(),
      projects,
      servers,
      destinations,
      environments,
      resources,
      new StaticProviderRegistry(),
      defaultsPolicy,
      defaultsFactory,
      clock,
      idGenerator,
      eventBus,
      logger,
    ),
    new StaticSourceDetector(),
    options.runtimePlanResolver ?? new StaticRuntimePlanResolver(),
    options.executionBackend ?? new HermeticExecutionBackend(),
    eventBus,
    new NoopDeploymentProgressReporter(),
    logger,
    new DeploymentSnapshotFactory(clock, idGenerator),
    new RuntimePlanResolutionInputBuilder(clock, idGenerator),
    new DeploymentFactory(clock, idGenerator),
    new DeploymentLifecycleService(clock),
    new PassThroughMutationCoordinator(),
    options.runtimeTargetBackendRegistry ?? new StaticRuntimeTargetBackendRegistry(),
    options.controlPlaneSecretProtector ?? testSecretProtector,
    options.domainRouteBindingReader,
    options.serverAppliedRouteDesiredStateReader,
    dependencyBindingReadModel,
    dependencyResourceSecretStore,
    options.processAttemptRecorder,
    undefined,
    options.operationGuardPort,
    options.environmentProfileDecisionReadModel,
    options.sourceVersionDetector,
    options.durableWorkQueueAdapter,
  );
  const provisionDependency = new ProvisionDependencyResourceUseCase(
    projects,
    environments,
    servers,
    dependencyResources,
    dependencyResourceSecretStore,
    clock,
    idGenerator,
    eventBus,
    logger,
    managedDependencyProvider,
  );

  return {
    bindDependency: new BindResourceDependencyUseCase(
      resources,
      dependencyResources,
      dependencyBindings,
      clock,
      idGenerator,
      eventBus,
      logger,
    ),
    createBackup: new CreateDependencyResourceBackupUseCase(
      dependencyResources,
      dependencyResourceBackups,
      dependencyResourceBackupProvider,
      dependencyResourceSecretStore,
      clock,
      idGenerator,
      eventBus,
      logger,
    ),
    clock,
    context,
    createDeploymentUseCase,
    deploymentReadModel,
    dependencyBindings,
    dependencyBindingReadModel,
    dependencyResourceBackupProvider,
    dependencyResourceBackups,
    dependencyResourceSecretStore,
    dependencyResources,
    deployments,
    environment,
    environments,
    eventBus,
    managedDependencyProvider,
    provisionDependencyResource: provisionDependency,
    logger,
    projects,
    repositoryContext,
    restoreBackup: new RestoreDependencyResourceBackupUseCase(
      dependencyResources,
      dependencyResourceBackups,
      dependencyResourceBackupProvider,
      dependencyResourceSecretStore,
      clock,
      idGenerator,
      eventBus,
      logger,
    ),
    resources,
    servers,
    createDeploymentInput: {
      projectId: "prj_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
    },
  };
}

async function createActivePostgresBinding(input: {
  dependencyResources: MemoryDependencyResourceRepository;
  dependencyBindings: MemoryResourceDependencyBindingRepository;
  repositoryContext: ReturnType<typeof toRepositoryContext>;
  dependencyResourceSecretStore?: FakeDependencyResourceSecretStore;
  context?: ExecutionContext;
  bindingId?: string;
  dependencyResourceId?: string;
  status?: "active" | "removed";
}) {
  const dependencyResource = ResourceInstance.createPostgresDependencyResource({
    id: ResourceInstanceId.rehydrate(input.dependencyResourceId ?? "rsi_pg"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    name: ResourceInstanceName.rehydrate("External Postgres"),
    kind: ResourceInstanceKindValue.rehydrate("postgres"),
    sourceMode: DependencyResourceSourceModeValue.rehydrate("imported-external"),
    providerKey: ProviderKey.rehydrate("external-postgres"),
    endpoint: {
      host: "db.example.com",
      port: 5432,
      databaseName: "app",
      maskedConnection: "postgres://app:********@db.example.com:5432/app",
    },
    connectionSecretRef: DependencyResourceSecretRef.rehydrate(
      "appaloft://dependency-resources/rsi_pg/connection",
    ),
    providerManaged: false,
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();
  await input.dependencyResources.upsert(
    input.repositoryContext,
    dependencyResource,
    UpsertResourceInstanceSpec.fromResourceInstance(dependencyResource),
  );
  if (input.dependencyResourceSecretStore && input.context) {
    await input.dependencyResourceSecretStore.storeConnection(input.context, {
      dependencyResourceId: input.dependencyResourceId ?? "rsi_pg",
      projectId: "prj_demo",
      environmentId: "env_demo",
      kind: "postgres",
      purpose: "connection",
      secretValue: "postgres://app:super-secret@db.example.com:5432/app",
      storedAt: "2026-01-01T00:00:00.000Z",
    });
  }

  const binding = ResourceBinding.create({
    id: ResourceBindingId.rehydrate(input.bindingId ?? "rbd_pg"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    resourceId: ResourceId.rehydrate("res_demo"),
    resourceInstanceId: ResourceInstanceId.rehydrate(input.dependencyResourceId ?? "rsi_pg"),
    targetName: ResourceBindingTargetName.rehydrate("DATABASE_URL"),
    scope: ResourceBindingScopeValue.rehydrate("runtime-only"),
    injectionMode: ResourceInjectionModeValue.rehydrate("env"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();
  if (input.status === "removed") {
    binding.unbind({ removedAt: UpdatedAt.rehydrate("2026-01-01T00:01:00.000Z") });
  }

  await input.dependencyBindings.upsert(
    input.repositoryContext,
    binding,
    UpsertResourceBindingSpec.fromResourceBinding(binding),
  );
}

async function createActiveRedisBinding(input: {
  dependencyResources: MemoryDependencyResourceRepository;
  dependencyBindings: MemoryResourceDependencyBindingRepository;
  repositoryContext: ReturnType<typeof toRepositoryContext>;
  dependencyResourceSecretStore?: FakeDependencyResourceSecretStore;
  context?: ExecutionContext;
}) {
  const dependencyResource = ResourceInstance.createRedisDependencyResource({
    id: ResourceInstanceId.rehydrate("rsi_redis"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    name: ResourceInstanceName.rehydrate("External Redis"),
    kind: ResourceInstanceKindValue.rehydrate("redis"),
    sourceMode: DependencyResourceSourceModeValue.rehydrate("imported-external"),
    providerKey: ProviderKey.rehydrate("external-redis"),
    endpoint: {
      host: "redis.example.com",
      port: 6379,
      databaseName: "0",
      maskedConnection: "redis://:********@redis.example.com:6379/0",
    },
    connectionSecretRef: DependencyResourceSecretRef.rehydrate(
      "appaloft://dependency-resources/rsi_redis/connection",
    ),
    providerManaged: false,
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();
  await input.dependencyResources.upsert(
    input.repositoryContext,
    dependencyResource,
    UpsertResourceInstanceSpec.fromResourceInstance(dependencyResource),
  );
  if (input.dependencyResourceSecretStore && input.context) {
    await input.dependencyResourceSecretStore.storeConnection(input.context, {
      dependencyResourceId: "rsi_redis",
      projectId: "prj_demo",
      environmentId: "env_demo",
      kind: "redis",
      purpose: "connection",
      secretValue: "redis://:super-secret@redis.example.com:6379/0",
      storedAt: "2026-01-01T00:00:00.000Z",
    });
  }

  const binding = ResourceBinding.create({
    id: ResourceBindingId.rehydrate("rbd_redis"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    resourceId: ResourceId.rehydrate("res_demo"),
    resourceInstanceId: ResourceInstanceId.rehydrate("rsi_redis"),
    targetName: ResourceBindingTargetName.rehydrate("REDIS_URL"),
    scope: ResourceBindingScopeValue.rehydrate("runtime-only"),
    injectionMode: ResourceInjectionModeValue.rehydrate("env"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();

  await input.dependencyBindings.upsert(
    input.repositoryContext,
    binding,
    UpsertResourceBindingSpec.fromResourceBinding(binding),
  );
}

async function createActiveManagedRedisBinding(input: {
  dependencyResources: MemoryDependencyResourceRepository;
  dependencyBindings: MemoryResourceDependencyBindingRepository;
  repositoryContext: ReturnType<typeof toRepositoryContext>;
  dependencyResourceSecretStore?: FakeDependencyResourceSecretStore;
  context?: ExecutionContext;
}) {
  const dependencyResource = ResourceInstance.createRedisDependencyResource({
    id: ResourceInstanceId.rehydrate("rsi_managed_redis"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    name: ResourceInstanceName.rehydrate("Managed Redis"),
    kind: ResourceInstanceKindValue.rehydrate("redis"),
    sourceMode: DependencyResourceSourceModeValue.rehydrate("appaloft-managed"),
    providerKey: ProviderKey.rehydrate("appaloft-managed-redis"),
    providerManaged: true,
    providerRealization: {
      status: DependencyResourceProviderRealizationStatusValue.pending(),
      attemptId: DependencyResourceProviderRealizationAttemptId.rehydrate("dpr_managed_redis"),
      attemptedAt: OccurredAt.rehydrate("2026-01-01T00:00:00.000Z"),
    },
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();
  dependencyResource
    .markProviderRealized({
      attemptId: DependencyResourceProviderRealizationAttemptId.rehydrate("dpr_managed_redis"),
      providerResourceHandle:
        DependencyResourceProviderResourceHandle.rehydrate("redis/rsi_managed_redis"),
      endpoint: {
        host: "managed-redis.redis.internal",
        port: 6379,
        databaseName: "0",
        maskedConnection: "redis://:********@managed-redis.redis.internal:6379/0",
      },
      connectionSecretRef: DependencyResourceSecretRef.rehydrate(
        "appaloft://dependency-resources/rsi_managed_redis/connection",
      ),
      realizedAt: OccurredAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })
    ._unsafeUnwrap();
  await input.dependencyResources.upsert(
    input.repositoryContext,
    dependencyResource,
    UpsertResourceInstanceSpec.fromResourceInstance(dependencyResource),
  );
  if (input.dependencyResourceSecretStore && input.context) {
    await input.dependencyResourceSecretStore.storeConnection(input.context, {
      dependencyResourceId: "rsi_managed_redis",
      projectId: "prj_demo",
      environmentId: "env_demo",
      kind: "redis",
      purpose: "connection",
      secretValue: "redis://:super-secret@managed-redis.redis.internal:6379/0",
      storedAt: "2026-01-01T00:00:00.000Z",
    });
  }

  const binding = ResourceBinding.create({
    id: ResourceBindingId.rehydrate("rbd_managed_redis"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    resourceId: ResourceId.rehydrate("res_demo"),
    resourceInstanceId: ResourceInstanceId.rehydrate("rsi_managed_redis"),
    targetName: ResourceBindingTargetName.rehydrate("REDIS_URL"),
    scope: ResourceBindingScopeValue.rehydrate("runtime-only"),
    injectionMode: ResourceInjectionModeValue.rehydrate("env"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();

  await input.dependencyBindings.upsert(
    input.repositoryContext,
    binding,
    UpsertResourceBindingSpec.fromResourceBinding(binding),
  );
}

function createStaticSiteResource(input: { publishDirectory?: string } = {}): Resource {
  return Resource.rehydrate({
    id: ResourceId.rehydrate("res_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    destinationId: DestinationId.rehydrate("dst_demo"),
    name: ResourceName.rehydrate("docs"),
    slug: ResourceSlug.rehydrate("docs"),
    kind: ResourceKindValue.rehydrate("static-site"),
    services: [],
    sourceBinding: {
      kind: SourceKindValue.rehydrate("local-folder"),
      locator: SourceLocator.rehydrate("."),
      displayName: DisplayNameText.rehydrate("workspace"),
      baseDirectory: SourceBaseDirectory.rehydrate("/site"),
    },
    runtimeProfile: {
      strategy: RuntimePlanStrategyValue.rehydrate("static"),
      buildCommand: CommandText.rehydrate("pnpm build"),
      ...(input.publishDirectory
        ? { publishDirectory: StaticPublishDirectory.rehydrate(input.publishDirectory) }
        : {}),
    },
    networkProfile: {
      internalPort: PortNumber.rehydrate(80),
      upstreamProtocol: ResourceNetworkProtocolValue.rehydrate("http"),
      exposureMode: ResourceExposureModeValue.rehydrate("reverse-proxy"),
    },
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

function createRuntimeSmokeResource(input: {
  kind?: "application" | "compose-stack";
  sourceKind?: "local-folder" | "compose" | "docker-image";
  sourceLocator?: string;
  strategy: "dockerfile" | "docker-compose" | "prebuilt-image" | "workspace-commands";
  dockerfilePath?: string;
  dockerComposeFilePath?: string;
  versionReference?: VersionReference;
}): Resource {
  return Resource.rehydrate({
    id: ResourceId.rehydrate("res_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    destinationId: DestinationId.rehydrate("dst_demo"),
    name: ResourceName.rehydrate("web"),
    slug: ResourceSlug.rehydrate("web"),
    kind: ResourceKindValue.rehydrate(input.kind ?? "application"),
    services: [],
    sourceBinding: {
      kind: SourceKindValue.rehydrate(input.sourceKind ?? "local-folder"),
      locator: SourceLocator.rehydrate(input.sourceLocator ?? "."),
      displayName: DisplayNameText.rehydrate("workspace"),
      ...(input.versionReference ? { versionReference: input.versionReference } : {}),
    },
    runtimeProfile: {
      strategy: RuntimePlanStrategyValue.rehydrate(input.strategy),
      ...(input.dockerfilePath
        ? { dockerfilePath: DockerfilePath.rehydrate(input.dockerfilePath) }
        : {}),
      ...(input.dockerComposeFilePath
        ? { dockerComposeFilePath: DockerComposeFilePath.rehydrate(input.dockerComposeFilePath) }
        : {}),
    },
    networkProfile: {
      internalPort: PortNumber.rehydrate(3000),
      upstreamProtocol: ResourceNetworkProtocolValue.rehydrate("http"),
      exposureMode: ResourceExposureModeValue.rehydrate("reverse-proxy"),
    },
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

function createHistoricalDeployment(input: {
  id: string;
  resourceId?: string;
  createdAt: string;
  status: "created" | "planning" | "planned" | "running" | "succeeded" | "failed" | "rolled-back";
  supersedesDeploymentId?: string;
}): Deployment {
  const environment = Environment.create({
    id: EnvironmentId.rehydrate("env_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    name: EnvironmentName.rehydrate("production"),
    kind: EnvironmentKindValue.rehydrate("production"),
    createdAt: CreatedAt.rehydrate(input.createdAt),
  })._unsafeUnwrap();
  const deployment = Deployment.create({
    id: DeploymentId.rehydrate(input.id),
    projectId: ProjectId.rehydrate("prj_demo"),
    serverId: DeploymentTargetId.rehydrate("srv_demo"),
    destinationId: DestinationId.rehydrate("dst_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    resourceId: ResourceId.rehydrate(input.resourceId ?? "res_demo"),
    runtimePlan: RuntimePlan.rehydrate({
      id: RuntimePlanId.rehydrate(`plan_${input.id}`),
      source: SourceDescriptor.rehydrate({
        kind: SourceKindValue.rehydrate("local-folder"),
        locator: SourceLocator.rehydrate("."),
        displayName: DisplayNameText.rehydrate("workspace"),
      }),
      buildStrategy: BuildStrategyKindValue.rehydrate("dockerfile"),
      packagingMode: PackagingModeValue.rehydrate("all-in-one-docker"),
      execution: RuntimeExecutionPlan.rehydrate({
        kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
        image: ImageReference.rehydrate("demo:test"),
        port: PortNumber.rehydrate(3000),
      }),
      target: DeploymentTargetDescriptor.rehydrate({
        kind: TargetKindValue.rehydrate("single-server"),
        providerKey: ProviderKey.rehydrate("generic-ssh"),
        serverIds: [DeploymentTargetId.rehydrate("srv_demo")],
      }),
      detectSummary: DetectSummary.rehydrate("historical deployment"),
      steps: [
        PlanStepText.rehydrate("package"),
        PlanStepText.rehydrate("deploy"),
        PlanStepText.rehydrate("verify"),
      ],
      generatedAt: GeneratedAt.rehydrate(input.createdAt),
    }),
    environmentSnapshot: environment.materializeSnapshot({
      snapshotId: EnvironmentSnapshotId.rehydrate(`snap_${input.id}`),
      createdAt: GeneratedAt.rehydrate(input.createdAt),
    }),
    createdAt: CreatedAt.rehydrate(input.createdAt),
    ...(input.supersedesDeploymentId
      ? { supersedesDeploymentId: DeploymentId.rehydrate(input.supersedesDeploymentId) }
      : {}),
  })._unsafeUnwrap();

  if (input.status === "planning") {
    deployment.markPlanning(StartedAt.rehydrate(input.createdAt))._unsafeUnwrap();
    return deployment;
  }

  if (input.status === "planned") {
    deployment.markPlanning(StartedAt.rehydrate(input.createdAt))._unsafeUnwrap();
    deployment.markPlanned(StartedAt.rehydrate(input.createdAt))._unsafeUnwrap();
    return deployment;
  }

  if (input.status === "running") {
    deployment.markPlanning(StartedAt.rehydrate(input.createdAt))._unsafeUnwrap();
    deployment.markPlanned(StartedAt.rehydrate(input.createdAt))._unsafeUnwrap();
    deployment.start(StartedAt.rehydrate(input.createdAt))._unsafeUnwrap();
    return deployment;
  }

  if (input.status === "succeeded" || input.status === "failed" || input.status === "rolled-back") {
    deployment.markPlanning(StartedAt.rehydrate(input.createdAt))._unsafeUnwrap();
    deployment.markPlanned(StartedAt.rehydrate(input.createdAt))._unsafeUnwrap();
    deployment.start(StartedAt.rehydrate(input.createdAt))._unsafeUnwrap();
    deployment
      .applyExecutionResult(
        FinishedAt.rehydrate("2026-01-01T00:10:00.000Z"),
        ExecutionResult.rehydrate({
          exitCode: ExitCode.rehydrate(input.status === "failed" ? 1 : 0),
          status: ExecutionStatusValue.rehydrate(input.status),
          retryable: input.status === "failed",
          timeline: [
            DeploymentTimelineJournalEntry.rehydrate({
              timestamp: OccurredAt.rehydrate("2026-01-01T00:10:00.000Z"),
              phase: DeploymentPhaseValue.rehydrate("deploy"),
              level: LogLevelValue.rehydrate("info"),
              message: MessageText.rehydrate(`Historical deployment ${input.status}`),
            }),
          ],
        }),
      )
      ._unsafeUnwrap();
  }

  return deployment;
}

class RaceLosingMemoryDeploymentRepository extends MemoryDeploymentRepository {
  override async findOne(
    _context: ReturnType<typeof toRepositoryContext>,
    _spec: DeploymentSelectionSpec,
  ): Promise<Deployment | null> {
    return null;
  }

  override async insertOne(
    _context: ReturnType<typeof toRepositoryContext>,
    _deployment: Deployment,
    _spec: Parameters<MemoryDeploymentRepository["insertOne"]>[2],
  ): Promise<Result<void>> {
    return err(
      domainError.conflict("Deployment insert conflicts with current persistence state", {
        aggregateRoot: "deployment",
        constraint: "deployments_active_resource_unique",
        deploymentId: "dep_competing",
        resourceId: "res_demo",
        status: "running",
      }),
    );
  }
}

describe("CreateDeploymentUseCase", () => {
  test("[CPS-FAIL-002] missing keyring blocks deployment before persistence or execution", async () => {
    const fixture = await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
      controlPlaneSecretProtector: unavailableSecretProtector,
    });
    const marker = "MISSING_KEYRING_MARKER";
    fixture.environment
      .setVariable({
        key: ConfigKey.rehydrate("DEPLOYMENT_SECRET"),
        value: ConfigValueText.rehydrate(testProtectedSecret(marker)),
        kind: VariableKindValue.rehydrate("secret"),
        exposure: VariableExposureValue.rehydrate("runtime"),
        scope: ConfigScopeValue.rehydrate("environment"),
        isSecret: true,
        updatedAt: UpdatedAt.rehydrate(fixture.clock.now()),
      })
      ._unsafeUnwrap();
    await fixture.environments.upsert(
      fixture.repositoryContext,
      fixture.environment,
      UpsertEnvironmentSpec.fromEnvironment(fixture.environment),
    );

    const result = await fixture.createDeploymentUseCase.execute(
      fixture.context,
      fixture.createDeploymentInput,
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "control_plane_secret_keyring_unavailable",
      details: { phase: "control-plane-secret-materialization" },
    });
    expect(fixture.deployments.items.size).toBe(0);
    expect(JSON.stringify(result._unsafeUnwrapErr())).not.toContain(marker);
  });

  test("rejects legacy deployment source and runtime fields at command schema boundary", () => {
    const command = CreateDeploymentCommand.create({
      projectId: "prj_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      sourceLocator: ".",
      deploymentMethod: "auto",
      installCommand: "bun install",
    } as never);

    expect(command.isErr()).toBe(true);
    expect(command._unsafeUnwrapErr().code).toBe("validation_error");
  });

  test("[DEP-CREATE-ADM-035] rejects repository config fields at command schema boundary", () => {
    const command = CreateDeploymentCommand.create({
      projectId: "prj_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      configFilePath: "appaloft.json",
      runtime: {
        strategy: "workspace-commands",
      },
    } as never);

    expect(command.isErr()).toBe(true);
    expect(command._unsafeUnwrapErr().code).toBe("validation_error");
  });

  test("[CONFIG-FILE-SERVICE-GRAPH-005] rejects service graph fields at command schema boundary", () => {
    const command = CreateDeploymentCommand.create({
      projectId: "prj_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      services: [
        {
          name: "worker",
          kind: "worker",
        },
      ],
    } as never);

    expect(command.isErr()).toBe(true);
    expect(command._unsafeUnwrapErr().code).toBe("validation_error");
  });

  test("[WF-PLAN-BOUND-001] rejects framework-specific deployment fields at command schema boundary", () => {
    const command = CreateDeploymentCommand.create({
      projectId: "prj_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      framework: "nextjs",
      packageName: "web",
      baseImage: "node:22-alpine",
      runtimePreset: "nextjs",
      buildpack: "node",
      nodeVersion: "22",
      nextOutputMode: "standalone",
      nextRouter: "app",
    } as never);

    expect(command.isErr()).toBe(true);
    expect(command._unsafeUnwrapErr().code).toBe("validation_error");
  });

  test("[SWARM-TARGET-ADM-001] rejects Swarm deployment fields at command schema boundary", () => {
    const command = CreateDeploymentCommand.create({
      projectId: "prj_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      namespace: "prod",
      stack: "web",
      service: "api",
      replicas: 3,
      updatePolicy: "start-first",
      registrySecret: "resource-secret:REGISTRY_TOKEN",
      ingress: { host: "www.example.com" },
      manifest: { services: {} },
    } as never);

    expect(command.isErr()).toBe(true);
    expect(command._unsafeUnwrapErr().code).toBe("validation_error");
  });

  test("[PROC-DELIVERY-WORKER-020] accepts deployment work durably without inline runtime execution", async () => {
    const durableWork = new RecordingDurableWorkAdapter();
    const executionBackend = new CountingExecutionBackend();
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      deployments,
      repositoryContext,
    } = await createDeploymentFixture(undefined, {
      durableWorkQueueAdapter: durableWork,
      executionBackend,
    });

    const result = await createDeploymentUseCase.execute(context, {
      ...createDeploymentInput,
      executionMode: "detached",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) throw new Error(result.error.message);
    expect(executionBackend.calls).toBe(0);
    const deploymentId = result.value.id;
    const workItems = Array.from(durableWork.items.values());
    expect(workItems).toEqual([
      expect.objectContaining({
        id: `dw_deployment_${deploymentId}`,
        kind: "deployment",
        status: "pending",
        operationKey: "deployments.create",
        deploymentId,
        projectId: "prj_demo",
        environmentId: "env_demo",
        resourceId: "res_demo",
        serverId: "srv_demo",
        subjectKind: "deployment",
        subjectId: deploymentId,
        phase: "accepted",
        step: "queued",
      }),
    ]);
    expect(durableWork.events).toEqual([
      expect.objectContaining({
        id: `dwe_deployment_${deploymentId}_accepted`,
        workItemId: `dw_deployment_${deploymentId}`,
        sequence: 1,
        kind: "accepted",
        status: "pending",
      }),
    ]);

    const deployment = await deployments.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate(deploymentId)),
    );
    expect(deployment?.toState().status.value).toBe("running");
  });

  test("[PROC-DELIVERY-WORKER-021] worker drain executes accepted deployment work", async () => {
    const durableWork = new RecordingDurableWorkAdapter();
    const executionBackend = new CountingExecutionBackend();
    const processAttemptRecorder = new RecordingProcessAttemptRecorder();
    const {
      clock,
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      deployments,
      eventBus,
      logger,
      repositoryContext,
    } = await createDeploymentFixture(undefined, {
      durableWorkQueueAdapter: durableWork,
      executionBackend,
      processAttemptRecorder,
    });
    const accepted = await createDeploymentUseCase.execute(context, {
      ...createDeploymentInput,
      executionMode: "detached",
    });
    expect(accepted.isOk()).toBe(true);
    if (accepted.isErr()) throw new Error(accepted.error.message);

    const handler = new DeploymentDurableWorkHandler(
      deployments,
      new DeploymentLifecycleService(clock),
      executionBackend,
      eventBus,
      logger,
      processAttemptRecorder,
    );
    const drained = await drainDurableWorkOnce(
      context,
      durableWork,
      {
        resolve(item) {
          return item.kind === "deployment" ? handler : undefined;
        },
      },
      {
        worker: {
          workerId: "deployment-worker-1",
          workerGroup: "deployment-worker",
          slot: 1,
        },
        now: "2026-01-01T00:00:00.000Z",
        leaseDurationMs: 300000,
      },
    );

    expect(drained.isOk()).toBe(true);
    if (drained.isErr()) throw new Error(drained.error.message);
    expect(drained.value).toEqual({
      scanned: 1,
      claimed: 1,
      completed: 1,
      failed: 0,
      skipped: 0,
    });
    expect(executionBackend.calls).toBe(1);
    expect(durableWork.completions).toEqual([
      expect.objectContaining({
        workItemId: `dw_deployment_${accepted.value.id}`,
        status: "succeeded",
        phase: "runtime-execution",
        step: "completed",
      }),
    ]);
    const deployment = await deployments.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate(accepted.value.id)),
    );
    expect(deployment?.toState().status.value).toBe("succeeded");
    expect(processAttemptRecorder.records.at(-1)).toMatchObject({
      deploymentId: accepted.value.id,
      status: "succeeded",
      operationKey: "deployments.create",
    });
  });

  test("[PROC-DELIVERY-WORKER-021A] worker restores the authoritative project owner tenant", async () => {
    const durableWork = new RecordingDurableWorkAdapter();
    const executionBackend = new CountingExecutionBackend();
    const {
      clock,
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      deployments,
      eventBus,
      logger,
    } = await createDeploymentFixture(undefined, {
      durableWorkQueueAdapter: durableWork,
      executionBackend,
    });
    const accepted = await createDeploymentUseCase.execute(context, {
      ...createDeploymentInput,
      executionMode: "detached",
    });
    expect(accepted.isOk()).toBe(true);
    if (accepted.isErr()) throw new Error(accepted.error.message);
    expect(durableWork.items.get(`dw_deployment_${accepted.value.id}`)?.safeDetails).toMatchObject({
      tenantId: "org_self_hosted",
      tenantOrganizationId: "org_self_hosted",
    });

    const handler = new DeploymentDurableWorkHandler(
      deployments,
      new DeploymentLifecycleService(clock),
      executionBackend,
      eventBus,
      logger,
    );
    const drained = await drainDurableWorkOnce(
      context,
      durableWork,
      {
        resolve(item) {
          return item.kind === "deployment" ? handler : undefined;
        },
      },
      {
        worker: {
          workerId: "deployment-worker-tenant",
          workerGroup: "deployment-worker",
          slot: 1,
        },
        now: "2026-01-01T00:00:00.000Z",
        leaseDurationMs: 300000,
      },
    );

    expect(drained.isOk()).toBe(true);
    expect(executionBackend.lastContext?.tenant).toEqual({
      tenantId: "org_self_hosted",
      organizationId: "org_self_hosted",
      source: "durable-work-item",
    });
  });

  test("[PROC-DELIVERY-WORKER-022] preserves durable progress timeline when worker completion persists", async () => {
    const durableWork = new RecordingDurableWorkAdapter();
    let progressRecorder: DeploymentProgressRecorder | undefined;
    const executionBackend = new DurableProgressDeferredExecutionBackend(() => {
      if (!progressRecorder) {
        throw new Error("progress recorder was not configured");
      }
      return progressRecorder;
    });
    const processAttemptRecorder = new RecordingProcessAttemptRecorder();
    const {
      clock,
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      deployments,
      eventBus,
      logger,
      repositoryContext,
    } = await createDeploymentFixture(undefined, {
      durableWorkQueueAdapter: durableWork,
      executionBackend,
      processAttemptRecorder,
    });
    progressRecorder = new DeploymentTimelineProgressRecorder(deployments, logger);
    const accepted = await createDeploymentUseCase.execute(context, {
      ...createDeploymentInput,
      executionMode: "detached",
    });
    expect(accepted.isOk()).toBe(true);
    if (accepted.isErr()) throw new Error(accepted.error.message);

    const handler = new DeploymentDurableWorkHandler(
      deployments,
      new DeploymentLifecycleService(clock),
      executionBackend,
      eventBus,
      logger,
      processAttemptRecorder,
    );
    const drained = drainDurableWorkOnce(
      context,
      durableWork,
      {
        resolve(item) {
          return item.kind === "deployment" ? handler : undefined;
        },
      },
      {
        worker: {
          workerId: "deployment-worker-1",
          workerGroup: "deployment-worker",
          slot: 1,
        },
        now: "2026-01-01T00:00:00.000Z",
        leaseDurationMs: 300000,
      },
    );

    await executionBackend.reported.promise;
    const running = await deployments.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate(accepted.value.id)),
    );
    expect(running?.toState().status.value).toBe("running");
    expect(running?.toState().timeline.map((log) => log.message)).toContain(
      "Runtime container was started",
    );

    executionBackend.release.resolve();
    const drainedResult = await drained;
    expect(drainedResult.isOk()).toBe(true);
    if (drainedResult.isErr()) throw new Error(drainedResult.error.message);

    const completed = await deployments.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate(accepted.value.id)),
    );
    expect(completed?.toState().status.value).toBe("succeeded");
    expect(completed?.toState().timeline.map((log) => log.message)).toContain(
      "Runtime container was started",
    );
    expect(completed?.toState().timeline.map((log) => log.message)).toContain(
      "Hermetic execution backend applied runtime plan",
    );
  });

  test("[PROC-DELIVERY-WORKER-026] keeps default deployment execution synchronous with durable work enabled", async () => {
    const durableWork = new RecordingDurableWorkAdapter();
    const executionBackend = new CountingExecutionBackend();
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      deployments,
      repositoryContext,
    } = await createDeploymentFixture(undefined, {
      durableWorkQueueAdapter: durableWork,
      executionBackend,
    });

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) throw new Error(result.error.message);
    expect(executionBackend.calls).toBe(1);
    expect(durableWork.items.size).toBe(0);
    expect(durableWork.events).toHaveLength(0);
    const deployment = await deployments.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate(result.value.id)),
    );
    expect(deployment?.toState().status.value).toBe("succeeded");
  });

  test("[DEP-CREATE-ASYNC-001] admits detached deployment execution before runtime completion", async () => {
    const executionBackend = new DeferredExecutionBackend();
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      deployments,
      repositoryContext,
    } = await createDeploymentFixture(new LocalEmbeddedDefaultsPolicy(), {
      executionBackend,
    });

    const result = await createDeploymentUseCase.execute(context, {
      ...createDeploymentInput,
      executionMode: "detached",
    });
    const created = unwrapDeploymentCreateResult(result);
    const startedDeployment = await executionBackend.started.promise;

    expect(startedDeployment.toState().id.value).toBe(created.id);
    const admitted = await deployments.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate(created.id)),
    );
    expect(admitted?.toState().status.value).toBe("running");

    executionBackend.release.resolve();
    await executionBackend.completed.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));

    const completed = await deployments.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate(created.id)),
    );
    expect(completed?.toState().status.value).toBe("succeeded");
  });

  test("adds runtime context metadata for workload diagnostics", async () => {
    const runtimePlanResolver = new CapturingRuntimePlanResolver();
    const { context, createDeploymentInput, createDeploymentUseCase } =
      await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
        runtimePlanResolver,
      });

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    expect(runtimePlanResolver.input?.requestedDeployment.runtimeMetadata).toMatchObject({
      "context.projectName": "Demo",
      "context.projectSlug": "demo",
      "context.environmentName": "production",
      "context.environmentKind": "production",
      "context.resourceName": "web",
      "context.resourceSlug": "web",
      "context.resourceKind": "application",
      "context.destinationName": "default",
      "context.destinationKind": "generic",
      "context.serverName": "demo-server",
      "context.serverProviderKey": "generic-ssh",
      "context.serverTargetKind": "single-server",
      "resource.runtimeName": "www",
    });
    expect(runtimePlanResolver.input?.requestedDeployment.runtimeMetadata?.["preview.id"]).toBe(
      undefined,
    );
  });

  test("[STOR-SNAPSHOT-001] includes storage attachments in deployment plan input", async () => {
    const runtimePlanResolver = new CapturingRuntimePlanResolver();
    const {
      clock,
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      repositoryContext,
      resources,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
      runtimePlanResolver,
    });
    const resource = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_demo")),
    );
    if (!resource) {
      throw new Error("Expected fixture resource");
    }
    resource
      .attachStorage({
        attachmentId: ResourceStorageAttachmentId.rehydrate("rsa_data"),
        storageVolumeId: StorageVolumeId.rehydrate("stv_data"),
        storageVolumeKind: StorageVolumeKindValue.rehydrate("named-volume"),
        destinationPath: StorageDestinationPath.rehydrate("/var/lib/app/data"),
        mountMode: ResourceStorageMountModeValue.readWrite(),
        attachedAt: CreatedAt.rehydrate(clock.now()),
      })
      ._unsafeUnwrap();
    await resources.upsert(repositoryContext, resource, UpsertResourceSpec.fromResource(resource));

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    expect(runtimePlanResolver.input?.requestedDeployment.storageMounts).toEqual([
      {
        attachmentId: "rsa_data",
        storageVolumeId: "stv_data",
        storageVolumeKind: "named-volume",
        destinationPath: "/var/lib/app/data",
        mountMode: "read-write",
      },
    ]);
  });

  test("[CONFIG-FILE-SERVICE-GRAPH-005] passes repository service graphs into runtime planning", async () => {
    const runtimePlanResolver = new CapturingRuntimePlanResolver();
    const { context, createDeploymentInput, createDeploymentUseCase } =
      await createDeploymentFixture(new LocalEmbeddedDefaultsPolicy(), {
        runtimePlanResolver,
        deploymentConfigReader: new StaticDeploymentConfigReader({
          configFilePath: "appaloft.yml",
          services: [
            {
              name: "web",
              kind: "web",
              runtime: {
                strategy: "workspace-commands",
                startCommand: "bun run start:web",
              },
              network: {
                internalPort: 3000,
                exposureMode: "reverse-proxy",
              },
            },
            {
              name: "worker",
              kind: "worker",
              runtime: {
                strategy: "workspace-commands",
                startCommand: "bun run start:worker",
              },
              network: {
                exposureMode: "none",
              },
              replicas: 4,
            },
          ],
        }),
      });

    const result = await createDeploymentUseCase.execute(context, {
      ...createDeploymentInput,
      sourceLocator: ".",
      configFilePath: "appaloft.yml",
    } as never);

    expect(result.isOk()).toBe(true);
    expect(runtimePlanResolver.input?.requestedDeployment.services).toEqual([
      {
        name: "web",
        kind: "web",
        runtime: {
          strategy: "workspace-commands",
          startCommand: "bun run start:web",
        },
        network: {
          internalPort: 3000,
          exposureMode: "reverse-proxy",
        },
      },
      {
        name: "worker",
        kind: "worker",
        runtime: {
          strategy: "workspace-commands",
          startCommand: "bun run start:worker",
        },
        network: {
          exposureMode: "none",
        },
        replicas: 4,
      },
    ]);
  });

  test("[PROC-DELIVERY-001] projects deployment execution into operator work with safe details", async () => {
    const processAttemptRecorder = new RecordingProcessAttemptRecorder();
    const { context, createDeploymentInput, createDeploymentUseCase } =
      await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
        processAttemptRecorder,
      });

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    const deploymentId = result._unsafeUnwrap().id;
    expect(processAttemptRecorder.records).toHaveLength(2);
    expect(processAttemptRecorder.records).toEqual([
      expect.objectContaining({
        id: deploymentId,
        kind: "deployment",
        status: "running",
        operationKey: "deployments.create",
        dedupeKey: `deployment:${deploymentId}`,
        correlationId: "req_test",
        requestId: "req_test",
        phase: "deployment-execution",
        step: "running",
        projectId: "prj_demo",
        resourceId: "res_demo",
        deploymentId,
        serverId: "srv_demo",
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        nextActions: ["no-action"],
        safeDetails: expect.objectContaining({
          triggerKind: "create",
          deploymentStatus: "running",
          buildStrategy: "dockerfile",
          executionKind: "docker-container",
          targetKind: "single-server",
          targetProviderKey: "generic-ssh",
          packagingMode: "all-in-one-docker",
        }),
      }),
      expect.objectContaining({
        id: deploymentId,
        kind: "deployment",
        status: "succeeded",
        operationKey: "deployments.create",
        dedupeKey: `deployment:${deploymentId}`,
        phase: "deployment-execution",
        step: "succeeded",
        projectId: "prj_demo",
        resourceId: "res_demo",
        deploymentId,
        serverId: "srv_demo",
        startedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T00:03:00.000Z",
        updatedAt: "2026-01-01T00:03:00.000Z",
        nextActions: ["no-action"],
        safeDetails: expect.objectContaining({
          triggerKind: "create",
          deploymentStatus: "succeeded",
          buildStrategy: "dockerfile",
          executionKind: "docker-container",
          targetKind: "single-server",
          targetProviderKey: "generic-ssh",
        }),
      }),
    ]);
    expect(JSON.stringify(processAttemptRecorder.records)).not.toContain("Hermetic execution");
  });

  test("[PROC-DELIVERY-004] projects post-acceptance deployment failure without raw provider output", async () => {
    const processAttemptRecorder = new RecordingProcessAttemptRecorder();
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      resources,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
      executionBackend: new FailingStaticPackageExecutionBackend(),
      processAttemptRecorder,
    });
    const staticResource = createStaticSiteResource({ publishDirectory: "/dist" });

    await resources.upsert(
      repositoryContext,
      staticResource,
      UpsertResourceSpec.fromResource(staticResource),
    );

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    const deploymentId = result._unsafeUnwrap().id;
    expect(processAttemptRecorder.records.map((record) => record.status)).toEqual([
      "running",
      "failed",
    ]);
    expect(processAttemptRecorder.records[1]).toMatchObject({
      id: deploymentId,
      kind: "deployment",
      status: "failed",
      operationKey: "deployments.create",
      dedupeKey: `deployment:${deploymentId}`,
      phase: "deployment-execution",
      step: "failed",
      projectId: "prj_demo",
      resourceId: "res_demo",
      deploymentId,
      serverId: "srv_demo",
      errorCode: "provider_error",
      errorCategory: "async-processing",
      retriable: true,
      nextActions: ["diagnostic", "manual-review"],
      safeDetails: expect.objectContaining({
        triggerKind: "create",
        deploymentStatus: "failed",
        failurePhase: "image-build",
        failureStep: "static-package",
        buildStrategy: "dockerfile",
        executionKind: "docker-container",
      }),
    });
    expect(JSON.stringify(processAttemptRecorder.records)).not.toContain(
      "Static artifact package failed",
    );
  });

  test("[DEP-CREATE-AUTHZ-001] deployment guard carries provider and timeout cost before persistence", async () => {
    const guard = new DenyingOperationGuardPort();
    const { context, createDeploymentInput, createDeploymentUseCase, deployments, eventBus } =
      await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
        operationGuardPort: guard,
      });

    const result = await createDeploymentUseCase.execute(context, {
      ...createDeploymentInput,
      executionMode: "detached",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "operation_check_denied",
      details: {
        checkKey: "test.quota",
        checkKind: "quota",
        operationKey: "deployments.create",
        organizationId: "org_self_hosted",
        projectId: "prj_demo",
        environmentId: "env_demo",
        resourceId: "res_demo",
        serverId: "srv_demo",
        reason: "test-operation-denied",
      },
    });
    expect(guard.requests).toEqual([
      expect.objectContaining({
        operationKey: "deployments.create",
        organizationId: "org_self_hosted",
        resourceRefs: {
          projectId: "prj_demo",
          environmentId: "env_demo",
          resourceId: "res_demo",
          serverId: "srv_demo",
          destinationId: "dst_demo",
        },
        contextAttributes: expect.objectContaining({
          estimatedExternalProviderCalls: 1,
          estimatedTimeoutSeconds: 3_600,
          estimatedWriteUnits: 3,
        }),
      }),
    ]);
    expect(deployments.items.size).toBe(0);
    expect(eventBus.events).toHaveLength(0);
  });

  test("[DEP-CREATE-ASYNC-019][PROC-DELIVERY-004] projects runtime target capacity exhaustion recovery details", async () => {
    const processAttemptRecorder = new RecordingProcessAttemptRecorder();
    const { context, createDeploymentInput, createDeploymentUseCase, deployments } =
      await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
        executionBackend: new CapacityExhaustedExecutionBackend(),
        processAttemptRecorder,
      });

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    const deploymentId = result._unsafeUnwrap().id;
    expect(processAttemptRecorder.records.map((record) => record.status)).toEqual([
      "running",
      "failed",
    ]);
    expect(processAttemptRecorder.records[1]).toMatchObject({
      id: deploymentId,
      kind: "deployment",
      status: "failed",
      operationKey: "deployments.create",
      errorCode: "runtime_target_resource_exhausted",
      errorCategory: "async-processing",
      retriable: true,
      nextActions: ["diagnostic", "manual-review"],
      safeDetails: expect.objectContaining({
        deploymentStatus: "failed",
        failurePhase: "runtime-target-apply",
        failureStep: "docker-run",
        capacityResource: "disk",
        capacitySignal: "disk-space-exhausted",
        capacityInspectCommand: "appaloft server capacity inspect srv_demo",
        capacityPruneCommand: "appaloft server capacity prune srv_demo --dry-run",
      }),
    });
    expect(
      deployments.items.get(deploymentId)?.toState().runtimePlan.toState().execution.toState()
        .metadata,
    ).toMatchObject({
      errorCode: "runtime_target_resource_exhausted",
      capacityResource: "disk",
      capacitySignal: "disk-space-exhausted",
    });
    expect(JSON.stringify(processAttemptRecorder.records)).not.toContain(
      "Docker run failed with safe capacity signal",
    );
  });

  test("[DEP-BIND-SNAP-REF-001] [DEP-BIND-SNAP-REF-002] captures active Postgres binding safe references without secrets", async () => {
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      dependencyBindings,
      dependencyResourceSecretStore,
      dependencyResources,
      deployments,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy());
    await createActivePostgresBinding({
      dependencyBindings,
      dependencyResourceSecretStore,
      dependencyResources,
      context,
      repositoryContext,
    });

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);
    const created = unwrapDeploymentCreateResult(result);

    const deployment = deployments.items.get(created.id);
    expect(deployment?.toState().dependencyBindingReferences).toHaveLength(1);
    expect(deployment?.toState().dependencyBindingReferences[0]).toMatchObject({
      bindingId: ResourceBindingId.rehydrate("rbd_pg"),
      dependencyResourceId: ResourceInstanceId.rehydrate("rsi_pg"),
      kind: ResourceInstanceKindValue.rehydrate("postgres"),
      targetName: ResourceBindingTargetName.rehydrate("DATABASE_URL"),
      scope: ResourceBindingScopeValue.rehydrate("runtime-only"),
      injectionMode: ResourceInjectionModeValue.rehydrate("env"),
      runtimeSecretRef: DeploymentDependencyRuntimeSecretRef.rehydrate(
        "appaloft://dependency-resources/rsi_pg/connection",
      ),
    });
    const serializedReferences = JSON.stringify(
      deployment?.toState().dependencyBindingReferences ?? [],
    );
    expect(serializedReferences).not.toContain("super-secret");
    expect(serializedReferences).not.toContain("db.example.com");
    expect(serializedReferences).not.toContain("postgres://");
  });

  test("[ENV-PROFILE-DUP-005] rejects deployment admission with pending environment profile decisions", async () => {
    const environmentProfileDecisions = new MemoryEnvironmentProfileDecisionStore();
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      deployments,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
      environmentProfileDecisionReadModel: environmentProfileDecisions,
    });
    await environmentProfileDecisions.recordPending(repositoryContext, {
      id: "epd_env_demo_res_demo_dependency-binding_rbind_pg",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      kind: "dependency-binding",
      sourceId: "rbind_pg",
      reason: "Dependency binding was deferred and must be resolved before deployment.",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "environment-profile-decision-admission",
        causeCode: "environment-profile-decision-pending",
        pendingDecisionIds: ["epd_env_demo_res_demo_dependency-binding_rbind_pg"],
      },
    });
    expect(deployments.items.size).toBe(0);
  });

  test("[DEP-BIND-REDIS-SNAPSHOT-001] captures active Redis binding safe references without secrets", async () => {
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      dependencyBindings,
      dependencyResourceSecretStore,
      dependencyResources,
      deployments,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy());
    await createActiveRedisBinding({
      dependencyBindings,
      dependencyResourceSecretStore,
      dependencyResources,
      context,
      repositoryContext,
    });

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);
    const created = unwrapDeploymentCreateResult(result);

    const deployment = deployments.items.get(created.id);
    expect(deployment?.toState().dependencyBindingReferences).toHaveLength(1);
    expect(deployment?.toState().dependencyBindingReferences[0]).toMatchObject({
      bindingId: ResourceBindingId.rehydrate("rbd_redis"),
      dependencyResourceId: ResourceInstanceId.rehydrate("rsi_redis"),
      kind: ResourceInstanceKindValue.rehydrate("redis"),
      targetName: ResourceBindingTargetName.rehydrate("REDIS_URL"),
      scope: ResourceBindingScopeValue.rehydrate("runtime-only"),
      injectionMode: ResourceInjectionModeValue.rehydrate("env"),
      runtimeSecretRef: DeploymentDependencyRuntimeSecretRef.rehydrate(
        "appaloft://dependency-resources/rsi_redis/connection",
      ),
    });
    const serializedReferences = JSON.stringify(
      deployment?.toState().dependencyBindingReferences ?? [],
    );
    expect(serializedReferences).not.toContain("super-secret");
    expect(serializedReferences).not.toContain("redis.example.com");
    expect(serializedReferences).not.toContain("redis://");
  });

  test("[DEP-RES-REDIS-NATIVE-005] captures realized managed Redis binding runtime references without secrets", async () => {
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      dependencyBindings,
      dependencyResourceSecretStore,
      dependencyResources,
      deployments,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy());
    await createActiveManagedRedisBinding({
      dependencyBindings,
      dependencyResourceSecretStore,
      dependencyResources,
      context,
      repositoryContext,
    });

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);
    const created = unwrapDeploymentCreateResult(result);

    const deployment = deployments.items.get(created.id);
    expect(deployment?.toState().dependencyBindingReferences).toHaveLength(1);
    expect(deployment?.toState().dependencyBindingReferences[0]).toMatchObject({
      bindingId: ResourceBindingId.rehydrate("rbd_managed_redis"),
      dependencyResourceId: ResourceInstanceId.rehydrate("rsi_managed_redis"),
      kind: ResourceInstanceKindValue.rehydrate("redis"),
      targetName: ResourceBindingTargetName.rehydrate("REDIS_URL"),
      scope: ResourceBindingScopeValue.rehydrate("runtime-only"),
      injectionMode: ResourceInjectionModeValue.rehydrate("env"),
      runtimeSecretRef: DeploymentDependencyRuntimeSecretRef.rehydrate(
        "appaloft://dependency-resources/rsi_managed_redis/connection",
      ),
    });
    const serializedReferences = JSON.stringify(
      deployment?.toState().dependencyBindingReferences ?? [],
    );
    expect(serializedReferences).not.toContain("super-secret");
    expect(serializedReferences).not.toContain("managed-redis.redis.internal");
    expect(serializedReferences).not.toContain("redis://");
  });

  test("[DEP-RES-PG-CLOSED-LOOP-001] verifies managed Postgres provision bind deploy observe backup restore loop", async () => {
    const {
      bindDependency,
      context,
      createBackup,
      createDeploymentInput,
      createDeploymentUseCase,
      deploymentReadModel,
      dependencyResourceBackupProvider,
      provisionDependencyResource,
      repositoryContext,
      restoreBackup,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy());

    const provisioned = await provisionDependencyResource.execute(context, {
      kind: "postgres",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Main DB",
    });
    expect(provisioned.isOk()).toBe(true);
    const dependencyResourceId = provisioned._unsafeUnwrap().id;

    const bound = await bindDependency.execute(context, {
      resourceId: "res_demo",
      dependencyResourceId,
      targetName: "DATABASE_URL",
    });
    expect(bound.isOk()).toBe(true);

    const deployed = await createDeploymentUseCase.execute(context, createDeploymentInput);
    const createdDeployment = unwrapDeploymentCreateResult(deployed);
    const observed = await deploymentReadModel.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate(createdDeployment.id)),
    );
    const observedLogs = await deploymentReadModel.findTimeline(
      repositoryContext,
      createdDeployment.id,
    );

    expect(observed).toMatchObject({
      id: createdDeployment.id,
      status: "succeeded",
      dependencyBindingReferences: [
        expect.objectContaining({
          dependencyResourceId,
          kind: "postgres",
          targetName: "DATABASE_URL",
        }),
      ],
    });
    expect(observedLogs).toContainEqual(
      expect.objectContaining({
        level: "info",
        message: "Hermetic execution backend applied runtime plan",
      }),
    );
    expect(JSON.stringify(observed)).not.toContain("super-secret");
    expect(JSON.stringify(observed)).not.toContain("postgres://app:");

    const backup = await createBackup.execute(context, { dependencyResourceId });
    expect(backup.isOk()).toBe(true);
    const restored = await restoreBackup.execute(context, {
      backupId: backup._unsafeUnwrap().id,
      acknowledgeDataOverwrite: true,
      acknowledgeRuntimeNotRestarted: true,
    });

    expect(restored.isOk()).toBe(true);
    expect(dependencyResourceBackupProvider.backups).toContainEqual(
      expect.objectContaining({
        dependencyResourceId,
        providerKey: "appaloft-managed-postgres",
        dependencyKind: "postgres",
      }),
    );
    expect(dependencyResourceBackupProvider.restores).toContainEqual(
      expect.objectContaining({
        backupId: backup._unsafeUnwrap().id,
        dependencyResourceId,
      }),
    );
  });

  test("[DEP-RES-REDIS-CLOSED-LOOP-001] verifies managed Redis provision bind deploy observe backup restore loop", async () => {
    const {
      bindDependency,
      context,
      createBackup,
      createDeploymentInput,
      createDeploymentUseCase,
      deploymentReadModel,
      dependencyResourceBackupProvider,
      dependencyResourceSecretStore,
      managedDependencyProvider,
      provisionDependencyResource,
      repositoryContext,
      restoreBackup,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy());
    dependencyResourceBackupProvider.setSupported(["appaloft-managed-redis:redis"]);
    managedDependencyProvider.setRealizationResult(
      ok({
        providerResourceHandle: "redis/rsi_0001",
        endpoint: {
          host: "main-cache.redis.internal",
          port: 6379,
          databaseName: "0",
          maskedConnection: "redis://:********@main-cache.redis.internal:6379/0",
        },
        connectionSecretValue: "redis://:super-secret@main-cache.redis.internal:6379/0",
        realizedAt: "2026-01-01T00:00:00.000Z",
      }),
    );

    const provisioned = await provisionDependencyResource.execute(context, {
      kind: "redis",
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Main Cache",
    });
    expect(provisioned.isOk()).toBe(true);
    const dependencyResourceId = provisioned._unsafeUnwrap().id;
    const secretRef = `appaloft://dependency-resources/${dependencyResourceId}/connection`;

    const bound = await bindDependency.execute(context, {
      resourceId: "res_demo",
      dependencyResourceId,
      targetName: "REDIS_URL",
    });
    expect(bound.isOk()).toBe(true);

    const deployed = await createDeploymentUseCase.execute(context, createDeploymentInput);
    const createdDeployment = unwrapDeploymentCreateResult(deployed);
    const observed = await deploymentReadModel.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate(createdDeployment.id)),
    );
    const observedLogs = await deploymentReadModel.findTimeline(
      repositoryContext,
      createdDeployment.id,
    );

    expect(observed).toMatchObject({
      id: createdDeployment.id,
      status: "succeeded",
      dependencyBindingReferences: [
        expect.objectContaining({
          dependencyResourceId,
          kind: "redis",
          targetName: "REDIS_URL",
        }),
      ],
    });
    expect(observedLogs).toContainEqual(
      expect.objectContaining({
        level: "info",
        message: "Hermetic execution backend applied runtime plan",
      }),
    );
    expect(JSON.stringify(observed)).not.toContain("super-secret");
    expect(JSON.stringify(observed)).not.toContain("redis://:super-secret");
    const resolvedSecret = await dependencyResourceSecretStore.resolve(context, {
      secretRef,
    });
    expect(resolvedSecret.isOk()).toBe(true);
    expect(resolvedSecret._unsafeUnwrap()).toEqual({
      secretRef,
      secretValue: "redis://:super-secret@main-cache.redis.internal:6379/0",
    });

    const backup = await createBackup.execute(context, { dependencyResourceId });
    expect(backup.isOk()).toBe(true);
    const restored = await restoreBackup.execute(context, {
      backupId: backup._unsafeUnwrap().id,
      acknowledgeDataOverwrite: true,
      acknowledgeRuntimeNotRestarted: true,
    });

    expect(restored.isOk()).toBe(true);
    expect(dependencyResourceBackupProvider.backups).toContainEqual(
      expect.objectContaining({
        dependencyResourceId,
        providerKey: "appaloft-managed-redis",
        dependencyKind: "redis",
      }),
    );
    expect(dependencyResourceBackupProvider.restores).toContainEqual(
      expect.objectContaining({
        backupId: backup._unsafeUnwrap().id,
        dependencyResourceId,
      }),
    );
  });

  test("[DEP-BIND-RUNTIME-INJECT-004] rejects active dependency binding when the runtime target name conflicts", async () => {
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      dependencyBindings,
      dependencyResourceSecretStore,
      dependencyResources,
      deployments,
      environment,
      environments,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy());
    await createActivePostgresBinding({
      dependencyBindings,
      dependencyResourceSecretStore,
      dependencyResources,
      context,
      repositoryContext,
    });
    environment
      .setVariable({
        key: ConfigKey.rehydrate("DATABASE_URL"),
        value: ConfigValueText.rehydrate("existing-configured-value"),
        kind: VariableKindValue.rehydrate("secret"),
        exposure: VariableExposureValue.rehydrate("runtime"),
        updatedAt: UpdatedAt.rehydrate("2026-01-01T00:00:01.000Z"),
      })
      ._unsafeUnwrap();
    await environments.upsert(
      repositoryContext,
      environment,
      UpsertEnvironmentSpec.fromEnvironment(environment),
    );

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "dependency_runtime_injection_blocked",
      details: {
        reason: "dependency_runtime_injection_target_conflict",
        bindingCount: 1,
      },
    });
    expect(deployments.items.size).toBe(0);
  });

  test("[DEP-BIND-RUNTIME-INJECT-004] rejects active dependency binding when the runtime target cannot deliver dependency secrets", async () => {
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      dependencyBindings,
      dependencyResourceSecretStore,
      dependencyResources,
      deployments,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
      runtimeTargetBackendRegistry: new StaticRuntimeTargetBackendRegistry(true, [
        "runtime.apply",
        "runtime.verify",
        "runtime.logs",
      ]),
    });
    await createActivePostgresBinding({
      dependencyBindings,
      dependencyResourceSecretStore,
      dependencyResources,
      context,
      repositoryContext,
    });

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "dependency_runtime_injection_blocked",
      details: {
        reason: "dependency_runtime_injection_target_backend_unsupported",
        bindingCount: 1,
      },
    });
    expect(deployments.items.size).toBe(0);
  });

  test("[DEP-BIND-SECRET-RESOLVE-004] rejects active dependency binding with unresolved Appaloft-owned runtime secret ref", async () => {
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      dependencyBindings,
      dependencyResources,
      deployments,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy());
    await createActivePostgresBinding({
      dependencyBindings,
      dependencyResources,
      repositoryContext,
    });

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "dependency_runtime_injection_blocked",
      details: {
        reason: "dependency_runtime_secret_unresolved",
        bindingCount: 1,
      },
    });
    expect(JSON.stringify(result._unsafeUnwrapErr())).not.toContain("super-secret");
    expect(JSON.stringify(result._unsafeUnwrapErr())).not.toContain("postgres://");
    expect(deployments.items.size).toBe(0);
  });

  test("[DEP-BIND-SNAP-REF-003] omits removed bindings from new deployment snapshots", async () => {
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      dependencyBindings,
      dependencyResourceSecretStore,
      dependencyResources,
      deployments,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy());
    await createActivePostgresBinding({
      dependencyBindings,
      dependencyResourceSecretStore,
      dependencyResources,
      context,
      repositoryContext,
      status: "removed",
    });

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    expect(
      deployments.items.get(result._unsafeUnwrap().id)?.toState().dependencyBindingReferences,
    ).toEqual([]);
  });

  test("[DEP-BIND-ROTATE-004] preserves historical deployment snapshot references after binding secret rotation", async () => {
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      dependencyBindings,
      dependencyResourceSecretStore,
      dependencyResources,
      deployments,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy());
    await createActivePostgresBinding({
      dependencyBindings,
      dependencyResourceSecretStore,
      dependencyResources,
      context,
      repositoryContext,
    });
    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);
    const created = unwrapDeploymentCreateResult(result);
    const deployment = deployments.items.get(created.id);
    const capturedReferences = deployment?.toState().dependencyBindingReferences ?? [];
    const binding = dependencyBindings.items.get("rbd_pg");

    expect(binding).toBeDefined();
    binding
      ?.rotateSecret({
        secretRef: ResourceBindingSecretRef.rehydrate("secret://dependency-binding/rbd_pg/current"),
        secretVersion: ResourceBindingSecretVersion.rehydrate("rbsv_0001"),
        rotatedAt: UpdatedAt.rehydrate("2026-01-01T00:03:00.000Z"),
      })
      ._unsafeUnwrap();
    if (binding) {
      await dependencyBindings.upsert(
        repositoryContext,
        binding,
        UpsertResourceBindingSpec.fromResourceBinding(binding),
      );
    }

    expect(deployment?.toState().dependencyBindingReferences).toEqual(capturedReferences);
    expect(JSON.stringify(deployment?.toState().dependencyBindingReferences ?? [])).not.toContain(
      "secret://dependency-binding/rbd_pg/current",
    );
  });

  test("[DEP-BIND-SECRET-RESOLVE-007] keeps historical and rotated dependency refs resolvable for deployment snapshots", async () => {
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      dependencyBindings,
      dependencyResourceSecretStore,
      dependencyResources,
      deployments,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy());
    await createActivePostgresBinding({
      dependencyBindings,
      dependencyResourceSecretStore,
      dependencyResources,
      context,
      repositoryContext,
    });

    const firstResult = await createDeploymentUseCase.execute(context, createDeploymentInput);
    const firstCreated = unwrapDeploymentCreateResult(firstResult);
    const firstDeployment = deployments.items.get(firstCreated.id);
    const firstReference = firstDeployment?.toState().dependencyBindingReferences[0];
    const rotatedSecretRef = "appaloft+pg://resource-binding/rbd_pg/rbsv_0001";
    const rotatedSecretValue = "postgres://app:rotated-secret@db.example.com:5432/app";

    const binding = dependencyBindings.items.get("rbd_pg");
    expect(binding).toBeDefined();
    binding
      ?.rotateSecret({
        secretRef: ResourceBindingSecretRef.rehydrate(rotatedSecretRef),
        secretVersion: ResourceBindingSecretVersion.rehydrate("rbsv_0001"),
        rotatedAt: UpdatedAt.rehydrate("2026-01-01T00:03:00.000Z"),
      })
      ._unsafeUnwrap();
    if (binding) {
      await dependencyBindings.upsert(
        repositoryContext,
        binding,
        UpsertResourceBindingSpec.fromResourceBinding(binding),
      );
    }

    const unresolvedResult = await createDeploymentUseCase.execute(context, createDeploymentInput);
    expect(unresolvedResult.isErr()).toBe(true);
    expect(unresolvedResult._unsafeUnwrapErr()).toMatchObject({
      code: "dependency_runtime_injection_blocked",
      details: { reason: "dependency_runtime_secret_unresolved" },
    });

    dependencyResourceSecretStore.setResolvedValue(rotatedSecretRef, rotatedSecretValue);
    const secondResult = await createDeploymentUseCase.execute(context, createDeploymentInput);
    const secondCreated = unwrapDeploymentCreateResult(secondResult);
    const secondDeployment = deployments.items.get(secondCreated.id);
    const secondReference = secondDeployment?.toState().dependencyBindingReferences[0];
    const firstResolved = await dependencyResourceSecretStore.resolve(context, {
      secretRef: firstReference?.runtimeSecretRef?.value ?? "",
    });
    const secondResolved = await dependencyResourceSecretStore.resolve(context, {
      secretRef: secondReference?.runtimeSecretRef?.value ?? "",
    });

    expect(firstReference?.runtimeSecretRef?.value).toBe(
      "appaloft://dependency-resources/rsi_pg/connection",
    );
    expect(secondReference?.runtimeSecretRef?.value).toBe(rotatedSecretRef);
    expect(firstResolved.isOk()).toBe(true);
    expect(secondResolved._unsafeUnwrap()).toEqual({
      secretRef: rotatedSecretRef,
      secretValue: rotatedSecretValue,
    });
    expect(firstDeployment?.toState().dependencyBindingReferences[0]?.runtimeSecretRef?.value).toBe(
      "appaloft://dependency-resources/rsi_pg/connection",
    );
  });

  test("[RES-PROFILE-ACCESS-003] resource access path prefix reaches generated route planning input", async () => {
    const innerRuntimePlanResolver = new CapturingRuntimePlanResolver();
    const defaultAccessDomainProvider = new StaticDefaultAccessDomainProvider();
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      repositoryContext,
      resources,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
      runtimePlanResolver: new DefaultAccessDomainRuntimePlanResolver(
        innerRuntimePlanResolver,
        defaultAccessDomainProvider,
      ),
      edgeProxyKind: "traefik",
    });
    const resource = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_demo")),
    );
    if (!resource) {
      throw new Error("Expected resource fixture");
    }
    resource
      .configureAccessProfile({
        accessProfile: {
          generatedAccessMode: ResourceGeneratedAccessModeValue.rehydrate("inherit"),
          pathPrefix: RoutePathPrefix.rehydrate("/docs"),
        },
        configuredAt: UpdatedAt.rehydrate("2026-01-01T00:00:05.000Z"),
      })
      ._unsafeUnwrap();
    await resources.upsert(repositoryContext, resource, UpsertResourceSpec.fromResource(resource));

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    expect(defaultAccessDomainProvider.calls).toHaveLength(1);
    expect(innerRuntimePlanResolver.input?.requestedDeployment).toMatchObject({
      domains: ["web.203-0-113-10.sslip.io"],
      pathPrefix: "/docs",
      tlsMode: "auto",
      accessContext: {
        resourceId: "res_demo",
        pathPrefix: "/docs",
      },
      accessRouteMetadata: {
        "access.routeSource": "generated-default",
        "access.hostname": "web.203-0-113-10.sslip.io",
        "access.providerKey": "sslip",
      },
    });
  });

  test("[RES-PROFILE-ACCESS-001] disabled resource access profile skips generated route resolution", async () => {
    const innerRuntimePlanResolver = new CapturingRuntimePlanResolver();
    const defaultAccessDomainProvider = new StaticDefaultAccessDomainProvider();
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      repositoryContext,
      resources,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
      runtimePlanResolver: new DefaultAccessDomainRuntimePlanResolver(
        innerRuntimePlanResolver,
        defaultAccessDomainProvider,
      ),
      edgeProxyKind: "traefik",
    });
    const resource = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_demo")),
    );
    if (!resource) {
      throw new Error("Expected resource fixture");
    }
    resource
      .configureAccessProfile({
        accessProfile: {
          generatedAccessMode: ResourceGeneratedAccessModeValue.rehydrate("disabled"),
          pathPrefix: RoutePathPrefix.rehydrate("/"),
        },
        configuredAt: UpdatedAt.rehydrate("2026-01-01T00:00:05.000Z"),
      })
      ._unsafeUnwrap();
    await resources.upsert(repositoryContext, resource, UpsertResourceSpec.fromResource(resource));

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    expect(defaultAccessDomainProvider.calls).toHaveLength(0);
    expect(innerRuntimePlanResolver.input?.requestedDeployment.accessContext).toBeUndefined();
    expect(innerRuntimePlanResolver.input?.requestedDeployment.domains).toBeUndefined();
  });

  test("[RES-PROFILE-ARCHIVE-004] rejects deployment creation for archived resources", async () => {
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      eventBus,
      repositoryContext,
      resources,
    } = await createDeploymentFixture();
    const resource = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_demo")),
    );
    if (!resource) {
      throw new Error("Expected resource fixture");
    }
    resource
      .archive({
        archivedAt: ArchivedAt.rehydrate("2026-01-01T00:00:05.000Z"),
      })
      ._unsafeUnwrap();
    await resources.upsert(repositoryContext, resource, UpsertResourceSpec.fromResource(resource));

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "resource_archived",
      details: {
        phase: "resource-lifecycle-guard",
        resourceId: "res_demo",
        commandName: "deployments.create",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });

  test("[SRV-LIFE-DEACT-004] rejects deployment creation for inactive servers", async () => {
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      eventBus,
      repositoryContext,
      servers,
    } = await createDeploymentFixture();
    const server = await servers.findOne(
      repositoryContext,
      DeploymentTargetByIdSpec.create(DeploymentTargetId.rehydrate("srv_demo")),
    );
    if (!server) {
      throw new Error("Expected server fixture");
    }
    server
      .deactivate({
        deactivatedAt: DeactivatedAt.rehydrate("2026-01-01T00:00:05.000Z"),
      })
      ._unsafeUnwrap();
    await servers.upsert(
      repositoryContext,
      server,
      UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
    );

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "server_inactive",
      details: {
        phase: "server-lifecycle-guard",
        serverId: "srv_demo",
        commandName: "deployments.create",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });

  test("[DEP-CREATE-ADM-023] supersedes the previous active deployment before admitting a new one", async () => {
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      deployments,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy());

    const activeDeployment = createHistoricalDeployment({
      id: "dep_active",
      createdAt: "2026-01-01T00:00:05.000Z",
      status: "running",
    });
    const admitResult = await deployments.insertOne(
      repositoryContext,
      activeDeployment,
      UpsertDeploymentSpec.fromDeployment(activeDeployment),
    );
    expect(admitResult.isOk()).toBe(true);

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    const nextDeploymentId = result._unsafeUnwrap().id;
    expect(nextDeploymentId).not.toBe("dep_active");

    const supersededDeployment = await deployments.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate("dep_active")),
    );
    expect(supersededDeployment?.toState()).toMatchObject({
      status: { value: "canceled" },
      supersededByDeploymentId: { value: nextDeploymentId },
    });

    const acceptedDeployment = await deployments.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate(nextDeploymentId)),
    );
    expect(acceptedDeployment?.toState().status.value).toBe("succeeded");
  });

  test("[DEP-CREATE-ADM-023A] rejects deployment admission when the atomic admit step loses a concurrent race", async () => {
    const projects = new MemoryProjectRepository();
    const servers = new MemoryServerRepository();
    const destinations = new MemoryDestinationRepository();
    const environments = new MemoryEnvironmentRepository();
    const resources = new MemoryResourceRepository();
    const deployments = new RaceLosingMemoryDeploymentRepository();
    const clock = new FixedClock("2026-01-01T00:00:00.000Z");
    const idGenerator = new SequenceIdGenerator();
    const eventBus = new CapturedEventBus();
    const logger = new NoopLogger();
    const defaultsFactory = new DeploymentContextDefaultsFactory(clock, idGenerator);
    const context = createTestContext();
    const repositoryContext = toRepositoryContext(context);

    const project = Project.create({
      id: ProjectId.rehydrate("prj_demo"),
      name: ProjectName.rehydrate("Demo"),
      createdAt: CreatedAt.rehydrate(clock.now()),
    })._unsafeUnwrap();
    const server = DeploymentTarget.register({
      id: DeploymentTargetId.rehydrate("srv_demo"),
      name: DeploymentTargetName.rehydrate("demo-server"),
      host: HostAddress.rehydrate("127.0.0.1"),
      port: PortNumber.rehydrate(22),
      providerKey: ProviderKey.rehydrate("generic-ssh"),
      createdAt: CreatedAt.rehydrate(clock.now()),
    })._unsafeUnwrap();
    const destination = Destination.register({
      id: DestinationId.rehydrate("dst_demo"),
      serverId: DeploymentTargetId.rehydrate("srv_demo"),
      name: DestinationName.rehydrate("default"),
      kind: DestinationKindValue.rehydrate("generic"),
      createdAt: CreatedAt.rehydrate(clock.now()),
    })._unsafeUnwrap();
    const environment = Environment.create({
      id: EnvironmentId.rehydrate("env_demo"),
      projectId: ProjectId.rehydrate("prj_demo"),
      name: EnvironmentName.rehydrate("production"),
      kind: EnvironmentKindValue.rehydrate("production"),
      createdAt: CreatedAt.rehydrate(clock.now()),
    })._unsafeUnwrap();
    const resource = Resource.create({
      id: ResourceId.rehydrate("res_demo"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      destinationId: DestinationId.rehydrate("dst_demo"),
      name: ResourceName.rehydrate("web"),
      kind: ResourceKindValue.rehydrate("application"),
      sourceBinding: {
        kind: SourceKindValue.rehydrate("local-folder"),
        locator: SourceLocator.rehydrate("."),
        displayName: DisplayNameText.rehydrate("workspace"),
      },
      runtimeProfile: {
        strategy: RuntimePlanStrategyValue.rehydrate("auto"),
      },
      networkProfile: {
        internalPort: PortNumber.rehydrate(3000),
        upstreamProtocol: ResourceNetworkProtocolValue.rehydrate("http"),
        exposureMode: ResourceExposureModeValue.rehydrate("reverse-proxy"),
      },
      createdAt: CreatedAt.rehydrate(clock.now()),
    })._unsafeUnwrap();

    await projects.upsert(repositoryContext, project, UpsertProjectSpec.fromProject(project));
    await servers.upsert(
      repositoryContext,
      server,
      UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
    );
    await destinations.upsert(
      repositoryContext,
      destination,
      UpsertDestinationSpec.fromDestination(destination),
    );
    await environments.upsert(
      repositoryContext,
      environment,
      UpsertEnvironmentSpec.fromEnvironment(environment),
    );
    await resources.upsert(repositoryContext, resource, UpsertResourceSpec.fromResource(resource));

    const useCase = new CreateDeploymentUseCase(
      deployments,
      new DeploymentContextResolver(projects, servers, destinations, environments, resources),
      new DeploymentContextBootstrapService(
        new NullDeploymentConfigReader(),
        projects,
        servers,
        destinations,
        environments,
        resources,
        new StaticProviderRegistry(),
        new ExplicitContextRequiredPolicy(),
        defaultsFactory,
        clock,
        idGenerator,
        eventBus,
        logger,
      ),
      new StaticSourceDetector(),
      new StaticRuntimePlanResolver(),
      new HermeticExecutionBackend(),
      eventBus,
      new NoopDeploymentProgressReporter(),
      logger,
      new DeploymentSnapshotFactory(clock, idGenerator),
      new RuntimePlanResolutionInputBuilder(clock, idGenerator),
      new DeploymentFactory(clock, idGenerator),
      new DeploymentLifecycleService(clock),
      new PassThroughMutationCoordinator(),
      new StaticRuntimeTargetBackendRegistry(),
      testSecretProtector,
    );

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "deployment_not_redeployable",
      details: {
        commandName: "deployments.create",
        phase: "redeploy-guard",
        deploymentId: "dep_competing",
        resourceId: "res_demo",
        status: "running",
        causeCode: "concurrent_active_deployment",
      },
    });
  });

  test("[DEP-CREATE-ADM-023B] rejects supersede when the previous running deployment cannot be canceled", async () => {
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      deployments,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
      executionBackend: new CancelFailingExecutionBackend(),
    });

    const activeDeployment = createHistoricalDeployment({
      id: "dep_active",
      createdAt: "2026-01-01T00:00:05.000Z",
      status: "running",
    });
    const admitResult = await deployments.insertOne(
      repositoryContext,
      activeDeployment,
      UpsertDeploymentSpec.fromDeployment(activeDeployment),
    );
    expect(admitResult.isOk()).toBe(true);

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error).toMatchObject({
      code: "conflict",
      details: {
        commandName: "deployments.create",
        phase: "supersede-previous-deployment",
        deploymentId: "dep_active",
        resourceId: "res_demo",
      },
    });
    const supersedingDeploymentId = String(error.details?.supersededByDeploymentId ?? "");
    expect(supersedingDeploymentId.length).toBeGreaterThan(0);

    const storedDeployment = await deployments.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate("dep_active")),
    );
    expect(storedDeployment?.toState()).toMatchObject({
      status: { value: "cancel-requested" },
      supersededByDeploymentId: { value: supersedingDeploymentId },
    });
  });

  test("creates a deployment with an immutable environment snapshot", async () => {
    const projects = new MemoryProjectRepository();
    const servers = new MemoryServerRepository();
    const destinations = new MemoryDestinationRepository();
    const environments = new MemoryEnvironmentRepository();
    const resources = new MemoryResourceRepository();
    const deployments = new MemoryDeploymentRepository();
    const clock = new FixedClock("2026-01-01T00:00:00.000Z");
    const idGenerator = new SequenceIdGenerator();
    const eventBus = new CapturedEventBus();
    const logger = new NoopLogger();
    const defaultsFactory = new DeploymentContextDefaultsFactory(clock, idGenerator);
    const context = createTestContext();
    const repositoryContext = toRepositoryContext(context);

    const project = Project.create({
      id: ProjectId.rehydrate("prj_demo"),
      name: ProjectName.rehydrate("Demo"),
      createdAt: CreatedAt.rehydrate(clock.now()),
    })._unsafeUnwrap();
    const server = DeploymentTarget.register({
      id: DeploymentTargetId.rehydrate("srv_demo"),
      name: DeploymentTargetName.rehydrate("demo-server"),
      host: HostAddress.rehydrate("127.0.0.1"),
      port: PortNumber.rehydrate(22),
      providerKey: ProviderKey.rehydrate("generic-ssh"),
      createdAt: CreatedAt.rehydrate(clock.now()),
    })._unsafeUnwrap();
    const destination = Destination.register({
      id: DestinationId.rehydrate("dst_demo"),
      serverId: DeploymentTargetId.rehydrate("srv_demo"),
      name: DestinationName.rehydrate("default"),
      kind: DestinationKindValue.rehydrate("generic"),
      createdAt: CreatedAt.rehydrate(clock.now()),
    })._unsafeUnwrap();
    const environment = Environment.create({
      id: EnvironmentId.rehydrate("env_demo"),
      projectId: ProjectId.rehydrate("prj_demo"),
      name: EnvironmentName.rehydrate("production"),
      kind: EnvironmentKindValue.rehydrate("production"),
      createdAt: CreatedAt.rehydrate(clock.now()),
    })._unsafeUnwrap();
    const resource = Resource.create({
      id: ResourceId.rehydrate("res_demo"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      destinationId: DestinationId.rehydrate("dst_demo"),
      name: ResourceName.rehydrate("web"),
      kind: ResourceKindValue.rehydrate("application"),
      sourceBinding: {
        kind: SourceKindValue.rehydrate("local-folder"),
        locator: SourceLocator.rehydrate("."),
        displayName: DisplayNameText.rehydrate("workspace"),
      },
      runtimeProfile: {
        strategy: RuntimePlanStrategyValue.rehydrate("auto"),
      },
      networkProfile: {
        internalPort: PortNumber.rehydrate(3000),
        upstreamProtocol: ResourceNetworkProtocolValue.rehydrate("http"),
        exposureMode: ResourceExposureModeValue.rehydrate("reverse-proxy"),
      },
      createdAt: CreatedAt.rehydrate(clock.now()),
    })._unsafeUnwrap();

    environment.setVariable({
      key: ConfigKey.rehydrate("DATABASE_URL"),
      value: ConfigValueText.rehydrate(testProtectedSecret("postgres://db")),
      kind: VariableKindValue.rehydrate("secret"),
      exposure: VariableExposureValue.rehydrate("runtime"),
      scope: ConfigScopeValue.rehydrate("environment"),
      isSecret: true,
      updatedAt: UpdatedAt.rehydrate(clock.now()),
    });

    await projects.upsert(repositoryContext, project, UpsertProjectSpec.fromProject(project));
    await servers.upsert(
      repositoryContext,
      server,
      UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
    );
    await destinations.upsert(
      repositoryContext,
      destination,
      UpsertDestinationSpec.fromDestination(destination),
    );
    await environments.upsert(
      repositoryContext,
      environment,
      UpsertEnvironmentSpec.fromEnvironment(environment),
    );
    await resources.upsert(repositoryContext, resource, UpsertResourceSpec.fromResource(resource));

    const contextResolver = new DeploymentContextResolver(
      projects,
      servers,
      destinations,
      environments,
      resources,
    );
    const useCase = new CreateDeploymentUseCase(
      deployments,
      contextResolver,
      new DeploymentContextBootstrapService(
        new NullDeploymentConfigReader(),
        projects,
        servers,
        destinations,
        environments,
        resources,
        new StaticProviderRegistry(),
        new ExplicitContextRequiredPolicy(),
        defaultsFactory,
        clock,
        idGenerator,
        eventBus,
        logger,
      ),
      new StaticSourceDetector(),
      new StaticRuntimePlanResolver(),
      new HermeticExecutionBackend(),
      eventBus,
      new NoopDeploymentProgressReporter(),
      logger,
      new DeploymentSnapshotFactory(clock, idGenerator),
      new RuntimePlanResolutionInputBuilder(clock, idGenerator),
      new DeploymentFactory(clock, idGenerator),
      new DeploymentLifecycleService(clock),
      new PassThroughMutationCoordinator(),
      new StaticRuntimeTargetBackendRegistry(),
      testSecretProtector,
    );

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
    });

    expect(result.isOk()).toBe(true);
    const createdDeployment = result._unsafeUnwrap();

    const deployment = await deployments.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate(createdDeployment.id)),
    );
    expect(deployment).not.toBeNull();
    expect(deployment?.toState().status.value).toBe("succeeded");
    expect(deployment?.toState().environmentSnapshot.variables).toEqual([
      expect.objectContaining({
        key: "DATABASE_URL",
        value: testProtectedSecret("postgres://db"),
        isSecret: true,
      }),
    ]);
    expect(deployment?.toState().timeline).toHaveLength(1);
    expect(eventBus.events.length).toBeGreaterThan(0);
  });

  test("[RES-PROFILE-CONFIG-012] applies resource-scoped variables over inherited environment snapshot entries", async () => {
    const projects = new MemoryProjectRepository();
    const servers = new MemoryServerRepository();
    const destinations = new MemoryDestinationRepository();
    const environments = new MemoryEnvironmentRepository();
    const resources = new MemoryResourceRepository();
    const deployments = new MemoryDeploymentRepository();
    const clock = new FixedClock("2026-01-01T00:00:00.000Z");
    const idGenerator = new SequenceIdGenerator();
    const eventBus = new CapturedEventBus();
    const logger = new NoopLogger();
    const defaultsFactory = new DeploymentContextDefaultsFactory(clock, idGenerator);
    const context = createTestContext();
    const repositoryContext = toRepositoryContext(context);

    const project = Project.create({
      id: ProjectId.rehydrate("prj_demo"),
      name: ProjectName.rehydrate("Demo"),
      createdAt: CreatedAt.rehydrate(clock.now()),
    })._unsafeUnwrap();
    const server = DeploymentTarget.register({
      id: DeploymentTargetId.rehydrate("srv_demo"),
      name: DeploymentTargetName.rehydrate("demo-server"),
      host: HostAddress.rehydrate("127.0.0.1"),
      port: PortNumber.rehydrate(22),
      providerKey: ProviderKey.rehydrate("generic-ssh"),
      createdAt: CreatedAt.rehydrate(clock.now()),
    })._unsafeUnwrap();
    const destination = Destination.register({
      id: DestinationId.rehydrate("dst_demo"),
      serverId: DeploymentTargetId.rehydrate("srv_demo"),
      name: DestinationName.rehydrate("default"),
      kind: DestinationKindValue.rehydrate("generic"),
      createdAt: CreatedAt.rehydrate(clock.now()),
    })._unsafeUnwrap();
    const environment = Environment.create({
      id: EnvironmentId.rehydrate("env_demo"),
      projectId: ProjectId.rehydrate("prj_demo"),
      name: EnvironmentName.rehydrate("production"),
      kind: EnvironmentKindValue.rehydrate("production"),
      createdAt: CreatedAt.rehydrate(clock.now()),
    })._unsafeUnwrap();
    const resource = Resource.create({
      id: ResourceId.rehydrate("res_demo"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      destinationId: DestinationId.rehydrate("dst_demo"),
      name: ResourceName.rehydrate("web"),
      kind: ResourceKindValue.rehydrate("application"),
      sourceBinding: {
        kind: SourceKindValue.rehydrate("local-folder"),
        locator: SourceLocator.rehydrate("."),
        displayName: DisplayNameText.rehydrate("workspace"),
      },
      runtimeProfile: {
        strategy: RuntimePlanStrategyValue.rehydrate("auto"),
      },
      networkProfile: {
        internalPort: PortNumber.rehydrate(3000),
        upstreamProtocol: ResourceNetworkProtocolValue.rehydrate("http"),
        exposureMode: ResourceExposureModeValue.rehydrate("reverse-proxy"),
      },
      createdAt: CreatedAt.rehydrate(clock.now()),
    })._unsafeUnwrap();

    environment.setVariable({
      key: ConfigKey.rehydrate("DATABASE_URL"),
      value: ConfigValueText.rehydrate("postgres://environment"),
      kind: VariableKindValue.rehydrate("secret"),
      exposure: VariableExposureValue.rehydrate("runtime"),
      scope: ConfigScopeValue.rehydrate("environment"),
      isSecret: true,
      updatedAt: UpdatedAt.rehydrate(clock.now()),
    });
    environment.setVariable({
      key: ConfigKey.rehydrate("PUBLIC_BASE_URL"),
      value: ConfigValueText.rehydrate("https://env.example.test"),
      kind: VariableKindValue.rehydrate("plain-config"),
      exposure: VariableExposureValue.rehydrate("build-time"),
      scope: ConfigScopeValue.rehydrate("environment"),
      updatedAt: UpdatedAt.rehydrate(clock.now()),
    });
    resource.setVariable({
      key: ConfigKey.rehydrate("DATABASE_URL"),
      value: ConfigValueText.rehydrate(testProtectedSecret("postgres://resource")),
      kind: VariableKindValue.rehydrate("secret"),
      exposure: VariableExposureValue.rehydrate("runtime"),
      isSecret: true,
      updatedAt: UpdatedAt.rehydrate(clock.now()),
    });

    await projects.upsert(repositoryContext, project, UpsertProjectSpec.fromProject(project));
    await servers.upsert(
      repositoryContext,
      server,
      UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
    );
    await destinations.upsert(
      repositoryContext,
      destination,
      UpsertDestinationSpec.fromDestination(destination),
    );
    await environments.upsert(
      repositoryContext,
      environment,
      UpsertEnvironmentSpec.fromEnvironment(environment),
    );
    await resources.upsert(repositoryContext, resource, UpsertResourceSpec.fromResource(resource));

    const useCase = new CreateDeploymentUseCase(
      deployments,
      new DeploymentContextResolver(projects, servers, destinations, environments, resources),
      new DeploymentContextBootstrapService(
        new NullDeploymentConfigReader(),
        projects,
        servers,
        destinations,
        environments,
        resources,
        new StaticProviderRegistry(),
        new ExplicitContextRequiredPolicy(),
        defaultsFactory,
        clock,
        idGenerator,
        eventBus,
        logger,
      ),
      new StaticSourceDetector(),
      new StaticRuntimePlanResolver(),
      new HermeticExecutionBackend(),
      eventBus,
      new NoopDeploymentProgressReporter(),
      logger,
      new DeploymentSnapshotFactory(clock, idGenerator),
      new RuntimePlanResolutionInputBuilder(clock, idGenerator),
      new DeploymentFactory(clock, idGenerator),
      new DeploymentLifecycleService(clock),
      new PassThroughMutationCoordinator(),
      new StaticRuntimeTargetBackendRegistry(),
      testSecretProtector,
    );

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
    });

    expect(result.isOk()).toBe(true);
    const createdDeployment = result._unsafeUnwrap();
    const deployment = await deployments.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate(createdDeployment.id)),
    );

    expect(deployment?.toState().environmentSnapshot.precedence).toEqual([
      "defaults",
      "system",
      "organization",
      "project",
      "environment",
      "resource",
      "deployment",
    ]);
    expect(deployment?.toState().environmentSnapshot.variables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "DATABASE_URL",
          value: testProtectedSecret("postgres://resource"),
          scope: "resource",
          isSecret: true,
        }),
        expect.objectContaining({
          key: "PUBLIC_BASE_URL",
          value: "https://env.example.test",
          scope: "environment",
          exposure: "build-time",
          isSecret: false,
        }),
      ]),
    );
  });

  test("rejects deployment admission when resource has no source binding", async () => {
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      resources,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy());
    const resourceWithoutSource = Resource.create({
      id: ResourceId.rehydrate("res_demo"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      destinationId: DestinationId.rehydrate("dst_demo"),
      name: ResourceName.rehydrate("web"),
      kind: ResourceKindValue.rehydrate("application"),
      runtimeProfile: {
        strategy: RuntimePlanStrategyValue.rehydrate("auto"),
      },
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();

    await resources.upsert(
      repositoryContext,
      resourceWithoutSource,
      UpsertResourceSpec.fromResource(resourceWithoutSource),
    );

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe("validation_error");
    expect(error.details).toMatchObject({
      phase: "resource-source-resolution",
      resourceId: "res_demo",
    });
  });

  test("rejects deployment admission when resource keeps an unnormalized GitHub tree URL", async () => {
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      resources,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy());
    const legacyResource = Resource.rehydrate({
      id: ResourceId.rehydrate("res_demo"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      destinationId: DestinationId.rehydrate("dst_demo"),
      name: ResourceName.rehydrate("web"),
      slug: ResourceSlug.rehydrate("web"),
      kind: ResourceKindValue.rehydrate("application"),
      services: [],
      sourceBinding: {
        kind: SourceKindValue.rehydrate("git-public"),
        locator: SourceLocator.rehydrate(
          "https://github.com/coollabsio/coolify-examples/tree/v4.x/bun",
        ),
        displayName: DisplayNameText.rehydrate("coollabsio/coolify-examples"),
      },
      runtimeProfile: {
        strategy: RuntimePlanStrategyValue.rehydrate("dockerfile"),
      },
      networkProfile: {
        internalPort: PortNumber.rehydrate(3000),
        upstreamProtocol: ResourceNetworkProtocolValue.rehydrate("http"),
        exposureMode: ResourceExposureModeValue.rehydrate("reverse-proxy"),
      },
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    });

    await resources.upsert(
      repositoryContext,
      legacyResource,
      UpsertResourceSpec.fromResource(legacyResource),
    );

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe("validation_error");
    expect(error.details).toMatchObject({
      phase: "resource-source-resolution",
      sourceKind: "git-public",
      sourceLocator: "https://github.com/coollabsio/coolify-examples/tree/v4.x/bun",
    });
  });

  test("rejects deployment admission when inbound resource has no internal port", async () => {
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      resources,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy());
    const resourceWithoutNetworkProfile = Resource.create({
      id: ResourceId.rehydrate("res_demo"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      destinationId: DestinationId.rehydrate("dst_demo"),
      name: ResourceName.rehydrate("web"),
      kind: ResourceKindValue.rehydrate("application"),
      sourceBinding: {
        kind: SourceKindValue.rehydrate("local-folder"),
        locator: SourceLocator.rehydrate("."),
        displayName: DisplayNameText.rehydrate("workspace"),
      },
      runtimeProfile: {
        strategy: RuntimePlanStrategyValue.rehydrate("auto"),
      },
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();

    await resources.upsert(
      repositoryContext,
      resourceWithoutNetworkProfile,
      UpsertResourceSpec.fromResource(resourceWithoutNetworkProfile),
    );

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe("validation_error");
    expect(error.details).toMatchObject({
      phase: "resource-network-resolution",
      resourceId: "res_demo",
      resourceKind: "application",
    });
  });

  test("[DEP-CREATE-ADM-026] resolves static resource profile into static artifact planning input", async () => {
    const runtimePlanResolver = new CapturingRuntimePlanResolver();
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      resources,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
      runtimePlanResolver,
    });
    const staticResource = createStaticSiteResource({ publishDirectory: "/dist" });

    await resources.upsert(
      repositoryContext,
      staticResource,
      UpsertResourceSpec.fromResource(staticResource),
    );

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    const requestedDeployment = runtimePlanResolver.input?.requestedDeployment as
      | Record<string, unknown>
      | undefined;
    expect(requestedDeployment).toMatchObject({
      method: "static",
      publishDirectory: "/dist",
      buildCommand: "pnpm build",
      port: 80,
      exposureMode: "reverse-proxy",
      upstreamProtocol: "http",
    });
  });

  test("[DEP-CREATE-SMOKE-001] resolves Dockerfile resource profile without transport runtime fields", async () => {
    const runtimePlanResolver = new CapturingRuntimePlanResolver();
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      resources,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
      runtimePlanResolver,
    });
    const dockerfileResource = createRuntimeSmokeResource({
      strategy: "dockerfile",
      dockerfilePath: "deploy/Dockerfile",
    });

    await resources.upsert(
      repositoryContext,
      dockerfileResource,
      UpsertResourceSpec.fromResource(dockerfileResource),
    );

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    expect(runtimePlanResolver.input?.requestedDeployment).toMatchObject({
      method: "dockerfile",
      dockerfilePath: "deploy/Dockerfile",
      port: 3000,
      exposureMode: "reverse-proxy",
      upstreamProtocol: "http",
    });
  });

  test("[DEP-CREATE-SMOKE-006] resolves Docker Compose resource profile before generic-SSH backend execution", async () => {
    const runtimePlanResolver = new CapturingRuntimePlanResolver();
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      resources,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
      runtimePlanResolver,
    });
    const composeResource = createRuntimeSmokeResource({
      kind: "compose-stack",
      sourceKind: "compose",
      sourceLocator: "/workspace/compose-app",
      strategy: "docker-compose",
      dockerComposeFilePath: "docker-compose.yml",
    });

    await resources.upsert(
      repositoryContext,
      composeResource,
      UpsertResourceSpec.fromResource(composeResource),
    );

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    expect(runtimePlanResolver.input?.requestedDeployment).toMatchObject({
      method: "docker-compose",
      dockerComposeFilePath: "docker-compose.yml",
      port: 3000,
    });
    expect(runtimePlanResolver.input?.server.providerKey.value).toBe("generic-ssh");
  });

  test("[DEP-CREATE-SMOKE-003] resolves prebuilt image resource profile through ids-only create input", async () => {
    const runtimePlanResolver = new CapturingRuntimePlanResolver();
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      resources,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
      runtimePlanResolver,
    });
    const imageResource = createRuntimeSmokeResource({
      sourceKind: "docker-image",
      sourceLocator: "docker://appaloft-smoke-prebuilt:latest",
      strategy: "prebuilt-image",
    });

    await resources.upsert(
      repositoryContext,
      imageResource,
      UpsertResourceSpec.fromResource(imageResource),
    );

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    expect(runtimePlanResolver.input?.source.kind).toBe("docker-image");
    expect(runtimePlanResolver.input?.requestedDeployment).toMatchObject({
      method: "prebuilt-image",
      port: 3000,
    });
    expect(createDeploymentInput).toEqual({
      projectId: "prj_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
    });
  });

  test("[DEP-CREATE-SMOKE-007] admits Docker tag versions for runtime target digest resolution", async () => {
    const runtimePlanResolver = new CapturingRuntimePlanResolver();
    const sourceVersionDetector = new StaticUnknownSourceVersionDetector();
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      resources,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
      runtimePlanResolver,
      sourceVersionDetector,
    });
    const requested = VersionReference.createForSource({
      sourceKind: "docker-image",
      value: "latest",
      referenceKind: "image-tag",
    })._unsafeUnwrap();
    const imageResource = createRuntimeSmokeResource({
      sourceKind: "docker-image",
      sourceLocator: "ghcr.io/acme/api:latest",
      strategy: "prebuilt-image",
      versionReference: requested,
    });

    await resources.upsert(
      repositoryContext,
      imageResource,
      UpsertResourceSpec.fromResource(imageResource),
    );

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    expect(sourceVersionDetector.calls).toBe(0);
    expect(runtimePlanResolver.input?.source.kind).toBe("docker-image");
    expect(runtimePlanResolver.input?.source.version).toBeUndefined();
    expect(runtimePlanResolver.input?.source.metadata).toMatchObject({
      versionReference: "latest",
      versionReferenceKind: "image-tag",
      imageTag: "latest",
    });
    expect(runtimePlanResolver.input?.detectedReasoning).not.toContain(
      "runtime target will report Docker image digest",
    );
  });

  test("[DEF-ACCESS-ROUTE-013][EDGE-PROXY-ROUTE-005] resolves server-applied config domains into deployment planning input", async () => {
    const runtimePlanResolver = new CapturingRuntimePlanResolver();
    const desiredRoutes = new StaticServerAppliedRouteDesiredStateReader({
      routeSetId: "prj_demo:env_demo:res_demo:srv_demo:dst_demo",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      sourceFingerprint: "local-folder:demo",
      domains: [
        {
          host: "www.example.test",
          pathPrefix: "/",
          tlsMode: "auto",
        },
        {
          host: "app.example.test",
          pathPrefix: "/",
          tlsMode: "auto",
        },
      ],
      status: "desired",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const { context, createDeploymentInput, createDeploymentUseCase } =
      await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
        runtimePlanResolver,
        edgeProxyKind: "traefik",
        serverAppliedRouteDesiredStateReader: desiredRoutes,
      });

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    expect(desiredRoutes.targets).toEqual([
      {
        projectId: "prj_demo",
        environmentId: "env_demo",
        resourceId: "res_demo",
        serverId: "srv_demo",
        destinationId: "dst_demo",
      },
    ]);
    expect(runtimePlanResolver.input?.requestedDeployment).toMatchObject({
      proxyKind: "traefik",
      domains: ["www.example.test", "app.example.test"],
      pathPrefix: "/",
      tlsMode: "auto",
      accessRoutes: [
        {
          proxyKind: "traefik",
          domains: ["www.example.test", "app.example.test"],
          pathPrefix: "/",
          tlsMode: "auto",
        },
      ],
      accessRouteMetadata: {
        "access.routeSource": "server-applied-config-domain",
        "access.serverAppliedRouteSetId": "prj_demo:env_demo:res_demo:srv_demo:dst_demo",
        "access.hostname": "www.example.test",
        "access.scheme": "https",
        "access.routeCount": "2",
        "access.routeGroupCount": "1",
        "access.sourceFingerprint": "local-folder:demo",
      },
    });
  });

  test("[DEF-ACCESS-ROUTE-004] durable domain binding takes precedence over server-applied config domain", async () => {
    const runtimePlanResolver = new CapturingRuntimePlanResolver();
    const desiredRoutes = new StaticServerAppliedRouteDesiredStateReader({
      routeSetId: "prj_demo:env_demo:res_demo:srv_demo:dst_demo",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domains: [
        {
          host: "server-applied.example.test",
          pathPrefix: "/",
          tlsMode: "auto",
        },
      ],
      status: "desired",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const routeBindingReader = new StaticDomainRouteBindingReader([
      {
        id: "dmb_ready",
        domainName: "durable.example.test",
        pathPrefix: "/",
        proxyKind: "traefik",
        tlsMode: "disabled",
        status: "ready",
        createdAt: "2026-01-01T00:02:00.000Z",
      },
    ]);
    const { context, createDeploymentInput, createDeploymentUseCase } =
      await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
        runtimePlanResolver,
        edgeProxyKind: "traefik",
        domainRouteBindingReader: routeBindingReader,
        serverAppliedRouteDesiredStateReader: desiredRoutes,
      });

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    expect(runtimePlanResolver.input?.requestedDeployment).toMatchObject({
      proxyKind: "traefik",
      domains: ["durable.example.test"],
      pathPrefix: "/",
      tlsMode: "disabled",
      accessRoutes: [
        {
          proxyKind: "traefik",
          domains: ["durable.example.test"],
          pathPrefix: "/",
          tlsMode: "disabled",
        },
      ],
      accessRouteMetadata: {
        "access.routeSource": "durable-domain-binding",
        "access.domainBindingId": "dmb_ready",
        "access.domainBindingStatus": "ready",
        "access.hostname": "durable.example.test",
        "access.scheme": "http",
      },
    });
  });

  test("[DEP-CREATE-ASYNC-012A] records the previous runtime-owning deployment as the explicit supersede target", async () => {
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      deployments,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy());

    const successfulDeployment = createHistoricalDeployment({
      id: "dep_success",
      createdAt: "2026-01-01T00:00:01.000Z",
      status: "succeeded",
    });
    const failedDeployment = createHistoricalDeployment({
      id: "dep_failed",
      createdAt: "2026-01-01T00:00:02.000Z",
      status: "failed",
    });

    expect(
      (
        await deployments.insertOne(
          repositoryContext,
          successfulDeployment,
          UpsertDeploymentSpec.fromDeployment(successfulDeployment),
        )
      ).isOk(),
    ).toBe(true);
    expect(
      (
        await deployments.insertOne(
          repositoryContext,
          failedDeployment,
          UpsertDeploymentSpec.fromDeployment(failedDeployment),
        )
      ).isOk(),
    ).toBe(true);

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    const deployment = await deployments.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate(result._unsafeUnwrap().id)),
    );
    expect(deployment?.toState().supersedesDeploymentId?.value).toBe("dep_success");
  });

  test("[DEF-ACCESS-ROUTE-013] non-deployable durable binding does not block server-applied route", async () => {
    const runtimePlanResolver = new CapturingRuntimePlanResolver();
    const desiredRoutes = new StaticServerAppliedRouteDesiredStateReader({
      routeSetId: "prj_demo:env_demo:res_demo:srv_demo:dst_demo",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domains: [
        {
          host: "server-applied.example.test",
          pathPrefix: "/",
          tlsMode: "disabled",
        },
      ],
      status: "desired",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const routeBindingReader = new StaticDomainRouteBindingReader([
      {
        id: "dmb_pending",
        domainName: "pending.example.test",
        pathPrefix: "/",
        proxyKind: "traefik",
        tlsMode: "disabled",
        status: "pending_verification",
        createdAt: "2026-01-01T00:02:00.000Z",
      },
    ]);
    const { context, createDeploymentInput, createDeploymentUseCase } =
      await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
        runtimePlanResolver,
        edgeProxyKind: "traefik",
        domainRouteBindingReader: routeBindingReader,
        serverAppliedRouteDesiredStateReader: desiredRoutes,
      });

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    expect(runtimePlanResolver.input?.requestedDeployment).toMatchObject({
      proxyKind: "traefik",
      domains: ["server-applied.example.test"],
      accessRouteMetadata: {
        "access.routeSource": "server-applied-config-domain",
        "access.hostname": "server-applied.example.test",
      },
    });
  });

  test("[EDGE-PROXY-ROUTE-005] resolves mixed server-applied config domain route groups", async () => {
    const runtimePlanResolver = new CapturingRuntimePlanResolver();
    const desiredRoutes = new StaticServerAppliedRouteDesiredStateReader({
      routeSetId: "prj_demo:env_demo:res_demo:srv_demo:dst_demo",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domains: [
        {
          host: "www.example.test",
          pathPrefix: "/",
          tlsMode: "auto",
        },
        {
          host: "admin.example.test",
          pathPrefix: "/admin",
          tlsMode: "auto",
        },
      ],
      status: "desired",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const { context, createDeploymentInput, createDeploymentUseCase } =
      await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
        runtimePlanResolver,
        edgeProxyKind: "traefik",
        serverAppliedRouteDesiredStateReader: desiredRoutes,
      });

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    expect(runtimePlanResolver.input?.requestedDeployment).toMatchObject({
      proxyKind: "traefik",
      domains: ["www.example.test"],
      pathPrefix: "/",
      tlsMode: "auto",
      accessRoutes: [
        {
          proxyKind: "traefik",
          domains: ["www.example.test"],
          pathPrefix: "/",
          tlsMode: "auto",
        },
        {
          proxyKind: "traefik",
          domains: ["admin.example.test"],
          pathPrefix: "/admin",
          tlsMode: "auto",
        },
      ],
      accessRouteMetadata: {
        "access.routeSource": "server-applied-config-domain",
        "access.serverAppliedRouteSetId": "prj_demo:env_demo:res_demo:srv_demo:dst_demo",
        "access.hostname": "www.example.test",
        "access.scheme": "https",
        "access.routeCount": "2",
        "access.routeGroupCount": "2",
      },
    });
  });

  test("[EDGE-PROXY-ROUTE-008] preserves server-applied canonical redirect route intent", async () => {
    type ServerAppliedCanonicalRedirectDomain =
      ServerAppliedRouteDesiredStateRecord["domains"][number] & {
        redirectTo?: string;
        redirectStatus?: 301 | 302 | 307 | 308;
      };

    const runtimePlanResolver = new CapturingRuntimePlanResolver();
    const domains: ServerAppliedCanonicalRedirectDomain[] = [
      {
        host: "example.test",
        pathPrefix: "/",
        tlsMode: "auto",
      },
      {
        host: "www.example.test",
        pathPrefix: "/",
        tlsMode: "auto",
        redirectTo: "example.test",
        redirectStatus: 308,
      },
    ];
    const desiredRoutes = new StaticServerAppliedRouteDesiredStateReader({
      routeSetId: "prj_demo:env_demo:res_demo:srv_demo:dst_demo",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domains,
      status: "desired",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const { context, createDeploymentInput, createDeploymentUseCase } =
      await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
        runtimePlanResolver,
        edgeProxyKind: "traefik",
        serverAppliedRouteDesiredStateReader: desiredRoutes,
      });

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    expect(runtimePlanResolver.input?.requestedDeployment).toMatchObject({
      proxyKind: "traefik",
      domains: ["example.test"],
      pathPrefix: "/",
      tlsMode: "auto",
      accessRoutes: [
        {
          proxyKind: "traefik",
          domains: ["example.test"],
          pathPrefix: "/",
          tlsMode: "auto",
        },
        {
          proxyKind: "traefik",
          domains: ["www.example.test"],
          pathPrefix: "/",
          tlsMode: "auto",
          routeBehavior: "redirect",
          redirectTo: "example.test",
          redirectStatus: 308,
        },
      ],
      accessRouteMetadata: {
        "access.routeSource": "server-applied-config-domain",
        "access.hostname": "example.test",
        "access.routeCount": "2",
        "access.routeGroupCount": "2",
        "access.redirectRouteCount": "1",
      },
    });
  });

  test("[ROUTE-TLS-ENTRY-016] preserves durable domain canonical redirect route intent", async () => {
    const runtimePlanResolver = new CapturingRuntimePlanResolver();
    const routeBindingReader = new StaticDomainRouteBindingReader([
      {
        id: "dmb_canonical",
        domainName: "example.test",
        pathPrefix: "/",
        proxyKind: "traefik",
        tlsMode: "auto",
        status: "ready",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "dmb_www",
        domainName: "www.example.test",
        pathPrefix: "/",
        proxyKind: "traefik",
        tlsMode: "auto",
        redirectTo: "example.test",
        redirectStatus: 308,
        status: "ready",
        createdAt: "2026-01-01T00:01:00.000Z",
      },
    ]);
    const { context, createDeploymentInput, createDeploymentUseCase } =
      await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
        runtimePlanResolver,
        edgeProxyKind: "traefik",
        domainRouteBindingReader: routeBindingReader,
      });

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    expect(routeBindingReader.targets).toEqual([
      {
        projectId: "prj_demo",
        environmentId: "env_demo",
        resourceId: "res_demo",
        serverId: "srv_demo",
        destinationId: "dst_demo",
      },
    ]);
    expect(runtimePlanResolver.input?.requestedDeployment).toMatchObject({
      proxyKind: "traefik",
      domains: ["example.test"],
      pathPrefix: "/",
      tlsMode: "auto",
      accessRoutes: [
        {
          proxyKind: "traefik",
          domains: ["example.test"],
          pathPrefix: "/",
          tlsMode: "auto",
        },
        {
          proxyKind: "traefik",
          domains: ["www.example.test"],
          pathPrefix: "/",
          tlsMode: "auto",
          routeBehavior: "redirect",
          redirectTo: "example.test",
          redirectStatus: 308,
        },
      ],
      accessRouteMetadata: {
        "access.routeSource": "durable-domain-binding",
        "access.domainBindingId": "dmb_canonical",
        "access.hostname": "example.test",
        "access.routeGroupCount": "2",
        "access.redirectRouteCount": "1",
      },
    });
  });

  test("[DEP-CREATE-ADM-027] rejects static resource without publish directory before acceptance", async () => {
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      deployments,
      resources,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy());
    const staticResource = createStaticSiteResource();

    await resources.upsert(
      repositoryContext,
      staticResource,
      UpsertResourceSpec.fromResource(staticResource),
    );

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe("validation_error");
    expect(error.details).toMatchObject({
      phase: "runtime-plan-resolution",
      resourceId: "res_demo",
      runtimePlanStrategy: "static",
    });
    expect(deployments.items.size).toBe(0);
  });

  test("[DEP-CREATE-ADM-011] rejects unsupported runtime target backend before acceptance", async () => {
    const { context, createDeploymentInput, createDeploymentUseCase, deployments } =
      await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
        runtimeTargetBackendRegistry: new StaticRuntimeTargetBackendRegistry(false),
      });

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe("runtime_target_unsupported");
    expect(error.details).toMatchObject({
      commandName: "deployments.create",
      phase: "runtime-target-resolution",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      runtimePlanStrategy: "auto",
      targetKind: "single-server",
      targetProviderKey: "generic-ssh",
    });
    expect(deployments.items.size).toBe(0);
  });

  test("[SWARM-TARGET-ADM-002] rejects unsupported Swarm target backend before acceptance", async () => {
    const { context, createDeploymentInput, createDeploymentUseCase, deployments } =
      await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
        serverProviderKey: "docker-swarm",
        serverTargetKind: "orchestrator-cluster",
        runtimeTargetBackendRegistry: new StaticRuntimeTargetBackendRegistry(false),
      });

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe("runtime_target_unsupported");
    expect(error.details).toMatchObject({
      commandName: "deployments.create",
      phase: "runtime-target-resolution",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      runtimePlanStrategy: "auto",
      targetKind: "orchestrator-cluster",
      targetProviderKey: "docker-swarm",
      providerKey: "docker-swarm",
    });
    expect(deployments.items.size).toBe(0);
  });

  test("[DEP-CREATE-ASYNC-017] keeps accepted static deployment ok when package fails after acceptance", async () => {
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      deployments,
      resources,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
      executionBackend: new FailingStaticPackageExecutionBackend(),
    });
    const staticResource = createStaticSiteResource({ publishDirectory: "/dist" });

    await resources.upsert(
      repositoryContext,
      staticResource,
      UpsertResourceSpec.fromResource(staticResource),
    );

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    const deploymentId = result._unsafeUnwrap().id;
    const deployment = await deployments.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate(deploymentId)),
    );
    expect(deployment?.toState()).toMatchObject({
      status: { value: "failed" },
    });
    expect(deployment?.toState().timeline.at(-1)?.toState().phase.value).toBe("package");
    expect(deployment?.toState().runtimePlan.toState().execution.toState().metadata).toMatchObject({
      phase: "image-build",
      step: "static-package",
      runtimePlanStrategy: "static",
      publishDirectory: "/dist",
    });
  });

  test.skip("bootstraps a default local deployment context when ids are omitted", async () => {
    const projects = new MemoryProjectRepository();
    const servers = new MemoryServerRepository();
    const destinations = new MemoryDestinationRepository();
    const environments = new MemoryEnvironmentRepository();
    const resources = new MemoryResourceRepository();
    const deployments = new MemoryDeploymentRepository();
    const clock = new FixedClock("2026-01-01T00:00:00.000Z");
    const idGenerator = new SequenceIdGenerator();
    const eventBus = new CapturedEventBus();
    const logger = new NoopLogger();
    const defaultsFactory = new DeploymentContextDefaultsFactory(clock, idGenerator);
    const context = createTestContext();
    const repositoryContext = toRepositoryContext(context);

    const contextResolver = new DeploymentContextResolver(
      projects,
      servers,
      destinations,
      environments,
      resources,
    );
    const useCase = new CreateDeploymentUseCase(
      deployments,
      contextResolver,
      new DeploymentContextBootstrapService(
        new NullDeploymentConfigReader(),
        projects,
        servers,
        destinations,
        environments,
        resources,
        new StaticProviderRegistry(),
        new LocalEmbeddedDefaultsPolicy(),
        defaultsFactory,
        clock,
        idGenerator,
        eventBus,
        logger,
      ),
      new StaticSourceDetector(),
      new StaticRuntimePlanResolver(),
      new HermeticExecutionBackend(),
      eventBus,
      new NoopDeploymentProgressReporter(),
      logger,
      new DeploymentSnapshotFactory(clock, idGenerator),
      new RuntimePlanResolutionInputBuilder(clock, idGenerator),
      new DeploymentFactory(clock, idGenerator),
      new DeploymentLifecycleService(clock),
      new PassThroughMutationCoordinator(),
      new StaticRuntimeTargetBackendRegistry(),
      testSecretProtector,
    );

    const result = await useCase.execute(context, {
      sourceLocator: ".",
    } as never);

    expect(result.isOk()).toBe(true);
    expect(projects.items.size).toBe(1);
    expect(servers.items.size).toBe(1);
    expect(destinations.items.size).toBe(1);
    expect(environments.items.size).toBe(1);
    expect(resources.items.size).toBe(1);

    const deployment = await deployments.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate(result._unsafeUnwrap().id)),
    );
    expect(deployment?.toState().projectId.value).toBe("prj_0001");
    expect(deployment?.toState().environmentId.value).toBe("env_0002");
    expect(deployment?.toState().serverId?.value).toBe("srv_0003");
    expect(deployment?.toState().destinationId?.value).toBe("dst_0004");
    expect(deployment?.toState().resourceId.value).toBe("res_0005");
    expect([...servers.items.values()][0]?.toState().providerKey.value).toBe("local-shell");
    expect([...environments.items.values()][0]?.toState().name.value).toBe("local");
  });

  test.skip("uses command resource bootstrap spec when ids are omitted", async () => {
    const projects = new MemoryProjectRepository();
    const servers = new MemoryServerRepository();
    const destinations = new MemoryDestinationRepository();
    const environments = new MemoryEnvironmentRepository();
    const resources = new MemoryResourceRepository();
    const deployments = new MemoryDeploymentRepository();
    const clock = new FixedClock("2026-01-01T00:00:00.000Z");
    const idGenerator = new SequenceIdGenerator();
    const eventBus = new CapturedEventBus();
    const logger = new NoopLogger();
    const defaultsFactory = new DeploymentContextDefaultsFactory(clock, idGenerator);
    const context = createTestContext();

    const contextResolver = new DeploymentContextResolver(
      projects,
      servers,
      destinations,
      environments,
      resources,
    );
    const useCase = new CreateDeploymentUseCase(
      deployments,
      contextResolver,
      new DeploymentContextBootstrapService(
        new NullDeploymentConfigReader(),
        projects,
        servers,
        destinations,
        environments,
        resources,
        new StaticProviderRegistry(),
        new LocalEmbeddedDefaultsPolicy(),
        defaultsFactory,
        clock,
        idGenerator,
        eventBus,
        logger,
      ),
      new StaticSourceDetector(),
      new StaticRuntimePlanResolver(),
      new HermeticExecutionBackend(),
      eventBus,
      new NoopDeploymentProgressReporter(),
      logger,
      new DeploymentSnapshotFactory(clock, idGenerator),
      new RuntimePlanResolutionInputBuilder(clock, idGenerator),
      new DeploymentFactory(clock, idGenerator),
      new DeploymentLifecycleService(clock),
      new PassThroughMutationCoordinator(),
      new StaticRuntimeTargetBackendRegistry(),
      testSecretProtector,
    );

    const result = await useCase.execute(context, {
      sourceLocator: "https://github.com/acme/hello-api.git",
      resource: {
        name: "hello-api",
        kind: "application",
      },
    } as never);

    expect(result.isOk()).toBe(true);
    expect(resources.items.size).toBe(1);
    const resource = [...resources.items.values()][0];
    expect(resource?.toState().name.value).toBe("hello-api");
    expect(resource?.toState().slug.value).toBe("hello-api");
    expect(resource?.toState().destinationId?.value).toBe("dst_0004");
  });

  test.skip("bootstraps deployment context from deployment config", async () => {
    const projects = new MemoryProjectRepository();
    const servers = new MemoryServerRepository();
    const destinations = new MemoryDestinationRepository();
    const environments = new MemoryEnvironmentRepository();
    const resources = new MemoryResourceRepository();
    const deployments = new MemoryDeploymentRepository();
    const clock = new FixedClock("2026-01-01T00:00:00.000Z");
    const idGenerator = new SequenceIdGenerator();
    const eventBus = new CapturedEventBus();
    const logger = new NoopLogger();
    const defaultsFactory = new DeploymentContextDefaultsFactory(clock, idGenerator);
    const context = createTestContext();
    const repositoryContext = toRepositoryContext(context);

    const contextResolver = new DeploymentContextResolver(
      projects,
      servers,
      destinations,
      environments,
      resources,
    );
    const useCase = new CreateDeploymentUseCase(
      deployments,
      contextResolver,
      new DeploymentContextBootstrapService(
        new StaticDeploymentConfigReader({
          project: {
            name: "Configured App",
          },
          environment: {
            name: "production",
            kind: "production",
          },
          resource: {
            name: "web",
            kind: "application",
          },
          targets: [
            {
              key: "production-ssh",
              name: "Production SSH",
              providerKey: "generic-ssh",
              host: "203.0.113.10",
              port: 22,
            },
          ],
          deployment: {
            targetKey: "production-ssh",
            method: "workspace-commands",
            startCommand: "node dist/server.js",
            port: 3000,
          },
        }),
        projects,
        servers,
        destinations,
        environments,
        resources,
        new StaticProviderRegistry(),
        new ExplicitContextRequiredPolicy(),
        defaultsFactory,
        clock,
        idGenerator,
        eventBus,
        logger,
      ),
      new StaticSourceDetector(),
      new StaticRuntimePlanResolver(),
      new HermeticExecutionBackend(),
      eventBus,
      new NoopDeploymentProgressReporter(),
      logger,
      new DeploymentSnapshotFactory(clock, idGenerator),
      new RuntimePlanResolutionInputBuilder(clock, idGenerator),
      new DeploymentFactory(clock, idGenerator),
      new DeploymentLifecycleService(clock),
      new PassThroughMutationCoordinator(),
      new StaticRuntimeTargetBackendRegistry(),
      testSecretProtector,
    );

    const result = await useCase.execute(context, {
      sourceLocator: ".",
    } as never);

    expect(result.isOk()).toBe(true);
    expect([...projects.items.values()][0]?.toState().name.value).toBe("Configured App");
    expect([...environments.items.values()][0]?.toState().name.value).toBe("production");
    expect([...resources.items.values()][0]?.toState().name.value).toBe("web");
    expect([...servers.items.values()][0]?.toState().providerKey.value).toBe("generic-ssh");
    expect([...destinations.items.values()][0]?.toState().name.value).toBe("default");

    const deployment = await deployments.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate(result._unsafeUnwrap().id)),
    );
    expect(deployment?.toState().projectId.value).toBe("prj_0001");
    expect(deployment?.toState().environmentId.value).toBe("env_0002");
    expect(deployment?.toState().serverId?.value).toBe("srv_0003");
    expect(deployment?.toState().destinationId?.value).toBe("dst_0004");
    expect(deployment?.toState().resourceId.value).toBe("res_0005");
  });

  test("[RT-CAP-SCHED-001] materializes repository runtime prune config as deployment-snapshot policy", async () => {
    const projects = new MemoryProjectRepository();
    const servers = new MemoryServerRepository();
    const destinations = new MemoryDestinationRepository();
    const environments = new MemoryEnvironmentRepository();
    const resources = new MemoryResourceRepository();
    const policyRepository = new MemoryScheduledRuntimePrunePolicyRepository();
    const clock = new FixedClock("2026-01-01T00:00:00.000Z");
    const idGenerator = new SequenceIdGenerator();
    const eventBus = new CapturedEventBus();
    const logger = new NoopLogger();
    const defaultsFactory = new DeploymentContextDefaultsFactory(clock, idGenerator);
    const context = createTestContext();
    const repositoryContext = toRepositoryContext(context);
    const bootstrap = new DeploymentContextBootstrapService(
      new StaticDeploymentConfigReader({
        configFilePath: "appaloft.yml",
        project: {
          name: "Configured App",
        },
        environment: {
          name: "production",
          kind: "production",
        },
        resource: {
          name: "web",
          kind: "application",
        },
        targets: [
          {
            key: "ssh-prod",
            name: "SSH Production",
            providerKey: "generic-ssh",
            host: "203.0.113.10",
            port: 22,
            destination: {
              name: "default",
              kind: "generic",
            },
          },
        ],
        deployment: {
          targetKey: "ssh-prod",
          method: "workspace-commands",
          startCommand: "node dist/server.js",
          port: 3000,
        },
        retention: {
          runtimePrune: {
            retentionDays: 14,
            destructive: true,
            categories: ["stopped-containers", "preview-workspaces"],
            retryOnFailure: false,
            enabled: true,
          },
        },
      }),
      projects,
      servers,
      destinations,
      environments,
      resources,
      new StaticProviderRegistry(),
      new ExplicitContextRequiredPolicy(),
      defaultsFactory,
      clock,
      idGenerator,
      eventBus,
      logger,
      policyRepository,
    );

    const result = await bootstrap.bootstrap(context, {
      sourceLocator: ".",
    } as never);

    expect(result.isOk()).toBe(true);
    const policies = await policyRepository.listRecords(repositoryContext, {
      scopes: ["deployment-snapshot"],
      enabledOnly: false,
    });
    expect(policies.isOk()).toBe(true);
    expect(policies._unsafeUnwrap()).toEqual([
      {
        id: "rpp_deployment_snapshot_srv_0003",
        version: "appaloft.yml",
        scope: "deployment-snapshot",
        serverId: "srv_0003",
        retentionDays: 14,
        destructive: true,
        categories: ["stopped-containers", "preview-workspaces"],
        retryOnFailure: false,
        enabled: true,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });
});
