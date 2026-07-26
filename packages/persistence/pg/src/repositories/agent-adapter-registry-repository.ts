import {
  type AgentAdapterInstallationReferenceReader,
  type AgentAdapterRegistryRepository,
  type RepositoryContext,
} from "@appaloft/application";
import {
  AgentAdapterCanonicalManifest,
  AgentAdapterDefinition,
  AgentAdapterDefinitionDigest,
  AgentAdapterDisplayName,
  AgentAdapterId,
  AgentAdapterInstallation,
  AgentAdapterInstallationId,
  AgentAdapterInstallationRevision,
  AgentAdapterInstallationStatus,
  AgentAdapterVersion,
  CreatedAt,
  domainError,
  err,
  ok,
  type Result,
  UpdatedAt,
} from "@appaloft/core";
import { type Kysely, type Selectable } from "kysely";
import { type Database } from "../schema";
import { normalizeTimestamp, resolveRepositoryExecutor } from "./shared";

type DefinitionRow = Selectable<Database["agent_adapter_definitions"]>;
type InstallationRow = Selectable<Database["agent_adapter_installations"]>;

function tenantId(context: RepositoryContext): string {
  return context.tenant?.tenantId ?? "tenant_instance";
}

function timestamp(value: string | Date | null | undefined, field: string): string {
  const normalized = normalizeTimestamp(value);
  if (!normalized) throw new Error(`Agent Adapter ${field} is missing`);
  return normalized;
}

function definitionFromRow(row: DefinitionRow): AgentAdapterDefinition {
  return AgentAdapterDefinition.rehydrate({
    id: AgentAdapterDefinitionDigest.rehydrate(row.digest),
    adapterId: AgentAdapterId.rehydrate(row.adapter_id),
    adapterVersion: AgentAdapterVersion.rehydrate(row.adapter_version),
    displayName: AgentAdapterDisplayName.rehydrate(row.display_name),
    canonicalManifest: AgentAdapterCanonicalManifest.rehydrate(row.canonical_manifest),
    registeredAt: CreatedAt.rehydrate(timestamp(row.registered_at, "registeredAt")),
  });
}

function installationFromRow(row: InstallationRow): AgentAdapterInstallation {
  const installedAt = timestamp(row.installed_at, "installedAt");
  const updatedAt = timestamp(row.updated_at, "updatedAt");
  return AgentAdapterInstallation.rehydrate({
    id: AgentAdapterInstallationId.rehydrate(row.id),
    definitionDigest: AgentAdapterDefinitionDigest.rehydrate(row.definition_digest),
    adapterId: AgentAdapterId.rehydrate(row.adapter_id),
    adapterVersion: AgentAdapterVersion.rehydrate(row.adapter_version),
    status: AgentAdapterInstallationStatus.rehydrate(row.status as "disabled" | "enabled"),
    revision: AgentAdapterInstallationRevision.rehydrate(row.revision),
    installedAt: CreatedAt.rehydrate(installedAt),
    ...(updatedAt !== installedAt ? { updatedAt: UpdatedAt.rehydrate(updatedAt) } : {}),
  });
}

