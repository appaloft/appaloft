import {
  type AgentWorkspaceProfileInstallationReferenceReader,
  type AgentWorkspaceProfileRegistryRepository,
  type RepositoryContext,
} from "@appaloft/application";
import {
  AgentWorkspaceProfileCanonicalManifest,
  AgentWorkspaceProfileDefinition,
  AgentWorkspaceProfileDefinitionDigest,
  AgentWorkspaceProfileDisplayName,
  AgentWorkspaceProfileId,
  AgentWorkspaceProfileInstallation,
  AgentWorkspaceProfileInstallationId,
  AgentWorkspaceProfileInstallationRevision,
  AgentWorkspaceProfileInstallationStatus,
  AgentWorkspaceProfileVersion,
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

type DefinitionRow = Selectable<Database["agent_workspace_profile_definitions"]>;
type InstallationRow = Selectable<Database["agent_workspace_profile_installations"]>;

function tenantId(context: RepositoryContext): string {
  return context.tenant?.tenantId ?? "tenant_instance";
}

function timestamp(value: string | Date | null | undefined, field: string): string {
  const normalized = normalizeTimestamp(value);
  if (!normalized) throw new Error(`Agent Workspace Profile ${field} is missing`);
  return normalized;
}

function definitionFromRow(row: DefinitionRow): AgentWorkspaceProfileDefinition {
  return AgentWorkspaceProfileDefinition.rehydrate({
    id: AgentWorkspaceProfileDefinitionDigest.rehydrate(row.digest),
    profileId: AgentWorkspaceProfileId.rehydrate(row.profile_id),
    profileVersion: AgentWorkspaceProfileVersion.rehydrate(row.profile_version),
    displayName: AgentWorkspaceProfileDisplayName.rehydrate(row.display_name),
    canonicalManifest: AgentWorkspaceProfileCanonicalManifest.rehydrate(row.canonical_manifest),
    registeredAt: CreatedAt.rehydrate(timestamp(row.registered_at, "registeredAt")),
  });
}

function installationFromRow(row: InstallationRow): AgentWorkspaceProfileInstallation {
  const installedAt = timestamp(row.installed_at, "installedAt");
  const updatedAt = timestamp(row.updated_at, "updatedAt");
  return AgentWorkspaceProfileInstallation.rehydrate({
    id: AgentWorkspaceProfileInstallationId.rehydrate(row.id),
    definitionDigest: AgentWorkspaceProfileDefinitionDigest.rehydrate(row.definition_digest),
    profileId: AgentWorkspaceProfileId.rehydrate(row.profile_id),
    profileVersion: AgentWorkspaceProfileVersion.rehydrate(row.profile_version),
    status: AgentWorkspaceProfileInstallationStatus.rehydrate(row.status as "disabled" | "enabled"),
    revision: AgentWorkspaceProfileInstallationRevision.rehydrate(row.revision),
    installedAt: CreatedAt.rehydrate(installedAt),
    credentialConnections: row.credential_connections.flatMap((connection) =>
      typeof connection.requirementId === "string" &&
      typeof connection.connectionReference === "string"
        ? [
            {
              requirementId: connection.requirementId,
              connectionReference: connection.connectionReference,
            },
          ]
        : [],
    ),
    ...(updatedAt !== installedAt ? { updatedAt: UpdatedAt.rehydrate(updatedAt) } : {}),
  });
}

export class PgAgentWorkspaceProfileRegistryRepository
  implements AgentWorkspaceProfileRegistryRepository
{
  constructor(private readonly db: Kysely<Database>) {}

  async saveDefinition(
    definition: AgentWorkspaceProfileDefinition,
  ): Promise<Result<AgentWorkspaceProfileDefinition>> {
    const state = definition.toState();
    await this.db
      .insertInto("agent_workspace_profile_definitions")
      .values({
        digest: state.id.value,
        profile_id: state.profileId.value,
        profile_version: state.profileVersion.value,
        display_name: state.displayName.value,
        canonical_manifest: state.canonicalManifest.value,
        registered_at: state.registeredAt.value,
      })
      .onConflict((conflict) => conflict.column("digest").doNothing())
      .execute();
    const existing = await this.findDefinition(state.id.value);
    if (!existing) {
      return err(
        domainError.invariant("Agent Workspace Profile definition was not persisted", {
          definitionDigest: state.id.value,
        }),
      );
    }
    if (
      !existing.matchesCanonicalManifest(state.canonicalManifest) ||
      !existing.toState().profileId.equals(state.profileId) ||
      !existing.toState().profileVersion.equals(state.profileVersion)
    ) {
      return err(
        domainError.conflict("Agent Workspace Profile definition digest collision", {
          definitionDigest: state.id.value,
        }),
      );
    }
    return ok(existing);
  }

  async findDefinition(definitionDigest: string): Promise<AgentWorkspaceProfileDefinition | null> {
    const row = await this.db
      .selectFrom("agent_workspace_profile_definitions")
      .selectAll()
      .where("digest", "=", definitionDigest)
      .executeTakeFirst();
    return row ? definitionFromRow(row) : null;
  }

  async saveInstallation(
    context: RepositoryContext,
    installation: AgentWorkspaceProfileInstallation,
    expectedRevision: number | null,
  ): Promise<Result<void>> {
    const state = installation.toState();
    const executor = resolveRepositoryExecutor(this.db, context);
    if (expectedRevision === null) {
      const inserted = await executor
        .insertInto("agent_workspace_profile_installations")
        .values({
          tenant_id: tenantId(context),
          id: state.id.value,
          definition_digest: state.definitionDigest.value,
          profile_id: state.profileId.value,
          profile_version: state.profileVersion.value,
          status: state.status.value,
          revision: state.revision.value,
          installed_at: state.installedAt.value,
          updated_at: state.updatedAt?.value ?? state.installedAt.value,
          credential_connections: state.credentialConnections.map((connection) => ({
            ...connection,
          })),
        })
        .onConflict((conflict) => conflict.columns(["tenant_id", "definition_digest"]).doNothing())
        .executeTakeFirst();
      if (Number(inserted.numInsertedOrUpdatedRows ?? 0) === 0) {
        return err(
          domainError.conflict("Agent Workspace Profile installation already exists", {
            installationId: state.id.value,
          }),
        );
      }
      return ok(undefined);
    }
    const updated = await executor
      .updateTable("agent_workspace_profile_installations")
      .set({
        status: state.status.value,
        revision: state.revision.value,
        updated_at: state.updatedAt?.value ?? state.installedAt.value,
        credential_connections: state.credentialConnections.map((connection) => ({
          ...connection,
        })),
      })
      .where("tenant_id", "=", tenantId(context))
      .where("id", "=", state.id.value)
      .where("revision", "=", expectedRevision)
      .executeTakeFirst();
    if (Number(updated.numUpdatedRows ?? 0) === 0) {
      return err(
        domainError.conflict("Agent Workspace Profile installation changed concurrently", {
          installationId: state.id.value,
          expectedRevision,
        }),
      );
    }
    return ok(undefined);
  }

  async findInstallation(
    context: RepositoryContext,
    installationId: string,
  ): Promise<AgentWorkspaceProfileInstallation | null> {
    const row = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("agent_workspace_profile_installations")
      .selectAll()
      .where("tenant_id", "=", tenantId(context))
      .where("id", "=", installationId)
      .executeTakeFirst();
    return row ? installationFromRow(row) : null;
  }

  async findInstallationByDefinition(
    context: RepositoryContext,
    definitionDigest: string,
  ): Promise<AgentWorkspaceProfileInstallation | null> {
    const row = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("agent_workspace_profile_installations")
      .selectAll()
      .where("tenant_id", "=", tenantId(context))
      .where("definition_digest", "=", definitionDigest)
      .executeTakeFirst();
    return row ? installationFromRow(row) : null;
  }

  async listInstallations(
    context: RepositoryContext,
    limit: number,
  ): Promise<AgentWorkspaceProfileInstallation[]> {
    const rows = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("agent_workspace_profile_installations")
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
        .deleteFrom("agent_workspace_profile_references")
        .where("tenant_id", "=", tenantId(context))
        .where("installation_id", "=", installationId)
        .where("active", "=", false)
        .execute();
      const deleted = await executor
        .deleteFrom("agent_workspace_profile_installations")
        .where("tenant_id", "=", tenantId(context))
        .where("id", "=", installationId)
        .executeTakeFirst();
      return ok(Number(deleted.numDeletedRows ?? 0) > 0);
    } catch {
      return err(
        domainError.conflict("Agent Workspace Profile installation is still referenced", {
          installationId,
        }),
      );
    }
  }
}

export class PgAgentWorkspaceProfileInstallationReferenceReader
  implements AgentWorkspaceProfileInstallationReferenceReader
{
  constructor(private readonly db: Kysely<Database>) {}

  async countActiveWorkspaceReferences(
    context: RepositoryContext,
    installationId: string,
  ): Promise<number> {
    const row = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("agent_workspace_profile_references")
      .select((expression) => expression.fn.countAll<number>().as("count"))
      .where("tenant_id", "=", tenantId(context))
      .where("installation_id", "=", installationId)
      .where("active", "=", true)
      .executeTakeFirst();
    return Number(row?.count ?? 0);
  }
}
