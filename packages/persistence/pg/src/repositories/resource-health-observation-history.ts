import {
  type ExecutionContext,
  type RepositoryContext,
  type ResourceHealthHistoryObservation,
  type ResourceHealthObservationHistoryReadModel,
  type ResourceHealthObservationRecord,
  type ResourceHealthObservationRecorder,
  type ResourceHealthOverall,
  type ResourceHealthSourceError,
  type ResourceHealthSummary,
  type ResourceProxyHealthSection,
  type ResourcePublicAccessHealthSection,
  type ResourceRuntimeHealth,
  type ResourceRuntimeLifecycle,
  toRepositoryContext,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Kysely, type Selectable } from "kysely";

import { type Database, type ResourceHealthObservationsTable } from "../schema";
import { resolveRepositoryContextOrganizationId, resolveRepositoryExecutor } from "./shared";

type ResourceHealthObservationRow = Selectable<ResourceHealthObservationsTable>;

export class PgResourceHealthObservationHistoryReadModel
  implements ResourceHealthObservationHistoryReadModel
{
  constructor(private readonly db: Kysely<Database>) {}

  async listObservations(
    context: ExecutionContext,
    input: { resourceId: string; window: { from: string; to: string }; limit: number },
  ): Promise<
    Result<{
      observations: ResourceHealthHistoryObservation[];
      sourceErrors: ResourceHealthSourceError[];
    }>
  > {
    const executor = resolveRepositoryExecutor(this.db, toRepositoryContext(context));

    try {
      let query = executor
        .selectFrom("resource_health_observations")
        .selectAll()
        .where("resource_id", "=", input.resourceId)
        .where("observed_at", ">=", input.window.from)
        .where("observed_at", "<=", input.window.to)
        .orderBy("observed_at", "desc")
        .limit(input.limit);
      const organizationId = resolveRepositoryContextOrganizationId(toRepositoryContext(context));
      if (organizationId) {
        query = query.where("resource_id", "in", (subquery) =>
          subquery
            .selectFrom("resources")
            .select("resources.id")
            .where("resources.project_id", "in", (projects) =>
              projects
                .selectFrom("projects")
                .select("id")
                .where("organization_id", "=", organizationId),
            ),
        );
      }

      const rows = await query.execute();

      const sourceErrors: ResourceHealthSourceError[] =
        rows.length === 0
          ? [
              {
                source: "health-check",
                code: "resource_health_observations_missing",
                category: "observation",
                phase: "resource-health-history",
                retriable: false,
                relatedEntityId: input.resourceId,
                message:
                  "No retained resource health observations matched the requested scope and window.",
              },
            ]
          : [];

      return ok({
        observations: rows.map(observationFromRow),
        sourceErrors,
      });
    } catch (error) {
      return err(infraError(error, "resource-health-observation-list"));
    }
  }
}

export class PgResourceHealthObservationRecorder implements ResourceHealthObservationRecorder {
  constructor(private readonly db: Kysely<Database>) {}

  async record(
    context: RepositoryContext,
    record: ResourceHealthObservationRecord,
  ): Promise<Result<ResourceHealthHistoryObservation>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      await executor
        .insertInto("resource_health_observations")
        .values({
          id: record.observationId,
          resource_id: record.resourceId,
          observed_at: record.observedAt,
          overall: record.summary.overall,
          runtime_lifecycle: record.summary.runtime.lifecycle,
          runtime_health: record.summary.runtime.health,
          public_access_status: record.summary.publicAccess.status,
          proxy_status: record.summary.proxy.status,
          health_policy_status: record.summary.healthPolicy.status,
          latest_deployment_id: record.summary.latestDeployment?.id ?? null,
          summary: record.summary as unknown as Record<string, unknown>,
          retained_until: record.retainedUntil,
        })
        .execute();

      return ok(observationFromRecord(record));
    } catch (error) {
      return err(infraError(error, "resource-health-observation-record"));
    }
  }
}

