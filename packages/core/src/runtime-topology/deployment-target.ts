import { AggregateRoot } from "../shared/entity";
import { type DeploymentTargetId, type SshCredentialId } from "../shared/identifiers";
import { type PortNumber } from "../shared/numeric-values";
import { ok, type Result } from "../shared/result";
import {
  type DeploymentTargetCredentialKindValue,
  type EdgeProxyKindValue,
  EdgeProxyStatusValue,
  TargetKindValue,
} from "../shared/state-machine";
import { type CreatedAt, type UpdatedAt } from "../shared/temporal";
import {
  type DeploymentTargetName,
  type DeploymentTargetUsername,
  type ErrorCodeText,
  type HostAddress,
  type MessageText,
  type ProviderKey,
  type SshPrivateKeyText,
  type SshPublicKeyText,
} from "../shared/text-values";

export interface DeploymentTargetCredentialState {
  kind: DeploymentTargetCredentialKindValue;
  credentialId?: SshCredentialId;
  username?: DeploymentTargetUsername;
  publicKey?: SshPublicKeyText;
  privateKey?: SshPrivateKeyText;
}

export interface DeploymentTargetEdgeProxyState {
  kind: EdgeProxyKindValue;
  status: EdgeProxyStatusValue;
  lastAttemptAt?: UpdatedAt;
  lastSucceededAt?: UpdatedAt;
  lastErrorCode?: ErrorCodeText;
  lastErrorMessage?: MessageText;
}

export interface DeploymentTargetState {
  id: DeploymentTargetId;
  name: DeploymentTargetName;
  host: HostAddress;
  port: PortNumber;
  providerKey: ProviderKey;
  targetKind: TargetKindValue;
  credential?: DeploymentTargetCredentialState;
  edgeProxy?: DeploymentTargetEdgeProxyState;
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
    edgeProxyKind?: EdgeProxyKindValue;
    createdAt: CreatedAt;
  }): Result<DeploymentTarget> {
    const edgeProxyKind = input.edgeProxyKind;
    const deploymentTarget = new DeploymentTarget({
      id: input.id,
      name: input.name,
      host: input.host,
      port: input.port,
      providerKey: input.providerKey,
      targetKind: input.targetKind ?? TargetKindValue.rehydrate("single-server"),
      ...(edgeProxyKind
        ? {
            edgeProxy: {
              kind: edgeProxyKind,
              status: EdgeProxyStatusValue.initialForKind(edgeProxyKind),
            },
          }
        : {}),
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
      credentialReferenceConfigured: Boolean(input.credential.credentialId),
    });

    return ok(undefined);
  }

  beginEdgeProxyBootstrap(input: { attemptedAt: UpdatedAt }): Result<void> {
    const edgeProxy = this.state.edgeProxy;
    if (!edgeProxy) {
      return ok(undefined);
    }

    const status = edgeProxy.status.beginBootstrap(edgeProxy.kind);
    if (status.isErr()) {
      return status.map(() => undefined);
    }

    this.state.edgeProxy = {
      kind: edgeProxy.kind,
      status: status.value,
      lastAttemptAt: input.attemptedAt,
    };
    this.recordDomainEvent("deployment_target.edge_proxy_bootstrap_started", input.attemptedAt, {
      proxyKind: edgeProxy.kind.value,
    });

    return ok(undefined);
  }

  markEdgeProxyReady(input: { completedAt: UpdatedAt }): Result<void> {
    const edgeProxy = this.state.edgeProxy;
    if (!edgeProxy) {
      return ok(undefined);
    }

    const status = edgeProxy.status.markReady();
    if (status.isErr()) {
      return status.map(() => undefined);
    }

    this.state.edgeProxy = {
      kind: edgeProxy.kind,
      status: status.value,
      ...(edgeProxy.lastAttemptAt ? { lastAttemptAt: edgeProxy.lastAttemptAt } : {}),
      lastSucceededAt: input.completedAt,
    };
    this.recordDomainEvent("deployment_target.edge_proxy_bootstrap_succeeded", input.completedAt, {
      proxyKind: edgeProxy.kind.value,
    });

    return ok(undefined);
  }

  markEdgeProxyFailed(input: {
    failedAt: UpdatedAt;
    errorCode: ErrorCodeText;
    errorMessage: MessageText;
  }): Result<void> {
    const edgeProxy = this.state.edgeProxy;
    if (!edgeProxy) {
      return ok(undefined);
    }

    const status = edgeProxy.status.markFailed();
    if (status.isErr()) {
      return status.map(() => undefined);
    }

    this.state.edgeProxy = {
      kind: edgeProxy.kind,
      status: status.value,
      ...(edgeProxy.lastAttemptAt ? { lastAttemptAt: edgeProxy.lastAttemptAt } : {}),
      ...(edgeProxy.lastSucceededAt ? { lastSucceededAt: edgeProxy.lastSucceededAt } : {}),
      lastErrorCode: input.errorCode,
      lastErrorMessage: input.errorMessage,
    };
    this.recordDomainEvent("deployment_target.edge_proxy_bootstrap_failed", input.failedAt, {
      proxyKind: edgeProxy.kind.value,
      errorCode: input.errorCode.value,
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
