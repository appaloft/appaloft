import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import { type CreatedAt, type UpdatedAt } from "../shared/temporal";
import {
  type ActiveAgentWorkspaceReferenceCount,
  type AgentAdapterDefinitionDigest,
  type AgentAdapterId,
  type AgentAdapterInstallationId,
  AgentAdapterInstallationRevision,
  AgentAdapterInstallationStatus,
  type AgentAdapterVersion,
} from "./values";

export interface AgentAdapterInstallationState {
  id: AgentAdapterInstallationId;
  definitionDigest: AgentAdapterDefinitionDigest;
  adapterId: AgentAdapterId;
  adapterVersion: AgentAdapterVersion;
  status: AgentAdapterInstallationStatus;
  revision: AgentAdapterInstallationRevision;
  installedAt: CreatedAt;
  updatedAt?: UpdatedAt;
}

export class AgentAdapterInstallation extends AggregateRoot<
  AgentAdapterInstallationState,
  AgentAdapterInstallationId
> {
  private constructor(state: AgentAdapterInstallationState) {
    super(state);
  }

  static install(
    input: Omit<AgentAdapterInstallationState, "revision" | "status">,
  ): Result<AgentAdapterInstallation> {
    const installation = new AgentAdapterInstallation({
      ...input,
      status: AgentAdapterInstallationStatus.enabled(),
      revision: AgentAdapterInstallationRevision.initial(),
    });
    installation.recordDomainEvent("agent_adapter_installation.installed", input.installedAt, {
      definitionDigest: input.definitionDigest.value,
      adapterId: input.adapterId.value,
      adapterVersion: input.adapterVersion.value,
    });
    return ok(installation);
  }

  static rehydrate(state: AgentAdapterInstallationState): AgentAdapterInstallation {
    return new AgentAdapterInstallation(state);
  }

  isEnabled(): boolean {
    return this.state.status.isEnabled();
  }

  assertAvailableForNewWorkspace(): Result<void> {
    if (!this.state.status.isEnabled()) {
      return err(
        domainError.conflict("Agent Adapter installation is disabled", {
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
    this.recordDomainEvent("agent_adapter_installation.disabled", at, {
      definitionDigest: this.state.definitionDigest.value,
    });
    return ok(undefined);
  }

  assertCanUninstall(activeReferences: ActiveAgentWorkspaceReferenceCount): Result<void> {
    if (activeReferences.hasActiveReferences()) {
      return err(
        domainError.conflict("Agent Adapter installation has active Workspace references", {
          installationId: this.id.value,
          activeWorkspaceReferences: activeReferences.value,
        }),
      );
    }
    return ok(undefined);
  }

  toState(): AgentAdapterInstallationState {
    return { ...this.state };
  }
}
