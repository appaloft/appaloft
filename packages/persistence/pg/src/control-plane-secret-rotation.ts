import { createHash } from "node:crypto";

import {
  type ControlPlaneSecretContext,
  type ControlPlaneSecretEnvelopeState,
  type ControlPlaneSecretProtector,
  type ControlPlaneSecretRotationApplyInput,
  type ControlPlaneSecretRotationApplyResult,
  type ControlPlaneSecretRotationPlan,
  type ControlPlaneSecretRotationPort,
  type ControlPlaneSecretRotationUnreadableFinding,
} from "@appaloft/application";
import { type DomainError, err, ok, type Result } from "@appaloft/core";
import { type Kysely, type Transaction } from "kysely";

import { type Database } from "./schema";

type RotationDatabase = Kysely<Database> | Transaction<Database>;
type RotationTable =
  | "environment_variables"
  | "resource_variables"
  | "dependency_resource_secrets"
  | "dependency_binding_secrets"
  | "deployments";
interface RotationRecord {
  table: RotationTable;
  id: string;
  context: ControlPlaneSecretContext;
  value: string;
  state: ControlPlaneSecretEnvelopeState;
  keyId?: string;
  variableIndex?: number;
  snapshot?: Record<string, unknown>;
  finding: Omit<ControlPlaneSecretRotationUnreadableFinding, "reason" | "keyId">;
}

export interface ControlPlaneSecretRotationFaultInjector {
  afterWrite?(completedWriteCount: number): void;
}

function rotationError(code: string, message: string, reason: string): DomainError {
  return {
    code,
    category: "infra",
    message,
    retryable: false,
    details: { phase: "control-plane-secret-rotation", reason },
  };
}

function payloadValue(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const value = (payload as { value?: unknown }).value;
  return typeof value === "string" ? value : undefined;
}

function snapshotVariables(snapshot: Record<string, unknown>): unknown[] {
  return Array.isArray(snapshot.variables) ? snapshot.variables : [];
}

function rotationDigest(records: readonly RotationRecord[], activeKeyId: string | null): string {
  const hash = createHash("sha256");
  hash.update(activeKeyId ?? "unavailable");
  for (const record of [...records].sort((left, right) =>
    `${left.table}:${left.id}`.localeCompare(`${right.table}:${right.id}`),
  )) {
    hash.update(record.table);
    hash.update("\0");
    hash.update(record.id);
    hash.update("\0");
    hash.update(record.context.purpose);
    hash.update("\0");
    hash.update(record.value);
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

function persistenceRecordIdentity(record: RotationRecord): string {
  if (record.table !== "deployments") return `${record.table}:${record.id}`;
  return `${record.table}:${record.id.slice(0, record.id.lastIndexOf(":"))}`;
}

const maxUnreadableFindings = 100;

function unreadableReason(error: DomainError): string {
  return typeof error.details?.reason === "string" ? error.details.reason : "unreadable";
}

function sqlStateCode(error: unknown): string | undefined {
  let candidate = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof candidate !== "object" || candidate === null) return undefined;
    if (
      "code" in candidate &&
      typeof (candidate as { code?: unknown }).code === "string" &&
      /^[0-9A-Z]{5}$/.test((candidate as { code: string }).code)
    ) {
      return (candidate as { code: string }).code;
    }
    candidate = "cause" in candidate ? (candidate as { cause?: unknown }).cause : undefined;
  }
  return undefined;
}

function sourceReadFailureReason(source: string, error: unknown): string {
  switch (sqlStateCode(error)) {
    case "42703":
      return `${source}-schema-incompatible`;
    case "0A000":
      return `${source}-feature-unsupported`;
    case "55000":
      return `${source}-state-unavailable`;
    case "XX001":
    case "XX002":
      return `${source}-storage-corrupt`;
    default:
      return `${source}-read-failed`;
  }
}

