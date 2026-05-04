import { type EnvironmentId, type ProjectId, type ResourceInstanceId } from "../shared/identifiers";
import { type ResourceInstanceKindValue } from "../shared/state-machine";
import {
  type ResourceInstance,
  type ResourceInstanceSlug,
  type ResourceInstanceState,
} from "./resource-instance";

export interface ResourceInstanceSelectionSpecVisitor<TResult> {
  visitResourceInstanceById(query: TResult, spec: ResourceInstanceByIdSpec): TResult;
  visitResourceInstanceByEnvironmentAndSlug(
    query: TResult,
    spec: ResourceInstanceByEnvironmentAndSlugSpec,
  ): TResult;
}

export interface ResourceInstanceMutationSpecVisitor<TResult> {
  visitUpsertResourceInstance(spec: UpsertResourceInstanceSpec): TResult;
}

export interface ResourceInstanceSelectionSpec {
  isSatisfiedBy(candidate: ResourceInstance): boolean;
  accept<TResult>(query: TResult, visitor: ResourceInstanceSelectionSpecVisitor<TResult>): TResult;
}

export interface ResourceInstanceMutationSpec {
  accept<TResult>(visitor: ResourceInstanceMutationSpecVisitor<TResult>): TResult;
}

export class ResourceInstanceByIdSpec implements ResourceInstanceSelectionSpec {
  private constructor(private readonly expectedId: ResourceInstanceId) {}

  static create(id: ResourceInstanceId): ResourceInstanceByIdSpec {
    return new ResourceInstanceByIdSpec(id);
  }

  get id(): ResourceInstanceId {
    return this.expectedId;
  }

  isSatisfiedBy(candidate: ResourceInstance): boolean {
    return candidate.toState().id.equals(this.expectedId);
  }

  accept<TResult>(query: TResult, visitor: ResourceInstanceSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitResourceInstanceById(query, this);
  }
}

export class ResourceInstanceByEnvironmentAndSlugSpec implements ResourceInstanceSelectionSpec {
  private constructor(
    private readonly expectedProjectId: ProjectId,
    private readonly expectedEnvironmentId: EnvironmentId,
    private readonly expectedKind: ResourceInstanceKindValue,
    private readonly expectedSlug: ResourceInstanceSlug,
  ) {}

  static create(
    projectId: ProjectId,
    environmentId: EnvironmentId,
    kind: ResourceInstanceKindValue,
    slug: ResourceInstanceSlug,
  ): ResourceInstanceByEnvironmentAndSlugSpec {
    return new ResourceInstanceByEnvironmentAndSlugSpec(projectId, environmentId, kind, slug);
  }

  get projectId(): ProjectId {
    return this.expectedProjectId;
  }

  get environmentId(): EnvironmentId {
    return this.expectedEnvironmentId;
  }

  get kind(): ResourceInstanceKindValue {
    return this.expectedKind;
  }

  get slug(): ResourceInstanceSlug {
    return this.expectedSlug;
  }

  isSatisfiedBy(candidate: ResourceInstance): boolean {
    const state = candidate.toState();
    return Boolean(
      state.projectId?.equals(this.expectedProjectId) &&
        state.environmentId?.equals(this.expectedEnvironmentId) &&
        state.kind.equals(this.expectedKind) &&
        state.slug?.equals(this.expectedSlug),
    );
  }

  accept<TResult>(query: TResult, visitor: ResourceInstanceSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitResourceInstanceByEnvironmentAndSlug(query, this);
  }
}

export class UpsertResourceInstanceSpec implements ResourceInstanceMutationSpec {
  private constructor(private readonly nextState: ResourceInstanceState) {}

  static fromResourceInstance(resourceInstance: ResourceInstance): UpsertResourceInstanceSpec {
    return new UpsertResourceInstanceSpec(resourceInstance.toState());
  }

  get state(): ResourceInstanceState {
    return this.nextState;
  }

  accept<TResult>(visitor: ResourceInstanceMutationSpecVisitor<TResult>): TResult {
    return visitor.visitUpsertResourceInstance(this);
  }
}
