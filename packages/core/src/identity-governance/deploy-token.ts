import { AggregateRoot } from "../shared/entity";
import { type DomainError, domainError } from "../shared/errors";
import {
  type DeploymentTargetId,
  type DeployTokenId,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
  type ResourceId,
} from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import { DeployTokenStatusValue } from "../shared/state-machine";
import {
  type CreatedAt,
  type ExpiresAt,
  type LastUsedAt,
  type RevokedAt,
  type RotatedAt,
} from "../shared/temporal";
import { type DisplayNameText } from "../shared/text-values";
import { ScalarValueObject, ValueObject } from "../shared/value-object";
import { type SourceRepositoryFullName } from "../workload-delivery/source-binding";

export type DeployTokenWorkflowCommand =
  | "preview-cleanup"
  | "server-config-deploy"
  | "source-link-deploy";

const deployTokenWorkflowCommandBrand: unique symbol = Symbol("DeployTokenWorkflowCommandValue");
export class DeployTokenWorkflowCommandValue extends ScalarValueObject<DeployTokenWorkflowCommand> {
  private [deployTokenWorkflowCommandBrand]!: void;

  private constructor(value: DeployTokenWorkflowCommand) {
    super(value);
  }

  static create(value: string): Result<DeployTokenWorkflowCommandValue> {
    const normalized = value.trim();
    if (
      normalized !== "preview-cleanup" &&
      normalized !== "server-config-deploy" &&
      normalized !== "source-link-deploy"
    ) {
      return err(
        domainError.validation("Deploy token workflow command is not supported", {
          phase: "deploy-token-scope",
          workflowCommand: normalized,
        }),
      );
    }

    return ok(new DeployTokenWorkflowCommandValue(normalized));
  }

  static rehydrate(value: DeployTokenWorkflowCommand): DeployTokenWorkflowCommandValue {
    return new DeployTokenWorkflowCommandValue(value);
  }
}

const deployTokenVerifierDigestBrand: unique symbol = Symbol("DeployTokenVerifierDigest");
export class DeployTokenVerifierDigest extends ScalarValueObject<string> {
  private [deployTokenVerifierDigestBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DeployTokenVerifierDigest> {
    const normalized = value.trim();
    if (!normalized) {
      return err(
        domainError.validation("Deploy token verifier digest is required", {
          phase: "deploy-token-verifier",
        }),
      );
    }

    if (!/^[a-z0-9][a-z0-9-]*:[A-Za-z0-9._~+/=-]{16,}$/.test(normalized)) {
      return err(
        domainError.validation("Deploy token verifier digest must include an algorithm prefix", {
          phase: "deploy-token-verifier",
        }),
      );
    }

    return ok(new DeployTokenVerifierDigest(normalized));
  }

  static rehydrate(value: string): DeployTokenVerifierDigest {
    return new DeployTokenVerifierDigest(value.trim());
  }
}

const deployTokenSecretSuffixBrand: unique symbol = Symbol("DeployTokenSecretSuffix");
export class DeployTokenSecretSuffix extends ScalarValueObject<string> {
  private [deployTokenSecretSuffixBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DeployTokenSecretSuffix> {
    const normalized = value.trim();
    if (!/^[A-Za-z0-9_-]{4,12}$/.test(normalized)) {
      return err(
        domainError.validation("Deploy token secret suffix must be a short safe token suffix", {
          phase: "deploy-token-verifier",
        }),
      );
    }

    return ok(new DeployTokenSecretSuffix(normalized));
  }

  static rehydrate(value: string): DeployTokenSecretSuffix {
    return new DeployTokenSecretSuffix(value.trim());
  }
}

export interface DeployTokenScopeState {
  projectIds: readonly ProjectId[];
  environmentIds: readonly EnvironmentId[];
  resourceIds: readonly ResourceId[];
  deploymentTargetIds: readonly DeploymentTargetId[];
  repositoryFullNames: readonly SourceRepositoryFullName[];
  workflowCommands: readonly DeployTokenWorkflowCommandValue[];
}

export interface DeployTokenAuthorizationScopeRequest {
  deploymentTargetId?: DeploymentTargetId;
  environmentId?: EnvironmentId;
  projectId?: ProjectId;
  repositoryFullName?: SourceRepositoryFullName;
  resourceId?: ResourceId;
  workflowCommand: DeployTokenWorkflowCommandValue;
}

export class DeployTokenScope extends ValueObject<DeployTokenScopeState> {
  private constructor(state: DeployTokenScopeState) {
    super(state);
  }

