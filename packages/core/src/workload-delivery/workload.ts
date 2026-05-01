import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import { type EnvironmentId, type ProjectId, type WorkloadId } from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import { type WorkloadKindValue } from "../shared/state-machine";
import { type CreatedAt } from "../shared/temporal";
import { type WorkloadName } from "../shared/text-values";
import { type BuildSpec, type RuntimeSpec, type SourceSpec } from "./specs";

export interface WorkloadState {
  id: WorkloadId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  name: WorkloadName;
  kind: WorkloadKindValue;
  source: SourceSpec;
  build: BuildSpec;
  runtime: RuntimeSpec;
  createdAt: CreatedAt;
}

export interface WorkloadVisitor<TContext, TResult> {
  visitWorkload(workload: Workload, context: TContext): TResult;
}

export class Workload extends AggregateRoot<WorkloadState> {
  private constructor(state: WorkloadState) {
    super(state);
  }

  static declare(input: WorkloadState): Result<Workload> {
    if (input.kind.isStaticSite() && !input.runtime.canRunStaticSiteWorkload()) {
      return err(domainError.validation("Static site workloads must use the static-site runtime"));
    }

    if (input.kind.isWorker() && !input.runtime.canRunWorkerWorkload()) {
      return err(domainError.validation("Worker workloads cannot use the web-server runtime"));
    }

    const workload = new Workload({
      ...input,
    });
    workload.recordDomainEvent("workload.declared", input.createdAt, {
      kind: input.kind.value,
      sourceKind: input.source.toState().kind.value,
      buildKind: input.build.toState().kind.value,
    });
    return ok(workload);
  }

  static rehydrate(state: WorkloadState): Workload {
    return new Workload(state);
  }

  accept<TContext, TResult>(
    visitor: WorkloadVisitor<TContext, TResult>,
    context: TContext,
  ): TResult {
    return visitor.visitWorkload(this, context);
  }

  toState(): WorkloadState {
    return { ...this.state };
  }
}
