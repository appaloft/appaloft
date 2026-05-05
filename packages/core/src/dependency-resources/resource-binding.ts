import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import {
  type EnvironmentId,
  type ProjectId,
  type ResourceBindingId,
  type ResourceId,
  type ResourceInstanceId,
} from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import {
  type ResourceBindingScopeValue,
  type ResourceInjectionModeValue,
} from "../shared/state-machine";
import { type CreatedAt, type UpdatedAt } from "../shared/temporal";
import { ScalarValueObject } from "../shared/value-object";

export type ResourceBindingStatus = "active" | "removed";

function resourceDependencyBindingValidationError(
  message: string,
  details?: Record<string, string | number | boolean>,
) {
  return domainError.validation(message, {
    phase: "resource-dependency-binding",
    ...(details ?? {}),
  });
}

const resourceBindingTargetNameBrand: unique symbol = Symbol("ResourceBindingTargetName");
export class ResourceBindingTargetName extends ScalarValueObject<string> {
  private [resourceBindingTargetNameBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ResourceBindingTargetName> {
    const normalized = value.trim().toUpperCase();
    if (!normalized) {
      return err(resourceDependencyBindingValidationError("Binding target name is required"));
    }
    if (!/^[A-Z_][A-Z0-9_]*$/.test(normalized)) {
      return err(
        resourceDependencyBindingValidationError(
          "Binding target name must be an environment variable style name",
          { field: "targetName" },
        ),
      );
    }
    return ok(new ResourceBindingTargetName(normalized));
  }

  static rehydrate(value: string): ResourceBindingTargetName {
    return new ResourceBindingTargetName(value.trim().toUpperCase());
  }
}

const resourceBindingStatusBrand: unique symbol = Symbol("ResourceBindingStatusValue");
export class ResourceBindingStatusValue extends ScalarValueObject<ResourceBindingStatus> {
  private [resourceBindingStatusBrand]!: void;

  private constructor(value: ResourceBindingStatus) {
    super(value);
  }

  static active(): ResourceBindingStatusValue {
    return new ResourceBindingStatusValue("active");
  }

  static rehydrate(value: ResourceBindingStatus): ResourceBindingStatusValue {
    return new ResourceBindingStatusValue(value);
  }

  isActive(): boolean {
    return this.value === "active";
  }

  remove(): ResourceBindingStatusValue {
    return new ResourceBindingStatusValue("removed");
  }
}

export interface ResourceBindingState {
  id: ResourceBindingId;
  projectId: ProjectId;
  resourceId: ResourceId;
  resourceInstanceId: ResourceInstanceId;
  environmentId: EnvironmentId;
  targetName: ResourceBindingTargetName;
  scope: ResourceBindingScopeValue;
  injectionMode: ResourceInjectionModeValue;
  status: ResourceBindingStatusValue;
  createdAt: CreatedAt;
  removedAt?: UpdatedAt;
}

export interface ResourceBindingVisitor<TContext, TResult> {
  visitResourceBinding(resourceBinding: ResourceBinding, context: TContext): TResult;
}

export class ResourceBinding extends AggregateRoot<ResourceBindingState> {
  private constructor(state: ResourceBindingState) {
    super(state);
  }

  static create(
    input: Omit<ResourceBindingState, "status" | "removedAt"> &
      Partial<Pick<ResourceBindingState, "status" | "removedAt">>,
  ): Result<ResourceBinding> {
    const binding = new ResourceBinding({
      ...input,
      status: input.status ?? ResourceBindingStatusValue.active(),
    });
    if (!binding.canUseInjectionMode()) {
      return err(
        resourceDependencyBindingValidationError(
          "Build-only resource bindings cannot use runtime references",
        ),
      );
    }

    binding.recordDomainEvent("resource-dependency-bound", input.createdAt, {
      projectId: input.projectId.value,
      environmentId: input.environmentId.value,
      resourceId: input.resourceId.value,
      dependencyResourceId: input.resourceInstanceId.value,
      targetName: input.targetName.value,
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

  isActive(): boolean {
    return this.state.status.isActive();
  }

  matchesActiveTarget(input: {
    resourceId: ResourceId;
    resourceInstanceId: ResourceInstanceId;
    targetName: ResourceBindingTargetName;
  }): boolean {
    return (
      this.isActive() &&
      this.state.resourceId.equals(input.resourceId) &&
      this.state.resourceInstanceId.equals(input.resourceInstanceId) &&
      this.state.targetName.equals(input.targetName)
    );
  }

  unbind(input: { removedAt: UpdatedAt }): Result<{ changed: boolean }> {
    if (!this.state.status.isActive()) {
      return ok({ changed: false });
    }
    this.state.status = this.state.status.remove();
    this.state.removedAt = input.removedAt;
    this.recordDomainEvent("resource-dependency-unbound", input.removedAt, {
      projectId: this.state.projectId.value,
      environmentId: this.state.environmentId.value,
      resourceId: this.state.resourceId.value,
      dependencyResourceId: this.state.resourceInstanceId.value,
      bindingId: this.state.id.value,
      removedAt: input.removedAt.value,
    });
    return ok({ changed: true });
  }

  toState(): ResourceBindingState {
    return {
      ...this.state,
      ...(this.state.removedAt ? { removedAt: this.state.removedAt } : {}),
    };
  }
}
