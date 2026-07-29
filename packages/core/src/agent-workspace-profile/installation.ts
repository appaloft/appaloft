import { type ActiveAgentWorkspaceReferenceCount } from "../agent-adapter";
import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import { type CreatedAt, type UpdatedAt } from "../shared/temporal";
import {
  type AgentWorkspaceProfileDefinitionDigest,
  type AgentWorkspaceProfileId,
  type AgentWorkspaceProfileInstallationId,
  AgentWorkspaceProfileInstallationRevision,
  AgentWorkspaceProfileInstallationStatus,
  type AgentWorkspaceProfileVersion,
} from "./values";

export interface AgentWorkspaceProfileInstallationState {
  id: AgentWorkspaceProfileInstallationId;
  definitionDigest: AgentWorkspaceProfileDefinitionDigest;
  profileId: AgentWorkspaceProfileId;
  profileVersion: AgentWorkspaceProfileVersion;
  status: AgentWorkspaceProfileInstallationStatus;
  revision: AgentWorkspaceProfileInstallationRevision;
  installedAt: CreatedAt;
  updatedAt?: UpdatedAt;
  credentialConnections: readonly AgentWorkspaceProfileCredentialConnection[];
}

export interface AgentWorkspaceProfileCredentialConnection {
  readonly requirementId: string;
  readonly connectionReference: string;
}

export class AgentWorkspaceProfileInstallation extends AggregateRoot<
  AgentWorkspaceProfileInstallationState,
  AgentWorkspaceProfileInstallationId
> {
  private constructor(state: AgentWorkspaceProfileInstallationState) {
    super(state);
  }

  static install(
    input: Omit<
      AgentWorkspaceProfileInstallationState,
      "credentialConnections" | "revision" | "status"
    >,
  ): Result<AgentWorkspaceProfileInstallation> {
    const installation = new AgentWorkspaceProfileInstallation({
      ...input,
      status: AgentWorkspaceProfileInstallationStatus.enabled(),
      revision: AgentWorkspaceProfileInstallationRevision.initial(),
      credentialConnections: [],
    });
    installation.recordDomainEvent(
      "agent_workspace_profile_installation.installed",
      input.installedAt,
      {
        definitionDigest: input.definitionDigest.value,
        profileId: input.profileId.value,
        profileVersion: input.profileVersion.value,
      },
    );
    return ok(installation);
  }

  static rehydrate(
    state: AgentWorkspaceProfileInstallationState,
  ): AgentWorkspaceProfileInstallation {
    return new AgentWorkspaceProfileInstallation({
      ...state,
      credentialConnections: [...(state.credentialConnections ?? [])],
    });
  }

  assertAvailableForNewWorkspace(): Result<void> {
    if (!this.state.status.isEnabled()) {
      return err(
        domainError.conflict("Agent Workspace Profile installation is disabled", {
          installationId: this.id.value,
        }),
      );
    }
    return ok(undefined);
  }

  disable(at: UpdatedAt): Result<void> {
    if (this.state.status.isDisabled()) return ok(undefined);
    this.state.status = this.state.status.disable();
    this.state.revision = this.state.revision.next();
    this.state.updatedAt = at;
    this.recordDomainEvent("agent_workspace_profile_installation.disabled", at, {
      definitionDigest: this.state.definitionDigest.value,
    });
    return ok(undefined);
  }

  configureCredentialConnections(
    connections: readonly AgentWorkspaceProfileCredentialConnection[],
    at: UpdatedAt,
  ): Result<{ changed: boolean }> {
    const normalized = [...connections]
      .map((connection) => ({
        requirementId: connection.requirementId.trim(),
        connectionReference: connection.connectionReference.trim(),
      }))
      .sort((left, right) => left.requirementId.localeCompare(right.requirementId));
    if (
      normalized.some(
        (connection, index) =>
          !/^[a-z][a-z0-9-]{0,62}$/u.test(connection.requirementId) ||
          !/^[A-Za-z][A-Za-z0-9_.:-]{0,159}$/u.test(connection.connectionReference) ||
          normalized[index - 1]?.requirementId === connection.requirementId,
      )
    ) {
      return err(
        domainError.validation("Agent Workspace Profile Credential Connections are invalid"),
      );
    }
    const current = [...this.state.credentialConnections].sort((left, right) =>
      left.requirementId.localeCompare(right.requirementId),
    );
    if (
      current.length === normalized.length &&
      current.every(
        (connection, index) =>
          connection.requirementId === normalized[index]?.requirementId &&
          connection.connectionReference === normalized[index]?.connectionReference,
      )
    ) {
      return ok({ changed: false });
    }
    this.state.credentialConnections = normalized;
    this.state.revision = this.state.revision.next();
    this.state.updatedAt = at;
    this.recordDomainEvent(
      "agent_workspace_profile_installation.credential_connections_configured",
      at,
      {
        requirementIds: normalized.map((connection) => connection.requirementId),
      },
    );
    return ok({ changed: true });
  }

  assertCanUninstall(activeReferences: ActiveAgentWorkspaceReferenceCount): Result<void> {
    if (activeReferences.hasActiveReferences()) {
      return err(
        domainError.conflict(
          "Agent Workspace Profile installation has active Workspace references",
          {
            installationId: this.id.value,
            activeWorkspaceReferences: activeReferences.value,
          },
        ),
      );
    }
    return ok(undefined);
  }

  toState(): AgentWorkspaceProfileInstallationState {
    return {
      ...this.state,
      credentialConnections: this.state.credentialConnections.map((connection) => ({
        ...connection,
      })),
    };
  }
}
