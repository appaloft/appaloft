import {
  type MarkServerAppliedRouteAppliedSpec,
  type MarkServerAppliedRouteFailedSpec,
  type ServerAppliedRouteAppliedState,
  type ServerAppliedRouteDesiredStateDomain,
  type ServerAppliedRouteDesiredStateRecord,
  type ServerAppliedRouteDesiredStateTarget,
  type ServerAppliedRouteFailureState,
  type ServerAppliedRouteStateByRouteSetIdSpec,
  type ServerAppliedRouteStateBySourceFingerprintSpec,
  type ServerAppliedRouteStateByTargetSpec,
  type ServerAppliedRouteStateRepository,
  type ServerAppliedRouteStateSelectionSpec,
  type ServerAppliedRouteStateSelectionSpecVisitor,
  type ServerAppliedRouteStateUpdateSpec,
  type ServerAppliedRouteStateUpdateSpecVisitor,
  type ServerAppliedRouteStateUpsertSpec,
  type ServerAppliedRouteStateUpsertSpecVisitor,
  type UpsertServerAppliedRouteDesiredStateSpec,
} from "@appaloft/application";
import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";
import {
  type Insertable,
  type Kysely,
  type Selectable,
  type SelectQueryBuilder,
  type Updateable,
} from "kysely";

import { type Database, type ServerAppliedRouteStatesTable } from "../schema";

type ServerAppliedRouteStateRow = Selectable<ServerAppliedRouteStatesTable>;
type JsonRecord = Record<string, unknown>;
type ServerAppliedRouteStateSelectionQuery = SelectQueryBuilder<
  Database,
  "server_applied_route_states",
  Selectable<Database["server_applied_route_states"]>
>;
type WhereCapableQuery<TResult> = {
  where(column: string, op: "=", value: unknown): TResult;
};

class KyselyServerAppliedRouteStateSelectionVisitor<TResult extends WhereCapableQuery<TResult>>
  implements ServerAppliedRouteStateSelectionSpecVisitor<TResult>
{
  visitServerAppliedRouteStateByTarget(
    query: TResult,
    spec: ServerAppliedRouteStateByTargetSpec,
  ): TResult {
    return query.where("route_set_id", "=", routeSetKey(spec.target));
  }

  visitServerAppliedRouteStateByRouteSetId(
    query: TResult,
    spec: ServerAppliedRouteStateByRouteSetIdSpec,
  ): TResult {
    return query.where("route_set_id", "=", spec.routeSetId);
  }

  visitServerAppliedRouteStateBySourceFingerprint(
    query: TResult,
    spec: ServerAppliedRouteStateBySourceFingerprintSpec,
  ): TResult {
    return query.where("source_fingerprint", "=", spec.sourceFingerprint);
  }
}

class KyselyServerAppliedRouteStateUpsertVisitor
  implements
    ServerAppliedRouteStateUpsertSpecVisitor<{
      values: Insertable<Database["server_applied_route_states"]>;
    }>
{
  visitUpsertServerAppliedRouteDesiredState(spec: UpsertServerAppliedRouteDesiredStateSpec) {
    return {
      values: {
        route_set_id: spec.record.routeSetId,
        project_id: spec.record.projectId,
        environment_id: spec.record.environmentId,
        resource_id: spec.record.resourceId,
        server_id: spec.record.serverId,
        destination_id: spec.record.destinationId ?? null,
        source_fingerprint: spec.record.sourceFingerprint ?? null,
        domains: spec.record.domains.map(domainToJson),
        status: spec.record.status,
        updated_at: spec.record.updatedAt,
        last_applied: spec.record.lastApplied
          ? appliedToJson({
              deploymentId: spec.record.lastApplied.deploymentId,
              appliedAt: spec.record.lastApplied.appliedAt,
              ...(spec.record.lastApplied.providerKey
                ? { providerKey: spec.record.lastApplied.providerKey }
                : {}),
              ...(spec.record.lastApplied.proxyKind
                ? { proxyKind: spec.record.lastApplied.proxyKind }
                : {}),
            })
          : null,
        last_failure: spec.record.lastFailure ? failureToJson(spec.record.lastFailure) : null,
        metadata: {},
      },
    };
  }
}

