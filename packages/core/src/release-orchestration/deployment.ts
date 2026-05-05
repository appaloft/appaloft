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
  type CreatedAt,
  type FinishedAt,
  type GeneratedAt,
  type StartedAt,
} from "../shared/temporal";
import { PlanStepText } from "../shared/text-values";
import { type DeploymentDependencyBindingReferenceState } from "./dependency-binding-snapshot-reference";
import {
  type DeploymentLogEntry,
  type ExecutionResult,
  RollbackPlan,
  type RuntimePlan,
} from "./runtime-plan";

export interface DeploymentState {
  id: DeploymentId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  resourceId: ResourceId;
  serverId: DeploymentTargetId;
  destinationId: DestinationId;
  status: DeploymentStatusValue;
  runtimePlan: RuntimePlan;
  environmentSnapshot: EnvironmentSnapshot;
  dependencyBindingReferences: DeploymentDependencyBindingReferenceState[];
  logs: DeploymentLogEntry[];
  createdAt: CreatedAt;
  startedAt?: StartedAt;
  finishedAt?: FinishedAt;
  rollbackOfDeploymentId?: DeploymentId;
  supersedesDeploymentId?: DeploymentId;
  supersededByDeploymentId?: DeploymentId;
}

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
    serverId: DeploymentTargetId;
    destinationId: DestinationId;
    runtimePlan: RuntimePlan;
    environmentSnapshot: EnvironmentSnapshot;
    dependencyBindingReferences?: DeploymentDependencyBindingReferenceState[];
    createdAt: CreatedAt;
    rollbackOfDeploymentId?: DeploymentId;
    supersedesDeploymentId?: DeploymentId;
    supersededByDeploymentId?: DeploymentId;
  }): Result<Deployment> {
    if (!input.runtimePlan.hasSteps()) {
      return err(domainError.validation("Runtime plan must contain at least one step"));
    }

    return ok(
      new Deployment({
        id: input.id,
        projectId: input.projectId,
        environmentId: input.environmentId,
        resourceId: input.resourceId,
        serverId: input.serverId,
        destinationId: input.destinationId,
        status: DeploymentStatusValue.created(),
        runtimePlan: input.runtimePlan,
        environmentSnapshot: input.environmentSnapshot,
        dependencyBindingReferences: [...(input.dependencyBindingReferences ?? [])],
        logs: [],
        createdAt: input.createdAt,
        ...(input.rollbackOfDeploymentId
          ? { rollbackOfDeploymentId: input.rollbackOfDeploymentId }
          : {}),
        ...(input.supersedesDeploymentId
          ? { supersedesDeploymentId: input.supersedesDeploymentId }
          : {}),
        ...(input.supersededByDeploymentId
          ? { supersededByDeploymentId: input.supersededByDeploymentId }
          : {}),
      }),
    );
  }

  static rehydrate(state: DeploymentState): Deployment {
    return new Deployment({
      ...state,
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
      this.recordDomainEvent("deployment.planning_started", at, {});
      return undefined;
    });
  }

  markPlanned(at: StartedAt): Result<void> {
    return this.state.status.markPlanned().map((nextStatus) => {
      this.state.status = nextStatus;
      this.recordDomainEvent("deployment.planned", at, {});
      return undefined;
    });
  }

  start(at: StartedAt): Result<void> {
    return this.state.status.start().map((nextStatus) => {
      this.state.status = nextStatus;
      this.state.startedAt = at;
      this.recordDomainEvent("deployment.started", at, {});
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
    return this.state.status.applyExecutionResult(resultState.status).map((nextStatus) => {
      this.state.status = nextStatus;

      const executionMetadata = {
        ...(resultState.metadata ?? {}),
        ...(resultState.errorCode ? { errorCode: resultState.errorCode.value } : {}),
      };

      if (Object.keys(executionMetadata).length > 0) {
        this.state.runtimePlan = this.state.runtimePlan.withExecutionMetadata(executionMetadata);
      }

      const failurePhase = resultState.metadata?.phase;
      const errorMessage = resultState.metadata?.message;

      this.recordDomainEvent("deployment.finished", at, {
        status: this.state.status.value,
        exitCode: resultState.exitCode.value,
        retryable: resultState.retryable,
        ...(resultState.errorCode ? { errorCode: resultState.errorCode.value } : {}),
        ...(failurePhase ? { failurePhase } : {}),
        ...(errorMessage ? { errorMessage } : {}),
      });
      return undefined;
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

  resolveExecutionContinuation(): DeploymentExecutionContinuation {
    const allowed =
      this.state.status.allowsExecutionContinuation() && !this.state.supersededByDeploymentId;

    return {
      allowed,
      ...(this.state.supersededByDeploymentId
        ? { supersededByDeploymentId: this.state.supersededByDeploymentId }
        : {}),
    };
  }

  requiresRuntimeCancellationForSupersede(): boolean {
    return this.state.status.requiresRuntimeCancellationForSupersede();
  }

  toState(): DeploymentState {
    return {
      ...this.state,
      dependencyBindingReferences: [...this.state.dependencyBindingReferences],
      logs: [...this.state.logs],
    };
  }
}
