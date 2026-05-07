import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import {
  type DeploymentTargetId,
  type DestinationId,
  type EnvironmentId,
  type PreviewEnvironmentId,
  type ProjectId,
  type ResourceId,
} from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import { type CreatedAt, type UpdatedAt } from "../shared/temporal";
import { ScalarValueObject } from "../shared/value-object";
import {
  type GitCommitShaText,
  type GitRefText,
  type SourceBindingFingerprint,
  type SourceRepositoryFullName,
} from "../workload-delivery/source-binding";

export type PreviewEnvironmentProvider = "github";
export type PreviewEnvironmentStatus = "active" | "cleanup-requested";

const previewEnvironmentValidationPhase = "preview-environment-admission";
const previewEnvironmentTransitionPhase = "preview-environment-state-transition";
const previewEnvironmentProviders = ["github"] as const;
const previewEnvironmentStatuses = ["active", "cleanup-requested"] as const;

function includesValue<TValue extends string>(
  values: readonly TValue[],
  value: string,
): value is TValue {
  return values.includes(value as TValue);
}

function previewEnvironmentValidationError(
  message: string,
  details?: Record<string, string | number | boolean>,
) {
  return domainError.validation(message, {
    phase: previewEnvironmentValidationPhase,
    ...(details ?? {}),
  });
}

function previewEnvironmentTransitionError(
  message: string,
  details?: Record<string, string | number | boolean>,
) {
  return domainError.conflict(message, {
    phase: previewEnvironmentTransitionPhase,
    ...(details ?? {}),
  });
}

const previewEnvironmentProviderBrand: unique symbol = Symbol("PreviewEnvironmentProvider");
export class PreviewEnvironmentProviderValue extends ScalarValueObject<PreviewEnvironmentProvider> {
  private [previewEnvironmentProviderBrand]!: void;

  private constructor(value: PreviewEnvironmentProvider) {
    super(value);
  }

  static create(value: string): Result<PreviewEnvironmentProviderValue> {
    const normalized = value.trim();
    if (!includesValue(previewEnvironmentProviders, normalized)) {
      return err(
        previewEnvironmentValidationError("Preview environment provider is unsupported", {
          field: "provider",
          provider: normalized,
        }),
      );
    }

    return ok(new PreviewEnvironmentProviderValue(normalized));
  }

  static github(): PreviewEnvironmentProviderValue {
    return new PreviewEnvironmentProviderValue("github");
  }

  static rehydrate(value: PreviewEnvironmentProvider): PreviewEnvironmentProviderValue {
    return new PreviewEnvironmentProviderValue(value);
  }
}
const previewEnvironmentStatusBrand: unique symbol = Symbol("PreviewEnvironmentStatus");
export class PreviewEnvironmentStatusValue extends ScalarValueObject<PreviewEnvironmentStatus> {
  private [previewEnvironmentStatusBrand]!: void;

  private constructor(value: PreviewEnvironmentStatus) {
    super(value);
  }

  static create(value: string): Result<PreviewEnvironmentStatusValue> {
    const normalized = value.trim();
    if (!includesValue(previewEnvironmentStatuses, normalized)) {
      return err(
        previewEnvironmentValidationError("Preview environment status is unsupported", {
          field: "status",
          status: normalized,
        }),
      );
    }

    return ok(new PreviewEnvironmentStatusValue(normalized));
  }

  static active(): PreviewEnvironmentStatusValue {
    return new PreviewEnvironmentStatusValue("active");
  }

  static cleanupRequested(): PreviewEnvironmentStatusValue {
    return new PreviewEnvironmentStatusValue("cleanup-requested");
  }

  static rehydrate(value: PreviewEnvironmentStatus): PreviewEnvironmentStatusValue {
    return new PreviewEnvironmentStatusValue(value);
  }

  requestCleanup(): Result<PreviewEnvironmentStatusValue> {
    if (this.value === "cleanup-requested") {
      return err(
        previewEnvironmentTransitionError("Preview environment cleanup is already requested", {
          status: this.value,
        }),
      );
    }

    return ok(PreviewEnvironmentStatusValue.cleanupRequested());
  }

  isActive(): boolean {
    return this.value === "active";
  }
}

const previewPullRequestNumberBrand: unique symbol = Symbol("PreviewPullRequestNumber");
export class PreviewPullRequestNumber extends ScalarValueObject<number> {
  private [previewPullRequestNumberBrand]!: void;

  private constructor(value: number) {
    super(value);
  }

  static create(value: number): Result<PreviewPullRequestNumber> {
    if (!Number.isInteger(value) || value < 1) {
      return err(
        previewEnvironmentValidationError(
          "Preview pull request number must be a positive integer",
          {
            field: "pullRequestNumber",
            pullRequestNumber: value,
          },
        ),
      );
    }

    return ok(new PreviewPullRequestNumber(value));
  }

  static rehydrate(value: number): PreviewPullRequestNumber {
    return new PreviewPullRequestNumber(value);
  }
}