class KyselyServerAppliedRouteStateUpdateVisitor
  implements
    ServerAppliedRouteStateUpdateSpecVisitor<{
      values: Updateable<Database["server_applied_route_states"]>;
    }>
{
  visitMarkServerAppliedRouteApplied(spec: MarkServerAppliedRouteAppliedSpec) {
    return {
      values: {
        status: "applied",
        updated_at: spec.updatedAt,
        last_applied: appliedToJson({
          deploymentId: spec.deploymentId,
          appliedAt: spec.updatedAt,
          ...(spec.providerKey ? { providerKey: spec.providerKey } : {}),
          ...(spec.proxyKind ? { proxyKind: spec.proxyKind } : {}),
        }),
        last_failure: null,
      },
    };
  }

  visitMarkServerAppliedRouteFailed(spec: MarkServerAppliedRouteFailedSpec) {
    return {
      values: {
        status: "failed",
        updated_at: spec.updatedAt,
        last_failure: failureToJson({
          deploymentId: spec.deploymentId,
          failedAt: spec.updatedAt,
          phase: spec.phase,
          errorCode: spec.errorCode,
          retryable: spec.retryable,
          ...(spec.message ? { message: spec.message } : {}),
          ...(spec.providerKey ? { providerKey: spec.providerKey } : {}),
          ...(spec.proxyKind ? { proxyKind: spec.proxyKind } : {}),
        }),
      },
    };
  }
}

function routeSetKey(target: ServerAppliedRouteDesiredStateTarget): string {
  return [
    target.projectId,
    target.environmentId,
    target.resourceId,
    target.serverId,
    target.destinationId ?? "default",
  ].join(":");
}

function validateNonEmptyContextValue(input: { label: string; value: string }): Result<void> {
  if (!input.value.trim()) {
    return err(
      domainError.validation(`${input.label} is required`, {
        phase: "config-domain-resolution",
        field: input.label,
      }),
    );
  }

  return ok(undefined);
}

function validateTarget(target: ServerAppliedRouteDesiredStateTarget): Result<void> {
  const fields = [
    ["projectId", target.projectId],
    ["environmentId", target.environmentId],
    ["resourceId", target.resourceId],
    ["serverId", target.serverId],
  ] as const;

  for (const [label, value] of fields) {
    const result = validateNonEmptyContextValue({ label, value });
    if (result.isErr()) {
      return err(result.error);
    }
  }

  if (target.destinationId !== undefined) {
    const result = validateNonEmptyContextValue({
      label: "destinationId",
      value: target.destinationId,
    });
    if (result.isErr()) {
      return err(result.error);
    }
  }

  return ok(undefined);
}

function validateRouteSetId(routeSetId: string): Result<void> {
  return validateNonEmptyContextValue({ label: "routeSetId", value: routeSetId });
}

function validateSourceFingerprint(sourceFingerprint: string): Result<void> {
  if (!sourceFingerprint.trim()) {
    return err(
      domainError.validation("Source fingerprint is required", {
        phase: "source-link-validation",
      }),
    );
  }

  if (/\/\/[^/\s]+:[^/@\s]+@/.test(sourceFingerprint)) {
    return err(
      domainError.validation("Source fingerprint contains credential-bearing material", {
        phase: "source-link-validation",
      }),
    );
  }

  return ok(undefined);
}