  static create(input: {
    deploymentTargetIds?: readonly DeploymentTargetId[];
    environmentIds?: readonly EnvironmentId[];
    projectIds?: readonly ProjectId[];
    repositoryFullNames?: readonly SourceRepositoryFullName[];
    resourceIds?: readonly ResourceId[];
    workflowCommands: readonly DeployTokenWorkflowCommandValue[];
  }): Result<DeployTokenScope> {
    if (input.workflowCommands.length === 0) {
      return err(
        domainError.validation("Deploy token must allow at least one workflow command", {
          phase: "deploy-token-scope",
          field: "workflowCommands",
        }),
      );
    }

    return ok(
      new DeployTokenScope({
        deploymentTargetIds: uniqueValues(input.deploymentTargetIds ?? []),
        environmentIds: uniqueValues(input.environmentIds ?? []),
        projectIds: uniqueValues(input.projectIds ?? []),
        repositoryFullNames: uniqueValues(input.repositoryFullNames ?? []),
        resourceIds: uniqueValues(input.resourceIds ?? []),
        workflowCommands: uniqueValues(input.workflowCommands),
      }),
    );
  }

  static rehydrate(state: DeployTokenScopeState): DeployTokenScope {
    return new DeployTokenScope({
      deploymentTargetIds: [...state.deploymentTargetIds],
      environmentIds: [...state.environmentIds],
      projectIds: [...state.projectIds],
      repositoryFullNames: [...state.repositoryFullNames],
      resourceIds: [...state.resourceIds],
      workflowCommands: [...state.workflowCommands],
    });
  }

  authorizes(request: DeployTokenAuthorizationScopeRequest): boolean {
    if (!containsValue(this.state.workflowCommands, request.workflowCommand)) {
      return false;
    }

    return (
      matchesOptionalConstraint(this.state.projectIds, request.projectId) &&
      matchesOptionalConstraint(this.state.environmentIds, request.environmentId) &&
      matchesOptionalConstraint(this.state.resourceIds, request.resourceId) &&
      matchesOptionalConstraint(this.state.deploymentTargetIds, request.deploymentTargetId) &&
      matchesOptionalConstraint(this.state.repositoryFullNames, request.repositoryFullName)
    );
  }

  toState(): DeployTokenScopeState {
    return {
      deploymentTargetIds: [...this.state.deploymentTargetIds],
      environmentIds: [...this.state.environmentIds],
      projectIds: [...this.state.projectIds],
      repositoryFullNames: [...this.state.repositoryFullNames],
      resourceIds: [...this.state.resourceIds],
      workflowCommands: [...this.state.workflowCommands],
    };
  }
}

export interface DeployTokenState {
  id: DeployTokenId;
  organizationId: OrganizationId;
  displayName: DisplayNameText;
  verifierDigest: DeployTokenVerifierDigest;
  secretSuffix: DeployTokenSecretSuffix;
  scope: DeployTokenScope;
  status: DeployTokenStatusValue;
  createdAt: CreatedAt;
  expiresAt?: ExpiresAt;
  lastUsedAt?: LastUsedAt;
  rotatedAt?: RotatedAt;
  revokedAt?: RevokedAt;
}

export interface DeployTokenVisitor<TContext, TResult> {
  visitDeployToken(deployToken: DeployToken, context: TContext): TResult;
}

export class DeployToken extends AggregateRoot<DeployTokenState> {
  private constructor(state: DeployTokenState) {
    super(state);
  }

  static create(
    input: Omit<DeployTokenState, "lastUsedAt" | "revokedAt" | "rotatedAt" | "status">,
  ): Result<DeployToken> {
    const deployToken = new DeployToken({
      ...input,
      status: DeployTokenStatusValue.active(),
    });
    deployToken.recordDomainEvent("deploy_token.created", input.createdAt, {
      organizationId: input.organizationId.value,
      displayName: input.displayName.value,
      secretSuffix: input.secretSuffix.value,
    });
    return ok(deployToken);
  }

