import {
  type RepositoryContext,
  type SandboxRepository,
  type StoredSandbox,
  type StoredSnapshot,
  type StoredTemplate,
} from "@appaloft/application";
import {
  CreatedAt,
  ExpiresAt,
  Sandbox,
  SandboxCredentialGrant,
  SandboxId,
  SandboxIsolationLevel,
  SandboxNetworkPolicy,
  SandboxResourceLimits,
  SandboxSnapshot,
  SandboxSnapshotId,
  SandboxSnapshotStatusValue,
  SandboxStatusValue,
  SandboxTemplate,
  SandboxTemplateId,
  SandboxTemplateName,
  UpdatedAt,
} from "@appaloft/core";
import { type Kysely, type Selectable, sql } from "kysely";
import { type Database } from "../schema";
import { normalizeTimestamp, resolveRepositoryExecutor } from "./shared";

type SandboxRow = Selectable<Database["execution_sandboxes"]>;
type SnapshotRow = Selectable<Database["execution_sandbox_snapshots"]>;
type TemplateRow = Selectable<Database["execution_sandbox_templates"]>;

type SerializedSandboxState = {
  source:
    | { kind: "image"; image: string }
    | { kind: "template"; templateId: string }
    | { kind: "snapshot"; snapshotId: string };
  realizedIsolation?: "container-trusted" | "gvisor" | "kata" | "microvm";
  limits: { cpuMillis: number; memoryBytes: number; diskBytes: number; maxProcesses: number };
  networkPolicy: ReturnType<SandboxNetworkPolicy["toState"]>;
  currentAttemptId?: string;
  providerHandle?: string;
  provisionAttempts: number;
};

function contextTenantId(context: RepositoryContext): string {
  return context.tenant?.tenantId ?? "tenant_instance";
}

function objectState<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

function requiredTimestamp(value: string | Date | null | undefined): string {
  const normalized = normalizeTimestamp(value);
  if (!normalized) throw new Error("Execution Sandbox timestamp is missing");
  return normalized;
}

function sandboxState(sandbox: Sandbox): SerializedSandboxState {
  const state = sandbox.toState();
  const source: SerializedSandboxState["source"] =
    state.source.kind === "image"
      ? state.source
      : state.source.kind === "template"
        ? { kind: "template", templateId: state.source.templateId.value }
        : { kind: "snapshot", snapshotId: state.source.snapshotId.value };
  return {
    source,
    limits: state.limits.toState(),
    networkPolicy: state.networkPolicy.toState(),
    provisionAttempts: state.provisionAttempts,
    ...(state.realizedIsolation ? { realizedIsolation: state.realizedIsolation.value } : {}),
    ...(state.currentAttemptId ? { currentAttemptId: state.currentAttemptId } : {}),
    ...(state.providerHandle ? { providerHandle: state.providerHandle } : {}),
  };
}

function sandboxFromRow(row: SandboxRow): Sandbox {
  const state = objectState<SerializedSandboxState>(row.state);
  const source =
    state.source.kind === "image"
      ? state.source
      : state.source.kind === "template"
        ? {
            kind: "template" as const,
            templateId: SandboxTemplateId.rehydrate(state.source.templateId),
          }
        : {
            kind: "snapshot" as const,
            snapshotId: SandboxSnapshotId.rehydrate(state.source.snapshotId),
          };
  return Sandbox.rehydrate({
    id: SandboxId.rehydrate(row.id),
    source,
    status: SandboxStatusValue.rehydrate(
      row.status as Parameters<typeof SandboxStatusValue.rehydrate>[0],
    ),
    requestedIsolation: SandboxIsolationLevel.rehydrate(
      row.requested_isolation as Parameters<typeof SandboxIsolationLevel.rehydrate>[0],
    ),
    limits: SandboxResourceLimits.rehydrate(state.limits),
    networkPolicy: SandboxNetworkPolicy.rehydrate(state.networkPolicy),
    createdAt: CreatedAt.rehydrate(requiredTimestamp(row.created_at)),
    updatedAt: UpdatedAt.rehydrate(requiredTimestamp(row.updated_at)),
    provisionAttempts: state.provisionAttempts ?? 0,
    ...(row.expires_at
      ? { expiresAt: ExpiresAt.rehydrate(requiredTimestamp(row.expires_at)) }
      : {}),
    ...(state.realizedIsolation
      ? { realizedIsolation: SandboxIsolationLevel.rehydrate(state.realizedIsolation) }
      : {}),
    ...(state.currentAttemptId ? { currentAttemptId: state.currentAttemptId } : {}),
    ...(state.providerHandle ? { providerHandle: state.providerHandle } : {}),
  });
}

