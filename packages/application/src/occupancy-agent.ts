import {
  CreatedAt,
  OccupancyAgent,
  OccupancyAgentId,
  type OccupancyAgentKey,
  SandboxDisplayName,
  SandboxId,
  UpdatedAt,
  err,
  ok,
  type Result,
} from "@appaloft/core";

export interface OccupancyAgentHandle {
  readonly agentId: string;
  readonly name: string;
  readonly sandboxId: string;
}

export interface OccupancyAgentOccupyInput extends OccupancyAgentKey {
  readonly sandboxId: string;
  readonly name: string;
  readonly forceNew?: boolean;
  readonly preferredAgentId?: string;
  readonly now: string;
}

export interface OccupancyAgentRepository {
  occupy(input: OccupancyAgentOccupyInput): Promise<Result<OccupancyAgentHandle>>;
  findActive(key: OccupancyAgentKey): Promise<OccupancyAgent | undefined>;
  save(agent: OccupancyAgent): Promise<Result<void>>;
}

function occupancyKey(input: OccupancyAgentKey): string {
  return [
    input.tenantId,
    input.subjectId,
    input.projectId,
    input.repositoryIdentity,
    input.branch,
  ].join("\0");
}

function nextOccupancyAgentId(next?: (prefix: string) => string): Result<OccupancyAgentId> {
  if (next) return OccupancyAgentId.generate(next);
  return OccupancyAgentId.create(`agt_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`);
}

export class InMemoryOccupancyAgentRepository implements OccupancyAgentRepository {
  private readonly agents = new Map<string, OccupancyAgent>();

  constructor(private readonly nextId?: (prefix: string) => string) {}

  async findActive(key: OccupancyAgentKey): Promise<OccupancyAgent | undefined> {
    const agent = this.agents.get(occupancyKey(key));
    return agent?.toState().status.isActive ? agent : undefined;
  }

  async save(agent: OccupancyAgent): Promise<Result<void>> {
    this.agents.set(occupancyKey(agent.key()), agent);
    return ok(undefined);
  }

  async occupy(input: OccupancyAgentOccupyInput): Promise<Result<OccupancyAgentHandle>> {
    const createdAt = CreatedAt.rehydrate(input.now);
    const updatedAt = UpdatedAt.rehydrate(input.now);
    const sandboxId = SandboxId.create(input.sandboxId);
    if (sandboxId.isErr()) return err(sandboxId.error);
    const name = SandboxDisplayName.create(input.name);
    if (name.isErr()) return err(name.error);

    const existing = await this.findActive(input);
    if (existing && !input.forceNew) {
      const retargeted = existing.retarget({ sandboxId: sandboxId.value, at: updatedAt });
      if (retargeted.isErr()) return err(retargeted.error);
      return ok({
        agentId: existing.id.value,
        name: existing.displayName().value,
        sandboxId: existing.sandboxId().value,
      });
    }
    if (existing && input.forceNew) {
      const retired = existing.retire({ at: updatedAt });
      if (retired.isErr()) return err(retired.error);
    }

    const id =
      input.preferredAgentId && !input.forceNew
        ? OccupancyAgentId.create(input.preferredAgentId)
        : nextOccupancyAgentId(this.nextId);
    if (id.isErr()) return err(id.error);
    const created = OccupancyAgent.create({
      id: id.value,

      name: name.value,
      key: input,
      sandboxId: sandboxId.value,
      createdAt,
      updatedAt,
    });
    if (created.isErr()) return err(created.error);
    const saved = await this.save(created.value);
    if (saved.isErr()) return err(saved.error);
    return ok({
      agentId: created.value.id.value,
      name: created.value.displayName().value,
      sandboxId: created.value.sandboxId().value,
    });
  }
}

export function occupancyAgentHandleFromState(agent: OccupancyAgent): OccupancyAgentHandle {
  return {
    agentId: agent.id.value,
    name: agent.displayName().value,
    sandboxId: agent.sandboxId().value,
  };
}

