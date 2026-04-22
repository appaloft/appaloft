import { join } from "node:path";
import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";
import { createDatabase, type DatabaseConnection } from "@appaloft/persistence-pg";

type MergeableTableName =
  | "projects"
  | "servers"
  | "ssh_credentials"
  | "destinations"
  | "environments"
  | "resources"
  | "environment_variables"
  | "deployments"
  | "domain_bindings"
  | "certificates"
  | "certificate_secrets"
  | "audit_logs"
  | "provider_job_logs"
  | "source_links"
  | "default_access_domain_policies"
  | "server_applied_route_states";

interface MergeableTable {
  name: MergeableTableName;
  primaryKey: string;
}

type MergeRow = Record<string, unknown>;
type DatabaseHandle = DatabaseConnection["db"];

interface TableDiff {
  table: MergeableTable;
  upserts: MergeRow[];
  deletions: MergeRow[];
}

const mergeableTables: readonly MergeableTable[] = [
  { name: "projects", primaryKey: "id" },
  { name: "ssh_credentials", primaryKey: "id" },
  { name: "servers", primaryKey: "id" },
  { name: "environments", primaryKey: "id" },
  { name: "destinations", primaryKey: "id" },
  { name: "resources", primaryKey: "id" },
  { name: "environment_variables", primaryKey: "id" },
  { name: "deployments", primaryKey: "id" },
  { name: "domain_bindings", primaryKey: "id" },
  { name: "certificates", primaryKey: "id" },
  { name: "certificate_secrets", primaryKey: "ref" },
  { name: "audit_logs", primaryKey: "id" },
  { name: "provider_job_logs", primaryKey: "id" },
  { name: "source_links", primaryKey: "source_fingerprint" },
  { name: "default_access_domain_policies", primaryKey: "id" },
  { name: "server_applied_route_states", primaryKey: "route_set_id" },
] as const;

function mergeConflictError(
  table: MergeableTable,
  row: MergeRow | undefined,
  details?: Record<string, string | number | boolean | null>,
): DomainError {
  const keyValue = row?.[table.primaryKey];

  return domainError.infra("SSH remote PGlite state could not merge overlapping row changes", {
    phase: "remote-state-sync-upload",
    reason: "remote_state_merge_conflict",
    table: table.name,
    primaryKey: table.primaryKey,
    ...(typeof keyValue === "string" || typeof keyValue === "number"
      ? { primaryKeyValue: String(keyValue) }
      : {}),
    ...(details ?? {}),
  });
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableValue(item));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, stableValue(record[key])]),
    );
  }

  return value;
}

function stableRow(row: MergeRow | undefined): string {
  return JSON.stringify(row === undefined ? null : stableValue(row));
}

function rowEquals(left: MergeRow | undefined, right: MergeRow | undefined): boolean {
  return stableRow(left) === stableRow(right);
}

function rowKey(table: MergeableTable, row: MergeRow): Result<string> {
  const keyValue = row[table.primaryKey];
  if (typeof keyValue === "string" || typeof keyValue === "number") {
    return ok(String(keyValue));
  }

  return err(
    mergeConflictError(table, row, {
      reason: "remote_state_merge_invalid_primary_key",
    }),
  );
}

function buildRowMap(
  table: MergeableTable,
  rows: readonly MergeRow[],
): Result<Map<string, MergeRow>> {
  const map = new Map<string, MergeRow>();

  for (const row of rows) {
    const key = rowKey(table, row);
    if (key.isErr()) {
      return err(key.error);
    }
    map.set(key.value, row);
  }

  return ok(map);
}

function omitPrimaryKey(table: MergeableTable, row: MergeRow): MergeRow {
  return Object.fromEntries(Object.entries(row).filter(([column]) => column !== table.primaryKey));
}

async function readRows(db: DatabaseHandle, table: MergeableTable): Promise<readonly MergeRow[]> {
  const rows = await db
    .selectFrom(table.name as never)
    .selectAll()
    .execute();
  return rows as readonly MergeRow[];
}

async function deleteRow(db: DatabaseHandle, table: MergeableTable, row: MergeRow): Promise<void> {
  const key = row[table.primaryKey];
  await db
    .deleteFrom(table.name as never)
    .where(table.primaryKey as never, "=", key as never)
    .execute();
}

async function upsertRow(db: DatabaseHandle, table: MergeableTable, row: MergeRow): Promise<void> {
  const updateValues = omitPrimaryKey(table, row);

  await db
    .insertInto(table.name as never)
    .values(row as never)
    .onConflict(
      (conflict) =>
        conflict.column(table.primaryKey as never).doUpdateSet(updateValues as never) as never,
    )
    .execute();
}

