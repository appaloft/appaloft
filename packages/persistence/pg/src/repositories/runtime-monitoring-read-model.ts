import {
  type ExecutionContext,
  type RepositoryContext,
  type RuntimeMonitoringDeploymentMarker,
  type RuntimeMonitoringMarkerReadModel,
  type RuntimeMonitoringRetentionSummary,
  type RuntimeMonitoringSafeLabels,
  type RuntimeMonitoringSample,
  type RuntimeMonitoringSamplePruneInput,
  type RuntimeMonitoringSamplePruneStoreResult,
  type RuntimeMonitoringSampleReadModel,
  type RuntimeMonitoringSampleRecord,
  type RuntimeMonitoringSampleRetentionStore,
  type RuntimeMonitoringSamplesReadInput,
  type RuntimeMonitoringSamplesReadResult,
  type RuntimeMonitoringSampleWriteStore,
  type RuntimeMonitoringScope,
  type RuntimeMonitoringScopeEvidence,
  type RuntimeMonitoringSignal,
  type RuntimeMonitoringSourceError,
  type RuntimeMonitoringThresholdMetric,
  type RuntimeMonitoringThresholdPolicyRecord,
  type RuntimeMonitoringThresholdPolicyRepository,
  type RuntimeMonitoringThresholdRule,
  type RuntimeMonitoringWarning,
  type RuntimeUsageArtifactKind,
  type RuntimeUsageFreshness,
  type RuntimeUsageScope,
  type RuntimeUsageTotals,
  toRepositoryContext,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import {
  type Database,
  type DeploymentsTable,
  type RuntimeMonitoringSamplesTable,
  type RuntimeMonitoringThresholdPoliciesTable,
} from "../schema";
import { type RepositoryExecutor, resolveRepositoryExecutor } from "./shared";

type RuntimeMonitoringSampleRow = Selectable<RuntimeMonitoringSamplesTable>;
type RuntimeMonitoringThresholdPolicyRow = Selectable<RuntimeMonitoringThresholdPoliciesTable>;
type DeploymentMarkerRow = Pick<
  Selectable<DeploymentsTable>,
  "id" | "resource_id" | "environment_id" | "status" | "created_at" | "started_at" | "finished_at"
>;

const allSignals: RuntimeMonitoringSignal[] = [
  "cpu",
  "memory",
  "disk",
  "inode",
  "docker",
  "network",
];

const thresholdMetrics: RuntimeMonitoringThresholdMetric[] = [
  "containerCpuPercent",
  "loadAverage1m",
  "containerUsedBytes",
  "usedBytes",
  "attributedBytes",
  "used",
  "imageBytes",
  "buildCacheBytes",
  "containerWritableBytes",
  "rxBytes",
  "txBytes",
];

export class PgRuntimeMonitoringSampleReadModel implements RuntimeMonitoringSampleReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async listSamples(
    context: ExecutionContext,
    input: RuntimeMonitoringSamplesReadInput,
  ): Promise<Result<RuntimeMonitoringSamplesReadResult>> {
    const executor = resolveRepositoryExecutor(this.db, toRepositoryContext(context));

    try {
      const signals = input.signals ?? allSignals;
      const scopedSamplesQuery = applySampleScopeFilter(
        executor.selectFrom("runtime_monitoring_samples").selectAll(),
        input.scope,
      )
        .where("observed_at", ">=", input.window.from)
        .where("observed_at", "<=", input.window.to)
        .orderBy("observed_at", "asc")
        .limit(input.limit);

      const [rows, retention] = await Promise.all([
        scopedSamplesQuery.execute(),
        readRetention(executor, input.scope),
      ]);
      const sourceErrors = sourceErrorsForRetention(input, retention);

      if (rows.length === 0) {
        sourceErrors.push({
          source: "monitoring-store",
          code: "runtime_monitoring_samples_missing",
          message: "No retained runtime monitoring samples matched the requested scope and window.",
          retriable: false,
        });
      }

      return ok({
        retention,
        samples: rows.flatMap((row) => sampleFromRow(row, signals)),
        warnings: warningsForRetention(input, retention, rows.length),
        sourceErrors,
      });
    } catch (error) {
      return err(infraError(error, "runtime-monitoring-samples"));
    }
  }
}

