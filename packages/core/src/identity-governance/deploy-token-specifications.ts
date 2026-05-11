import { type DeployTokenId } from "../shared/identifiers";
import { type CreatedAt } from "../shared/temporal";
import {
  type DeployToken,
  type DeployTokenState,
  type DeployTokenVerifierDigest,
} from "./deploy-token";

export interface DeployTokenSelectionSpecVisitor<TResult> {
  visitDeployTokenById(query: TResult, spec: DeployTokenByIdSpec): TResult;
  visitActiveDeployTokenByVerifierDigest(
    query: TResult,
    spec: ActiveDeployTokenByVerifierDigestSpec,
  ): TResult;
}

export interface DeployTokenMutationSpecVisitor<TResult> {
  visitUpsertDeployToken(spec: UpsertDeployTokenSpec): TResult;
  visitRotateDeployToken(spec: RotateDeployTokenSpec): TResult;
  visitRevokeDeployToken(spec: RevokeDeployTokenSpec): TResult;
  visitMarkDeployTokenUsed(spec: MarkDeployTokenUsedSpec): TResult;
}

export interface DeployTokenSelectionSpec {
  accept<TResult>(query: TResult, visitor: DeployTokenSelectionSpecVisitor<TResult>): TResult;
}

export interface DeployTokenMutationSpec {
  accept<TResult>(visitor: DeployTokenMutationSpecVisitor<TResult>): TResult;
}

export class DeployTokenByIdSpec implements DeployTokenSelectionSpec {
  private constructor(public readonly id: DeployTokenId) {}

  static create(id: DeployTokenId): DeployTokenByIdSpec {
    return new DeployTokenByIdSpec(id);
  }

  accept<TResult>(query: TResult, visitor: DeployTokenSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitDeployTokenById(query, this);
  }
}

export class ActiveDeployTokenByVerifierDigestSpec implements DeployTokenSelectionSpec {
  private constructor(
    public readonly verifierDigest: DeployTokenVerifierDigest,
    public readonly at: CreatedAt,
  ) {}

  static create(
    verifierDigest: DeployTokenVerifierDigest,
    at: CreatedAt,
  ): ActiveDeployTokenByVerifierDigestSpec {
    return new ActiveDeployTokenByVerifierDigestSpec(verifierDigest, at);
  }

  accept<TResult>(query: TResult, visitor: DeployTokenSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitActiveDeployTokenByVerifierDigest(query, this);
  }
}

abstract class BaseDeployTokenMutationSpec implements DeployTokenMutationSpec {
  protected constructor(public readonly state: DeployTokenState) {}

  accept<TResult>(visitor: DeployTokenMutationSpecVisitor<TResult>): TResult {
    return this.visit(visitor);
  }

  protected abstract visit<TResult>(visitor: DeployTokenMutationSpecVisitor<TResult>): TResult;
}

export class UpsertDeployTokenSpec extends BaseDeployTokenMutationSpec {
  static fromDeployToken(deployToken: DeployToken): UpsertDeployTokenSpec {
    return new UpsertDeployTokenSpec(deployToken.toState());
  }

  protected visit<TResult>(visitor: DeployTokenMutationSpecVisitor<TResult>): TResult {
    return visitor.visitUpsertDeployToken(this);
  }
}

export class RotateDeployTokenSpec extends BaseDeployTokenMutationSpec {
  static fromDeployToken(deployToken: DeployToken): RotateDeployTokenSpec {
    return new RotateDeployTokenSpec(deployToken.toState());
  }

  protected visit<TResult>(visitor: DeployTokenMutationSpecVisitor<TResult>): TResult {
    return visitor.visitRotateDeployToken(this);
  }
}

export class RevokeDeployTokenSpec extends BaseDeployTokenMutationSpec {
  static fromDeployToken(deployToken: DeployToken): RevokeDeployTokenSpec {
    return new RevokeDeployTokenSpec(deployToken.toState());
  }

  protected visit<TResult>(visitor: DeployTokenMutationSpecVisitor<TResult>): TResult {
    return visitor.visitRevokeDeployToken(this);
  }
}

export class MarkDeployTokenUsedSpec extends BaseDeployTokenMutationSpec {
  static fromDeployToken(deployToken: DeployToken): MarkDeployTokenUsedSpec {
    return new MarkDeployTokenUsedSpec(deployToken.toState());
  }

  protected visit<TResult>(visitor: DeployTokenMutationSpecVisitor<TResult>): TResult {
    return visitor.visitMarkDeployTokenUsed(this);
  }
}
