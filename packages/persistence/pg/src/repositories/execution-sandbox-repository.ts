import {
  type RepositoryContext,
  type SandboxRepository,
  type StoredSandbox,
  type StoredSnapshot,
} from "@appaloft/application";
import {
  CreatedAt,
  ExpiresAt,
  Sandbox,
  SandboxId,
  SandboxIsolationLevel,
  SandboxNetworkPolicy,
  SandboxResourceLimits,
  SandboxSnapshot,
  SandboxSnapshotId,
  SandboxSnapshotStatusValue,
  SandboxStatusValue,
  UpdatedAt,
} from "@appaloft/core";
import { type Kysely, type Selectable } from "kysely";
import { type Database } from "../schema";
import { normalizeTimestamp, resolveRepositoryExecutor } from "./shared";

type SandboxRow = Selectable<Database["execution_sandboxes"]>;
type SnapshotRow = Selectable<Database["execution_sandbox_snapshots"]>;

type SerializedSandboxState = {
  source: { kind: "image"; image: string };
  realizedIsolation?: "container-trusted" | "gvisor" | "kata" | "microvm";
  limits: { cpuMillis: number; memoryBytes: number; diskBytes: number; maxProcesses: number };
  networkPolicy: ReturnType<SandboxNetworkPolicy["toState"]>;
  currentAttemptId?: string;
  providerHandle?: string;
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
  if (state.source.kind !== "image") {
    throw new Error("PG Sandbox repository currently requires normalized image source");
  }
  return {
    source: state.source,
    limits: state.limits.toState(),
    networkPolicy: state.networkPolicy.toState(),
    ...(state.realizedIsolation ? { realizedIsolation: state.realizedIsolation.value } : {}),
    ...(state.currentAttemptId ? { currentAttemptId: state.currentAttemptId } : {}),
    ...(state.providerHandle ? { providerHandle: state.providerHandle } : {}),
  };
}

function sandboxFromRow(row: SandboxRow): Sandbox {
  const state = objectState<SerializedSandboxState>(row.state);
  return Sandbox.rehydrate({
    id: SandboxId.rehydrate(row.id),
    source: state.source,
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
}