export class PgRuntimeMonitoringMarkerReadModel implements RuntimeMonitoringMarkerReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async listDeploymentMarkers(
    context: ExecutionContext,
    input: { scope: RuntimeMonitoringScope; window: { from: string; to: string } },
  ): Promise<Result<RuntimeMonitoringDeploymentMarker[]>> {
    const executor = resolveRepositoryExecutor(this.db, toRepositoryContext(context));

    try {
      const rows = await applyDeploymentScopeFilter(
        executor
          .selectFrom("deployments")
          .select([
            "id",
            "resource_id",
            "environment_id",
            "status",
            "created_at",
            "started_at",
            "finished_at",
          ]),
        input.scope,
      )
        .orderBy("created_at", "desc")
        .limit(200)
        .execute();

      return ok(
        rows
          .map(markerFromDeployment)
          .filter(
            (marker) =>
              marker.observedAt >= input.window.from && marker.observedAt <= input.window.to,
          )
          .sort((left, right) => left.observedAt.localeCompare(right.observedAt)),
      );
    } catch (error) {
      return err(infraError(error, "runtime-monitoring-markers"));
    }
  }
}

export class PgRuntimeMonitoringSampleRetentionStore
  implements RuntimeMonitoringSampleRetentionStore
{
  constructor(private readonly db: Kysely<Database>) {}

  async prune(
    context: RepositoryContext,
    input: RuntimeMonitoringSamplePruneInput,
  ): Promise<Result<RuntimeMonitoringSamplePruneStoreResult>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      let query = executor
        .selectFrom("runtime_monitoring_samples")
        .select("id")
        .where("retained_until", "<", input.before)
        .orderBy("retained_until", "asc");

      if (input.scope) {
        query = applySampleScopeFilter(query, input.scope);
      }

      if (input.limit !== undefined) {
        query = query.limit(input.limit);
      }

      const rows = await query.execute();
      const ids = rows.map((row) => row.id);

      if (!input.dryRun && ids.length > 0) {
        await executor
          .deleteFrom("runtime_monitoring_samples")
          .where("id", "in", ids)
          .executeTakeFirst();
      }

      return ok({
        matchedCount: ids.length,
        prunedCount: input.dryRun ? 0 : ids.length,
      });
    } catch (error) {
      return err(infraError(error, "runtime-monitoring-retention-prune"));
    }
  }
}

export class PgRuntimeMonitoringSampleWriteStore implements RuntimeMonitoringSampleWriteStore {
  constructor(private readonly db: Kysely<Database>) {}

  async record(
    context: RepositoryContext,
    sample: RuntimeMonitoringSampleRecord,
  ): Promise<Result<RuntimeMonitoringSample>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const scope = sample.scopeEvidence.scope;

    try {
      await executor
        .insertInto("runtime_monitoring_samples")
        .values({
          id: sample.sampleId,
          observed_at: sample.observedAt,
          collected_at: sample.collectedAt,
          scope_kind: scope.kind,
          scope_id: scopeId(scope),
          server_id: sample.scopeEvidence.serverId ?? null,
          project_id: sample.scopeEvidence.projectId ?? null,
          environment_id: sample.scopeEvidence.environmentId ?? null,
          resource_id: sample.scopeEvidence.resourceId ?? null,
          deployment_id: sample.scopeEvidence.deploymentId ?? null,
          totals: totalsRecord(sample.totals),
          freshness: sample.freshness,
          partial: sample.partial,
          labels: labelsRecord(sample.labels),
          warnings: sample.warnings.map(warningRecord),
          source_errors: sample.sourceErrors.map(sourceErrorRecord),
          retained_until: sample.retainedUntil,
        })
        .execute();

      return ok({
        sampleId: sample.sampleId,
        observedAt: sample.observedAt,
        collectedAt: sample.collectedAt,
        scopeEvidence: sample.scopeEvidence,
        totals: sample.totals,
        freshness: sample.freshness,
        partial: sample.partial,
        labels: sample.labels,
        warnings: sample.warnings,
        sourceErrors: sample.sourceErrors,
      });
    } catch (error) {
      return err(infraError(error, "runtime-monitoring-sample-record"));
    }
  }
}

