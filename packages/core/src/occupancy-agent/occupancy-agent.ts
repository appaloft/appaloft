import { SandboxDisplayName } from "../execution-sandbox/display-name";
import { type SandboxId } from "../execution-sandbox/values";
import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import { type CreatedAt, type UpdatedAt } from "../shared/temporal";
import { OccupancyAgentId, OccupancyAgentStatus } from "./values";

export interface OccupancyAgentKey {
  readonly tenantId: string;
  readonly subjectId: string;
  readonly projectId: string;
  readonly repositoryIdentity: string;
  readonly branch: string;
}

export interface OccupancyAgentState {
  readonly id: OccupancyAgentId;
  readonly name: SandboxDisplayName;
  readonly tenantId: string;
  readonly subjectId: string;
  readonly projectId: string;
  readonly repositoryIdentity: string;
  readonly branch: string;
  sandboxId: SandboxId;
  status: OccupancyAgentStatus;
  readonly createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export class OccupancyAgent extends AggregateRoot<OccupancyAgentState, OccupancyAgentId> {
  private constructor(state: OccupancyAgentState) {
    super(state);
  }

  static create(input: {
    readonly id: OccupancyAgentId;
    readonly name: SandboxDisplayName;
    readonly key: OccupancyAgentKey;
    readonly sandboxId: SandboxId;
    readonly createdAt: CreatedAt;
    readonly updatedAt: UpdatedAt;
  }): Result<OccupancyAgent> {
    if (!input.key.tenantId.trim() || !input.key.subjectId.trim() || !input.key.projectId.trim()) {
      return err(
        domainError.validation("Occupancy Agent key is incomplete", {
          phase: "occupancy-agent",
          field: "key",
        }),
      );
    }
    const agent = new OccupancyAgent({
      id: input.id,
      name: input.name,
      tenantId: input.key.tenantId,
      subjectId: input.key.subjectId,
      projectId: input.key.projectId,
      repositoryIdentity: input.key.repositoryIdentity,
      branch: input.key.branch,
      sandboxId: input.sandboxId,
      status: OccupancyAgentStatus.active(),
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    });
    agent.recordDomainEvent("occupancy-agent-created", input.createdAt, {
      sandboxId: input.sandboxId.value,
      name: input.name.value,
      projectId: input.key.projectId,
      repositoryIdentity: input.key.repositoryIdentity,
    });
    return ok(agent);
  }

  static rehydrate(state: OccupancyAgentState): OccupancyAgent {
    return new OccupancyAgent(state);
  }

  toState(): OccupancyAgentState {
    return { ...this.state };
  }

  displayName(): SandboxDisplayName {
    return this.state.name;
  }

  sandboxId(): SandboxId {
    return this.state.sandboxId;
  }

  key(): OccupancyAgentKey {
    return {
      tenantId: this.state.tenantId,
      subjectId: this.state.subjectId,
      projectId: this.state.projectId,
      repositoryIdentity: this.state.repositoryIdentity,
      branch: this.state.branch,
    };
  }

  retarget(input: { readonly sandboxId: SandboxId; readonly at: UpdatedAt }): Result<void> {
    if (!this.state.status.isActive) {
      return err(
        domainError.conflict("Retired Occupancy Agent cannot retarget a Sandbox", {
          phase: "occupancy-agent",
          code: "occupancy_agent_retired",
        }),
      );
    }
    if (this.state.sandboxId.value === input.sandboxId.value) return ok(undefined);
    this.state.sandboxId = input.sandboxId;
    this.state.updatedAt = input.at;
    this.recordDomainEvent("occupancy-agent-retargeted", input.at, {
      sandboxId: input.sandboxId.value,
    });
    return ok(undefined);
  }

  retire(input: { readonly at: UpdatedAt }): Result<void> {
    if (!this.state.status.isActive) return ok(undefined);
    this.state.status = OccupancyAgentStatus.retired();
    this.state.updatedAt = input.at;
    this.recordDomainEvent("occupancy-agent-retired", input.at, {
      sandboxId: this.state.sandboxId.value,
    });
    return ok(undefined);
  }
}