type SerializedSnapshotState = {
  capability: "filesystem" | "filesystem-memory";
  currentAttemptId?: string;
  providerHandle?: string;
  sizeBytes?: number;
};

type SerializedTemplateState = {
  image: string;
  minimumIsolation: "container-trusted" | "gvisor" | "kata" | "microvm";
  limits: { cpuMillis: number; memoryBytes: number; diskBytes: number; maxProcesses: number };
  networkPolicy: ReturnType<SandboxNetworkPolicy["toState"]>;
  overridePolicy: {
    isolation: "immutable" | "strengthen-only";
    limits: "immutable" | "decrease-only";
    network: "immutable";
  };
};

function templateFromRow(row: TemplateRow): SandboxTemplate {
  const state = objectState<SerializedTemplateState>(row.state);
  return SandboxTemplate.rehydrate({
    id: SandboxTemplateId.rehydrate(row.id),
    name: SandboxTemplateName.rehydrate(row.name),
    image: state.image,
    minimumIsolation: SandboxIsolationLevel.rehydrate(state.minimumIsolation),
    limits: SandboxResourceLimits.rehydrate(state.limits),
    networkPolicy: SandboxNetworkPolicy.rehydrate(state.networkPolicy),
    overridePolicy: state.overridePolicy,
    createdAt: CreatedAt.rehydrate(requiredTimestamp(row.created_at)),
  });
}

function snapshotFromRow(row: SnapshotRow): SandboxSnapshot {
  const state = objectState<SerializedSnapshotState>(row.state);
  return SandboxSnapshot.rehydrate({
    id: SandboxSnapshotId.rehydrate(row.id),
    sourceSandboxId: SandboxId.rehydrate(row.source_sandbox_id),
    capability: state.capability,
    status: SandboxSnapshotStatusValue.rehydrate(
      row.status as Parameters<typeof SandboxSnapshotStatusValue.rehydrate>[0],
    ),
    createdAt: CreatedAt.rehydrate(requiredTimestamp(row.created_at)),
    updatedAt: UpdatedAt.rehydrate(requiredTimestamp(row.updated_at)),
    ...(row.expires_at
      ? { expiresAt: ExpiresAt.rehydrate(requiredTimestamp(row.expires_at)) }
      : {}),
    ...(state.currentAttemptId ? { currentAttemptId: state.currentAttemptId } : {}),
    ...(state.providerHandle ? { providerHandle: state.providerHandle } : {}),
    ...(state.sizeBytes !== undefined ? { sizeBytes: state.sizeBytes } : {}),
  });
}

