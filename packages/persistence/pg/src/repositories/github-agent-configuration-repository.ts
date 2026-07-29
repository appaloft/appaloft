import {
  type GitHubAgentConfigurationRepository,
  type RepositoryContext,
} from "@appaloft/application";
import {
  type AgentProfileSnapshot,
  domainError,
  err,
  ok,
  type ProjectAutomationRuleSnapshot,
  type RepositoryBindingSnapshot,
  type Result,
} from "@appaloft/core";
import { type Kysely } from "kysely";
import { type Database } from "../schema";
import { resolveRepositoryExecutor } from "./shared";

type JsonRecord = Record<string, unknown>;

function tenantId(context: RepositoryContext): string {
  return context.tenant?.tenantId ?? "tenant_instance";
}

function json(value: unknown): JsonRecord {
  return structuredClone(value) as JsonRecord;
}

export class PgGitHubAgentConfigurationRepository implements GitHubAgentConfigurationRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async saveRepositoryBinding(
    context: RepositoryContext,
    value: RepositoryBindingSnapshot,
  ): Promise<Result<void>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    try {
      await executor
        .insertInto("repository_bindings")
        .values({
          tenant_id: tenantId(context),
          id: value.id,
          project_id: value.projectId,
          provider: value.provider,
          installation_connection_id: value.installationConnectionId,
          provider_repository_id: value.providerRepositoryId,
          state: json(value),
          status: value.status,
          created_at: value.createdAt,
          updated_at: value.updatedAt ?? value.createdAt,
        })
        .onConflict((conflict) =>
          conflict.columns(["tenant_id", "id"]).doUpdateSet({
            state: json(value),
            status: value.status,
            updated_at: value.updatedAt ?? value.createdAt,
          }),
        )
        .execute();
      return ok(undefined);
    } catch {
      return err(domainError.conflict("GitHub repository is already bound in this tenant"));
    }
  }

  async findRepositoryBinding(context: RepositoryContext, id: string) {
    const row = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("repository_bindings")
      .select("state")
      .where("tenant_id", "=", tenantId(context))
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? repositoryBindingSnapshot(row.state) : undefined;
  }

  async listRepositoryBindings(context: RepositoryContext, projectId?: string) {
    let query = resolveRepositoryExecutor(this.db, context)
      .selectFrom("repository_bindings")
      .select("state")
      .where("tenant_id", "=", tenantId(context));
    if (projectId) query = query.where("project_id", "=", projectId);
    const rows = await query.orderBy("created_at", "desc").execute();
    return rows
      .map((row) => repositoryBindingSnapshot(row.state))
      .filter((value): value is RepositoryBindingSnapshot => Boolean(value));
  }

  async saveAutomationRule(
    context: RepositoryContext,
    value: ProjectAutomationRuleSnapshot,
    expectedRevision: number | null,
  ): Promise<Result<void>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    if (expectedRevision === null) {
      const inserted = await executor
        .insertInto("project_automation_rules")
        .values({
          tenant_id: tenantId(context),
          id: value.id,
          project_id: value.projectId,
          repository_binding_id: value.repositoryBindingId,
          state: json(value),
          status: value.status,
          revision: value.revision,
          created_at: value.createdAt,
          updated_at: value.updatedAt ?? value.createdAt,
        })
        .onConflict((conflict) => conflict.columns(["tenant_id", "id"]).doNothing())
        .returning("id")
        .executeTakeFirst();
      return inserted ? ok(undefined) : err(domainError.conflict("Automation Rule already exists"));
    }
    const updated = await executor
      .updateTable("project_automation_rules")
      .set({
        state: json(value),
        status: value.status,
        revision: value.revision,
        updated_at: value.updatedAt ?? value.createdAt,
      })
      .where("tenant_id", "=", tenantId(context))
      .where("id", "=", value.id)
      .where("revision", "=", expectedRevision)
      .returning("id")
      .executeTakeFirst();
    return updated
      ? ok(undefined)
      : err(domainError.conflict("Automation Rule changed concurrently"));
  }

  async findAutomationRule(context: RepositoryContext, id: string) {
    const row = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("project_automation_rules")
      .select("state")
      .where("tenant_id", "=", tenantId(context))
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? automationRuleSnapshot(row.state) : undefined;
  }

  async listAutomationRules(context: RepositoryContext, projectId?: string) {
    let query = resolveRepositoryExecutor(this.db, context)
      .selectFrom("project_automation_rules")
      .select("state")
      .where("tenant_id", "=", tenantId(context));
    if (projectId) query = query.where("project_id", "=", projectId);
    const rows = await query.orderBy("created_at", "desc").execute();
    return rows
      .map((row) => automationRuleSnapshot(row.state))
      .filter((value): value is ProjectAutomationRuleSnapshot => Boolean(value));
  }

  async saveAgentProfile(
    context: RepositoryContext,
    value: AgentProfileSnapshot,
    expectedRevision: number | null,
  ): Promise<Result<void>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    if (expectedRevision === null) {
      const inserted = await executor
        .insertInto("agent_profiles")
        .values({
          tenant_id: tenantId(context),
          id: value.id,
          state: json(value),
          adapter: value.adapter,
          credential_connection_id: value.credentialConnectionId,
          status: value.status,
          revision: value.revision,
          created_at: value.createdAt,
          updated_at: value.updatedAt ?? value.createdAt,
        })
        .onConflict((conflict) => conflict.columns(["tenant_id", "id"]).doNothing())
        .returning("id")
        .executeTakeFirst();
      return inserted ? ok(undefined) : err(domainError.conflict("Agent Profile already exists"));
    }
    const updated = await executor
      .updateTable("agent_profiles")
      .set({
        state: json(value),
        status: value.status,
        revision: value.revision,
        updated_at: value.updatedAt ?? value.createdAt,
      })
      .where("tenant_id", "=", tenantId(context))
      .where("id", "=", value.id)
      .where("revision", "=", expectedRevision)
      .returning("id")
      .executeTakeFirst();
    return updated
      ? ok(undefined)
      : err(domainError.conflict("Agent Profile changed concurrently"));
  }

  async findAgentProfile(context: RepositoryContext, id: string) {
    const row = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("agent_profiles")
      .select("state")
      .where("tenant_id", "=", tenantId(context))
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? agentProfileSnapshot(row.state) : undefined;
  }

  async listAgentProfiles(context: RepositoryContext) {
    const rows = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("agent_profiles")
      .select("state")
      .where("tenant_id", "=", tenantId(context))
      .orderBy("created_at", "desc")
      .execute();
    return rows
      .map((row) => agentProfileSnapshot(row.state))
      .filter((value): value is AgentProfileSnapshot => Boolean(value));
  }
}

function repositoryBindingSnapshot(value: JsonRecord): RepositoryBindingSnapshot | undefined {
  return typeof value.id === "string" &&
    typeof value.tenantId === "string" &&
    typeof value.projectId === "string"
    ? (structuredClone(value) as unknown as RepositoryBindingSnapshot)
    : undefined;
}

function automationRuleSnapshot(value: JsonRecord): ProjectAutomationRuleSnapshot | undefined {
  return typeof value.id === "string" &&
    typeof value.tenantId === "string" &&
    typeof value.projectId === "string" &&
    typeof value.revision === "number"
    ? (structuredClone(value) as unknown as ProjectAutomationRuleSnapshot)
    : undefined;
}

function agentProfileSnapshot(value: JsonRecord): AgentProfileSnapshot | undefined {
  return typeof value.id === "string" &&
    typeof value.tenantId === "string" &&
    typeof value.revision === "number"
    ? (structuredClone(value) as unknown as AgentProfileSnapshot)
    : undefined;
}
