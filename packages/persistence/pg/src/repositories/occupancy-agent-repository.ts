import {
  CreatedAt,
  OccupancyAgent,
  OccupancyAgentId,
  OccupancyAgentStatus,
  type OccupancyAgentKey,
  SandboxDisplayName,
  SandboxId,
  UpdatedAt,
  err,
  ok,
  type Result,
} from "@appaloft/core";
import { type Kysely } from "kysely";

import {
  type OccupancyAgentHandle,
  type OccupancyAgentOccupyInput,
  type OccupancyAgentRepository,
} from "@appaloft/application";

import { type Database } from "../schema";

type OccupancyAgentRow = {
  tenant_id: string;
  id: string;
  name: string;
  subject_id: string;
  project_id: string;
  repository_identity: string;
  branch: string;
  sandbox_id: string;
  status: string;
  created_at: string;
  updated_at: string;
};

function rehydrate(row: OccupancyAgentRow): OccupancyAgent {
  return OccupancyAgent.rehydrate({
    id: OccupancyAgentId.rehydrate(row.id),
    name: SandboxDisplayName.rehydrate(row.name),
    tenantId: row.tenant_id,
    subjectId: row.subject_id,
    projectId: row.project_id,
    repositoryIdentity: row.repository_identity,
    branch: row.branch,
    sandboxId: SandboxId.rehydrate(row.sandbox_id),
    status: OccupancyAgentStatus.rehydrate(row.status === "retired" ? "retired" : "active"),
    createdAt: CreatedAt.rehydrate(row.created_at),
    updatedAt: UpdatedAt.rehydrate(row.updated_at),
  });
}

function values(agent: OccupancyAgent) {
  const state = agent.toState();
  return {
    tenant_id: state.tenantId,
    id: state.id.value,
    name: state.name.value,
    subject_id: state.subjectId,
    project_id: state.projectId,
    repository_identity: state.repositoryIdentity,
    branch: state.branch,
    sandbox_id: state.sandboxId.value,
    status: state.status.value,
    created_at: state.createdAt.value,
    updated_at: state.updatedAt.value,
  };
}

export class PgOccupancyAgentRepository implements OccupancyAgentRepository {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly nextId: (prefix: string) => string = (prefix) =>
      `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`,
  ) {}

  async findActive(key: OccupancyAgentKey): Promise<OccupancyAgent | undefined> {
    const row = await this.db
      .selectFrom("occupancy_agents")
      .selectAll()
      .where("tenant_id", "=", key.tenantId)
      .where("subject_id", "=", key.subjectId)
      .where("project_id", "=", key.projectId)
      .where("repository_identity", "=", key.repositoryIdentity)
      .where("branch", "=", key.branch)
      .where("status", "=", "active")
      .executeTakeFirst();
    return row ? rehydrate(row) : undefined;
  }

  async save(agent: OccupancyAgent): Promise<Result<void>> {
    const row = values(agent);
    await this.db
      .insertInto("occupancy_agents")
      .values(row)
      .onConflict((conflict) =>
        conflict.columns(["tenant_id", "id"]).doUpdateSet({
          name: row.name,
          subject_id: row.subject_id,
          project_id: row.project_id,
          repository_identity: row.repository_identity,
          branch: row.branch,
          sandbox_id: row.sandbox_id,
          status: row.status,
          updated_at: row.updated_at,
        }),
      )
      .execute();
    return ok(undefined);
  }

  async occupy(input: OccupancyAgentOccupyInput): Promise<Result<OccupancyAgentHandle>> {
    return this.db.transaction().execute(async (transaction) => {
      const scoped = new PgOccupancyAgentRepository(transaction, this.nextId);
      const createdAt = CreatedAt.rehydrate(input.now);
      const updatedAt = UpdatedAt.rehydrate(input.now);
      const sandboxId = SandboxId.create(input.sandboxId);
      if (sandboxId.isErr()) return err(sandboxId.error);
      const name = SandboxDisplayName.create(input.name);
      if (name.isErr()) return err(name.error);

      const existing = await scoped.findActive(input);
      if (existing && !input.forceNew) {
        const retargeted = existing.retarget({ sandboxId: sandboxId.value, at: updatedAt });
        if (retargeted.isErr()) return err(retargeted.error);
        const saved = await scoped.save(existing);
        if (saved.isErr()) return err(saved.error);
        return ok({
          agentId: existing.id.value,
          name: existing.displayName().value,
          sandboxId: existing.sandboxId().value,
        });
      }
      if (existing && input.forceNew) {
        const retired = existing.retire({ at: updatedAt });
        if (retired.isErr()) return err(retired.error);
        const saved = await scoped.save(existing);
        if (saved.isErr()) return err(saved.error);
      }

      const id =
        input.preferredAgentId && !input.forceNew
          ? OccupancyAgentId.create(input.preferredAgentId)
          : OccupancyAgentId.generate(this.nextId);
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
      const saved = await scoped.save(created.value);
      if (saved.isErr()) return err(saved.error);
      return ok({
        agentId: created.value.id.value,
        name: created.value.displayName().value,
        sandboxId: created.value.sandboxId().value,
      });
    });
  }
}