function observationFromRecord(
  record: ResourceHealthObservationRecord,
): ResourceHealthHistoryObservation {
  return {
    observationId: record.observationId,
    observedAt: record.observedAt,
    overall: record.summary.overall,
    runtimeLifecycle: record.summary.runtime.lifecycle,
    runtimeHealth: record.summary.runtime.health,
    publicAccessStatus: record.summary.publicAccess.status,
    proxyStatus: record.summary.proxy.status,
    healthPolicyStatus: record.summary.healthPolicy.status,
    ...(record.summary.latestDeployment?.id
      ? { latestDeploymentId: record.summary.latestDeployment.id }
      : {}),
    summary: record.summary,
  };
}

function observationFromRow(row: ResourceHealthObservationRow): ResourceHealthHistoryObservation {
  const summary = summaryFromValue(row.summary, row.resource_id);
  return {
    observationId: row.id,
    observedAt: serializeTimestamp(row.observed_at),
    overall: overallFromValue(row.overall),
    runtimeLifecycle: runtimeLifecycleFromValue(row.runtime_lifecycle),
    runtimeHealth: runtimeHealthFromValue(row.runtime_health),
    publicAccessStatus: publicAccessStatusFromValue(row.public_access_status),
    proxyStatus: proxyStatusFromValue(row.proxy_status),
    healthPolicyStatus:
      row.health_policy_status === "configured" || row.health_policy_status === "unsupported"
        ? row.health_policy_status
        : "not-configured",
    ...(row.latest_deployment_id ? { latestDeploymentId: row.latest_deployment_id } : {}),
    summary,
  };
}

function summaryFromValue(value: unknown, resourceId: string): ResourceHealthSummary {
  const candidate = value as Partial<ResourceHealthSummary>;
  if (
    candidate.schemaVersion === "resources.health/v1" &&
    typeof candidate.resourceId === "string"
  ) {
    return candidate as ResourceHealthSummary;
  }
  const observedAt = new Date(0).toISOString();
  return {
    schemaVersion: "resources.health/v1",
    resourceId,
    generatedAt: observedAt,
    observedAt,
    overall: "unknown",
    runtime: {
      lifecycle: "unknown",
      health: "unknown",
      reasonCode: "resource_health_observation_malformed",
    },
    healthPolicy: {
      status: "not-configured",
      enabled: false,
      reasonCode: "resource_health_observation_malformed",
    },
    publicAccess: {
      status: "unknown",
      reasonCode: "resource_health_observation_malformed",
    },
    proxy: {
      status: "unknown",
      reasonCode: "resource_health_observation_malformed",
    },
    checks: [],
    sourceErrors: [],
  };
}

function overallFromValue(value: string): ResourceHealthOverall {
  if (
    value === "healthy" ||
    value === "degraded" ||
    value === "unhealthy" ||
    value === "starting" ||
    value === "stopped" ||
    value === "not-deployed"
  ) {
    return value;
  }
  return "unknown";
}

function runtimeLifecycleFromValue(value: string): ResourceRuntimeLifecycle {
  if (
    value === "not-deployed" ||
    value === "starting" ||
    value === "running" ||
    value === "restarting" ||
    value === "degraded" ||
    value === "stopped" ||
    value === "exited"
  ) {
    return value;
  }
  return "unknown";
}

function runtimeHealthFromValue(value: string): ResourceRuntimeHealth {
  if (value === "healthy" || value === "unhealthy" || value === "not-configured") {
    return value;
  }
  return "unknown";
}

function publicAccessStatusFromValue(value: string): ResourcePublicAccessHealthSection["status"] {
  if (
    value === "ready" ||
    value === "not-ready" ||
    value === "failed" ||
    value === "not-configured"
  ) {
    return value;
  }
  return "unknown";
}

function proxyStatusFromValue(value: string): ResourceProxyHealthSection["status"] {
  if (
    value === "ready" ||
    value === "not-ready" ||
    value === "failed" ||
    value === "not-configured"
  ) {
    return value;
  }
  return "unknown";
}

function serializeTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function infraError(error: unknown, phase: string) {
  return domainError.infra("Resource health observation history operation could not be completed", {
    phase,
    adapter: "persistence.pg",
    reason: error instanceof Error ? error.message : "unknown",
  });
}
