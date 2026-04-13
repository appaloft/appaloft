import { AggregateRoot } from "../shared/entity";
import { type DeploymentTargetId } from "../shared/identifiers";
import { type PortNumber } from "../shared/numeric-values";
import { ok, type Result } from "../shared/result";
import { type DeploymentTargetCredentialKindValue, TargetKindValue } from "../shared/state-machine";
import { type CreatedAt, type UpdatedAt } from "../shared/temporal";
import {
  type DeploymentTargetName,
  type DeploymentTargetUsername,
  type HostAddress,
  type ProviderKey,
  type SshPrivateKeyText,
  type SshPublicKeyText,
} from "../shared/text-values";

export interface DeploymentTargetCredentialState {
  kind: DeploymentTargetCredentialKindValue;
  username?: DeploymentTargetUsername;
  publicKey?: SshPublicKeyText;
  privateKey?: SshPrivateKeyText;
}

export interface DeploymentTargetState {
  id: DeploymentTargetId;
  name: DeploymentTargetName;
  host: HostAddress;
  port: PortNumber;
  providerKey: ProviderKey;
  targetKind: TargetKindValue;
  credential?: DeploymentTargetCredentialState;
  createdAt: CreatedAt;
}

export interface DeploymentTargetVisitor<TContext, TResult> {
  visitDeploymentTarget(target: DeploymentTarget, context: TContext): TResult;
}

export class DeploymentTarget extends AggregateRoot<DeploymentTargetState> {
  private constructor(state: DeploymentTargetState) {
    super(state);
  }

  static register(input: {
    id: DeploymentTargetId;
    name: DeploymentTargetName;
    host: HostAddress;
    port: PortNumber;
    providerKey: ProviderKey;
    targetKind?: TargetKindValue;
    createdAt: CreatedAt;
  }): Result<DeploymentTarget> {
    const deploymentTarget = new DeploymentTarget({
      id: input.id,
      name: input.name,
      host: input.host,
      port: input.port,
      providerKey: input.providerKey,
      targetKind: input.targetKind ?? TargetKindValue.rehydrate("single-server"),
      createdAt: input.createdAt,
    });

    deploymentTarget.recordDomainEvent("deployment_target.registered", input.createdAt, {
      providerKey: input.providerKey.value,
    });

    return ok(deploymentTarget);
  }

  configureCredential(input: {
    credential: DeploymentTargetCredentialState;
    configuredAt: UpdatedAt;
  }): Result<void> {
    this.state.credential = input.credential;
    this.recordDomainEvent("deployment_target.credential_configured", input.configuredAt, {
      kind: input.credential.kind.value,
      usernameConfigured: Boolean(input.credential.username),
      publicKeyConfigured: Boolean(input.credential.publicKey),
      privateKeyConfigured: Boolean(input.credential.privateKey),
    });

    return ok(undefined);
  }

  static rehydrate(state: DeploymentTargetState): DeploymentTarget {
    return new DeploymentTarget(state);
  }

  accept<TContext, TResult>(
    visitor: DeploymentTargetVisitor<TContext, TResult>,
    context: TContext,
  ): TResult {
    return visitor.visitDeploymentTarget(this, context);
  }

  toState(): DeploymentTargetState {
    return { ...this.state };
  }
}

export type ServerState = DeploymentTargetState;
export { DeploymentTarget as Server };