function validateDomains(domains: readonly ServerAppliedRouteDesiredStateDomain[]): Result<void> {
  if (domains.length === 0) {
    return err(
      domainError.validation("Server-applied route domains are required", {
        phase: "config-domain-resolution",
      }),
    );
  }

  for (const domain of domains) {
    if (!domain.host.trim() || !domain.pathPrefix.trim()) {
      return err(
        domainError.validation("Server-applied route domain intent is incomplete", {
          phase: "config-domain-resolution",
          host: domain.host,
        }),
      );
    }
  }

  const byHost = new Map<string, ServerAppliedRouteDesiredStateDomain>();
  for (const domain of domains) {
    if (byHost.has(domain.host)) {
      return err(
        domainError.validation("Server-applied route domains cannot contain duplicate hosts", {
          phase: "config-domain-resolution",
          host: domain.host,
        }),
      );
    }
    byHost.set(domain.host, domain);
  }

  for (const domain of domains) {
    if (domain.redirectStatus && !domain.redirectTo) {
      return err(
        domainError.validation("Server-applied route redirect status requires redirect target", {
          phase: "config-domain-resolution",
          host: domain.host,
        }),
      );
    }

    if (!domain.redirectTo) {
      continue;
    }

    const target = byHost.get(domain.redirectTo);
    if (!target) {
      return err(
        domainError.validation("Server-applied route redirect target is missing", {
          phase: "config-domain-resolution",
          host: domain.host,
          redirectTo: domain.redirectTo,
        }),
      );
    }

    if (target.host === domain.host) {
      return err(
        domainError.validation("Server-applied route redirect cannot target itself", {
          phase: "config-domain-resolution",
          host: domain.host,
        }),
      );
    }

    if (target.redirectTo) {
      return err(
        domainError.validation(
          "Server-applied route redirect target must be a served domain, not another redirect",
          {
            phase: "config-domain-resolution",
            host: domain.host,
            redirectTo: domain.redirectTo,
          },
        ),
      );
    }
  }

  return ok(undefined);
}

function validateRecord(record: ServerAppliedRouteDesiredStateRecord): Result<void> {
  const targetResult = validateTarget({
    projectId: record.projectId,
    environmentId: record.environmentId,
    resourceId: record.resourceId,
    serverId: record.serverId,
    ...(record.destinationId ? { destinationId: record.destinationId } : {}),
  });
  if (targetResult.isErr()) {
    return err(targetResult.error);
  }

  const routeSetIdResult = validateRouteSetId(record.routeSetId);
  if (routeSetIdResult.isErr()) {
    return err(routeSetIdResult.error);
  }

  const domainsResult = validateDomains(record.domains);
  if (domainsResult.isErr()) {
    return err(domainsResult.error);
  }

  if (record.sourceFingerprint) {
    const fingerprintResult = validateSourceFingerprint(record.sourceFingerprint);
    if (fingerprintResult.isErr()) {
      return err(fingerprintResult.error);
    }
  }

  return ok(undefined);
}

function validateSelectionSpec(spec: ServerAppliedRouteStateSelectionSpec): Result<void> {
  return spec.accept(ok(undefined), {
    visitServerAppliedRouteStateByTarget: (_query, targetSpec) => validateTarget(targetSpec.target),
    visitServerAppliedRouteStateByRouteSetId: (_query, routeSetSpec) =>
      validateRouteSetId(routeSetSpec.routeSetId),
    visitServerAppliedRouteStateBySourceFingerprint: (_query, sourceFingerprintSpec) =>
      validateSourceFingerprint(sourceFingerprintSpec.sourceFingerprint),
  } satisfies ServerAppliedRouteStateSelectionSpecVisitor<Result<void>>);
}

function normalizeTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function stringField(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function booleanField(record: JsonRecord, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function redirectStatusField(record: JsonRecord): 301 | 302 | 307 | 308 | undefined {
  const value = record.redirectStatus;
  if (value === 301 || value === 302 || value === 307 || value === 308) {
    return value;
  }

  return undefined;
}

function tlsModeField(record: JsonRecord): ServerAppliedRouteDesiredStateDomain["tlsMode"] {
  return record.tlsMode === "auto" ? "auto" : "disabled";
}

function edgeProxyKindField(
  record: JsonRecord,
  key: string,
): ServerAppliedRouteAppliedState["proxyKind"] | undefined {
  const value = record[key];
  if (value === "none" || value === "traefik" || value === "caddy") {
    return value;
  }

  return undefined;
}

function domainToJson(domain: ServerAppliedRouteDesiredStateDomain): JsonRecord {
  return {
    host: domain.host,
    pathPrefix: domain.pathPrefix,
    tlsMode: domain.tlsMode,
    ...(domain.redirectTo ? { redirectTo: domain.redirectTo } : {}),
    ...(domain.redirectStatus ? { redirectStatus: domain.redirectStatus } : {}),
  };
}

function domainFromJson(domain: JsonRecord): ServerAppliedRouteDesiredStateDomain {
  const host = stringField(domain, "host") ?? "";
  const pathPrefix = stringField(domain, "pathPrefix") ?? "/";
  const redirectTo = stringField(domain, "redirectTo");
  const redirectStatus = redirectStatusField(domain);

  return {
    host,
    pathPrefix,
    tlsMode: tlsModeField(domain),
    ...(redirectTo ? { redirectTo } : {}),
    ...(redirectStatus ? { redirectStatus } : {}),
  };
}

function appliedToJson(input: {
  deploymentId: string;
  appliedAt: string;
  providerKey?: string;
  proxyKind?: ServerAppliedRouteAppliedState["proxyKind"];
}): JsonRecord {
  return {
    deploymentId: input.deploymentId,
    appliedAt: input.appliedAt,
    ...(input.providerKey ? { providerKey: input.providerKey } : {}),
    ...(input.proxyKind ? { proxyKind: input.proxyKind } : {}),
  };
}

function failureToJson(input: ServerAppliedRouteFailureState): JsonRecord {
  return {
    deploymentId: input.deploymentId,
    failedAt: input.failedAt,
    phase: input.phase,
    errorCode: input.errorCode,
    retryable: input.retryable,
    ...(input.message ? { message: input.message } : {}),
    ...(input.providerKey ? { providerKey: input.providerKey } : {}),
    ...(input.proxyKind ? { proxyKind: input.proxyKind } : {}),
  };
}

function appliedFromJson(record: JsonRecord | null): ServerAppliedRouteAppliedState | undefined {
  if (!record) {
    return undefined;
  }

  const deploymentId = stringField(record, "deploymentId");
  const appliedAt = stringField(record, "appliedAt");
  if (!deploymentId || !appliedAt) {
    return undefined;
  }

  const providerKey = stringField(record, "providerKey");
  const proxyKind = edgeProxyKindField(record, "proxyKind");

  return {
    deploymentId,
    appliedAt,
    ...(providerKey ? { providerKey } : {}),
    ...(proxyKind ? { proxyKind } : {}),
  };
}

function failureFromJson(record: JsonRecord | null): ServerAppliedRouteFailureState | undefined {
  if (!record) {
    return undefined;
  }

  const deploymentId = stringField(record, "deploymentId");
  const failedAt = stringField(record, "failedAt");
  const phase = stringField(record, "phase");
  const errorCode = stringField(record, "errorCode");
  const retryable = booleanField(record, "retryable");
  if (!deploymentId || !failedAt || !phase || !errorCode || retryable === undefined) {
    return undefined;
  }

  const message = stringField(record, "message");
  const providerKey = stringField(record, "providerKey");
  const proxyKind = edgeProxyKindField(record, "proxyKind");

  return {
    deploymentId,
    failedAt,
    phase,
    errorCode,
    retryable,
    ...(message ? { message } : {}),
    ...(providerKey ? { providerKey } : {}),
    ...(proxyKind ? { proxyKind } : {}),
  };
}

function mapRow(row: ServerAppliedRouteStateRow): ServerAppliedRouteDesiredStateRecord {
  const lastApplied = appliedFromJson(row.last_applied);
  const lastFailure = failureFromJson(row.last_failure);

  return {
    routeSetId: row.route_set_id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    resourceId: row.resource_id,
    serverId: row.server_id,
    ...(row.destination_id ? { destinationId: row.destination_id } : {}),
    ...(row.source_fingerprint ? { sourceFingerprint: row.source_fingerprint } : {}),
    domains: row.domains.map(domainFromJson),
    status: row.status === "applied" || row.status === "failed" ? row.status : "desired",
    updatedAt: normalizeTimestamp(row.updated_at),
    ...(lastApplied ? { lastApplied } : {}),
    ...(lastFailure ? { lastFailure } : {}),
  };
}

function persistenceError(message: string, error: unknown): DomainError {
  return domainError.infra(message, {
    phase: "config-domain-resolution",
    adapter: "persistence.pg",
    errorMessage: error instanceof Error ? error.message : String(error),
  });
}

export class PgServerAppliedRouteStateRepository implements ServerAppliedRouteStateRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async findOne(
    spec: ServerAppliedRouteStateSelectionSpec,
  ): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>> {
    const validation = validateSelectionSpec(spec);
    if (validation.isErr()) {
      return err(validation.error);
    }

    try {
      const row = await spec
        .accept(
          this.db.selectFrom("server_applied_route_states").selectAll(),
          new KyselyServerAppliedRouteStateSelectionVisitor<ServerAppliedRouteStateSelectionQuery>(),
        )
        .executeTakeFirst();

      return ok(row ? mapRow(row) : null);
    } catch (error) {
      return err(persistenceError("Server-applied route state could not be read", error));
    }
  }

  async upsert(
    record: ServerAppliedRouteDesiredStateRecord,
    spec: ServerAppliedRouteStateUpsertSpec,
  ): Promise<Result<ServerAppliedRouteDesiredStateRecord>> {
    const recordResult = validateRecord(record);
    if (recordResult.isErr()) {
      return err(recordResult.error);
    }

    try {
      const mutation = spec.accept(new KyselyServerAppliedRouteStateUpsertVisitor());
      const row = await this.db
        .insertInto("server_applied_route_states")
        .values(mutation.values)
        .onConflict((conflict) =>
          conflict.column("route_set_id").doUpdateSet({
            project_id: mutation.values.project_id,
            environment_id: mutation.values.environment_id,
            resource_id: mutation.values.resource_id,
            server_id: mutation.values.server_id,
            destination_id: mutation.values.destination_id,
            source_fingerprint: mutation.values.source_fingerprint,
            domains: mutation.values.domains,
            status: mutation.values.status,
            updated_at: mutation.values.updated_at,
            last_applied: mutation.values.last_applied,
            last_failure: mutation.values.last_failure,
            metadata: mutation.values.metadata,
          }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();

      return ok(mapRow(row));
    } catch (error) {
      return err(persistenceError("Server-applied route state could not be persisted", error));
    }
  }

  async updateOne(
    spec: ServerAppliedRouteStateSelectionSpec,
    updateSpec: ServerAppliedRouteStateUpdateSpec,
  ): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>> {
    const validation = validateSelectionSpec(spec);
    if (validation.isErr()) {
      return err(validation.error);
    }

    try {
      const mutation = updateSpec.accept(new KyselyServerAppliedRouteStateUpdateVisitor());
      const updated = await spec
        .accept(
          this.db.updateTable("server_applied_route_states"),
          new KyselyServerAppliedRouteStateSelectionVisitor(),
        )
        .set(mutation.values)
        .returningAll()
        .executeTakeFirst();

      return ok(updated ? mapRow(updated) : null);
    } catch (error) {
      return err(persistenceError("Server-applied route state could not be updated", error));
    }
  }

  async deleteOne(spec: ServerAppliedRouteStateSelectionSpec): Promise<Result<boolean>> {
    const validation = validateSelectionSpec(spec);
    if (validation.isErr()) {
      return err(validation.error);
    }

    try {
      const deleted = await spec
        .accept(
          this.db.deleteFrom("server_applied_route_states"),
          new KyselyServerAppliedRouteStateSelectionVisitor(),
        )
        .returning("route_set_id")
        .executeTakeFirst();

      return ok(Boolean(deleted));
    } catch (error) {
      return err(persistenceError("Server-applied route state could not be removed", error));
    }
  }

  async deleteMany(spec: ServerAppliedRouteStateSelectionSpec): Promise<Result<number>> {
    const validation = validateSelectionSpec(spec);
    if (validation.isErr()) {
      return err(validation.error);
    }

    try {
      const deleted = await spec
        .accept(
          this.db.deleteFrom("server_applied_route_states"),
          new KyselyServerAppliedRouteStateSelectionVisitor(),
        )
        .executeTakeFirst();

      return ok(Number(deleted.numDeletedRows));
    } catch (error) {
      return err(persistenceError("Server-applied route state sweep could not be removed", error));
    }
  }
}
