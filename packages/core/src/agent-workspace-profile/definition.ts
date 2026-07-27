import { AggregateRoot } from "../shared/entity";
import { ok, type Result } from "../shared/result";
import { type CreatedAt } from "../shared/temporal";
import {
  type AgentWorkspaceProfileCanonicalManifest,
  type AgentWorkspaceProfileDefinitionDigest,
  type AgentWorkspaceProfileDisplayName,
  type AgentWorkspaceProfileId,
  type AgentWorkspaceProfileVersion,
} from "./values";

export interface AgentWorkspaceProfileDefinitionState {
  id: AgentWorkspaceProfileDefinitionDigest;
  profileId: AgentWorkspaceProfileId;
  profileVersion: AgentWorkspaceProfileVersion;
  displayName: AgentWorkspaceProfileDisplayName;
  canonicalManifest: AgentWorkspaceProfileCanonicalManifest;
  registeredAt: CreatedAt;
}

export class AgentWorkspaceProfileDefinition extends AggregateRoot<
  AgentWorkspaceProfileDefinitionState,
  AgentWorkspaceProfileDefinitionDigest
> {
  private constructor(state: AgentWorkspaceProfileDefinitionState) {
    super(state);
  }

  static register(
    state: AgentWorkspaceProfileDefinitionState,
  ): Result<AgentWorkspaceProfileDefinition> {
    return ok(new AgentWorkspaceProfileDefinition(state));
  }

  static rehydrate(state: AgentWorkspaceProfileDefinitionState): AgentWorkspaceProfileDefinition {
    return new AgentWorkspaceProfileDefinition(state);
  }

  matchesCanonicalManifest(manifest: AgentWorkspaceProfileCanonicalManifest): boolean {
    return this.state.canonicalManifest.equals(manifest);
  }

  toState(): AgentWorkspaceProfileDefinitionState {
    return { ...this.state };
  }
}
