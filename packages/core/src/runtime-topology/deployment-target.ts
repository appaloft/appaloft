import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import { type DeploymentTargetId, type SshCredentialId } from "../shared/identifiers";
import { type PortNumber } from "../shared/numeric-values";
import { err, ok, type Result } from "../shared/result";
import {
  type DeploymentTargetCredentialKindValue,
  DeploymentTargetLifecycleStatusValue,
  EdgeProxyKindValue,
  EdgeProxyStatusValue,
  TargetKindValue,
} from "../shared/state-machine";
import {
  type CreatedAt,
  type DeactivatedAt,
  type DeletedAt,
  type UpdatedAt,
} from "../shared/temporal";
import {
  type DeactivationReason,
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
  lifecycleStatus: DeploymentTargetLifecycleStatusValue;
  deactivatedAt?: DeactivatedAt;
  deletedAt?: DeletedAt;
  deactivationReason?: DeactivationReason;
  credential?: DeploymentTargetCredentialState;
  edgeProxy?: DeploymentTargetEdgeProxyState;
  createdAt: CreatedAt;
}

export type DeploymentTargetRehydrateState = Omit<
  DeploymentTargetState,
  "deactivatedAt" | "deletedAt" | "deactivationReason" | "lifecycleStatus"
> &
  Partial<
    Pick<
      DeploymentTargetState,
      "deactivatedAt" | "deletedAt" | "deactivationReason" | "lifecycleStatus"
    >
  >;

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
      lifecycleStatus: DeploymentTargetLifecycleStatusValue.active(),
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

  deactivate(input: {
    deactivatedAt: DeactivatedAt;
    reason?: DeactivationReason;
  }): Result<{ changed: boolean }> {
    if (this.state.lifecycleStatus.isInactive()) {
      return ok({ changed: false });
    }

    const lifecycleStatus = this.state.lifecycleStatus.deactivate();
    if (lifecycleStatus.isErr()) {
      return lifecycleStatus.map(() => ({ changed: false }));
    }

    this.state.lifecycleStatus = lifecycleStatus.value;
    this.state.deactivatedAt = input.deactivatedAt;
    if (input.reason) {
      this.state.deactivationReason = input.reason;
    } else {
      delete this.state.deactivationReason;
    }

    this.recordDomainEvent("server-deactivated", input.deactivatedAt, {
      serverId: this.state.id.value,
      deactivatedAt: input.deactivatedAt.value,
      ...(input.reason ? { reason: input.reason.value } : {}),
    });

    return ok({ changed: true });
  }

  rename(input: {
    name: DeploymentTargetName;
    renamedAt: UpdatedAt;
  }): Result<{ changed: boolean }> {
    if (this.state.lifecycleStatus.isDeleted()) {
      return err(
        domainError.invariant("Deleted deployment targets cannot be renamed", {
          phase: "server-lifecycle-guard",
          serverId: this.state.id.value,
          lifecycleStatus: this.state.lifecycleStatus.value,
        }),
      );
    }

    if (this.state.name.equals(input.name)) {
      return ok({ changed: false });
    }

    const previousName = this.state.name;
    this.state.name = input.name;

    this.recordDomainEvent("server-renamed", input.renamedAt, {
      serverId: this.state.id.value,
      previousName: previousName.value,
      name: input.name.value,
      renamedAt: input.renamedAt.value,
    });

    return ok({ changed: true });
  }

  configureEdgeProxy(input: { kind: EdgeProxyKindValue; configuredAt: UpdatedAt }): Result<{
    changed: boolean;
    edgeProxy: DeploymentTargetEdgeProxyState;
  }> {
    const lifecycleGuard = this.ensureCanAcceptNewWork("servers.configure-edge-proxy");
    if (lifecycleGuard.isErr()) {
      return err(lifecycleGuard.error);
    }

    const currentEdgeProxy = this.state.edgeProxy ?? {
      kind: EdgeProxyKindValue.rehydrate("none"),
      status: EdgeProxyStatusValue.initialForKind(EdgeProxyKindValue.rehydrate("none")),
    };

    if (currentEdgeProxy.kind.equals(input.kind)) {
      return ok({ changed: false, edgeProxy: currentEdgeProxy });
    }

    const nextEdgeProxy = {
      kind: input.kind,
      status: EdgeProxyStatusValue.initialForKind(input.kind),
    };
    this.state.edgeProxy = nextEdgeProxy;

    this.recordDomainEvent("server-edge-proxy-configured", input.configuredAt, {
      serverId: this.state.id.value,
      previousKind: currentEdgeProxy.kind.value,
      previousStatus: currentEdgeProxy.status.value,
      kind: nextEdgeProxy.kind.value,
      status: nextEdgeProxy.status.value,
      configuredAt: input.configuredAt.value,
    });

    return ok({ changed: true, edgeProxy: nextEdgeProxy });
  }

  delete(input: { deletedAt: DeletedAt }): Result<{ changed: boolean }> {
    if (this.state.lifecycleStatus.isDeleted()) {
      return ok({ changed: false });
    }

    if (this.state.lifecycleStatus.isActive()) {
      return err(
        domainError.serverDeleteBlocked("Active servers must be deactivated before deletion", {
          phase: "server-lifecycle-guard",
          serverId: this.state.id.value,
          lifecycleStatus: "active",
          deletionBlockers: ["active-server"],
        }),
      );
    }

    const lifecycleStatus = this.state.lifecycleStatus.delete();
    if (lifecycleStatus.isErr()) {
      return err(lifecycleStatus.error);
    }

    this.state.lifecycleStatus = lifecycleStatus.value;
    this.state.deletedAt = input.deletedAt;

    this.recordDomainEvent("server-deleted", input.deletedAt, {
      serverId: this.state.id.value,
      serverName: this.state.name.value,
      providerKey: this.state.providerKey.value,
      deletedAt: input.deletedAt.value,
    });

    return ok({ changed: true });
  }

  ensureCanAcceptNewWork(commandName: string): Result<void> {
    if (!this.state.lifecycleStatus.isActive()) {
      return err(
        domainError.serverInactive("Inactive servers cannot accept new work", {
          commandName,
          phase: "server-lifecycle-guard",
          serverId: this.state.id.value,
          lifecycleStatus: this.state.lifecycleStatus.value,
          ...(this.state.deactivatedAt ? { deactivatedAt: this.state.deactivatedAt.value } : {}),
        }),
      );
    }

    return ok(undefined);
  }

  beginEdgeProxyBootstrap(input: { attemptedAt: UpdatedAt }): Result<void> {
    const lifecycleGuard = this.ensureCanAcceptNewWork("servers.bootstrap-proxy");
    if (lifecycleGuard.isErr()) {
      return lifecycleGuard;
    }

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

  static rehydrate(state: DeploymentTargetRehydrateState): DeploymentTarget {
    return new DeploymentTarget({
      ...state,
      lifecycleStatus: state.lifecycleStatus ?? DeploymentTargetLifecycleStatusValue.active(),
    });
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
