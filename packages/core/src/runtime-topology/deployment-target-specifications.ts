import { type DeploymentTargetId } from "../shared/identifiers";
import { type HostAddress, type ProviderKey } from "../shared/text-values";
import { type DeploymentTarget, type DeploymentTargetState } from "./deployment-target";

export interface DeploymentTargetSelectionSpecVisitor<TResult> {
  visitDeploymentTargetById(query: TResult, spec: DeploymentTargetByIdSpec): TResult;
  visitDeploymentTargetByProviderAndHost(
    query: TResult,
    spec: DeploymentTargetByProviderAndHostSpec,
  ): TResult;
}

export interface DeploymentTargetMutationSpecVisitor<TResult> {
  visitUpsertDeploymentTarget(spec: UpsertDeploymentTargetSpec): TResult;
}

export interface DeploymentTargetSelectionSpec {
  accept<TResult>(query: TResult, visitor: DeploymentTargetSelectionSpecVisitor<TResult>): TResult;
}

export interface DeploymentTargetMutationSpec {
  accept<TResult>(visitor: DeploymentTargetMutationSpecVisitor<TResult>): TResult;
}

export class DeploymentTargetByIdSpec implements DeploymentTargetSelectionSpec {
  private constructor(public readonly id: DeploymentTargetId) {}

  static create(id: DeploymentTargetId): DeploymentTargetByIdSpec {
    return new DeploymentTargetByIdSpec(id);
  }

  accept<TResult>(query: TResult, visitor: DeploymentTargetSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitDeploymentTargetById(query, this);
  }
}

export class DeploymentTargetByProviderAndHostSpec implements DeploymentTargetSelectionSpec {
  private constructor(
    public readonly providerKey: ProviderKey,
    public readonly host: HostAddress,
  ) {}

  static create(
    providerKey: ProviderKey,
    host: HostAddress,
  ): DeploymentTargetByProviderAndHostSpec {
    return new DeploymentTargetByProviderAndHostSpec(providerKey, host);
  }

  accept<TResult>(query: TResult, visitor: DeploymentTargetSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitDeploymentTargetByProviderAndHost(query, this);
  }
}

export class UpsertDeploymentTargetSpec implements DeploymentTargetMutationSpec {
  private constructor(public readonly state: DeploymentTargetState) {}

  static fromDeploymentTarget(deploymentTarget: DeploymentTarget): UpsertDeploymentTargetSpec {
    return new UpsertDeploymentTargetSpec(deploymentTarget.toState());
  }

  static fromServer(deploymentTarget: DeploymentTarget): UpsertDeploymentTargetSpec {
    return UpsertDeploymentTargetSpec.fromDeploymentTarget(deploymentTarget);
  }

  accept<TResult>(visitor: DeploymentTargetMutationSpecVisitor<TResult>): TResult {
    return visitor.visitUpsertDeploymentTarget(this);
  }
}

export type ServerSelectionSpecVisitor<TResult> = DeploymentTargetSelectionSpecVisitor<TResult>;
export type ServerMutationSpecVisitor<TResult> = DeploymentTargetMutationSpecVisitor<TResult>;
export type ServerSelectionSpec = DeploymentTargetSelectionSpec;
export type ServerMutationSpec = DeploymentTargetMutationSpec;
export {
  DeploymentTargetByIdSpec as ServerByIdSpec,
  UpsertDeploymentTargetSpec as UpsertServerSpec,
};
