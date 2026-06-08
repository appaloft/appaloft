import { type EnvironmentSnapshot } from "../configuration/environment-config-set";
import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import {
  type DeploymentId,
  type DeploymentTargetId,
  type DestinationId,
  type EnvironmentId,
  type ProjectId,
  type ResourceId,
  type RollbackPlanId,
} from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import { DeploymentStatusValue } from "../shared/state-machine";
import {
  type ArchivedAt,
  type CreatedAt,
  type FinishedAt,
  type GeneratedAt,
  type StartedAt,
} from "../shared/temporal";
import { PlanStepText } from "../shared/text-values";
import { ScalarValueObject, ValueObject } from "../shared/value-object";
import { Version, VersionReference } from "../shared/version";
import {
  type StaticArtifactId,
  type StaticArtifactPublicationId,
  type StaticArtifactRouteUrl,
} from "../workload-delivery/static-artifact";
import { type DeploymentDependencyBindingReferenceState } from "./dependency-binding-snapshot-reference";
import {
  type AccessRouteExpectation,
  type DeploymentLogEntry,
  type ExecutionResult,
  RollbackPlan,
  type RuntimePlan,
} from "./runtime-plan";

export type DeploymentTriggerKind = "create" | "retry" | "redeploy" | "rollback";
export type DeploymentTargetVariantKind = "server-backed" | "serverless-static-artifact";

export interface ServerBackedDeploymentTargetState {
  kind: "server-backed";
  serverId: DeploymentTargetId;
  destinationId: DestinationId;
}

export interface ServerlessStaticArtifactDeploymentTargetState {
  kind: "serverless-static-artifact";
  publicationId: StaticArtifactPublicationId;
  artifactId: StaticArtifactId;
  routeUrl: StaticArtifactRouteUrl;
}

export type DeploymentTargetVariantState =
  | ServerBackedDeploymentTargetState
  | ServerlessStaticArtifactDeploymentTargetState;

type LegacyServerBackedDeploymentTargetInput = {
  serverId?: DeploymentTargetId;
  destinationId?: DestinationId;
};

export class DeploymentTargetVariant extends ValueObject<DeploymentTargetVariantState> {
  private constructor(state: DeploymentTargetVariantState) {
    super(state);
  }

  static serverBacked(input: {
    serverId: DeploymentTargetId;
    destinationId: DestinationId;
  }): DeploymentTargetVariant {
    return new DeploymentTargetVariant({
      kind: "server-backed",
      serverId: input.serverId,
      destinationId: input.destinationId,
    });
  }

  static serverlessStaticArtifact(input: {
    publicationId: StaticArtifactPublicationId;
    artifactId: StaticArtifactId;
    routeUrl: StaticArtifactRouteUrl;
  }): DeploymentTargetVariant {
    return new DeploymentTargetVariant({
      kind: "serverless-static-artifact",
      publicationId: input.publicationId,
      artifactId: input.artifactId,
      routeUrl: input.routeUrl,
    });
  }

  static rehydrate(state: DeploymentTargetVariantState): DeploymentTargetVariant {
    return new DeploymentTargetVariant(state);
  }

  get kind(): DeploymentTargetVariantKind {
    return this.state.kind;
  }

  isServerBacked(): this is DeploymentTargetVariant & {
    toState(): ServerBackedDeploymentTargetState;
  } {
    return this.state.kind === "server-backed";
  }

  isServerlessStaticArtifact(): this is DeploymentTargetVariant & {
    toState(): ServerlessStaticArtifactDeploymentTargetState;
  } {
    return this.state.kind === "serverless-static-artifact";
  }

  toState(): DeploymentTargetVariantState {
    return { ...this.state };
  }
}

function cloneDeploymentTargetVariant(target: DeploymentTargetVariant): DeploymentTargetVariant {
  return DeploymentTargetVariant.rehydrate(target.toState());
}

function serverBackedDeploymentTargetFromLegacyInput(
  input: LegacyServerBackedDeploymentTargetInput,
): DeploymentTargetVariant | undefined {
  if (!input.serverId || !input.destinationId) {
    return undefined;
  }

  return DeploymentTargetVariant.serverBacked({
    serverId: input.serverId,
    destinationId: input.destinationId,
  });
}

