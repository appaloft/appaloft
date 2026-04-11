import { type ProjectId } from "../shared/identifiers";
import { type ProjectSlug } from "../shared/text-values";
import { type Project, type ProjectState } from "./project";

export interface ProjectSelectionSpecVisitor<TResult> {
  visitProjectById(query: TResult, spec: ProjectByIdSpec): TResult;
  visitProjectBySlug(query: TResult, spec: ProjectBySlugSpec): TResult;
}

export interface ProjectMutationSpecVisitor<TResult> {
  visitUpsertProject(spec: UpsertProjectSpec): TResult;
}

export interface ProjectSelectionSpec {
  isSatisfiedBy(candidate: Project): boolean;
  accept<TResult>(query: TResult, visitor: ProjectSelectionSpecVisitor<TResult>): TResult;
}

export interface ProjectMutationSpec {
  accept<TResult>(visitor: ProjectMutationSpecVisitor<TResult>): TResult;
}

export class ProjectByIdSpec implements ProjectSelectionSpec {
  private constructor(private readonly expectedId: ProjectId) {}

  static create(id: ProjectId): ProjectByIdSpec {
    return new ProjectByIdSpec(id);
  }

  get id(): ProjectId {
    return this.expectedId;
  }

  isSatisfiedBy(candidate: Project): boolean {
    return candidate.toState().id.equals(this.expectedId);
  }

  accept<TResult>(query: TResult, visitor: ProjectSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitProjectById(query, this);
  }
}

export class ProjectBySlugSpec implements ProjectSelectionSpec {
  private constructor(private readonly expectedSlug: ProjectSlug) {}

  static create(slug: ProjectSlug): ProjectBySlugSpec {
    return new ProjectBySlugSpec(slug);
  }

  get slug(): ProjectSlug {
    return this.expectedSlug;
  }

  isSatisfiedBy(candidate: Project): boolean {
    return candidate.toState().slug.equals(this.expectedSlug);
  }

  accept<TResult>(query: TResult, visitor: ProjectSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitProjectBySlug(query, this);
  }
}

export class UpsertProjectSpec implements ProjectMutationSpec {
  private constructor(private readonly nextState: ProjectState) {}

  static fromProject(project: Project): UpsertProjectSpec {
    return new UpsertProjectSpec(project.toState());
  }

  get state(): ProjectState {
    return this.nextState;
  }

  accept<TResult>(visitor: ProjectMutationSpecVisitor<TResult>): TResult {
    return visitor.visitUpsertProject(this);
  }
}
