import {
  type ResourceBindingId,
  type ResourceId,
  type ResourceInstanceId,
} from "../shared/identifiers";
import {
  type ResourceBinding,
  type ResourceBindingState,
  type ResourceBindingTargetName,
} from "./resource-binding";

export interface ResourceBindingSelectionSpecVisitor<TResult> {
  visitResourceBindingById(query: TResult, spec: ResourceBindingByIdSpec): TResult;
  visitActiveResourceBindingByTarget(
    query: TResult,
    spec: ActiveResourceBindingByTargetSpec,
  ): TResult;
  visitResourceBindingsByResource(query: TResult, spec: ResourceBindingsByResourceSpec): TResult;
}

export interface ResourceBindingMutationSpecVisitor<TResult> {
  visitUpsertResourceBinding(spec: UpsertResourceBindingSpec): TResult;
}

export interface ResourceBindingSelectionSpec {
  isSatisfiedBy(candidate: ResourceBinding): boolean;
  accept<TResult>(query: TResult, visitor: ResourceBindingSelectionSpecVisitor<TResult>): TResult;
}

export interface ResourceBindingMutationSpec {
  accept<TResult>(visitor: ResourceBindingMutationSpecVisitor<TResult>): TResult;
}

export class ResourceBindingByIdSpec implements ResourceBindingSelectionSpec {
  private constructor(private readonly expectedId: ResourceBindingId) {}

  static create(id: ResourceBindingId): ResourceBindingByIdSpec {
    return new ResourceBindingByIdSpec(id);
  }

  get id(): ResourceBindingId {
    return this.expectedId;
  }

  isSatisfiedBy(candidate: ResourceBinding): boolean {
    return candidate.toState().id.equals(this.expectedId);
  }

  accept<TResult>(query: TResult, visitor: ResourceBindingSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitResourceBindingById(query, this);
  }
}

export class ActiveResourceBindingByTargetSpec implements ResourceBindingSelectionSpec {
  private constructor(
    private readonly expectedResourceId: ResourceId,
    private readonly expectedResourceInstanceId: ResourceInstanceId,
    private readonly expectedTargetName: ResourceBindingTargetName,
  ) {}

  static create(
    resourceId: ResourceId,
    resourceInstanceId: ResourceInstanceId,
    targetName: ResourceBindingTargetName,
  ): ActiveResourceBindingByTargetSpec {
    return new ActiveResourceBindingByTargetSpec(resourceId, resourceInstanceId, targetName);
  }

  get resourceId(): ResourceId {
    return this.expectedResourceId;
  }

  get resourceInstanceId(): ResourceInstanceId {
    return this.expectedResourceInstanceId;
  }

  get targetName(): ResourceBindingTargetName {
    return this.expectedTargetName;
  }

  isSatisfiedBy(candidate: ResourceBinding): boolean {
    return candidate.matchesActiveTarget({
      resourceId: this.expectedResourceId,
      resourceInstanceId: this.expectedResourceInstanceId,
      targetName: this.expectedTargetName,
    });
  }

  accept<TResult>(query: TResult, visitor: ResourceBindingSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitActiveResourceBindingByTarget(query, this);
  }
}

export class ResourceBindingsByResourceSpec implements ResourceBindingSelectionSpec {
  private constructor(private readonly expectedResourceId: ResourceId) {}

  static create(resourceId: ResourceId): ResourceBindingsByResourceSpec {
    return new ResourceBindingsByResourceSpec(resourceId);
  }

  get resourceId(): ResourceId {
    return this.expectedResourceId;
  }

  isSatisfiedBy(candidate: ResourceBinding): boolean {
    const state = candidate.toState();
    return state.resourceId.equals(this.expectedResourceId) && state.status.isActive();
  }

  accept<TResult>(query: TResult, visitor: ResourceBindingSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitResourceBindingsByResource(query, this);
  }
}

export class UpsertResourceBindingSpec implements ResourceBindingMutationSpec {
  private constructor(private readonly nextState: ResourceBindingState) {}

  static fromResourceBinding(resourceBinding: ResourceBinding): UpsertResourceBindingSpec {
    return new UpsertResourceBindingSpec(resourceBinding.toState());
  }

  get state(): ResourceBindingState {
    return this.nextState;
  }

  accept<TResult>(visitor: ResourceBindingMutationSpecVisitor<TResult>): TResult {
    return visitor.visitUpsertResourceBinding(this);
  }
}