function deploymentTargetFromState(
  state: Partial<Pick<BaseDeploymentState, "target">> & LegacyServerBackedDeploymentTargetInput,
): DeploymentTargetVariant | undefined {
  if (state.target) {
    return cloneDeploymentTargetVariant(state.target);
  }

  return serverBackedDeploymentTargetFromLegacyInput(state);
}

function deploymentTargetStateFields(
  target: DeploymentTargetVariant,
):
  | { target: DeploymentTargetVariant; serverId: DeploymentTargetId; destinationId: DestinationId }
  | { target: DeploymentTargetVariant } {
  const clonedTarget = cloneDeploymentTargetVariant(target);
  const targetState = clonedTarget.toState();
  if (targetState.kind === "server-backed") {
    return {
      target: clonedTarget,
      serverId: targetState.serverId,
      destinationId: targetState.destinationId,
    };
  }

  return { target: clonedTarget };
}

function dockerImageSourceVersionFromExecutionMetadata(
  runtimePlan: RuntimePlan,
  metadata: Record<string, string> | undefined,
): Result<Version | undefined> {
  const source = runtimePlan.source;
  if (source.kind !== "docker-image") {
    return ok(undefined);
  }

  const digest = metadata?.imageDigest ?? metadata?.["source.imageDigest"];
  if (!digest) {
    return ok(undefined);
  }

  const fixedIdentifier = VersionReference.createDetected({
    sourceKind: "docker-image",
    referenceKind: "image-digest",
    value: digest,
  });
  if (fixedIdentifier.isErr()) {
    return err(fixedIdentifier.error);
  }

  const tagValue =
    source.version?.reference.referenceKind === "image-tag"
      ? source.version.reference.value
      : source.metadata?.versionReferenceKind === "image-tag"
        ? source.metadata.versionReference
        : source.metadata?.imageTag;
  if (!tagValue) {
    return Version.fixed({
      reference: fixedIdentifier.value,
      fixedIdentifier: fixedIdentifier.value,
    }).map((version) => version);
  }

  const tag = VersionReference.create({
    sourceKind: "docker-image",
    referenceKind: "image-tag",
    value: tagValue,
  });
  if (tag.isErr()) {
    return err(tag.error);
  }

  return Version.fixed({
    reference: tag.value,
    fixedIdentifier: fixedIdentifier.value,
    aliases: [tag.value],
  }).map((version) => version);
}

const deploymentTriggerKindBrand: unique symbol = Symbol("DeploymentTriggerKindValue");
export class DeploymentTriggerKindValue extends ScalarValueObject<DeploymentTriggerKind> {
  private [deploymentTriggerKindBrand]!: void;

  private constructor(value: DeploymentTriggerKind) {
    super(value);
  }

  static create(value: string): Result<DeploymentTriggerKindValue> {
    switch (value) {
      case "create":
      case "retry":
      case "redeploy":
      case "rollback":
        return ok(new DeploymentTriggerKindValue(value));
      default:
        return err(
          domainError.validation(
            "Deployment trigger kind must be one of create, retry, redeploy, rollback",
            {
              value,
            },
          ),
        );
    }
  }

  static rehydrate(value: DeploymentTriggerKind): DeploymentTriggerKindValue {
    return new DeploymentTriggerKindValue(value);
  }

  static createDefault(): DeploymentTriggerKindValue {
    return new DeploymentTriggerKindValue("create");
  }

  static retry(): DeploymentTriggerKindValue {
    return new DeploymentTriggerKindValue("retry");
  }

  static redeploy(): DeploymentTriggerKindValue {
    return new DeploymentTriggerKindValue("redeploy");
  }

  static rollback(): DeploymentTriggerKindValue {
    return new DeploymentTriggerKindValue("rollback");
  }
}