export class PgRuntimeMonitoringThresholdPolicyRepository
  implements RuntimeMonitoringThresholdPolicyRepository
{
  constructor(private readonly db: Kysely<Database>) {}

  async upsert(
    context: RepositoryContext,
    record: RuntimeMonitoringThresholdPolicyRecord,
  ): Promise<Result<RuntimeMonitoringThresholdPolicyRecord>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const scope = record.scope;

    try {
      const row = await executor
        .insertInto("runtime_monitoring_threshold_policies")
        .values({
          id: record.policyId,
          scope_kind: scope.kind,
          scope_id: scopeId(scope),
          rules: record.rules.map(thresholdRuleRecord),
          enabled: record.enabled,
          updated_at: record.updatedAt,
          updated_by_actor_id: record.updatedByActorId ?? null,
          updated_by_actor_kind: record.updatedByActorKind ?? null,
        })
        .onConflict((onConflict) =>
          onConflict.columns(["scope_kind", "scope_id"]).doUpdateSet({
            rules: record.rules.map(thresholdRuleRecord),
            enabled: record.enabled,
            updated_at: record.updatedAt,
            updated_by_actor_id: record.updatedByActorId ?? null,
            updated_by_actor_kind: record.updatedByActorKind ?? null,
          }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();

      return ok(thresholdPolicyFromRow(row));
    } catch (error) {
      return err(infraError(error, "runtime-monitoring-threshold-policy-upsert"));
    }
  }

  async findOne(
    context: RepositoryContext,
    input: { policyId?: string; scope?: RuntimeMonitoringScope },
  ): Promise<Result<RuntimeMonitoringThresholdPolicyRecord | null>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      const baseQuery = executor.selectFrom("runtime_monitoring_threshold_policies").selectAll();
      const row = input.policyId
        ? await baseQuery.where("id", "=", input.policyId).executeTakeFirst()
        : input.scope
          ? await baseQuery
              .where("scope_kind", "=", input.scope.kind)
              .where("scope_id", "=", scopeId(input.scope))
              .executeTakeFirst()
          : undefined;

      return ok(row ? thresholdPolicyFromRow(row) : null);
    } catch (error) {
      return err(infraError(error, "runtime-monitoring-threshold-policy-find"));
    }
  }
}

function applySampleScopeFilter<
  O,
  Q extends SelectQueryBuilder<Database, "runtime_monitoring_samples", O>,
>(query: Q, scope: RuntimeMonitoringScope): Q {
  switch (scope.kind) {
    case "server":
      return query.where("server_id", "=", scope.serverId) as Q;
    case "project":
      return query.where("project_id", "=", scope.projectId) as Q;
    case "environment":
      return query.where("environment_id", "=", scope.environmentId) as Q;
    case "resource":
      return query.where("resource_id", "=", scope.resourceId) as Q;
    case "deployment":
      return query.where("deployment_id", "=", scope.deploymentId) as Q;
  }
}

function scopeId(scope: RuntimeMonitoringScope): string {
  switch (scope.kind) {
    case "server":
      return scope.serverId;
    case "project":
      return scope.projectId;
    case "environment":
      return scope.environmentId;
    case "resource":
      return scope.resourceId;
    case "deployment":
      return scope.deploymentId;
  }
}

