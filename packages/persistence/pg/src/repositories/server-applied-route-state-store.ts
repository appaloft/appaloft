import {
  type ServerAppliedRouteAppliedState,
  type ServerAppliedRouteDesiredStateDomain,
  type ServerAppliedRouteDesiredStateRecord,
  type ServerAppliedRouteDesiredStateTarget,
  type ServerAppliedRouteFailureState,
  type ServerAppliedRouteStateStore,
} from "@appaloft/application";
import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";
import { type Kysely, type Selectable } from "kysely";

import { type Database, type ServerAppliedRouteStatesTable } from "../schema";

type ServerAppliedRouteStateRow = Selectable<ServerAppliedRouteStatesTable>;
type JsonRecord = Record<string, unknown>;

function routeSetKey(target: ServerAppliedRouteDesiredStateTarget): string {
  return [
    target.projectId,
    target.environmentId,
    target.resourceId,
    target.serverId,
    target.destinationId ?? "default",
  ].join(":");
}

function routeStateError(
  code: string,
  message: string,
  details?: Record<string, string | number | boolean | null>,
): DomainError {
  return {
    code,
    category: "infra",
    message,
    retryable: true,
    ...(details ? { details } : {}),
  };
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

export class PgServerAppliedRouteStateStore implements ServerAppliedRouteStateStore {
  constructor(private readonly db: Kysely<Database>) {}

  async upsertDesired(input: {
    target: ServerAppliedRouteDesiredStateTarget;
    domains: ServerAppliedRouteDesiredStateDomain[];
    sourceFingerprint?: string;
    updatedAt: string;
  }): Promise<Result<ServerAppliedRouteDesiredStateRecord>> {
    const targetResult = validateTarget(input.target);
    if (targetResult.isErr()) {
      return err(targetResult.error);
    }

    const domainsResult = validateDomains(input.domains);
    if (domainsResult.isErr()) {
      return err(domainsResult.error);
    }

    if (input.sourceFingerprint) {
      const fingerprintResult = validateSourceFingerprint(input.sourceFingerprint);
      if (fingerprintResult.isErr()) {
        return err(fingerprintResult.error);
      }
    }

    const values = {
      route_set_id: routeSetKey(input.target),
      project_id: input.target.projectId,
      environment_id: input.target.environmentId,
      resource_id: input.target.resourceId,
      server_id: input.target.serverId,
      destination_id: input.target.destinationId ?? null,
      source_fingerprint: input.sourceFingerprint ?? null,
      domains: input.domains.map(domainToJson),
      status: "desired",
      updated_at: input.updatedAt,
      last_applied: null,
      last_failure: null,
      metadata: {},
    };

    try {
      const row = await this.db
        .insertInto("server_applied_route_states")
        .values(values)
        .onConflict((conflict) =>
          conflict.column("route_set_id").doUpdateSet({
            project_id: values.project_id,
            environment_id: values.environment_id,
            resource_id: values.resource_id,
            server_id: values.server_id,
            destination_id: values.destination_id,
            source_fingerprint: values.source_fingerprint,
            domains: values.domains,
            status: values.status,
            updated_at: values.updated_at,
            last_applied: null,
            last_failure: null,
            metadata: values.metadata,
          }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();

      return ok(mapRow(row));
    } catch (error) {
      return err(persistenceError("Server-applied route state could not be persisted", error));
    }
  }

  async read(
    target: ServerAppliedRouteDesiredStateTarget,
  ): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>> {
    const targetResult = validateTarget(target);
    if (targetResult.isErr()) {
      return err(targetResult.error);
    }

    try {
      const exact = await this.readRouteSet(routeSetKey(target));
      if (exact || !target.destinationId) {
        return ok(exact);
      }

      return ok(
        await this.readRouteSet(
          routeSetKey({
            projectId: target.projectId,
            environmentId: target.environmentId,
            resourceId: target.resourceId,
            serverId: target.serverId,
          }),
        ),
      );
    } catch (error) {
      return err(persistenceError("Server-applied route state could not be read", error));
    }
  }

  async markApplied(input: {
    target: ServerAppliedRouteDesiredStateTarget;
    deploymentId: string;
    updatedAt: string;
    routeSetId?: string;
    providerKey?: string;
    proxyKind?: ServerAppliedRouteAppliedState["proxyKind"];
  }): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>> {
    const existing = await this.readForStatusUpdate(input.target, input.routeSetId);
    if (existing.isErr() || !existing.value) {
      return existing;
    }

    try {
      return ok(
        await this.updateStatus(existing.value.routeSetId, {
          status: "applied",
          updated_at: input.updatedAt,
          last_applied: appliedToJson({
            deploymentId: input.deploymentId,
            appliedAt: input.updatedAt,
            ...(input.providerKey ? { providerKey: input.providerKey } : {}),
            ...(input.proxyKind ? { proxyKind: input.proxyKind } : {}),
          }),
          last_failure: null,
        }),
      );
    } catch (error) {
      return err(
        persistenceError("Server-applied route applied state could not be persisted", error),
      );
    }
  }

  async markFailed(input: {
    target: ServerAppliedRouteDesiredStateTarget;
    deploymentId: string;
    updatedAt: string;
    phase: string;
    errorCode: string;
    message?: string;
    retryable: boolean;
    routeSetId?: string;
    providerKey?: string;
    proxyKind?: ServerAppliedRouteFailureState["proxyKind"];
  }): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>> {
    const existing = await this.readForStatusUpdate(input.target, input.routeSetId);
    if (existing.isErr() || !existing.value) {
      return existing;
    }

    const record = existing.value;
    const lastApplied = record.lastApplied
      ? appliedToJson({
          deploymentId: record.lastApplied.deploymentId,
          appliedAt: record.lastApplied.appliedAt,
          ...(record.lastApplied.providerKey
            ? { providerKey: record.lastApplied.providerKey }
            : {}),
          ...(record.lastApplied.proxyKind ? { proxyKind: record.lastApplied.proxyKind } : {}),
        })
      : null;

    try {
      return ok(
        await this.updateStatus(record.routeSetId, {
          status: "failed",
          updated_at: input.updatedAt,
          last_applied: lastApplied,
          last_failure: failureToJson({
            deploymentId: input.deploymentId,
            failedAt: input.updatedAt,
            phase: input.phase,
            errorCode: input.errorCode,
            retryable: input.retryable,
            ...(input.message ? { message: input.message } : {}),
            ...(input.providerKey ? { providerKey: input.providerKey } : {}),
            ...(input.proxyKind ? { proxyKind: input.proxyKind } : {}),
          }),
        }),
      );
    } catch (error) {
      return err(
        persistenceError("Server-applied route failed state could not be persisted", error),
      );
    }
  }

  async deleteDesired(target: ServerAppliedRouteDesiredStateTarget): Promise<Result<boolean>> {
    const targetResult = validateTarget(target);
    if (targetResult.isErr()) {
      return err(targetResult.error);
    }

    try {
      const deleted = await this.db
        .deleteFrom("server_applied_route_states")
        .where("route_set_id", "=", routeSetKey(target))
        .returning("route_set_id")
        .executeTakeFirst();

      return ok(Boolean(deleted));
    } catch (error) {
      return err(persistenceError("Server-applied route state could not be removed", error));
    }
  }

  private async readRouteSet(
    routeSetId: string,
  ): Promise<ServerAppliedRouteDesiredStateRecord | null> {
    const row = await this.db
      .selectFrom("server_applied_route_states")
      .selectAll()
      .where("route_set_id", "=", routeSetId)
      .executeTakeFirst();

    return row ? mapRow(row) : null;
  }

  private async readForStatusUpdate(
    target: ServerAppliedRouteDesiredStateTarget,
    expectedRouteSetId?: string,
  ): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>> {
    const existing = await this.read(target);
    if (existing.isErr() || !existing.value) {
      return existing;
    }

    if (expectedRouteSetId && existing.value.routeSetId !== expectedRouteSetId) {
      return err(
        routeStateError(
          "server_applied_route_state_conflict",
          "Server-applied route state did not match expected route set",
          {
            phase: "proxy-route-realization",
            expectedRouteSetId,
            actualRouteSetId: existing.value.routeSetId,
          },
        ),
      );
    }

    return existing;
  }

  private async updateStatus(
    routeSetId: string,
    input: {
      status: "applied" | "failed";
      updated_at: string;
      last_applied: JsonRecord | null;
      last_failure: JsonRecord | null;
    },
  ): Promise<ServerAppliedRouteDesiredStateRecord | null> {
    const updated = await this.db
      .updateTable("server_applied_route_states")
      .set(input)
      .where("route_set_id", "=", routeSetId)
      .returningAll()
      .executeTakeFirst();

    return updated ? mapRow(updated) : null;
  }
}
