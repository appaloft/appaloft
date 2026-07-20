import { Buffer } from "node:buffer";
import {
  type ControlPlaneExportPlan,
  type ControlPlaneExportResult,
  type ControlPlaneImportMode,
  type ControlPlaneImportPlan,
  type ControlPlaneImportResult,
  type ControlPlanePortabilityArtifactSummary,
  type ControlPlanePortabilityPort,
  type RepositoryContext,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Kysely, sql } from "kysely";
import { type Database } from "./schema";

interface SnapshotTable {
  name: string;
  primaryKey: string[];
  rows: Record<string, unknown>[];
}
interface SnapshotPayload {
  schemaVersion: "appaloft.control-plane-snapshot/v1";
  sourceRevision: string;
  createdAt: string;
  tables: SnapshotTable[];
}
interface EncryptedEnvelope {
  schemaVersion: "appaloft.control-plane-portability/v1";
  artifactId: string;
  createdAt: string;
  sourceRevision: string;
  tableCount: number;
  rowCount: number;
  encryption: {
    algorithm: "AES-GCM";
    kdf: "PBKDF2-SHA256";
    iterations: number;
    salt: string;
    iv: string;
  };
  checksum: string;
  ciphertext: string;
}

const excludedTables = new Set([
  "kysely_migration",
  "kysely_migration_lock",
  "control_plane_portability_artifacts",
]);
const iterations = 210_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function identifier(name: string) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error("unsafe SQL identifier");
  return sql.raw(`"${name}"`);
}
function base64(bytes: ArrayBuffer | Uint8Array): string {
  return Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString(
    "base64",
  );
}
function bytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}
function arrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}
async function sha256(value: Uint8Array): Promise<string> {
  return `sha256:${base64(await crypto.subtle.digest("SHA-256", arrayBuffer(value)))}`;
}
async function keyFromPassphrase(passphrase: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey(
    "raw",
    arrayBuffer(encoder.encode(passphrase)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: arrayBuffer(salt), iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
function json(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? { $appaloftBigInt: item.toString() } : item,
  );
}
function parseJson<T>(value: string): T {
  return JSON.parse(value, (_key, item) =>
    item && typeof item === "object" && typeof item.$appaloftBigInt === "string"
      ? item.$appaloftBigInt
      : item,
  ) as T;
}
function artifactId(): string {
  return `cpa_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

async function encrypt(
  payload: SnapshotPayload,
  passphrase: string,
  id = artifactId(),
): Promise<{ envelope: EncryptedEnvelope; serialized: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(json(payload));
  const key = await keyFromPassphrase(passphrase, salt);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: arrayBuffer(iv) },
      key,
      arrayBuffer(plaintext),
    ),
  );
  const rowCount = payload.tables.reduce((sum, table) => sum + table.rows.length, 0);
  const envelope: EncryptedEnvelope = {
    schemaVersion: "appaloft.control-plane-portability/v1",
    artifactId: id,
    createdAt: payload.createdAt,
    sourceRevision: payload.sourceRevision,
    tableCount: payload.tables.length,
    rowCount,
    encryption: {
      algorithm: "AES-GCM",
      kdf: "PBKDF2-SHA256",
      iterations,
      salt: base64(salt),
      iv: base64(iv),
    },
    checksum: await sha256(ciphertext),
    ciphertext: base64(ciphertext),
  };
  return { envelope, serialized: json(envelope) };
}

async function decrypt(
  serialized: string,
  passphrase: string,
): Promise<Result<{ envelope: EncryptedEnvelope; payload: SnapshotPayload }>> {
  try {
    const envelope = parseJson<EncryptedEnvelope>(serialized);
    if (
      envelope.schemaVersion !== "appaloft.control-plane-portability/v1" ||
      envelope.encryption?.algorithm !== "AES-GCM"
    ) {
      return err(
        domainError.validation("Control-plane portability envelope is unsupported", {
          phase: "control-plane-portability-decrypt",
        }),
      );
    }
    const ciphertext = bytes(envelope.ciphertext);
    if ((await sha256(ciphertext)) !== envelope.checksum) {
      return err(
        domainError.conflict("Control-plane portability artifact checksum does not match", {
          phase: "control-plane-portability-checksum",
          artifactId: envelope.artifactId,
        }),
      );
    }
    const key = await keyFromPassphrase(passphrase, bytes(envelope.encryption.salt));
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: arrayBuffer(bytes(envelope.encryption.iv)) },
      key,
      arrayBuffer(ciphertext),
    );
    const payload = parseJson<SnapshotPayload>(decoder.decode(plaintext));
    if (payload.schemaVersion !== "appaloft.control-plane-snapshot/v1") {
      return err(
        domainError.validation("Control-plane snapshot schema is unsupported", {
          phase: "control-plane-portability-compatibility",
        }),
      );
    }
    return ok({ envelope, payload });
  } catch {
    return err(
      domainError.validation("Control-plane portability artifact could not be decrypted", {
        phase: "control-plane-portability-decrypt",
        causeCode: "passphrase-or-envelope-invalid",
      }),
    );
  }
}

function topologicalOrder(
  names: string[],
  edges: Array<{ child: string; parent: string }>,
): string[] {
  const incoming = new Map(names.map((name) => [name, 0]));
  const children = new Map<string, string[]>();
  for (const edge of edges) {
    if (!incoming.has(edge.child) || !incoming.has(edge.parent) || edge.child === edge.parent)
      continue;
    incoming.set(edge.child, (incoming.get(edge.child) ?? 0) + 1);
    children.set(edge.parent, [...(children.get(edge.parent) ?? []), edge.child]);
  }
  const queue = names.filter((name) => incoming.get(name) === 0).sort();
  const ordered: string[] = [];
  while (queue.length) {
    const name = queue.shift() as string;
    ordered.push(name);
    for (const child of children.get(name) ?? []) {
      incoming.set(child, (incoming.get(child) ?? 1) - 1);
      if (incoming.get(child) === 0) queue.push(child);
    }
    queue.sort();
  }
  return [...ordered, ...names.filter((name) => !ordered.includes(name)).sort()];
}

export class PgControlPlanePortabilityService implements ControlPlanePortabilityPort {
  constructor(private readonly db: Kysely<Database>) {}

  private async authorize(context: RepositoryContext): Promise<Result<void>> {
    if (context.actor?.kind === "system") return ok(undefined);
    if (context.principal?.activeOrganization?.productRole !== "owner") {
      return err(
        domainError.operationAuthorizationDenied("Control-plane portability requires an owner", {
          phase: "control-plane-portability-authorization",
        }),
      );
    }
    const organizations = await sql<{
      organization_id: string;
    }>`SELECT DISTINCT organization_id FROM projects WHERE organization_id IS NOT NULL LIMIT 2`.execute(
      this.db,
    );
    const active = context.principal.activeOrganization.organizationId;
    if (
      organizations.rows.length > 1 ||
      organizations.rows.some((row) => row.organization_id !== active)
    ) {
      return err(
        domainError.operationAuthorizationDenied(
          "Whole-instance portability is unavailable from a tenant-scoped session on a multi-tenant control plane",
          { phase: "control-plane-portability-authorization" },
        ),
      );
    }
    return ok(undefined);
  }

  private async revision(executor: Kysely<Database> = this.db): Promise<string> {
    const result = await sql<{
      name: string;
    }>`SELECT name FROM kysely_migration ORDER BY timestamp DESC LIMIT 1`.execute(executor);
    return result.rows[0]?.name ?? "unversioned";
  }

  private async tableMetadata(executor: Kysely<Database> = this.db) {
    const tables = await sql<{
      tablename: string;
    }>`SELECT tablename FROM pg_tables WHERE schemaname = current_schema() ORDER BY tablename`.execute(
      executor,
    );
    const names = tables.rows
      .map((row) => row.tablename)
      .filter((name) => !excludedTables.has(name) && /^[a-z_][a-z0-9_]*$/.test(name));
    const keys = await sql<{ table_name: string; column_name: string; ordinal_position: number }>`
      SELECT tc.table_name, kcu.column_name, kcu.ordinal_position
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = current_schema() AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY tc.table_name, kcu.ordinal_position
    `.execute(executor);
    const foreignKeys = await sql<{ child: string; parent: string }>`
      SELECT tc.table_name AS child, ccu.table_name AS parent
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
      WHERE tc.table_schema = current_schema() AND tc.constraint_type = 'FOREIGN KEY'
    `.execute(executor);
    const primaryKeys = new Map<string, string[]>();
    for (const row of keys.rows)
      primaryKeys.set(row.table_name, [
        ...(primaryKeys.get(row.table_name) ?? []),
        row.column_name,
      ]);
    return { names: topologicalOrder(names, foreignKeys.rows), primaryKeys };
  }

  private async snapshot(executor: Kysely<Database> = this.db): Promise<SnapshotPayload> {
    const metadata = await this.tableMetadata(executor);
    const tables: SnapshotTable[] = [];
    for (const name of metadata.names) {
      const rows = await sql<Record<string, unknown>>`SELECT * FROM ${identifier(name)}`.execute(
        executor,
      );
      tables.push({ name, primaryKey: metadata.primaryKeys.get(name) ?? [], rows: rows.rows });
    }
    return {
      schemaVersion: "appaloft.control-plane-snapshot/v1",
      sourceRevision: await this.revision(executor),
      createdAt: new Date().toISOString(),
      tables,
    };
  }

  async planExport(context: RepositoryContext): Promise<Result<ControlPlaneExportPlan>> {
    const authorized = await this.authorize(context);
    if (authorized.isErr()) return err(authorized.error);
    try {
      const snapshot = await this.snapshot();
      return ok({
        schemaVersion: "control-plane-portability.export-plan/v1",
        sourceRevision: snapshot.sourceRevision,
        tables: snapshot.tables.map((table) => ({ name: table.name, rowCount: table.rows.length })),
        totalRows: snapshot.tables.reduce((sum, table) => sum + table.rows.length, 0),
        warnings: [
          "External provider resources are exported as Appaloft references and intent only.",
        ],
      });
    } catch (error) {
      return err(
        domainError.infra("Control-plane export plan could not be created", {
          phase: "control-plane-portability-export-plan",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }

  async export(
    context: RepositoryContext,
    input: { passphrase: string },
  ): Promise<Result<ControlPlaneExportResult>> {
    const authorized = await this.authorize(context);
    if (authorized.isErr()) return err(authorized.error);
    try {
      const snapshot = await this.snapshot();
      return this.persistEncrypted(snapshot, input.passphrase, "export");
    } catch (error) {
      return err(
        domainError.infra("Control-plane export could not be created", {
          phase: "control-plane-portability-export",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }

  private async persistEncrypted(
    snapshot: SnapshotPayload,
    passphrase: string,
    kind: ControlPlanePortabilityArtifactSummary["kind"],
  ): Promise<Result<ControlPlaneExportResult>> {
    const encrypted = await encrypt(snapshot, passphrase);
    const sizeBytes = Buffer.byteLength(encrypted.serialized);
    const summary: ControlPlanePortabilityArtifactSummary = {
      id: encrypted.envelope.artifactId,
      schemaVersion: "appaloft.control-plane-portability/v1",
      createdAt: encrypted.envelope.createdAt,
      sourceRevision: encrypted.envelope.sourceRevision,
      tableCount: encrypted.envelope.tableCount,
      rowCount: encrypted.envelope.rowCount,
      checksum: encrypted.envelope.checksum,
      sizeBytes,
      kind,
    };
    await this.db
      .insertInto("control_plane_portability_artifacts")
      .values({
        id: summary.id,
        schema_version: summary.schemaVersion,
        created_at: summary.createdAt,
        source_revision: summary.sourceRevision,
        table_count: summary.tableCount,
        row_count: summary.rowCount,
        checksum: summary.checksum,
        size_bytes: summary.sizeBytes,
        kind: summary.kind,
        encrypted_envelope: encrypted.serialized,
      })
      .execute();
    return ok({
      schemaVersion: "control-plane-portability.export/v1",
      artifact: summary,
      encryptedEnvelope: encrypted.serialized,
    });
  }

  async planImport(
    context: RepositoryContext,
    input: { encryptedEnvelope: string; passphrase: string; mode: ControlPlaneImportMode },
  ): Promise<Result<ControlPlaneImportPlan>> {
    const authorized = await this.authorize(context);
    if (authorized.isErr()) return err(authorized.error);
    const decrypted = await decrypt(input.encryptedEnvelope, input.passphrase);
    if (decrypted.isErr()) return err(decrypted.error);
    try {
      const targetRevision = await this.revision();
      const metadata = await this.tableMetadata();
      const targetTables = new Set(metadata.names);
      const tables: ControlPlaneImportPlan["tables"] = [];
      const blockers: string[] = [];
      if (decrypted.value.payload.sourceRevision !== targetRevision) {
        blockers.push(
          `schema-revision-mismatch:${decrypted.value.payload.sourceRevision}:${targetRevision}`,
        );
      }
      for (const table of decrypted.value.payload.tables) {
        if (!targetTables.has(table.name)) {
          blockers.push(`missing-target-table:${table.name}`);
          continue;
        }
        const count = await sql<{
          count: string | number;
        }>`SELECT COUNT(*) AS count FROM ${identifier(table.name)}`.execute(this.db);
        const existingRows = Number(count.rows[0]?.count ?? 0);
        tables.push({
          name: table.name,
          incomingRows: table.rows.length,
          existingRows,
          conflicts:
            input.mode === "merge" ? Math.min(existingRows, table.rows.length) : existingRows,
        });
      }
      return ok({
        schemaVersion: "control-plane-portability.import-plan/v1",
        compatible: blockers.length === 0,
        mode: input.mode,
        sourceRevision: decrypted.value.payload.sourceRevision,
        targetRevision,
        tables,
        blockers,
        warnings: [
          "External provider resources are not recreated; references require post-import verification.",
          ...(input.mode === "replace"
            ? [
                "Replace deletes current portable tables inside a transaction and creates a rollback artifact first.",
              ]
            : []),
        ],
      });
    } catch (error) {
      return err(
        domainError.infra("Control-plane import plan could not be created", {
          phase: "control-plane-portability-import-plan",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }

  async importControlPlane(
    context: RepositoryContext,
    input: {
      encryptedEnvelope: string;
      passphrase: string;
      mode: ControlPlaneImportMode;
      acknowledgeReplace: boolean;
    },
  ): Promise<Result<ControlPlaneImportResult>> {
    const authorized = await this.authorize(context);
    if (authorized.isErr()) return err(authorized.error);
    if (input.mode === "replace" && !input.acknowledgeReplace)
      return err(
        domainError.validation("Replace import requires explicit destructive acknowledgement", {
          phase: "control-plane-portability-import-admission",
        }),
      );
    const decrypted = await decrypt(input.encryptedEnvelope, input.passphrase);
    if (decrypted.isErr()) return err(decrypted.error);
    const plan = await this.planImport(context, input);
    if (plan.isErr()) return err(plan.error);
    if (!plan.value.compatible)
      return err(
        domainError.conflict("Control-plane portability artifact is incompatible with the target", {
          phase: "control-plane-portability-compatibility",
          blockers: plan.value.blockers.join(","),
        }),
      );
    const rollback = await this.persistEncrypted(
      await this.snapshot(),
      input.passphrase,
      "rollback",
    );
    if (rollback.isErr()) return err(rollback.error);
    try {
      let importedRows = 0;
      let updatedRows = 0;
      await this.db.transaction().execute(async (transaction) => {
        const tables = decrypted.value.payload.tables;
        if (input.mode === "replace") {
          for (const table of [...tables].reverse())
            await sql`DELETE FROM ${identifier(table.name)}`.execute(transaction);
        }
        for (const table of tables) {
          for (const row of table.rows) {
            const columns = Object.keys(row).filter((column) => /^[a-z_][a-z0-9_]*$/.test(column));
            if (columns.length === 0) continue;
            const columnSql = sql.join(columns.map(identifier));
            const valueSql = sql.join(columns.map((column) => sql`${row[column]}`));
            const primaryKey = table.primaryKey.filter((column) => columns.includes(column));
            const mutable = columns.filter((column) => !primaryKey.includes(column));
            let existed = false;
            if (input.mode === "merge" && primaryKey.length > 0) {
              const predicate = sql.join(
                primaryKey.map((column) => sql`${identifier(column)} = ${row[column]}`),
                sql` AND `,
              );
              const current = await sql<{
                present: number;
              }>`SELECT 1 AS present FROM ${identifier(table.name)} WHERE ${predicate} LIMIT 1`.execute(
                transaction,
              );
              existed = current.rows.length > 0;
            }
            const conflict =
              primaryKey.length === 0
                ? sql`ON CONFLICT DO NOTHING`
                : mutable.length === 0
                  ? sql`ON CONFLICT (${sql.join(primaryKey.map(identifier))}) DO NOTHING`
                  : sql`ON CONFLICT (${sql.join(primaryKey.map(identifier))}) DO UPDATE SET ${sql.join(mutable.map((column) => sql`${identifier(column)} = EXCLUDED.${identifier(column)}`))}`;
            const applied = await sql<{
              applied: boolean;
            }>`INSERT INTO ${identifier(table.name)} (${columnSql}) VALUES (${valueSql}) ${conflict} RETURNING true AS applied`.execute(
              transaction,
            );
            importedRows += applied.rows.length;
            if (existed && mutable.length > 0 && applied.rows.length > 0) updatedRows += 1;
          }
        }
      });
      return ok({
        schemaVersion: "control-plane-portability.import/v1",
        mode: input.mode,
        importedRows,
        updatedRows,
        rollbackArtifactId: rollback.value.artifact.id,
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      return err(
        domainError.infra("Control-plane import failed and database changes were rolled back", {
          phase: "control-plane-portability-import",
          rollbackArtifactId: rollback.value.artifact.id,
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }

  private summary(row: {
    id: string;
    schema_version: string;
    created_at: string | Date;
    source_revision: string;
    table_count: number;
    row_count: number;
    checksum: string;
    size_bytes: string | number | bigint;
    kind: string;
  }): ControlPlanePortabilityArtifactSummary {
    return {
      id: row.id,
      schemaVersion: "appaloft.control-plane-portability/v1",
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      sourceRevision: row.source_revision,
      tableCount: row.table_count,
      rowCount: row.row_count,
      checksum: row.checksum,
      sizeBytes: Number(row.size_bytes),
      kind: row.kind as ControlPlanePortabilityArtifactSummary["kind"],
    };
  }
  async listArtifacts(
    context: RepositoryContext,
  ): Promise<Result<ControlPlanePortabilityArtifactSummary[]>> {
    const authorized = await this.authorize(context);
    if (authorized.isErr()) return err(authorized.error);
    try {
      return ok(
        (
          await this.db
            .selectFrom("control_plane_portability_artifacts")
            .select([
              "id",
              "schema_version",
              "created_at",
              "source_revision",
              "table_count",
              "row_count",
              "checksum",
              "size_bytes",
              "kind",
            ])
            .orderBy("created_at", "desc")
            .execute()
        ).map((row) => this.summary(row)),
      );
    } catch (error) {
      return err(
        domainError.infra("Portability artifacts could not be listed", {
          phase: "control-plane-portability-artifact-read",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }
  async showArtifact(
    context: RepositoryContext,
    artifactIdValue: string,
  ): Promise<Result<ControlPlanePortabilityArtifactSummary>> {
    const authorized = await this.authorize(context);
    if (authorized.isErr()) return err(authorized.error);
    const row = await this.db
      .selectFrom("control_plane_portability_artifacts")
      .select([
        "id",
        "schema_version",
        "created_at",
        "source_revision",
        "table_count",
        "row_count",
        "checksum",
        "size_bytes",
        "kind",
      ])
      .where("id", "=", artifactIdValue)
      .executeTakeFirst();
    return row
      ? ok(this.summary(row))
      : err(domainError.notFound("control_plane_portability_artifact", artifactIdValue));
  }
  async deleteArtifact(
    context: RepositoryContext,
    artifactIdValue: string,
  ): Promise<Result<{ id: string; deletedAt: string }>> {
    const authorized = await this.authorize(context);
    if (authorized.isErr()) return err(authorized.error);
    const deleted = await this.db
      .deleteFrom("control_plane_portability_artifacts")
      .where("id", "=", artifactIdValue)
      .returning("id")
      .executeTakeFirst();
    return deleted
      ? ok({ id: deleted.id, deletedAt: new Date().toISOString() })
      : err(domainError.notFound("control_plane_portability_artifact", artifactIdValue));
  }
}