const previewEnvironmentExpiresAtBrand: unique symbol = Symbol("PreviewEnvironmentExpiresAt");
export class PreviewEnvironmentExpiresAt extends ScalarValueObject<string> {
  private [previewEnvironmentExpiresAtBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string | Date): Result<PreviewEnvironmentExpiresAt> {
    const raw = value instanceof Date ? value.toISOString() : value.trim();
    const parsed = new Date(raw);
    if (!raw || Number.isNaN(parsed.getTime())) {
      return err(
        previewEnvironmentValidationError("Preview environment expiry must be an ISO date-time", {
          field: "expiresAt",
        }),
      );
    }

    return ok(new PreviewEnvironmentExpiresAt(parsed.toISOString()));
  }

  static rehydrate(value: string): PreviewEnvironmentExpiresAt {
    return new PreviewEnvironmentExpiresAt(new Date(value).toISOString());
  }

  isExpiredAt(at: CreatedAt | UpdatedAt): boolean {
    return new Date(this.value).getTime() <= new Date(at.value).getTime();
  }
}

export interface PreviewEnvironmentSourceContextState {
  repositoryFullName: SourceRepositoryFullName;
  headRepositoryFullName: SourceRepositoryFullName;
  pullRequestNumber: PreviewPullRequestNumber;
  headSha: GitCommitShaText;
  baseRef: GitRefText;
  sourceBindingFingerprint: SourceBindingFingerprint;
}

export interface PreviewEnvironmentState {
  id: PreviewEnvironmentId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  resourceId: ResourceId;
  serverId: DeploymentTargetId;
  destinationId: DestinationId;
  provider: PreviewEnvironmentProviderValue;
  source: PreviewEnvironmentSourceContextState;
  status: PreviewEnvironmentStatusValue;
  createdAt: CreatedAt;
  updatedAt?: UpdatedAt;
  expiresAt?: PreviewEnvironmentExpiresAt;
}

function cloneSourceContext(
  source: PreviewEnvironmentSourceContextState,
): PreviewEnvironmentSourceContextState {
  return { ...source };
}

export class PreviewEnvironment extends AggregateRoot<
  PreviewEnvironmentState,
  PreviewEnvironmentId
> {
  private constructor(state: PreviewEnvironmentState) {
    super(state);
  }

  static create(input: {
    id: PreviewEnvironmentId;
    projectId: ProjectId;
    environmentId: EnvironmentId;
    resourceId: ResourceId;
    serverId: DeploymentTargetId;
    destinationId: DestinationId;
    provider: PreviewEnvironmentProviderValue;
    source: PreviewEnvironmentSourceContextState;
    createdAt: CreatedAt;
    expiresAt?: PreviewEnvironmentExpiresAt;
  }): Result<PreviewEnvironment> {
    const previewEnvironment = new PreviewEnvironment({
      id: input.id,
      projectId: input.projectId,
      environmentId: input.environmentId,
      resourceId: input.resourceId,
      serverId: input.serverId,
      destinationId: input.destinationId,
      provider: input.provider,
      source: cloneSourceContext(input.source),
      status: PreviewEnvironmentStatusValue.active(),
      createdAt: input.createdAt,
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    });

    previewEnvironment.recordDomainEvent("preview-environment-created", input.createdAt, {
      projectId: input.projectId.value,
      environmentId: input.environmentId.value,
      resourceId: input.resourceId.value,
      provider: input.provider.value,
      pullRequestNumber: input.source.pullRequestNumber.value,
    });

    return ok(previewEnvironment);
  }

  static rehydrate(state: PreviewEnvironmentState): PreviewEnvironment {
    return new PreviewEnvironment({
      ...state,
      source: cloneSourceContext(state.source),
      status: state.status ?? PreviewEnvironmentStatusValue.active(),
    });
  }

  belongsToResource(resourceId: ResourceId): boolean {
    return this.state.resourceId.equals(resourceId);
  }

  isActive(): boolean {
    return this.state.status.isActive();
  }

  isExpiredAt(at: CreatedAt | UpdatedAt): boolean {
    return this.state.expiresAt?.isExpiredAt(at) ?? false;
  }

  updateSourceContext(input: {
    source: PreviewEnvironmentSourceContextState;
    updatedAt: UpdatedAt;
  }): Result<{ changed: boolean }> {
    if (!this.state.status.isActive()) {
      return err(
        previewEnvironmentTransitionError(
          "Preview environment source can update only while active",
          {
            status: this.state.status.value,
          },
        ),
      );
    }

    const changed = !this.state.source.headSha.equals(input.source.headSha);
    this.state.source = cloneSourceContext(input.source);
    this.state.updatedAt = input.updatedAt;

    if (changed) {
      this.recordDomainEvent("preview-environment-source-updated", input.updatedAt, {
        resourceId: this.state.resourceId.value,
        provider: this.state.provider.value,
        pullRequestNumber: input.source.pullRequestNumber.value,
        headSha: input.source.headSha.value,
      });
    }

    return ok({ changed });
  }

  requestCleanup(input: { requestedAt: UpdatedAt }): Result<void> {
    return this.state.status.requestCleanup().map((status) => {
      this.state.status = status;
      this.state.updatedAt = input.requestedAt;
      this.recordDomainEvent("preview-environment-cleanup-requested", input.requestedAt, {
        resourceId: this.state.resourceId.value,
        provider: this.state.provider.value,
        pullRequestNumber: this.state.source.pullRequestNumber.value,
      });
      return undefined;
    });
  }

  toState(): PreviewEnvironmentState {
    return {
      ...this.state,
      source: cloneSourceContext(this.state.source),
    };
  }
}
