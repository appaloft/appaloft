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

const resourceBindingSecretRefBrand: unique symbol = Symbol("ResourceBindingSecretRef");
export class ResourceBindingSecretRef extends ScalarValueObject<string> {
  private [resourceBindingSecretRefBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ResourceBindingSecretRef> {
    const normalized = value.trim();
    if (!normalized) {
      return err(resourceDependencyBindingValidationError("Binding secret reference is required"));
    }
    if (/\s/.test(normalized)) {
      return err(
        resourceDependencyBindingValidationError(
          "Binding secret reference must be a single token",
          { field: "secretRef" },
        ),
      );
    }
    return ok(new ResourceBindingSecretRef(normalized));
  }

  static rehydrate(value: string): ResourceBindingSecretRef {
    return new ResourceBindingSecretRef(value.trim());
  }
}

const resourceBindingSecretVersionBrand: unique symbol = Symbol("ResourceBindingSecretVersion");
export class ResourceBindingSecretVersion extends ScalarValueObject<string> {
  private [resourceBindingSecretVersionBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ResourceBindingSecretVersion> {
    const normalized = value.trim();
    if (!normalized) {
      return err(resourceDependencyBindingValidationError("Binding secret version is required"));
    }
    if (/\s/.test(normalized)) {
      return err(
        resourceDependencyBindingValidationError("Binding secret version must be a single token", {
          field: "secretVersion",
        }),
      );
    }
    return ok(new ResourceBindingSecretVersion(normalized));
  }

  static rehydrate(value: string): ResourceBindingSecretVersion {
    return new ResourceBindingSecretVersion(value.trim());
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
  secretRef?: ResourceBindingSecretRef;
  secretVersion?: ResourceBindingSecretVersion;
  secretRotatedAt?: UpdatedAt;
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

  rotateSecret(input: {
    secretRef: ResourceBindingSecretRef;
    secretVersion: ResourceBindingSecretVersion;
    rotatedAt: UpdatedAt;
  }): Result<{ previousSecretVersion?: ResourceBindingSecretVersion }> {
    if (!this.state.status.isActive()) {
      return err(
        domainError.resourceDependencyBindingRotationBlocked(
          "Resource dependency binding is not active",
          {
            phase: "resource-dependency-binding-secret-rotation",
            bindingId: this.state.id.value,
            resourceId: this.state.resourceId.value,
            currentBindingState: this.state.status.value,
            blockerReasonCode: "binding_not_active",
          },
        ),
      );
    }

    const previousSecretVersion = this.state.secretVersion;
    this.state.secretRef = input.secretRef;
    this.state.secretVersion = input.secretVersion;
    this.state.secretRotatedAt = input.rotatedAt;
    this.recordDomainEvent("resource-dependency-binding-secret-rotated", input.rotatedAt, {
      projectId: this.state.projectId.value,
      environmentId: this.state.environmentId.value,
      resourceId: this.state.resourceId.value,
      dependencyResourceId: this.state.resourceInstanceId.value,
      bindingId: this.state.id.value,
      targetName: this.state.targetName.value,
      secretVersion: input.secretVersion.value,
      rotatedAt: input.rotatedAt.value,
      ...(previousSecretVersion ? { previousSecretVersion: previousSecretVersion.value } : {}),
    });
    return ok({
      ...(previousSecretVersion ? { previousSecretVersion } : {}),
    });
  }

  toState(): ResourceBindingState {
    return {
      ...this.state,
      ...(this.state.secretRef ? { secretRef: this.state.secretRef } : {}),
      ...(this.state.secretVersion ? { secretVersion: this.state.secretVersion } : {}),
      ...(this.state.secretRotatedAt ? { secretRotatedAt: this.state.secretRotatedAt } : {}),
      ...(this.state.removedAt ? { removedAt: this.state.removedAt } : {}),
    };
  }
}
