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
  logs: DeploymentLogEntry[];
  createdAt: CreatedAt;
  startedAt?: StartedAt;
  finishedAt?: FinishedAt;
  rollbackOfDeploymentId?: DeploymentId;
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
    createdAt: CreatedAt;
    rollbackOfDeploymentId?: DeploymentId;
  }): Result<Deployment> {
    if (input.runtimePlan.toState().steps.length === 0) {
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
        logs: [],
        createdAt: input.createdAt,
        ...(input.rollbackOfDeploymentId
          ? { rollbackOfDeploymentId: input.rollbackOfDeploymentId }
          : {}),
      }),
    );
  }

  static rehydrate(state: DeploymentState): Deployment {
    return new Deployment({
      ...state,
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

  cancel(at: FinishedAt, logs: DeploymentLogEntry[] = []): Result<void> {
    return this.state.status.cancel().map((nextStatus) => {
      this.state.status = nextStatus;
      this.appendLogs(logs);
      this.state.finishedAt = at;
      this.recordDomainEvent("deployment.canceled", at, {});
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
        ...(this.state.runtimePlan.toState().execution.toState().metadata ?? {}),
        ...(resultState.metadata ?? {}),
        ...(resultState.errorCode ? { errorCode: resultState.errorCode.value } : {}),
      };

      if (Object.keys(executionMetadata).length > 0) {
        this.state.runtimePlan = this.state.runtimePlan.withExecution(
          this.state.runtimePlan.toState().execution.withMetadata(executionMetadata),
        );
      }

      this.recordDomainEvent("deployment.finished", at, {
        status: this.state.status.value,
        exitCode: resultState.exitCode.value,
        retryable: resultState.retryable,
        ...(resultState.errorCode ? { errorCode: resultState.errorCode.value } : {}),
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
      snapshotId: this.state.environmentSnapshot.toState().id,
      target: this.state.runtimePlan.toState().target,
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

  toState(): DeploymentState {
    return {
      ...this.state,
      logs: [...this.state.logs],
    };
  }
}