async function readOptionalRotationSource<T>(
  source: string,
  read: () => Promise<T[]>,
): Promise<T[]> {
  try {
    return await read();
  } catch (error) {
    if (sqlStateCode(error) === "42P01") return [];
    throw rotationError(
      "control_plane_secret_rotation_source_read_failed",
      "A control-plane secret rotation source could not be read",
      sourceReadFailureReason(source, error),
    );
  }
}

export class PgControlPlaneSecretRotationService implements ControlPlaneSecretRotationPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly secretProtector: ControlPlaneSecretProtector,
    private readonly faultInjector?: ControlPlaneSecretRotationFaultInjector,
  ) {}

  async plan(): Promise<Result<ControlPlaneSecretRotationPlan>> {
    try {
      return ok(await this.planWith(this.db));
    } catch (error) {
      const safe = error as Partial<DomainError>;
      if (
        typeof safe.code === "string" &&
        typeof safe.message === "string" &&
        typeof safe.category === "string" &&
        typeof safe.retryable === "boolean"
      ) {
        return err(error as DomainError);
      }
      return err(
        rotationError(
          "control_plane_secret_rotation_plan_failed",
          "Control-plane secret rotation dry-run failed",
          "plan-read-failed",
        ),
      );
    }
  }

  async apply(
    input: ControlPlaneSecretRotationApplyInput,
  ): Promise<Result<ControlPlaneSecretRotationApplyResult>> {
    if (!input.backupReference.trim()) {
      return err(
        rotationError(
          "control_plane_secret_rotation_backup_required",
          "An external backup reference is required before rotation",
          "backup-reference-missing",
        ),
      );
    }
    const activeKeyId = this.secretProtector.activeKeyId();
    if (!activeKeyId) {
      return err(
        rotationError(
          "control_plane_secret_keyring_unavailable",
          "Control-plane secret keyring is unavailable; rotation was blocked",
          "keyring-unavailable",
        ),
      );
    }

    try {
      const result = await this.db.transaction().execute(async (transaction) => {
        const records = await this.collect(transaction);
        const digest = rotationDigest(records, activeKeyId);
        if (digest !== input.planDigest) {
          throw rotationError(
            "control_plane_secret_rotation_plan_stale",
            "The rotation plan is stale; run dry-run again",
            "plan-digest-mismatch",
          );
        }

        const prepared = [] as Array<{
          record: RotationRecord;
          envelope: string;
          changed: boolean;
        }>;
        for (const record of records) {
          const rewrapped = await this.secretProtector.rewrap(record.context, record.value, {
            allowLegacyPlaintext: input.allowLegacyPlaintext,
          });
          if (rewrapped.isErr()) throw rewrapped.error;
          prepared.push({
            record,
            envelope: rewrapped.value.envelope,
            changed: rewrapped.value.changed,
          });
        }

        let writeCount = 0;
        for (const item of prepared.filter((candidate) => candidate.changed)) {
          await this.write(transaction, item.record, item.envelope);
          writeCount += 1;
          this.faultInjector?.afterWrite?.(writeCount);
        }

        return {
          schemaVersion: "control-plane.secret-rotation-result/v1" as const,
          activeKeyId,
          matchedRecordCount: records.length,
          rotatedRecordCount: writeCount,
          unchangedRecordCount: records.length - writeCount,
          planDigest: digest,
          status: writeCount === 0 ? ("already-active" as const) : ("applied" as const),
        };
      });
      return ok(result);
    } catch (error) {
      const safe = error as Partial<DomainError>;
      if (
        typeof safe.code === "string" &&
        typeof safe.message === "string" &&
        typeof safe.category === "string" &&
        typeof safe.retryable === "boolean"
      ) {
        return err(error as DomainError);
      }
      return err(
        rotationError(
          "control_plane_secret_rotation_failed",
          "Control-plane secret rotation failed and was rolled back",
          "transaction-rolled-back",
        ),
      );
    }
  }

  private async planWith(db: RotationDatabase): Promise<ControlPlaneSecretRotationPlan> {
    const records = await this.collect(db);
    const stateCounts = {
      "active-key": 0,
      "retained-key": 0,
      "legacy-plaintext": 0,
      unreadable: 0,
    } satisfies Record<ControlPlaneSecretEnvelopeState, number>;
    const unreadableFindings: ControlPlaneSecretRotationUnreadableFinding[] = [];
    for (const record of records) {
      if (record.state === "unreadable") {
        const authenticated = await this.secretProtector.unprotect(record.context, record.value);
        stateCounts.unreadable += 1;
        if (unreadableFindings.length < maxUnreadableFindings) {
          unreadableFindings.push({
            ...record.finding,
            ...(record.keyId ? { keyId: record.keyId } : {}),
            reason: authenticated.isErr() ? unreadableReason(authenticated.error) : "unreadable",
          });
        }
        continue;
      }
      if (record.state === "active-key" || record.state === "retained-key") {
        const authenticated = await this.secretProtector.unprotect(record.context, record.value);
        if (authenticated.isErr()) {
          stateCounts.unreadable += 1;
          if (unreadableFindings.length < maxUnreadableFindings) {
            unreadableFindings.push({
              ...record.finding,
              ...(record.keyId ? { keyId: record.keyId } : {}),
              reason: unreadableReason(authenticated.error),
            });
          }
          continue;
        }
      }
      stateCounts[record.state] += 1;
    }
    const activeKeyId = this.secretProtector.activeKeyId();
    return {
      schemaVersion: "control-plane.secret-rotation-plan/v1",
      activeKeyId,
      recordCount: new Set(records.map(persistenceRecordIdentity)).size,
      variableKeyCount: records.length,
      stateCounts,
      requiresLegacyAuthorization: stateCounts["legacy-plaintext"] > 0,
      ready: Boolean(activeKeyId) && stateCounts.unreadable === 0,
      planDigest: rotationDigest(records, activeKeyId),
      unreadableFindings,
      unreadableFindingsTruncated: stateCounts.unreadable > unreadableFindings.length,
    };
  }

  private async collect(db: RotationDatabase): Promise<RotationRecord[]> {
    // Rotation planning intentionally runs before application migrations and may inspect a fresh or
    // partially initialized state. Read every source directly and treat only PostgreSQL's exact
    // undefined-table code as an empty source; every other read failure still fails the operation
    // closed. This keeps first deployment safe without relying on version-specific schema catalogs.
    // Keep source reads ordered so a failed maintenance plan has one deterministic safe reason and
    // does not leave concurrent reads running while the coordinated mirror is being closed.
    const environmentRows = await readOptionalRotationSource("environment-variables", () =>
      db
        .selectFrom("environment_variables")
        .select(["id", "environment_id", "key", "value"])
        .where("is_secret", "=", true)
        .execute(),
    );
    const resourceRows = await readOptionalRotationSource("resource-variables", () =>
      db
        .selectFrom("resource_variables")
        .select(["id", "resource_id", "key", "value"])
        .where("is_secret", "=", true)
        .execute(),
    );
    const dependencyRows = await readOptionalRotationSource("dependency-resource-secrets", () =>
      db
        .selectFrom("dependency_resource_secrets")
        .select(["ref", "dependency_resource_id", "environment_id", "payload"])
        .execute(),
    );
    const bindingRows = await readOptionalRotationSource("dependency-binding-secrets", () =>
      db
        .selectFrom("dependency_binding_secrets")
        .select(["ref", "binding_id", "resource_id", "payload"])
        .execute(),
    );
    const deploymentRows = await readOptionalRotationSource("deployment-snapshots", () =>
      db.selectFrom("deployments").select(["id", "environment_snapshot"]).execute(),
    );
    const records: RotationRecord[] = [];
    const append = (
      table: RotationTable,
      id: string,
      context: ControlPlaneSecretContext,
      value: string,
      finding: RotationRecord["finding"],
      extras: Omit<Partial<RotationRecord>, "finding"> = {},
    ) => {
      const inspected = this.secretProtector.inspect(value);
      records.push({ table, id, context, value, finding, ...inspected, ...extras });
    };
    for (const row of environmentRows) {
      append("environment_variables", row.id, { purpose: "environment-variable" }, row.value, {
        source: "environment-variable",
        recordId: row.id,
        purpose: "environment-variable",
        environmentId: row.environment_id,
        variableKey: row.key,
      });
    }
    for (const row of resourceRows) {
      append("resource_variables", row.id, { purpose: "resource-variable" }, row.value, {
        source: "resource-variable",
        recordId: row.id,
        purpose: "resource-variable",
        resourceId: row.resource_id,
        variableKey: row.key,
      });
    }
    for (const row of dependencyRows) {
      const value = payloadValue(row.payload);
      if (value)
        append("dependency_resource_secrets", row.ref, { purpose: "dependency-resource" }, value, {
          source: "dependency-resource-secret",
          recordId: row.ref,
          purpose: "dependency-resource",
          dependencyResourceId: row.dependency_resource_id,
          environmentId: row.environment_id,
        });
    }
    for (const row of bindingRows) {
      const value = payloadValue(row.payload);
      if (value)
        append("dependency_binding_secrets", row.ref, { purpose: "dependency-binding" }, value, {
          source: "dependency-binding-secret",
          recordId: row.ref,
          purpose: "dependency-binding",
          bindingId: row.binding_id,
          resourceId: row.resource_id,
        });
    }
    for (const row of deploymentRows) {
      const variables = snapshotVariables(row.environment_snapshot);
      variables.forEach((candidate, variableIndex) => {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return;
        const variable = candidate as Record<string, unknown>;
        if (variable.isSecret !== true || typeof variable.value !== "string") return;
        append(
          "deployments",
          `${row.id}:${variableIndex}`,
          { purpose: variable.scope === "resource" ? "resource-variable" : "environment-variable" },
          variable.value,
          {
            source: "deployment-snapshot-variable",
            recordId: row.id,
            purpose: variable.scope === "resource" ? "resource-variable" : "environment-variable",
            deploymentId: row.id,
            ...(typeof variable.key === "string" ? { variableKey: variable.key } : {}),
            variableIndex,
          },
          { variableIndex, snapshot: row.environment_snapshot },
        );
      });
    }
    return records;
  }

  private async write(
    db: Transaction<Database>,
    record: RotationRecord,
    envelope: string,
  ): Promise<void> {
    switch (record.table) {
      case "environment_variables":
        await db
          .updateTable(record.table)
          .set({ value: envelope })
          .where("id", "=", record.id)
          .execute();
        return;
      case "resource_variables":
        await db
          .updateTable(record.table)
          .set({ value: envelope })
          .where("id", "=", record.id)
          .execute();
        return;
      case "dependency_resource_secrets":
      case "dependency_binding_secrets": {
        const row = await db
          .selectFrom(record.table)
          .select("payload")
          .where("ref", "=", record.id)
          .executeTakeFirstOrThrow();
        await db
          .updateTable(record.table)
          .set({ payload: { ...row.payload, value: envelope } })
          .where("ref", "=", record.id)
          .execute();
        return;
      }
      case "deployments": {
        const separator = record.id.lastIndexOf(":");
        const deploymentId = record.id.slice(0, separator);
        const variableIndex = record.variableIndex;
        if (variableIndex === undefined)
          throw new Error("rotation deployment variable index missing");
        const row = await db
          .selectFrom("deployments")
          .select("environment_snapshot")
          .where("id", "=", deploymentId)
          .executeTakeFirstOrThrow();
        const variables = snapshotVariables(row.environment_snapshot).map((variable, index) =>
          index === variableIndex &&
          variable &&
          typeof variable === "object" &&
          !Array.isArray(variable)
            ? { ...(variable as Record<string, unknown>), value: envelope }
            : variable,
        );
        await db
          .updateTable("deployments")
          .set({ environment_snapshot: { ...row.environment_snapshot, variables } })
          .where("id", "=", deploymentId)
          .execute();
      }
    }
  }
}