function applyDeploymentScopeFilter<O, Q extends SelectQueryBuilder<Database, "deployments", O>>(
  query: Q,
  scope: RuntimeMonitoringScope,
): Q {
  switch (scope.kind) {
    case "server":
      return query.where("server_id", "=", scope.serverId) as Q;
    case "project":
      return query.where("project_id", "=", scope.projectId) as Q;
    case "environment":
      return query.where("environment_id", "=", scope.environmentId) as Q;
    case "resource":
      return query.where("resource_id", "=", scope.resourceId) as Q;
    case "deployment":
      return query.where("id", "=", scope.deploymentId) as Q;
  }
}

function warningRecord(warning: RuntimeMonitoringWarning): Record<string, unknown> {
  return {
    code: warning.code,
    message: warning.message,
    ...(warning.signal ? { signal: warning.signal } : {}),
    ...(warning.scope ? { scope: warning.scope } : {}),
  };
}

function totalsRecord(totals: RuntimeUsageTotals): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  if (totals.cpu) {
    record.cpu = { ...totals.cpu };
  }
  if (totals.memory) {
    record.memory = { ...totals.memory };
  }
  if (totals.disk) {
    record.disk = { ...totals.disk };
  }
  if (totals.inode) {
    record.inode = { ...totals.inode };
  }
  if (totals.docker) {
    record.docker = { ...totals.docker };
  }
  if (totals.network) {
    record.network = { ...totals.network };
  }
  return record;
}

function labelsRecord(labels: RuntimeMonitoringSafeLabels): Record<string, unknown> {
  return {
    ...(labels.providerKey ? { providerKey: labels.providerKey } : {}),
    ...(labels.artifactKind ? { artifactKind: labels.artifactKind } : {}),
    ...(labels.runtimeId ? { runtimeId: labels.runtimeId } : {}),
  };
}

function sourceErrorRecord(sourceError: RuntimeMonitoringSourceError): Record<string, unknown> {
  return {
    source: sourceError.source,
    code: sourceError.code,
    message: sourceError.message,
    retriable: sourceError.retriable,
  };
}

function thresholdRuleRecord(rule: RuntimeMonitoringThresholdRule): Record<string, unknown> {
  return {
    ruleId: rule.ruleId,
    signal: rule.signal,
    metric: rule.metric,
    ...(rule.warning !== undefined ? { warning: rule.warning } : {}),
    ...(rule.critical !== undefined ? { critical: rule.critical } : {}),
    comparator: rule.comparator,
  };
}

function thresholdPolicyFromRow(
  row: RuntimeMonitoringThresholdPolicyRow,
): RuntimeMonitoringThresholdPolicyRecord {
  return {
    policyId: row.id,
    scope: scopeFromKindAndId(row.scope_kind, row.scope_id),
    rules: thresholdRulesFromValue(row.rules),
    enabled: row.enabled,
    updatedAt: serializeTimestamp(row.updated_at),
    ...(row.updated_by_actor_id ? { updatedByActorId: row.updated_by_actor_id } : {}),
    ...(row.updated_by_actor_kind && isRuntimeMonitoringActorKind(row.updated_by_actor_kind)
      ? { updatedByActorKind: row.updated_by_actor_kind }
      : {}),
  };
}

function scopeFromKindAndId(kind: string, id: string): RuntimeMonitoringScope {
  switch (kind) {
    case "server":
      return { kind, serverId: id };
    case "project":
      return { kind, projectId: id };
    case "environment":
      return { kind, environmentId: id };
    case "resource":
      return { kind, resourceId: id };
    case "deployment":
      return { kind, deploymentId: id };
    default:
      return { kind: "resource", resourceId: id };
  }
}

