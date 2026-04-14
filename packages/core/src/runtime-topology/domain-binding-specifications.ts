import {
  type DomainBindingId,
  type EnvironmentId,
  type ProjectId,
  type ResourceId,
} from "../shared/identifiers";
import { type PublicDomainName, type RoutePathPrefix } from "../shared/text-values";
import { type DomainBinding, type DomainBindingState } from "./domain-binding";

export interface DomainBindingSelectionSpecVisitor<TResult> {
  visitDomainBindingById(query: TResult, spec: DomainBindingByIdSpec): TResult;
  visitDomainBindingByIdempotencyKey(
    query: TResult,
    spec: DomainBindingByIdempotencyKeySpec,
  ): TResult;
  visitActiveDomainBindingByOwnerAndRoute(
    query: TResult,
    spec: ActiveDomainBindingByOwnerAndRouteSpec,
  ): TResult;
}

export interface DomainBindingMutationSpecVisitor<TResult> {
  visitUpsertDomainBinding(spec: UpsertDomainBindingSpec): TResult;
}

export interface DomainBindingSelectionSpec {
  isSatisfiedBy(candidate: DomainBinding): boolean;
  accept<TResult>(query: TResult, visitor: DomainBindingSelectionSpecVisitor<TResult>): TResult;
}

export interface DomainBindingMutationSpec {
  accept<TResult>(visitor: DomainBindingMutationSpecVisitor<TResult>): TResult;
}

export class DomainBindingByIdSpec implements DomainBindingSelectionSpec {
  private constructor(private readonly expectedId: DomainBindingId) {}

  static create(id: DomainBindingId): DomainBindingByIdSpec {
    return new DomainBindingByIdSpec(id);
  }

  get id(): DomainBindingId {
    return this.expectedId;
  }

  isSatisfiedBy(candidate: DomainBinding): boolean {
    return candidate.toState().id.equals(this.expectedId);
  }

  accept<TResult>(query: TResult, visitor: DomainBindingSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitDomainBindingById(query, this);
  }
}

export class DomainBindingByIdempotencyKeySpec implements DomainBindingSelectionSpec {
  private constructor(private readonly expectedIdempotencyKey: string) {}

  static create(idempotencyKey: string): DomainBindingByIdempotencyKeySpec {
    return new DomainBindingByIdempotencyKeySpec(idempotencyKey);
  }

  get idempotencyKey(): string {
    return this.expectedIdempotencyKey;
  }

  isSatisfiedBy(candidate: DomainBinding): boolean {
    return candidate.toState().idempotencyKey?.value === this.expectedIdempotencyKey;
  }

  accept<TResult>(query: TResult, visitor: DomainBindingSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitDomainBindingByIdempotencyKey(query, this);
  }
}

export class ActiveDomainBindingByOwnerAndRouteSpec implements DomainBindingSelectionSpec {
  private constructor(
    private readonly expectedProjectId: ProjectId,
    private readonly expectedEnvironmentId: EnvironmentId,
    private readonly expectedResourceId: ResourceId,
    private readonly expectedDomainName: PublicDomainName,
    private readonly expectedPathPrefix: RoutePathPrefix,
  ) {}

  static create(input: {
    projectId: ProjectId;
    environmentId: EnvironmentId;
    resourceId: ResourceId;
    domainName: PublicDomainName;
    pathPrefix: RoutePathPrefix;
  }): ActiveDomainBindingByOwnerAndRouteSpec {
    return new ActiveDomainBindingByOwnerAndRouteSpec(
      input.projectId,
      input.environmentId,
      input.resourceId,
      input.domainName,
      input.pathPrefix,
    );
  }

  get projectId(): ProjectId {
    return this.expectedProjectId;
  }

  get environmentId(): EnvironmentId {
    return this.expectedEnvironmentId;
  }

  get resourceId(): ResourceId {
    return this.expectedResourceId;
  }

  get domainName(): PublicDomainName {
    return this.expectedDomainName;
  }

  get pathPrefix(): RoutePathPrefix {
    return this.expectedPathPrefix;
  }

  isSatisfiedBy(candidate: DomainBinding): boolean {
    const state = candidate.toState();
    return (
      state.projectId.equals(this.expectedProjectId) &&
      state.environmentId.equals(this.expectedEnvironmentId) &&
      state.resourceId.equals(this.expectedResourceId) &&
      state.domainName.equals(this.expectedDomainName) &&
      state.pathPrefix.equals(this.expectedPathPrefix) &&
      state.status.isActive()
    );
  }

  accept<TResult>(query: TResult, visitor: DomainBindingSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitActiveDomainBindingByOwnerAndRoute(query, this);
  }
}

export class UpsertDomainBindingSpec implements DomainBindingMutationSpec {
  private constructor(private readonly nextState: DomainBindingState) {}

  static fromDomainBinding(domainBinding: DomainBinding): UpsertDomainBindingSpec {
    return new UpsertDomainBindingSpec(domainBinding.toState());
  }

  get state(): DomainBindingState {
    return this.nextState;
  }

  accept<TResult>(visitor: DomainBindingMutationSpecVisitor<TResult>): TResult {
    return visitor.visitUpsertDomainBinding(this);
  }
}