export interface BaseDeploymentState {
  id: DeploymentId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  resourceId: ResourceId;
  target: DeploymentTargetVariant;
  status: DeploymentStatusValue;
  runtimePlan: RuntimePlan;
  environmentSnapshot: EnvironmentSnapshot;
  dependencyBindingReferences: DeploymentDependencyBindingReferenceState[];
  logs: DeploymentLogEntry[];
  createdAt: CreatedAt;
  startedAt?: StartedAt;
  finishedAt?: FinishedAt;
  triggerKind: DeploymentTriggerKindValue;
  sourceDeploymentId?: DeploymentId;
  rollbackCandidateDeploymentId?: DeploymentId;
  rollbackOfDeploymentId?: DeploymentId;
  supersedesDeploymentId?: DeploymentId;
  supersededByDeploymentId?: DeploymentId;
  archivedAt?: ArchivedAt;
}

type LegacyServerBackedDeploymentState = Omit<BaseDeploymentState, "target"> & {
  serverId: DeploymentTargetId;
  destinationId: DestinationId;
};

export type ServerBackedDeploymentState = BaseDeploymentState & {
  target: DeploymentTargetVariant;
  serverId: DeploymentTargetId;
  destinationId: DestinationId;
};

export type ServerlessStaticArtifactDeploymentState = BaseDeploymentState & {
  target: DeploymentTargetVariant;
  serverId?: never;
  destinationId?: never;
};

export type DeploymentState = ServerBackedDeploymentState | ServerlessStaticArtifactDeploymentState;

export interface DeploymentExecutionContinuation {
  allowed: boolean;
  supersededByDeploymentId?: DeploymentId;
}

export interface DeploymentVisitor<TContext, TResult> {
  visitDeployment(deployment: Deployment, context: TContext): TResult;
}

export class Deployment extends AggregateRoot<DeploymentState> {
  private constructor(state: DeploymentState) {
    super(state);
  }

  static create(input: {
    id: DeploymentId;
    projectId: ProjectId;
    environmentId: EnvironmentId;
    resourceId: ResourceId;
    target?: DeploymentTargetVariant;
    serverId?: DeploymentTargetId;
    destinationId?: DestinationId;
    runtimePlan: RuntimePlan;
    environmentSnapshot: EnvironmentSnapshot;
    dependencyBindingReferences?: DeploymentDependencyBindingReferenceState[];
    createdAt: CreatedAt;
    triggerKind?: DeploymentTriggerKindValue;
    sourceDeploymentId?: DeploymentId;
    rollbackCandidateDeploymentId?: DeploymentId;
    rollbackOfDeploymentId?: DeploymentId;
    supersedesDeploymentId?: DeploymentId;
    supersededByDeploymentId?: DeploymentId;
    archivedAt?: ArchivedAt;
  }): Result<Deployment> {
    if (!input.runtimePlan.hasSteps()) {
      return err(domainError.validation("Runtime plan must contain at least one step"));
    }

    const target = input.target ?? serverBackedDeploymentTargetFromLegacyInput(input);
    if (!target) {
      return err(
        domainError.validation("Deployment target must be an explicit variant", {
          deploymentId: input.id.value,
          resourceId: input.resourceId.value,
        }),
      );
    }

    return ok(
      new Deployment({
        id: input.id,
        projectId: input.projectId,
        environmentId: input.environmentId,
        resourceId: input.resourceId,
        ...deploymentTargetStateFields(target),
        status: DeploymentStatusValue.created(),
        runtimePlan: input.runtimePlan,
        environmentSnapshot: input.environmentSnapshot,
        dependencyBindingReferences: [...(input.dependencyBindingReferences ?? [])],
        logs: [],
        createdAt: input.createdAt,
        triggerKind: input.triggerKind ?? DeploymentTriggerKindValue.createDefault(),
        ...(input.sourceDeploymentId ? { sourceDeploymentId: input.sourceDeploymentId } : {}),
        ...(input.rollbackCandidateDeploymentId
          ? { rollbackCandidateDeploymentId: input.rollbackCandidateDeploymentId }
          : {}),
        ...(input.rollbackOfDeploymentId
          ? { rollbackOfDeploymentId: input.rollbackOfDeploymentId }
          : {}),
        ...(input.supersedesDeploymentId
          ? { supersedesDeploymentId: input.supersedesDeploymentId }
          : {}),
        ...(input.supersededByDeploymentId
          ? { supersededByDeploymentId: input.supersededByDeploymentId }
          : {}),
        ...(input.archivedAt ? { archivedAt: input.archivedAt } : {}),
      }),
    );
  }

