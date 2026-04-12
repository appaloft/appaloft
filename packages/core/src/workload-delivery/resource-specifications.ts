import { type EnvironmentId, type ProjectId, type ResourceId } from "../shared/identifiers";
import { type ResourceSlug } from "../shared/text-values";
import { type Resource, type ResourceState } from "./resource";

export interface ResourceSelectionSpecVisitor<TResult> {
  visitResourceById(query: TResult, spec: ResourceByIdSpec): TResult;
  visitResourceByEnvironmentAndSlug(
    query: TResult,
    spec: ResourceByEnvironmentAndSlugSpec,
  ): TResult;
}

export interface ResourceMutationSpecVisitor<TResult> {
  visitUpsertResource(spec: UpsertResourceSpec): TResult;
}

export interface ResourceSelectionSpec {
  isSatisfiedBy(candidate: Resource): boolean;
  accept<TResult>(query: TResult, visitor: ResourceSelectionSpecVisitor<TResult>): TResult;
}

export interface ResourceMutationSpec {
  accept<TResult>(visitor: ResourceMutationSpecVisitor<TResult>): TResult;
}

export class ResourceByIdSpec implements ResourceSelectionSpec {
  private constructor(private readonly expectedId: ResourceId) {}

  static create(id: ResourceId): ResourceByIdSpec {
    return new ResourceByIdSpec(id);
  }

  get id(): ResourceId {
    return this.expectedId;
  }

  isSatisfiedBy(candidate: Resource): boolean {
    return candidate.toState().id.equals(this.expectedId);
  }

  accept<TResult>(query: TResult, visitor: ResourceSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitResourceById(query, this);
  }
}

export class ResourceByEnvironmentAndSlugSpec implements ResourceSelectionSpec {
  private constructor(
    private readonly expectedProjectId: ProjectId,
    private readonly expectedEnvironmentId: EnvironmentId,
    private readonly expectedSlug: ResourceSlug,
  ) {}

  static create(
    projectId: ProjectId,
    environmentId: EnvironmentId,
    slug: ResourceSlug,
  ): ResourceByEnvironmentAndSlugSpec {
    return new ResourceByEnvironmentAndSlugSpec(projectId, environmentId, slug);
  }

  get projectId(): ProjectId {
    return this.expectedProjectId;
  }

  get environmentId(): EnvironmentId {
    return this.expectedEnvironmentId;
  }

  get slug(): ResourceSlug {
    return this.expectedSlug;
  }

  isSatisfiedBy(candidate: Resource): boolean {
    const state = candidate.toState();
    return (
      state.projectId.equals(this.expectedProjectId) &&
      state.environmentId.equals(this.expectedEnvironmentId) &&
      state.slug.equals(this.expectedSlug)
    );
  }

  accept<TResult>(query: TResult, visitor: ResourceSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitResourceByEnvironmentAndSlug(query, this);
  }
}

export class UpsertResourceSpec implements ResourceMutationSpec {
  private constructor(private readonly nextState: ResourceState) {}

  static fromResource(resource: Resource): UpsertResourceSpec {
    return new UpsertResourceSpec(resource.toState());
  }

  get state(): ResourceState {
    return this.nextState;
  }

  accept<TResult>(visitor: ResourceMutationSpecVisitor<TResult>): TResult {
    return visitor.visitUpsertResource(this);
  }
}