function thresholdRulesFromValue(value: unknown): RuntimeMonitoringThresholdRule[] {
  return arrayFromValue(value).flatMap((item) => {
    const raw = recordFromValue(item);
    if (
      typeof raw.ruleId !== "string" ||
      !isMonitoringSignal(raw.signal) ||
      !isRuntimeMonitoringThresholdMetric(raw.metric) ||
      raw.comparator !== "greater-than-or-equal"
    ) {
      return [];
    }

    return [
      {
        ruleId: raw.ruleId,
        signal: raw.signal,
        metric: raw.metric,
        ...(typeof raw.warning === "number" && Number.isFinite(raw.warning)
          ? { warning: raw.warning }
          : {}),
        ...(typeof raw.critical === "number" && Number.isFinite(raw.critical)
          ? { critical: raw.critical }
          : {}),
        comparator: raw.comparator,
      },
    ];
  });
}

async function readRetention(
  executor: RepositoryExecutor,
  scope: RuntimeMonitoringScope,
): Promise<RuntimeMonitoringRetentionSummary> {
  const first = await applySampleScopeFilter(
    executor
      .selectFrom("runtime_monitoring_samples")
      .select(["observed_at", "retained_until"])
      .orderBy("observed_at", "asc")
      .limit(1),
    scope,
  ).executeTakeFirst();
  const last = await applySampleScopeFilter(
    executor
      .selectFrom("runtime_monitoring_samples")
      .select(["observed_at", "retained_until"])
      .orderBy("retained_until", "desc")
      .limit(1),
    scope,
  ).executeTakeFirst();

  const retainedFrom = first?.observed_at ? serializeTimestamp(first.observed_at) : undefined;
  const retainedTo = last?.retained_until ? serializeTimestamp(last.retained_until) : undefined;
  const rawRetentionHours =
    retainedFrom && retainedTo
      ? Math.max(0, Math.round((Date.parse(retainedTo) - Date.parse(retainedFrom)) / 3_600_000))
      : 0;

  return {
    rawRetentionHours,
    ...(retainedFrom ? { retainedFrom } : {}),
    ...(retainedTo ? { retainedTo } : {}),
  };
}

function sourceErrorsForRetention(
  input: RuntimeMonitoringSamplesReadInput,
  retention: RuntimeMonitoringRetentionSummary,
): RuntimeMonitoringSourceError[] {
  const sourceErrors: RuntimeMonitoringSourceError[] = [];
  if (retention.retainedFrom && input.window.from < retention.retainedFrom) {
    sourceErrors.push({
      source: "monitoring-store",
      code: "runtime_monitoring_window_starts_before_retention",
      message: "The requested runtime monitoring window starts before retained raw samples.",
      retriable: false,
    });
  }
  if (retention.retainedTo && input.window.to > retention.retainedTo) {
    sourceErrors.push({
      source: "monitoring-store",
      code: "runtime_monitoring_window_ends_after_retention",
      message: "The requested runtime monitoring window ends after retained raw samples.",
      retriable: false,
    });
  }
  return sourceErrors;
}

function warningsForRetention(
  input: RuntimeMonitoringSamplesReadInput,
  retention: RuntimeMonitoringRetentionSummary,
  rowCount: number,
): RuntimeMonitoringWarning[] {
  const warnings: RuntimeMonitoringWarning[] = [];
  if (rowCount === 0) {
    warnings.push({
      code: "missing-samples",
      message: "No retained runtime monitoring samples matched the requested scope and window.",
      scope: input.scope,
    });
  }
  if (
    (retention.retainedFrom && input.window.from < retention.retainedFrom) ||
    (retention.retainedTo && input.window.to > retention.retainedTo)
  ) {
    warnings.push({
      code: "outside-retention",
      message: "The requested runtime monitoring window is partly outside retained raw samples.",
      scope: input.scope,
    });
  }
  return warnings;
}