  static rehydrate(state: DeploymentState | LegacyServerBackedDeploymentState): Deployment {
    const target = deploymentTargetFromState(state);
    if (!target) {
      throw new Error("Deployment rehydrate requires an explicit target variant");
    }

    return new Deployment({
      ...state,
      ...deploymentTargetStateFields(target),
      triggerKind: state.triggerKind ?? DeploymentTriggerKindValue.createDefault(),
      dependencyBindingReferences: [...(state.dependencyBindingReferences ?? [])],
      logs: [...state.logs],
    });
  }

  accept<TContext, TResult>(
    visitor: DeploymentVisitor<TContext, TResult>,
    context: TContext,
  ): TResult {
    return visitor.visitDeployment(this, context);
  }

  markPlanning(at: StartedAt): Result<void> {
    return this.state.status.markPlanning().map((nextStatus) => {
      this.state.status = nextStatus;
      this.recordDomainEvent("deployment.planning_started", at, this.recoveryEventPayload());
      return undefined;
    });
  }

  markPlanned(at: StartedAt): Result<void> {
    return this.state.status.markPlanned().map((nextStatus) => {
      this.state.status = nextStatus;
      this.recordDomainEvent("deployment.planned", at, this.recoveryEventPayload());
      return undefined;
    });
  }

  start(at: StartedAt): Result<void> {
    return this.state.status.start().map((nextStatus) => {
      this.state.status = nextStatus;
      this.state.startedAt = at;
      this.recordDomainEvent("deployment.started", at, this.recoveryEventPayload());
      return undefined;
    });
  }

  requestCancellation(
    at: StartedAt,
    input?: { supersededByDeploymentId?: DeploymentId },
  ): Result<void> {
    return this.state.status.requestCancel().map((nextStatus) => {
      this.state.status = nextStatus;
      if (input?.supersededByDeploymentId) {
        this.state.supersededByDeploymentId = input.supersededByDeploymentId;
      }
      this.recordDomainEvent("deployment.cancel_requested", at, {
        ...(input?.supersededByDeploymentId
          ? { supersededByDeploymentId: input.supersededByDeploymentId.value }
          : {}),
      });
      return undefined;
    });
  }

  cancel(
    at: FinishedAt,
    logs: DeploymentLogEntry[] = [],
    input?: { supersededByDeploymentId?: DeploymentId },
  ): Result<void> {
    return this.state.status.cancel().map((nextStatus) => {
      this.state.status = nextStatus;
      this.appendLogs(logs);
      this.state.finishedAt = at;
      if (input?.supersededByDeploymentId) {
        this.state.supersededByDeploymentId = input.supersededByDeploymentId;
      }
      this.recordDomainEvent("deployment.canceled", at, {
        ...(input?.supersededByDeploymentId
          ? { supersededByDeploymentId: input.supersededByDeploymentId.value }
          : {}),
      });
      this.recordDomainEvent("deployment.finished", at, {
        ...this.recoveryEventPayload(),
        status: this.state.status.value,
        ...(input?.supersededByDeploymentId
          ? { supersededByDeploymentId: input.supersededByDeploymentId.value }
          : {}),
      });
      return undefined;
    });
  }

  appendLogs(logs: DeploymentLogEntry[]): void {
    this.state.logs.push(...logs);
  }

  applyExecutionResult(at: FinishedAt, result: ExecutionResult): Result<void> {
    const resultState = result.toState();
    this.appendLogs(resultState.logs);
    this.state.finishedAt = at;
    return this.state.status.applyExecutionResult(resultState.status).andThen((nextStatus) => {
      this.state.status = nextStatus;

      const executionMetadata = {
        ...(resultState.metadata ?? {}),
        ...(resultState.errorCode ? { errorCode: resultState.errorCode.value } : {}),
      };

      if (Object.keys(executionMetadata).length > 0) {
        this.state.runtimePlan = this.state.runtimePlan.withExecutionMetadata(executionMetadata);
      }

      const sourceVersion = dockerImageSourceVersionFromExecutionMetadata(
        this.state.runtimePlan,
        resultState.metadata,
      );
      if (sourceVersion.isErr()) {
        return err(sourceVersion.error);
      }
      if (sourceVersion.value) {
        this.state.runtimePlan = this.state.runtimePlan.withSource(
          this.state.runtimePlan.source.withVersion(sourceVersion.value),
        );
      }

      const failurePhase = resultState.metadata?.phase;
      const errorMessage = resultState.metadata?.message;

      this.recordDomainEvent("deployment.finished", at, {
        ...this.recoveryEventPayload(),
        status: this.state.status.value,
        exitCode: resultState.exitCode.value,
        retryable: resultState.retryable,
        ...(resultState.errorCode ? { errorCode: resultState.errorCode.value } : {}),
        ...(failurePhase ? { failurePhase } : {}),
        ...(errorMessage ? { errorMessage } : {}),
      });
      return ok(undefined);
    });
  }

