import { type PreviewEnvironmentId, type ResourceId } from "../shared/identifiers";
import { type SourceRepositoryFullName } from "../workload-delivery/source-binding";
import {
  type PreviewEnvironment,
  type PreviewEnvironmentProviderValue,
  type PreviewEnvironmentState,
  type PreviewPullRequestNumber,
} from "./preview-environment";

export interface PreviewEnvironmentSelectionSpecVisitor<TResult> {
  visitPreviewEnvironmentById(query: TResult, spec: PreviewEnvironmentByIdSpec): TResult;
  visitPreviewEnvironmentBySourceScope(
    query: TResult,
    spec: PreviewEnvironmentBySourceScopeSpec,
  ): TResult;
}

export interface PreviewEnvironmentMutationSpecVisitor<TResult> {
  visitUpsertPreviewEnvironment(spec: UpsertPreviewEnvironmentSpec): TResult;
  visitDeletePreviewEnvironment(spec: DeletePreviewEnvironmentSpec): TResult;
}

export interface PreviewEnvironmentSelectionSpec {
  accept<TResult>(
    query: TResult,
    visitor: PreviewEnvironmentSelectionSpecVisitor<TResult>,
  ): TResult;
}

export interface PreviewEnvironmentMutationSpec {
  accept<TResult>(visitor: PreviewEnvironmentMutationSpecVisitor<TResult>): TResult;
}

export class PreviewEnvironmentByIdSpec implements PreviewEnvironmentSelectionSpec {
  private constructor(
    public readonly previewEnvironmentId: PreviewEnvironmentId,
    public readonly resourceId?: ResourceId,
  ) {}

  static create(
    previewEnvironmentId: PreviewEnvironmentId,
    resourceId?: ResourceId,
  ): PreviewEnvironmentByIdSpec {
    return new PreviewEnvironmentByIdSpec(previewEnvironmentId, resourceId);
  }

  accept<TResult>(
    query: TResult,
    visitor: PreviewEnvironmentSelectionSpecVisitor<TResult>,
  ): TResult {
    return visitor.visitPreviewEnvironmentById(query, this);
  }
}

export class PreviewEnvironmentBySourceScopeSpec implements PreviewEnvironmentSelectionSpec {
  private constructor(
    public readonly provider: PreviewEnvironmentProviderValue,
    public readonly repositoryFullName: SourceRepositoryFullName,
    public readonly pullRequestNumber: PreviewPullRequestNumber,
    public readonly resourceId?: ResourceId,
  ) {}

  static create(input: {
    provider: PreviewEnvironmentProviderValue;
    repositoryFullName: SourceRepositoryFullName;
    pullRequestNumber: PreviewPullRequestNumber;
    resourceId?: ResourceId;
  }): PreviewEnvironmentBySourceScopeSpec {
    return new PreviewEnvironmentBySourceScopeSpec(
      input.provider,
      input.repositoryFullName,
      input.pullRequestNumber,
      input.resourceId,
    );
  }

  accept<TResult>(
    query: TResult,
    visitor: PreviewEnvironmentSelectionSpecVisitor<TResult>,
  ): TResult {
    return visitor.visitPreviewEnvironmentBySourceScope(query, this);
  }
}

export class UpsertPreviewEnvironmentSpec implements PreviewEnvironmentMutationSpec {
  private constructor(private readonly nextState: PreviewEnvironmentState) {}

  static fromPreviewEnvironment(
    previewEnvironment: PreviewEnvironment,
  ): UpsertPreviewEnvironmentSpec {
    return new UpsertPreviewEnvironmentSpec(previewEnvironment.toState());
  }

  get state(): PreviewEnvironmentState {
    return this.nextState;
  }

  accept<TResult>(visitor: PreviewEnvironmentMutationSpecVisitor<TResult>): TResult {
    return visitor.visitUpsertPreviewEnvironment(this);
  }
}

export class DeletePreviewEnvironmentSpec implements PreviewEnvironmentMutationSpec {
  private constructor(
    public readonly previewEnvironmentId: PreviewEnvironmentId,
    public readonly resourceId: ResourceId,
  ) {}

  static create(
    previewEnvironmentId: PreviewEnvironmentId,
    resourceId: ResourceId,
  ): DeletePreviewEnvironmentSpec {
    return new DeletePreviewEnvironmentSpec(previewEnvironmentId, resourceId);
  }

  accept<TResult>(visitor: PreviewEnvironmentMutationSpecVisitor<TResult>): TResult {
    return visitor.visitDeletePreviewEnvironment(this);
  }
}