function sampleFromRow(
  row: RuntimeMonitoringSampleRow,
  signals: RuntimeMonitoringSignal[],
): RuntimeMonitoringSample[] {
  const scope = scopeFromRow(row);
  if (!scope) {
    return [];
  }

  return [
    {
      sampleId: row.id,
      observedAt: serializeTimestamp(row.observed_at),
      collectedAt: serializeTimestamp(row.collected_at),
      scopeEvidence: scopeEvidenceFromRow(row, scope),
      totals: totalsFromValue(row.totals, signals),
      freshness: freshnessFromValue(row.freshness),
      partial: row.partial,
      labels: labelsFromValue(row.labels),
      warnings: warningsFromValue(row.warnings),
      sourceErrors: sourceErrorsFromValue(row.source_errors),
    },
  ];
}

function scopeFromRow(row: RuntimeMonitoringSampleRow): RuntimeUsageScope | null {
  switch (row.scope_kind) {
    case "server":
      return row.scope_id ? { kind: "server", serverId: row.scope_id } : null;
    case "project":
      return row.scope_id ? { kind: "project", projectId: row.scope_id } : null;
    case "environment":
      return row.scope_id ? { kind: "environment", environmentId: row.scope_id } : null;
    case "resource":
      return row.scope_id ? { kind: "resource", resourceId: row.scope_id } : null;
    case "deployment":
      return row.scope_id ? { kind: "deployment", deploymentId: row.scope_id } : null;
    default:
      return null;
  }
}

function scopeEvidenceFromRow(
  row: RuntimeMonitoringSampleRow,
  scope: RuntimeUsageScope,
): RuntimeMonitoringScopeEvidence {
  return {
    scope,
    ...(row.server_id ? { serverId: row.server_id } : {}),
    ...(row.project_id ? { projectId: row.project_id } : {}),
    ...(row.environment_id ? { environmentId: row.environment_id } : {}),
    ...(row.resource_id ? { resourceId: row.resource_id } : {}),
    ...(row.deployment_id ? { deploymentId: row.deployment_id } : {}),
  };
}

function totalsFromValue(value: unknown, signals: RuntimeMonitoringSignal[]): RuntimeUsageTotals {
  const raw = recordFromValue(value);
  const totals: RuntimeUsageTotals = {};
  if (signals.includes("cpu")) {
    const cpu = numericObject(recordFromValue(raw.cpu), [
      "logicalCores",
      "loadAverage1m",
      "loadAverage5m",
      "loadAverage15m",
      "containerCpuPercent",
    ]);
    if (Object.keys(cpu).length > 0) {
      totals.cpu = cpu;
    }
  }
  if (signals.includes("memory")) {
    const memory = numericObject(recordFromValue(raw.memory), [
      "totalBytes",
      "usedBytes",
      "availableBytes",
      "containerUsedBytes",
    ]);
    if (Object.keys(memory).length > 0) {
      totals.memory = memory;
    }
  }
  if (signals.includes("disk")) {
    const disk = numericObject(recordFromValue(raw.disk), [
      "totalBytes",
      "usedBytes",
      "availableBytes",
      "attributedBytes",
    ]);
    if (Object.keys(disk).length > 0) {
      totals.disk = disk;
    }
  }
  if (signals.includes("inode")) {
    const inode = numericObject(recordFromValue(raw.inode), ["total", "used", "available"]);
    if (Object.keys(inode).length > 0) {
      totals.inode = inode;
    }
  }
  if (signals.includes("docker")) {
    const docker = numericObject(recordFromValue(raw.docker), [
      "imageBytes",
      "buildCacheBytes",
      "containerWritableBytes",
    ]);
    if (Object.keys(docker).length > 0) {
      totals.docker = docker;
    }
  }
  if (signals.includes("network")) {
    const network = numericObject(recordFromValue(raw.network), ["rxBytes", "txBytes"]);
    if (Object.keys(network).length > 0) {
      totals.network = network;
    }
  }
  return totals;
}

function numericObject<T extends string>(
  value: Record<string, unknown>,
  keys: T[],
): Partial<Record<T, number>> {
  const output: Partial<Record<T, number>> = {};
  for (const key of keys) {
    const raw = value[key];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      output[key] = raw;
    }
  }
  return output;
}