  createRollbackPlan(input: {
    id: RollbackPlanId;
    generatedAt: GeneratedAt;
  }): Result<RollbackPlan> {
    return RollbackPlan.create({
      id: input.id,
      deploymentId: this.state.id,
      snapshotId: this.state.environmentSnapshot.snapshotId,
      target: this.state.runtimePlan.target,
      steps: [
        PlanStepText.rehydrate("Resolve release snapshot"),
        PlanStepText.rehydrate("Prepare rollback package"),
        PlanStepText.rehydrate("Apply snapshot to target"),
        PlanStepText.rehydrate("Verify rollback release"),
      ],
      generatedAt: input.generatedAt,
    });
  }

  canStartNewDeployment(): boolean {
    return this.state.status.canStartNewDeployment();
  }

  canRetryRecovery(): boolean {
    return this.state.status.canRetryRecovery();
  }

  canArchive(): boolean {
    return this.state.status.isTerminal();
  }

  isArchived(): boolean {
    return Boolean(this.state.archivedAt);
  }

  archive(at: ArchivedAt): Result<void> {
    if (this.isArchived()) {
      return ok(undefined);
    }

    if (!this.canArchive()) {
      return err(
        domainError.deploymentArchiveNotAllowed("Deployment must be terminal before archive", {
          deploymentId: this.state.id.value,
          status: this.state.status.value,
        }),
      );
    }

    this.state.archivedAt = at;
    this.recordDomainEvent("deployment.archived", at, {
      ...this.recoveryEventPayload(),
      archivedAt: at.value,
      status: this.state.status.value,
    });
    return ok(undefined);
  }

  resolveExecutionContinuation(): DeploymentExecutionContinuation {
    const allowed =
      this.state.status.allowsExecutionContinuation() && !this.state.supersededByDeploymentId;

    return {
      allowed,
      ...(this.state.supersededByDeploymentId
        ? { supersededByDeploymentId: this.state.supersededByDeploymentId }
        : {}),
      ...(this.state.archivedAt ? { archivedAt: this.state.archivedAt } : {}),
    };
  }

  requiresRuntimeCancellationForSupersede(): boolean {
    return this.state.status.requiresRuntimeCancellationForSupersede();
  }

  canCancel(): boolean {
    return this.state.status.canCancel();
  }

  requiresRuntimeCancellationForManualCancel(): boolean {
    return this.state.status.requiresRuntimeCancellationForManualCancel();
  }

  hasRealizedAccessRoute(expectation: AccessRouteExpectation): boolean {
    return this.state.runtimePlan.hasAccessRoute(expectation);
  }

  toState(): DeploymentState {
    return {
      ...this.state,
      ...deploymentTargetStateFields(this.state.target),
      dependencyBindingReferences: [...this.state.dependencyBindingReferences],
      logs: [...this.state.logs],
    };
  }

  private recoveryEventPayload(): {
    triggerKind: DeploymentTriggerKind;
    sourceDeploymentId?: string;
    rollbackCandidateDeploymentId?: string;
  } {
    return {
      triggerKind: this.state.triggerKind.value,
      ...(this.state.sourceDeploymentId
        ? { sourceDeploymentId: this.state.sourceDeploymentId.value }
        : {}),
      ...(this.state.rollbackCandidateDeploymentId
        ? { rollbackCandidateDeploymentId: this.state.rollbackCandidateDeploymentId.value }
        : {}),
    };
  }
}
