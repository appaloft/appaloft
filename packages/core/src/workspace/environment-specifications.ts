import { type EnvironmentId, type ProjectId } from "../shared/identifiers";
import { type EnvironmentName } from "../shared/text-values";
import { type Environment, type EnvironmentState } from "./environment";

export interface EnvironmentSelectionSpecVisitor<TResult> {
  visitEnvironmentById(query: TResult, spec: EnvironmentByIdSpec): TResult;
  visitEnvironmentByProjectAndName(query: TResult, spec: EnvironmentByProjectAndNameSpec): TResult;
}

export interface EnvironmentMutationSpecVisitor<TResult> {
  visitUpsertEnvironment(spec: UpsertEnvironmentSpec): TResult;
}

export interface EnvironmentSelectionSpec {
  accept<TResult>(query: TResult, visitor: EnvironmentSelectionSpecVisitor<TResult>): TResult;
}

export interface EnvironmentMutationSpec {
  accept<TResult>(visitor: EnvironmentMutationSpecVisitor<TResult>): TResult;
}

export class EnvironmentByIdSpec implements EnvironmentSelectionSpec {
  private constructor(public readonly id: EnvironmentId) {}

  static create(id: EnvironmentId): EnvironmentByIdSpec {
    return new EnvironmentByIdSpec(id);
  }

  accept<TResult>(query: TResult, visitor: EnvironmentSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitEnvironmentById(query, this);
  }
}

export class EnvironmentByProjectAndNameSpec implements EnvironmentSelectionSpec {
  private constructor(
    public readonly projectId: ProjectId,
    public readonly name: EnvironmentName,
  ) {}

  static create(projectId: ProjectId, name: EnvironmentName): EnvironmentByProjectAndNameSpec {
    return new EnvironmentByProjectAndNameSpec(projectId, name);
  }

  accept<TResult>(query: TResult, visitor: EnvironmentSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitEnvironmentByProjectAndName(query, this);
  }
}

export class UpsertEnvironmentSpec implements EnvironmentMutationSpec {
  private constructor(public readonly state: EnvironmentState) {}

  static fromEnvironment(environment: Environment): UpsertEnvironmentSpec {
    return new UpsertEnvironmentSpec(environment.toState());
  }

  accept<TResult>(visitor: EnvironmentMutationSpecVisitor<TResult>): TResult {
    return visitor.visitUpsertEnvironment(this);
  }
}