function labelsFromValue(value: unknown): RuntimeMonitoringSafeLabels {
  const raw = recordFromValue(value);
  const labels: RuntimeMonitoringSafeLabels = {};
  if (typeof raw.providerKey === "string") {
    labels.providerKey = raw.providerKey;
  }
  if (typeof raw.runtimeId === "string") {
    labels.runtimeId = raw.runtimeId;
  }
  if (isRuntimeUsageArtifactKind(raw.artifactKind)) {
    labels.artifactKind = raw.artifactKind;
  }
  return labels;
}

function warningsFromValue(value: unknown): RuntimeMonitoringWarning[] {
  return arrayFromValue(value).flatMap((item) => {
    const raw = recordFromValue(item);
    if (!isMonitoringWarningCode(raw.code) || typeof raw.message !== "string") {
      return [];
    }
    return [
      {
        code: raw.code,
        message: raw.message,
        ...(isMonitoringSignal(raw.signal) ? { signal: raw.signal } : {}),
      },
    ];
  });
}

function sourceErrorsFromValue(value: unknown): RuntimeMonitoringSourceError[] {
  return arrayFromValue(value).flatMap((item) => {
    const raw = recordFromValue(item);
    if (
      !isMonitoringSource(raw.source) ||
      typeof raw.code !== "string" ||
      typeof raw.message !== "string" ||
      typeof raw.retriable !== "boolean"
    ) {
      return [];
    }
    return [
      {
        source: raw.source,
        code: raw.code,
        message: raw.message,
        retriable: raw.retriable,
      },
    ];
  });
}

function markerFromDeployment(row: DeploymentMarkerRow): RuntimeMonitoringDeploymentMarker {
  const observedAt = serializeTimestamp(row.finished_at ?? row.started_at ?? row.created_at);
  return {
    deploymentId: row.id,
    resourceId: row.resource_id,
    environmentId: row.environment_id,
    observedAt,
    status: row.status,
    label: `Deployment ${row.id} ${row.status}`,
    correlation: "time",
  };
}

function recordFromValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayFromValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRuntimeUsageArtifactKind(value: unknown): value is RuntimeUsageArtifactKind {
  return (
    value === "active-runtime" ||
    value === "rollback-candidate" ||
    value === "source-workspace" ||
    value === "docker-image" ||
    value === "docker-build-cache" ||
    value === "appaloft-state-root" ||
    value === "volume" ||
    value === "unknown"
  );
}

function isMonitoringWarningCode(value: unknown): value is RuntimeMonitoringWarning["code"] {
  return (
    value === "missing-samples" ||
    value === "partial-window" ||
    value === "stale-samples" ||
    value === "missing-metric-source" ||
    value === "outside-retention"
  );
}

function isMonitoringSignal(value: unknown): value is RuntimeMonitoringSignal {
  return allSignals.some((signal) => signal === value);
}

function isRuntimeMonitoringThresholdMetric(
  value: unknown,
): value is RuntimeMonitoringThresholdMetric {
  return thresholdMetrics.some((metric) => metric === value);
}

function isMonitoringSource(value: unknown): value is RuntimeMonitoringSourceError["source"] {
  return (
    value === "monitoring-store" ||
    value === "collector" ||
    value === "read-model" ||
    value === "unknown"
  );
}

function isRuntimeMonitoringActorKind(
  value: unknown,
): value is RuntimeMonitoringThresholdPolicyRecord["updatedByActorKind"] {
  return value === "deploy-token" || value === "system" || value === "user";
}

function freshnessFromValue(value: string): RuntimeUsageFreshness {
  if (value === "live" || value === "recent-sample" || value === "stale") {
    return value;
  }
  return "unknown";
}

function serializeTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function infraError(error: unknown, phase: string) {
  return domainError.infra("Runtime monitoring read model operation could not be completed", {
    phase,
    adapter: "persistence.pg",
    reason: error instanceof Error ? error.message : "unknown",
  });
}
