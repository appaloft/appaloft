import { AggregateRoot } from "../shared/entity";
import { ok, type Result } from "../shared/result";
import { type CreatedAt } from "../shared/temporal";
import {
  type AgentAdapterCanonicalManifest,
  type AgentAdapterDefinitionDigest,
  type AgentAdapterDisplayName,
  type AgentAdapterId,
  type AgentAdapterVersion,
} from "./values";

export interface AgentAdapterDefinitionState {
  id: AgentAdapterDefinitionDigest;
  adapterId: AgentAdapterId;
  adapterVersion: AgentAdapterVersion;
  displayName: AgentAdapterDisplayName;
  canonicalManifest: AgentAdapterCanonicalManifest;
  registeredAt: CreatedAt;
}

export class AgentAdapterDefinition extends AggregateRoot<
  AgentAdapterDefinitionState,
  AgentAdapterDefinitionDigest
> {
  private constructor(state: AgentAdapterDefinitionState) {
    super(state);
  }

  static register(state: AgentAdapterDefinitionState): Result<AgentAdapterDefinition> {
    return ok(new AgentAdapterDefinition(state));
  }

  static rehydrate(state: AgentAdapterDefinitionState): AgentAdapterDefinition {
    return new AgentAdapterDefinition(state);
  }

  matchesCanonicalManifest(canonicalManifest: AgentAdapterCanonicalManifest): boolean {
    return this.state.canonicalManifest.equals(canonicalManifest);
  }

  toState(): AgentAdapterDefinitionState {
    return { ...this.state };
  }
}