  static rehydrate(state: DeployTokenState): DeployToken {
    return new DeployToken({
      ...state,
      scope: DeployTokenScope.rehydrate(state.scope.toState()),
    });
  }

  accept<TContext, TResult>(
    visitor: DeployTokenVisitor<TContext, TResult>,
    context: TContext,
  ): TResult {
    return visitor.visitDeployToken(this, context);
  }

  matchesVerifierDigest(verifierDigest: DeployTokenVerifierDigest): boolean {
    return this.state.verifierDigest.equals(verifierDigest);
  }

  isRevoked(): boolean {
    return this.state.status.isRevoked();
  }

  isExpiredAt(now: CreatedAt): boolean {
    return this.state.expiresAt !== undefined && this.state.expiresAt.toDate() <= now.toDate();
  }

  canAuthorizeAt(now: CreatedAt): boolean {
    return this.state.status.isActive() && !this.isExpiredAt(now);
  }

  authorizesScope(request: DeployTokenAuthorizationScopeRequest): boolean {
    return this.state.scope.authorizes(request);
  }

  rotate(input: {
    verifierDigest: DeployTokenVerifierDigest;
    secretSuffix: DeployTokenSecretSuffix;
    rotatedAt: RotatedAt;
  }): Result<void> {
    if (this.state.status.isRevoked()) {
      return err(deployTokenRotationBlocked(this.state.id));
    }

    this.state.verifierDigest = input.verifierDigest;
    this.state.secretSuffix = input.secretSuffix;
    this.state.rotatedAt = input.rotatedAt;
    this.recordDomainEvent("deploy_token.rotated", input.rotatedAt, {
      organizationId: this.state.organizationId.value,
      secretSuffix: input.secretSuffix.value,
    });
    return ok(undefined);
  }

  revoke(input: { revokedAt: RevokedAt }): Result<{ changed: boolean }> {
    if (this.state.status.isRevoked()) {
      return ok({ changed: false });
    }

    this.state.status = this.state.status.revoke();
    this.state.revokedAt = input.revokedAt;
    this.recordDomainEvent("deploy_token.revoked", input.revokedAt, {
      organizationId: this.state.organizationId.value,
      secretSuffix: this.state.secretSuffix.value,
    });
    return ok({ changed: true });
  }

  markUsed(lastUsedAt: LastUsedAt): Result<void> {
    if (this.state.status.isRevoked()) {
      return err(deployTokenUseBlocked(this.state.id, "revoked"));
    }

    this.state.lastUsedAt = lastUsedAt;
    return ok(undefined);
  }

  toState(): DeployTokenState {
    return {
      ...this.state,
      scope: DeployTokenScope.rehydrate(this.state.scope.toState()),
    };
  }
}

function deployTokenRotationBlocked(id: DeployTokenId): DomainError {
  return {
    code: "deploy_token_rotation_blocked",
    category: "user",
    message: "Revoked deploy tokens cannot be rotated",
    retryable: false,
    details: {
      phase: "deploy-token-rotation",
      tokenId: id.value,
    },
  };
}

function deployTokenUseBlocked(id: DeployTokenId, relatedState: string): DomainError {
  return {
    code: "action_auth_invalid",
    category: "user",
    message: "Deploy token cannot authenticate Action requests",
    retryable: false,
    details: {
      phase: "action-authentication",
      reasonCode: relatedState,
      tokenId: id.value,
    },
  };
}

function matchesOptionalConstraint<TValue extends ScalarValueObject<string>>(
  allowedValues: readonly TValue[],
  requestedValue: TValue | undefined,
): boolean {
  return allowedValues.length === 0 || requestedValue === undefined
    ? allowedValues.length === 0
    : containsValue(allowedValues, requestedValue);
}

function containsValue<TValue extends ScalarValueObject<string>>(
  values: readonly TValue[],
  value: TValue,
): boolean {
  return values.some((candidate) => candidate.equals(value));
}

function uniqueValues<TValue extends ScalarValueObject<string>>(
  values: readonly TValue[],
): readonly TValue[] {
  return values.filter(
    (value, index) => values.findIndex((candidate) => candidate.equals(value)) === index,
  );
}