export class PgExecutionSandboxRepository implements SandboxRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async save(context: RepositoryContext, sandbox: Sandbox, providerKey: string): Promise<void> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const state = sandbox.toState();
    const row = {
      tenant_id: contextTenantId(context),
      id: state.id.value,
      provider_key: providerKey,
      status: state.status.value,
      requested_isolation: state.requestedIsolation.value,
      expires_at: state.expiresAt?.value ?? null,
      state: sandboxState(sandbox),
      created_at: state.createdAt.value,
      updated_at: state.updatedAt?.value ?? state.createdAt.value,
    };
    await executor
      .insertInto("execution_sandboxes")
      .values(row)
      .onConflict((conflict) =>
        conflict.columns(["tenant_id", "id"]).doUpdateSet({
          provider_key: row.provider_key,
          status: row.status,
          requested_isolation: row.requested_isolation,
          expires_at: row.expires_at,
          state: row.state,
          updated_at: row.updated_at,
        }),
      )
      .execute();
  }

  async find(context: RepositoryContext, sandboxId: string): Promise<StoredSandbox | null> {
    const row = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("execution_sandboxes")
      .selectAll()
      .where("tenant_id", "=", contextTenantId(context))
      .where("id", "=", sandboxId)
      .executeTakeFirst();
    return row
      ? { tenantId: row.tenant_id, providerKey: row.provider_key, sandbox: sandboxFromRow(row) }
      : null;
  }

  async list(
    context: RepositoryContext,
    input: { limit: number; offset: number },
  ): Promise<StoredSandbox[]> {
    const rows = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("execution_sandboxes")
      .selectAll()
      .where("tenant_id", "=", contextTenantId(context))
      .orderBy("updated_at", "desc")
      .limit(input.limit)
      .offset(input.offset)
      .execute();
    return rows.map((row) => ({
      tenantId: row.tenant_id,
      providerKey: row.provider_key,
      sandbox: sandboxFromRow(row),
    }));
  }

  async listForMaintenance(
    context: RepositoryContext,
    input: { limit: number },
  ): Promise<StoredSandbox[]> {
    const rows = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("execution_sandboxes")
      .selectAll()
      .where("tenant_id", "=", contextTenantId(context))
      .where("status", "not in", ["terminated", "expired"])
      .orderBy("updated_at", "asc")
      .limit(input.limit)
      .execute();
    return rows.map((row) => ({
      tenantId: row.tenant_id,
      providerKey: row.provider_key,
      sandbox: sandboxFromRow(row),
    }));
  }

  async listProviderRuntimes(
    context: RepositoryContext,
    input: { providerKey: string; limit: number; offset: number },
  ): Promise<Array<{ sandboxId: string; providerHandle: string }>> {
    const rows = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("execution_sandboxes")
      .select(["id", "state"])
      .where("tenant_id", "=", contextTenantId(context))
      .where("provider_key", "=", input.providerKey)
      .where(sql<boolean>`state ? 'providerHandle'`)
      .orderBy("id", "asc")
      .limit(input.limit)
      .offset(input.offset)
      .execute();
    return rows.flatMap((row) => {
      const state = row.state as SerializedSandboxState;
      return state.providerHandle
        ? [{ sandboxId: row.id, providerHandle: state.providerHandle }]
        : [];
    });
  }

  async saveCredentialGrant(
    context: RepositoryContext,
    sandboxId: string,
    grant: SandboxCredentialGrant,
  ): Promise<void> {
    const state = grant.toState();
    await resolveRepositoryExecutor(this.db, context)
      .insertInto("execution_sandbox_credential_grants")
      .values({
        tenant_id: contextTenantId(context),
        sandbox_id: sandboxId,
        grant_id: state.grantId,
        state: { ...state },
        created_at: new Date().toISOString(),
      })
      .onConflict((conflict) =>
        conflict
          .columns(["tenant_id", "sandbox_id", "grant_id"])
          .doUpdateSet({ state: { ...state } }),
      )
      .execute();
  }

  async findCredentialGrant(
    context: RepositoryContext,
    sandboxId: string,
    grantId: string,
  ): Promise<SandboxCredentialGrant | null> {
    const row = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("execution_sandbox_credential_grants")
      .select("state")
      .where("tenant_id", "=", contextTenantId(context))
      .where("sandbox_id", "=", sandboxId)
      .where("grant_id", "=", grantId)
      .executeTakeFirst();
    return row
      ? SandboxCredentialGrant.rehydrate(
          row.state as unknown as ReturnType<SandboxCredentialGrant["toState"]>,
        )
      : null;
  }

  async listCredentialGrants(
    context: RepositoryContext,
    sandboxId: string,
    input: { limit: number; offset: number },
  ): Promise<SandboxCredentialGrant[]> {
    const rows = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("execution_sandbox_credential_grants")
      .select("state")
      .where("tenant_id", "=", contextTenantId(context))
      .where("sandbox_id", "=", sandboxId)
      .orderBy("grant_id", "asc")
      .limit(input.limit)
      .offset(input.offset)
      .execute();
    return rows.map((row) =>
      SandboxCredentialGrant.rehydrate(
        row.state as unknown as ReturnType<SandboxCredentialGrant["toState"]>,
      ),
    );
  }

  async deleteCredentialGrant(
    context: RepositoryContext,
    sandboxId: string,
    grantId: string,
  ): Promise<void> {
    await resolveRepositoryExecutor(this.db, context)
      .deleteFrom("execution_sandbox_credential_grants")
      .where("tenant_id", "=", contextTenantId(context))
      .where("sandbox_id", "=", sandboxId)
      .where("grant_id", "=", grantId)
      .execute();
  }

  async saveSnapshot(
    context: RepositoryContext,
    snapshot: SandboxSnapshot,
    providerKey: string,
  ): Promise<void> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const state = snapshot.toState();
    const serialized: SerializedSnapshotState = {
      capability: state.capability,
      ...(state.currentAttemptId ? { currentAttemptId: state.currentAttemptId } : {}),
      ...(state.providerHandle ? { providerHandle: state.providerHandle } : {}),
      ...(state.sizeBytes !== undefined ? { sizeBytes: state.sizeBytes } : {}),
    };
    const row = {
      tenant_id: contextTenantId(context),
      id: state.id.value,
      source_sandbox_id: state.sourceSandboxId.value,
      provider_key: providerKey,
      status: state.status.value,
      expires_at: state.expiresAt?.value ?? null,
      state: serialized,
      created_at: state.createdAt.value,
      updated_at: state.updatedAt?.value ?? state.createdAt.value,
    };
    await executor
      .insertInto("execution_sandbox_snapshots")
      .values(row)
      .onConflict((conflict) =>
        conflict.columns(["tenant_id", "id"]).doUpdateSet({
          status: row.status,
          expires_at: row.expires_at,
          state: row.state,
          updated_at: row.updated_at,
        }),
      )
      .execute();
  }

  async findSnapshot(
    context: RepositoryContext,
    snapshotId: string,
  ): Promise<StoredSnapshot | null> {
    const row = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("execution_sandbox_snapshots")
      .selectAll()
      .where("tenant_id", "=", contextTenantId(context))
      .where("id", "=", snapshotId)
      .executeTakeFirst();
    return row
      ? { tenantId: row.tenant_id, providerKey: row.provider_key, snapshot: snapshotFromRow(row) }
      : null;
  }

  async listSnapshots(
    context: RepositoryContext,
    input: { limit: number; offset: number },
  ): Promise<StoredSnapshot[]> {
    const rows = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("execution_sandbox_snapshots")
      .selectAll()
      .where("tenant_id", "=", contextTenantId(context))
      .orderBy("created_at", "desc")
      .limit(input.limit)
      .offset(input.offset)
      .execute();
    return rows.map((row) => ({
      tenantId: row.tenant_id,
      providerKey: row.provider_key,
      snapshot: snapshotFromRow(row),
    }));
  }

  async saveTemplate(context: RepositoryContext, template: SandboxTemplate): Promise<void> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const state = template.toState();
    const serialized: SerializedTemplateState = {
      image: state.image,
      minimumIsolation: state.minimumIsolation.value,
      limits: state.limits.toState(),
      networkPolicy: state.networkPolicy.toState(),
      overridePolicy: { ...state.overridePolicy },
    };
    await executor
      .insertInto("execution_sandbox_templates")
      .values({
        tenant_id: contextTenantId(context),
        id: state.id.value,
        name: state.name.value,
        state: serialized,
        created_at: state.createdAt.value,
      })
      .onConflict((conflict) =>
        conflict.columns(["tenant_id", "id"]).doUpdateSet({
          name: state.name.value,
          state: serialized,
        }),
      )
      .execute();
  }

  async findTemplate(
    context: RepositoryContext,
    templateId: string,
  ): Promise<StoredTemplate | null> {
    const row = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("execution_sandbox_templates")
      .selectAll()
      .where("tenant_id", "=", contextTenantId(context))
      .where("id", "=", templateId)
      .executeTakeFirst();
    return row ? { tenantId: row.tenant_id, template: templateFromRow(row) } : null;
  }

  async listTemplates(
    context: RepositoryContext,
    input: { limit: number; offset: number },
  ): Promise<StoredTemplate[]> {
    const rows = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("execution_sandbox_templates")
      .selectAll()
      .where("tenant_id", "=", contextTenantId(context))
      .orderBy("created_at", "desc")
      .limit(input.limit)
      .offset(input.offset)
      .execute();
    return rows.map((row) => ({ tenantId: row.tenant_id, template: templateFromRow(row) }));
  }

  async deleteTemplate(context: RepositoryContext, templateId: string): Promise<void> {
    await resolveRepositoryExecutor(this.db, context)
      .deleteFrom("execution_sandbox_templates")
      .where("tenant_id", "=", contextTenantId(context))
      .where("id", "=", templateId)
      .execute();
  }

  async hasActiveTemplateReferences(
    context: RepositoryContext,
    templateId: string,
  ): Promise<boolean> {
    const row = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("execution_sandboxes")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("tenant_id", "=", contextTenantId(context))
      .where("status", "not in", ["terminated", "expired"])
      .where(sql<boolean>`state -> 'source' ->> 'kind' = 'template'`)
      .where(sql<boolean>`state -> 'source' ->> 'templateId' = ${templateId}`)
      .executeTakeFirst();
    return Number(row?.count ?? 0) > 0;
  }
}
