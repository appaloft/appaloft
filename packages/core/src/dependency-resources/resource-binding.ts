import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import {
  type EnvironmentId,
  type ResourceBindingId,
  type ResourceInstanceId,
  type WorkloadId,
} from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import {
  type ResourceBindingScopeValue,
  type ResourceInjectionModeValue,
} from "../shared/state-machine";
import { type CreatedAt } from "../shared/temporal";
import { type AliasText } from "../shared/text-values";

export interface ResourceBindingState {
  id: ResourceBindingId;
  workloadId: WorkloadId;
  resourceInstanceId: ResourceInstanceId;
  environmentId: EnvironmentId;
  alias: AliasText;
  scope: ResourceBindingScopeValue;
  injectionMode: ResourceInjectionModeValue;
  createdAt: CreatedAt;
}

export interface ResourceBindingVisitor<TContext, TResult> {
  visitResourceBinding(resourceBinding: ResourceBinding, context: TContext): TResult;
}

export class ResourceBinding extends AggregateRoot<ResourceBindingState> {
  private constructor(state: ResourceBindingState) {
    super(state);
  }

  static create(input: ResourceBindingState): Result<ResourceBinding> {
    const binding = new ResourceBinding(input);
    if (!binding.canUseInjectionMode()) {
      return err(
        domainError.validation("Build-only resource bindings cannot use runtime references"),
      );
    }

    binding.recordDomainEvent("resource.binding_created", input.createdAt, {
      scope: input.scope.value,
      injectionMode: input.injectionMode.value,
    });
    return ok(binding);
  }

  static rehydrate(state: ResourceBindingState): ResourceBinding {
    return new ResourceBinding(state);
  }

  accept<TContext, TResult>(
    visitor: ResourceBindingVisitor<TContext, TResult>,
    context: TContext,
  ): TResult {
    return visitor.visitResourceBinding(this, context);
  }

  canUseInjectionMode(): boolean {
    return !this.state.scope.isBuildOnly() || !this.state.injectionMode.isRuntimeReference();
  }

  toState(): ResourceBindingState {
    return { ...this.state };
  }
}
