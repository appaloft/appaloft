import { type ResourceInstanceId } from "../shared/identifiers";
import {
  type DependencyResourceBackup,
  type DependencyResourceBackupId,
  type DependencyResourceBackupState,
} from "./dependency-resource-backup";

export interface DependencyResourceBackupSelectionSpecVisitor<TResult> {
  visitDependencyResourceBackupById(
    query: TResult,
    spec: DependencyResourceBackupByIdSpec,
  ): TResult;
  visitDependencyResourceBackupsByDependencyResource(
    query: TResult,
    spec: DependencyResourceBackupsByDependencyResourceSpec,
  ): TResult;
}

export interface DependencyResourceBackupMutationSpecVisitor<TResult> {
  visitUpsertDependencyResourceBackup(spec: UpsertDependencyResourceBackupSpec): TResult;
}

export interface DependencyResourceBackupSelectionSpec {
  isSatisfiedBy(candidate: DependencyResourceBackup): boolean;
  accept<TResult>(
    query: TResult,
    visitor: DependencyResourceBackupSelectionSpecVisitor<TResult>,
  ): TResult;
}

export interface DependencyResourceBackupMutationSpec {
  accept<TResult>(visitor: DependencyResourceBackupMutationSpecVisitor<TResult>): TResult;
}

export class DependencyResourceBackupByIdSpec implements DependencyResourceBackupSelectionSpec {
  private constructor(private readonly expectedId: DependencyResourceBackupId) {}

  static create(id: DependencyResourceBackupId): DependencyResourceBackupByIdSpec {
    return new DependencyResourceBackupByIdSpec(id);
  }

  get id(): DependencyResourceBackupId {
    return this.expectedId;
  }

  isSatisfiedBy(candidate: DependencyResourceBackup): boolean {
    return candidate.toState().id.equals(this.expectedId);
  }

  accept<TResult>(
    query: TResult,
    visitor: DependencyResourceBackupSelectionSpecVisitor<TResult>,
  ): TResult {
    return visitor.visitDependencyResourceBackupById(query, this);
  }
}

export class DependencyResourceBackupsByDependencyResourceSpec
  implements DependencyResourceBackupSelectionSpec
{
  private constructor(private readonly expectedDependencyResourceId: ResourceInstanceId) {}

  static create(
    dependencyResourceId: ResourceInstanceId,
  ): DependencyResourceBackupsByDependencyResourceSpec {
    return new DependencyResourceBackupsByDependencyResourceSpec(dependencyResourceId);
  }

  get dependencyResourceId(): ResourceInstanceId {
    return this.expectedDependencyResourceId;
  }

  isSatisfiedBy(candidate: DependencyResourceBackup): boolean {
    return candidate.toState().dependencyResourceId.equals(this.expectedDependencyResourceId);
  }

  accept<TResult>(
    query: TResult,
    visitor: DependencyResourceBackupSelectionSpecVisitor<TResult>,
  ): TResult {
    return visitor.visitDependencyResourceBackupsByDependencyResource(query, this);
  }
}

export class UpsertDependencyResourceBackupSpec implements DependencyResourceBackupMutationSpec {
  private constructor(private readonly nextState: DependencyResourceBackupState) {}

  static fromDependencyResourceBackup(
    backup: DependencyResourceBackup,
  ): UpsertDependencyResourceBackupSpec {
    return new UpsertDependencyResourceBackupSpec(backup.toState());
  }

  get state(): DependencyResourceBackupState {
    return this.nextState;
  }

  accept<TResult>(visitor: DependencyResourceBackupMutationSpecVisitor<TResult>): TResult {
    return visitor.visitUpsertDependencyResourceBackup(this);
  }
}