export class PgAgentAdapterRegistryRepository implements AgentAdapterRegistryRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async saveDefinition(
    definition: AgentAdapterDefinition,
  ): Promise<Result<AgentAdapterDefinition>> {
    const state = definition.toState();
    await this.db
      .insertInto("agent_adapter_definitions")
      .values({
        digest: state.id.value,
        adapter_id: state.adapterId.value,
        adapter_version: state.adapterVersion.value,
        display_name: state.displayName.value,
        canonical_manifest: state.canonicalManifest.value,
        registered_at: state.registeredAt.value,
      })
      .onConflict((conflict) => conflict.column("digest").doNothing())
      .execute();
    const existing = await this.findDefinition(state.id.value);
    if (!existing) {
      return err(
        domainError.invariant("Agent Adapter definition was not persisted", {
          definitionDigest: state.id.value,
        }),
      );
    }
    if (
      !existing.matchesCanonicalManifest(state.canonicalManifest) ||
      !existing.toState().adapterId.equals(state.adapterId) ||
      !existing.toState().adapterVersion.equals(state.adapterVersion)
    ) {
      return err(
        domainError.conflict("Agent Adapter definition digest collision", {
          definitionDigest: state.id.value,
        }),
      );
    }
    return ok(existing);
  }

  async findDefinition(definitionDigest: string): Promise<AgentAdapterDefinition | null> {
    const row = await this.db
      .selectFrom("agent_adapter_definitions")
      .selectAll()
      .where("digest", "=", definitionDigest)
      .executeTakeFirst();
    return row ? definitionFromRow(row) : null;
  }

  async saveInstallation(
    context: RepositoryContext,
    installation: AgentAdapterInstallation,
    expectedRevision: number | null,
  ): Promise<Result<void>> {
    const state = installation.toState();
    const executor = resolveRepositoryExecutor(this.db, context);
    if (expectedRevision === null) {
      const inserted = await executor
        .insertInto("agent_adapter_installations")
        .values({
          tenant_id: tenantId(context),
          id: state.id.value,
          definition_digest: state.definitionDigest.value,
          adapter_id: state.adapterId.value,
          adapter_version: state.adapterVersion.value,
          status: state.status.value,
          revision: state.revision.value,
          installed_at: state.installedAt.value,
          updated_at: state.updatedAt?.value ?? state.installedAt.value,
        })
        .onConflict((conflict) => conflict.columns(["tenant_id", "definition_digest"]).doNothing())
        .executeTakeFirst();
      if (Number(inserted.numInsertedOrUpdatedRows ?? 0) === 0) {
        return err(
          domainError.conflict("Agent Adapter installation already exists", {
            installationId: state.id.value,
          }),
        );
      }
      return ok(undefined);
    }

    const updated = await executor
      .updateTable("agent_adapter_installations")
      .set({
        status: state.status.value,
        revision: state.revision.value,
        updated_at: state.updatedAt?.value ?? state.installedAt.value,
      })
      .where("tenant_id", "=", tenantId(context))
      .where("id", "=", state.id.value)
      .where("revision", "=", expectedRevision)
      .executeTakeFirst();
    if (Number(updated.numUpdatedRows ?? 0) === 0) {
      const current = await this.findInstallation(context, state.id.value);
      return err(
        domainError.conflict("Agent Adapter installation changed concurrently", {
          installationId: state.id.value,
          expectedRevision,
          revision: current?.toState().revision.value ?? -1,
        }),
      );
    }
    return ok(undefined);
  }

  async findInstallation(
    context: RepositoryContext,
    installationId: string,
  ): Promise<AgentAdapterInstallation | null> {
    const row = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("agent_adapter_installations")
      .selectAll()
      .where("tenant_id", "=", tenantId(context))
      .where("id", "=", installationId)
      .executeTakeFirst();
    return row ? installationFromRow(row) : null;
  }

  async findInstallationByDefinition(
    context: RepositoryContext,
    definitionDigest: string,
  ): Promise<AgentAdapterInstallation | null> {
    const row = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("agent_adapter_installations")
      .selectAll()
      .where("tenant_id", "=", tenantId(context))
      .where("definition_digest", "=", definitionDigest)
      .executeTakeFirst();
    return row ? installationFromRow(row) : null;
  }

  async listInstallations(
    context: RepositoryContext,
    limit: number,
  ): Promise<AgentAdapterInstallation[]> {
    const rows = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("agent_adapter_installations")
      .selectAll()
      .where("tenant_id", "=", tenantId(context))
      .orderBy("installed_at", "desc")
      .limit(Math.max(1, Math.min(limit, 200)))
      .execute();
    return rows.map(installationFromRow);
  }

  async deleteInstallation(
    context: RepositoryContext,
    installationId: string,
  ): Promise<Result<boolean>> {
    try {
      const executor = resolveRepositoryExecutor(this.db, context);
      await executor
        .deleteFrom("agent_adapter_workspace_references")
        .where("tenant_id", "=", tenantId(context))
        .where("installation_id", "=", installationId)
        .where("active", "=", false)
        .execute();
      const deleted = await executor
        .deleteFrom("agent_adapter_installations")
        .where("tenant_id", "=", tenantId(context))
        .where("id", "=", installationId)
        .executeTakeFirst();
      return ok(Number(deleted.numDeletedRows ?? 0) > 0);
    } catch {
      return err(
        domainError.conflict("Agent Adapter installation is still referenced", {
          installationId,
        }),
      );
    }
  }
}

export class PgAgentAdapterInstallationReferenceReader
  implements AgentAdapterInstallationReferenceReader
{
  constructor(private readonly db: Kysely<Database>) {}

  async countActiveWorkspaceReferences(
    context: RepositoryContext,
    installationId: string,
  ): Promise<number> {
    const row = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("agent_adapter_workspace_references")
      .select((expression) => expression.fn.countAll<number>().as("count"))
      .where("tenant_id", "=", tenantId(context))
      .where("installation_id", "=", installationId)
      .where("active", "=", true)
      .executeTakeFirst();
    return Number(row?.count ?? 0);
  }
}