export interface MergeRemotePgliteStateInput {
  baseDataRoot: string;
  localDataRoot: string;
  targetDataRoot: string;
}

export async function mergeRemotePgliteState(
  input: MergeRemotePgliteStateInput,
): Promise<Result<void>> {
  const base = await createDatabase({
    driver: "pglite",
    pgliteDataDir: join(input.baseDataRoot, "pglite"),
  });
  const local = await createDatabase({
    driver: "pglite",
    pgliteDataDir: join(input.localDataRoot, "pglite"),
  });
  const target = await createDatabase({
    driver: "pglite",
    pgliteDataDir: join(input.targetDataRoot, "pglite"),
  });

  try {
    const diffs: TableDiff[] = [];

    for (const table of mergeableTables) {
      const [baseRows, localRows] = await Promise.all([
        readRows(base.db, table),
        readRows(local.db, table),
      ]);
      const baseMap = buildRowMap(table, baseRows);
      if (baseMap.isErr()) {
        return err(baseMap.error);
      }
      const localMap = buildRowMap(table, localRows);
      if (localMap.isErr()) {
        return err(localMap.error);
      }

      const keys = new Set([...baseMap.value.keys(), ...localMap.value.keys()]);
      const upserts: MergeRow[] = [];
      const deletions: MergeRow[] = [];

      for (const key of keys) {
        const baseRow = baseMap.value.get(key);
        const localRow = localMap.value.get(key);
        if (rowEquals(baseRow, localRow)) {
          continue;
        }

        if (localRow) {
          upserts.push(localRow);
          continue;
        }

        if (baseRow) {
          deletions.push(baseRow);
        }
      }

      diffs.push({ table, upserts, deletions });
    }

    for (const diff of diffs.toReversed()) {
      if (diff.deletions.length === 0) {
        continue;
      }

      const targetRows = await readRows(target.db, diff.table);
      const targetMap = buildRowMap(diff.table, targetRows);
      if (targetMap.isErr()) {
        return err(targetMap.error);
      }

      for (const row of diff.deletions) {
        const key = rowKey(diff.table, row);
        if (key.isErr()) {
          return err(key.error);
        }

        const targetRow = targetMap.value.get(key.value);
        if (!targetRow) {
          continue;
        }

        if (!rowEquals(targetRow, row)) {
          return err(
            mergeConflictError(diff.table, row, {
              conflictStage: "delete",
            }),
          );
        }

        await deleteRow(target.db, diff.table, row);
      }
    }

    for (const diff of diffs) {
      if (diff.upserts.length === 0) {
        continue;
      }

      const [baseRows, targetRows] = await Promise.all([
        readRows(base.db, diff.table),
        readRows(target.db, diff.table),
      ]);
      const baseMap = buildRowMap(diff.table, baseRows);
      if (baseMap.isErr()) {
        return err(baseMap.error);
      }
      const targetMap = buildRowMap(diff.table, targetRows);
      if (targetMap.isErr()) {
        return err(targetMap.error);
      }

      for (const row of diff.upserts) {
        const key = rowKey(diff.table, row);
        if (key.isErr()) {
          return err(key.error);
        }

        const baseRow = baseMap.value.get(key.value);
        const targetRow = targetMap.value.get(key.value);

        if (baseRow) {
          if (!targetRow) {
            return err(
              mergeConflictError(diff.table, row, {
                conflictStage: "upsert",
                conflictReason: "remote_row_deleted",
              }),
            );
          }

          if (!rowEquals(targetRow, baseRow) && !rowEquals(targetRow, row)) {
            return err(
              mergeConflictError(diff.table, row, {
                conflictStage: "upsert",
                conflictReason: "remote_row_changed",
              }),
            );
          }
        } else if (targetRow && !rowEquals(targetRow, row)) {
          return err(
            mergeConflictError(diff.table, row, {
              conflictStage: "insert",
              conflictReason: "remote_row_already_exists",
            }),
          );
        }

        await upsertRow(target.db, diff.table, row);
      }
    }

    return ok(undefined);
  } catch (error) {
    return err(
      domainError.infra("SSH remote PGlite state merge failed", {
        phase: "remote-state-sync-upload",
        reason: "remote_state_merge_failed",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  } finally {
    await Promise.all([base.close(), local.close(), target.close()]);
  }
}
