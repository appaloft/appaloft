import {
  type RepositoryContext,
  type SourceEventDedupeStatus,
  type SourceEventDetail,
  type SourceEventIdentity,
  type SourceEventIgnoredReason,
  type SourceEventKind,
  type SourceEventListInput,
  type SourceEventListItem,
  type SourceEventListPage,
  type SourceEventOutcomeUpdate,
  type SourceEventPolicyCandidate,
  type SourceEventPolicyReader,
  type SourceEventPolicyResult,
  type SourceEventReadModel,
  type SourceEventRecord,
  type SourceEventRecorder,
  type SourceEventShowInput,
  type SourceEventSourceKind,
  type SourceEventStatus,
  type SourceEventVerificationSummary,
} from "@appaloft/application";
import { type Insertable, type Kysely, type Selectable, sql } from "kysely";

import { type Database, type SourceEventsTable } from "../schema";
import {
  type RepositoryExecutor,
  resolveRepositoryExecutor,
  type SerializedResourceAutoDeployPolicy,
  type SerializedResourceSourceBinding,
} from "./shared";

type SourceEventRow = Selectable<SourceEventsTable>;

export class PgSourceEventRepository
  implements SourceEventRecorder, SourceEventReadModel, SourceEventPolicyReader
{
  constructor(private readonly db: Kysely<Database>) {}

  async findByDedupeKey(
    _context: RepositoryContext,
    dedupeKey: string,
  ): Promise<SourceEventRecord | null> {
    const row = await this.db
      .selectFrom("source_events")
      .selectAll()
      .where("dedupe_key", "=", dedupeKey)
      .executeTakeFirst();

    return row ? recordFromRow(row) : null;
  }

  async record(context: RepositoryContext, record: SourceEventRecord): Promise<SourceEventRecord> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const inserted = await executor
      .insertInto("source_events")
      .values(insertableFromRecord(record))
      .onConflict((conflict) => conflict.column("dedupe_key").doNothing())
      .returningAll()
      .executeTakeFirst();

    if (inserted) {
      return recordFromRow(inserted);
    }

    const existing = await findByDedupeKey(executor, record.dedupeKey);
    return existing ? recordFromRow(existing) : record;
  }

  async updateOutcome(
    context: RepositoryContext,
    input: SourceEventOutcomeUpdate,
  ): Promise<SourceEventRecord> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const updated = await executor
      .updateTable("source_events")
      .set({
        project_id: input.projectId ?? null,
        status: input.status,
        matched_resource_ids: input.matchedResourceIds,
        ignored_reasons: input.ignoredReasons,
        policy_results: input.policyResults.map((result) => ({ ...result })),
        created_deployment_ids: input.createdDeploymentIds,
      })
      .where("id", "=", input.sourceEventId)
      .returningAll()
      .executeTakeFirst();

    if (!updated) {
      throw new Error(`Source event ${input.sourceEventId} was not found`);
    }

    return recordFromRow(updated);
  }

  async listCandidates(
    _context: RepositoryContext,
    input: {
      sourceKind: SourceEventSourceKind;
      sourceIdentity: SourceEventIdentity;
    },
  ): Promise<SourceEventPolicyCandidate[]> {
    const rows = await this.db
      .selectFrom("resources")
      .select([
        "id",
        "project_id",
        "environment_id",
        "destination_id",
        "source_binding",
        "auto_deploy_policy",
      ])
      .where("auto_deploy_policy", "is not", null)
      .where("source_binding", "is not", null)
      .where("lifecycle_status", "!=", "deleted")
      .execute();

    const candidates: SourceEventPolicyCandidate[] = [];
    const expectedTriggerKind = triggerKindForSourceEvent(input.sourceKind);
    for (const row of rows) {
      const sourceBinding = serializedSourceBinding(row.source_binding);
      const policy = serializedAutoDeployPolicy(row.auto_deploy_policy);
      if (
        !sourceBinding ||
        !policy ||
        policy.triggerKind !== expectedTriggerKind ||
        !sourceBindingMatches(input.sourceIdentity, sourceBinding)
      ) {
        continue;
      }

      candidates.push({
        projectId: row.project_id,
        environmentId: row.environment_id,
        resourceId: row.id,
        ...(row.destination_id ? { destinationId: row.destination_id } : {}),
        status: policy.status,
        refs: [...policy.refs],
        eventKinds: [...policy.eventKinds],
        sourceBinding: sourceIdentityFromBinding(sourceBinding),
        ...(policy.blockedReason ? { blockedReason: policy.blockedReason } : {}),
      });
    }

    return candidates;
  }

  async list(
    _context: RepositoryContext,
    input: SourceEventListInput,
  ): Promise<SourceEventListPage> {
    const limit = input.limit ?? 50;
    let query = this.db
      .selectFrom("source_events")
      .selectAll()
      .limit(limit + 1);

    if (input.projectId) {
      query = query.where("project_id", "=", input.projectId);
    }

    if (input.resourceId) {
      query = query.where(sql<boolean>`${input.resourceId} = ANY(matched_resource_ids)`);
    }

    if (input.status) {
      query = query.where("status", "=", input.status);
    }

    if (input.sourceKind) {
      query = query.where("source_kind", "=", input.sourceKind);
    }

    if (input.cursor) {
      query = query.where("received_at", "<", input.cursor);
    }

    const rows = await query.orderBy("received_at", "desc").execute();
    const pageRows = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? pageRows.at(-1)?.received_at : undefined;

    return {
      items: pageRows.map(listItemFromRow),
      ...(nextCursor ? { nextCursor } : {}),
    };
  }

  async findOne(
    _context: RepositoryContext,
    input: SourceEventShowInput,
  ): Promise<SourceEventDetail | null> {
    let query = this.db
      .selectFrom("source_events")
      .selectAll()
      .where("id", "=", input.sourceEventId);

    if (input.projectId) {
      query = query.where("project_id", "=", input.projectId);
    }

    if (input.resourceId) {
      query = query.where(sql<boolean>`${input.resourceId} = ANY(matched_resource_ids)`);
    }

    const row = await query.executeTakeFirst();
    return row ? detailFromRow(row) : null;
  }
}

async function findByDedupeKey(
  executor: RepositoryExecutor,
  dedupeKey: string,
): Promise<SourceEventRow | undefined> {
  return executor
    .selectFrom("source_events")
    .selectAll()
    .where("dedupe_key", "=", dedupeKey)
    .executeTakeFirst();
}

function triggerKindForSourceEvent(
  sourceKind: SourceEventSourceKind,
): SerializedResourceAutoDeployPolicy["triggerKind"] {
  return sourceKind === "generic-signed" ? "generic-signed-webhook" : "git-push";
}

function serializedSourceBinding(
  value: Record<string, unknown> | null,
): SerializedResourceSourceBinding | null {
  if (
    !value ||
    typeof value.kind !== "string" ||
    typeof value.locator !== "string" ||
    typeof value.displayName !== "string"
  ) {
    return null;
  }

  return {
    kind: value.kind as SerializedResourceSourceBinding["kind"],
    locator: value.locator,
    displayName: value.displayName,
    ...(typeof value.gitRef === "string" ? { gitRef: value.gitRef } : {}),
    ...(typeof value.commitSha === "string" ? { commitSha: value.commitSha } : {}),
    ...(typeof value.baseDirectory === "string" ? { baseDirectory: value.baseDirectory } : {}),
    ...(typeof value.originalLocator === "string"
      ? { originalLocator: value.originalLocator }
      : {}),
    ...(typeof value.repositoryId === "string" ? { repositoryId: value.repositoryId } : {}),
    ...(typeof value.repositoryFullName === "string"
      ? { repositoryFullName: value.repositoryFullName }
      : {}),
    ...(typeof value.defaultBranch === "string" ? { defaultBranch: value.defaultBranch } : {}),
    ...(typeof value.imageName === "string" ? { imageName: value.imageName } : {}),
    ...(typeof value.imageTag === "string" ? { imageTag: value.imageTag } : {}),
    ...(typeof value.imageDigest === "string" ? { imageDigest: value.imageDigest } : {}),
    ...(isStringRecord(value.metadata) ? { metadata: value.metadata } : {}),
  };
}

function serializedAutoDeployPolicy(
  value: Record<string, unknown> | null,
): SerializedResourceAutoDeployPolicy | null {
  if (
    !value ||
    !isAutoDeployPolicyStatus(value.status) ||
    !isAutoDeployTriggerKind(value.triggerKind) ||
    !Array.isArray(value.refs) ||
    !Array.isArray(value.eventKinds) ||
    typeof value.sourceBindingFingerprint !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }

  const refs = value.refs.filter((ref): ref is string => typeof ref === "string");
  const eventKinds = value.eventKinds.filter(isSourceEventKind);
  if (refs.length !== value.refs.length || eventKinds.length !== value.eventKinds.length) {
    return null;
  }

  return {
    status: value.status,
    triggerKind: value.triggerKind,
    refs,
    eventKinds,
    sourceBindingFingerprint: value.sourceBindingFingerprint,
    updatedAt: value.updatedAt,
    ...(value.blockedReason === "source-binding-changed"
      ? { blockedReason: value.blockedReason }
      : {}),
    ...(typeof value.genericWebhookSecretRef === "string"
      ? { genericWebhookSecretRef: value.genericWebhookSecretRef }
      : {}),
    ...(typeof value.dedupeWindowSeconds === "number"
      ? { dedupeWindowSeconds: value.dedupeWindowSeconds }
      : {}),
  };
}

function sourceBindingMatches(
  sourceIdentity: SourceEventIdentity,
  sourceBinding: SerializedResourceSourceBinding,
): boolean {
  if (
    sourceIdentity.providerRepositoryId &&
    sourceBinding.repositoryId &&
    sourceIdentity.providerRepositoryId.trim() === sourceBinding.repositoryId.trim()
  ) {
    return true;
  }

  if (
    sourceIdentity.repositoryFullName &&
    sourceBinding.repositoryFullName &&
    sourceIdentity.repositoryFullName.trim().toLowerCase() ===
      sourceBinding.repositoryFullName.trim().toLowerCase()
  ) {
    return true;
  }

  return safeSourceLocator(sourceIdentity.locator) === safeSourceLocator(sourceBinding.locator);
}

function sourceIdentityFromBinding(
  sourceBinding: SerializedResourceSourceBinding,
): SourceEventIdentity {
  return {
    locator: safeSourceLocator(sourceBinding.locator),
    ...(sourceBinding.repositoryId ? { providerRepositoryId: sourceBinding.repositoryId } : {}),
    ...(sourceBinding.repositoryFullName
      ? { repositoryFullName: sourceBinding.repositoryFullName }
      : {}),
  };
}

function safeSourceLocator(locator: string): string {
  try {
    const parsed = new URL(locator);
    parsed.username = "";
    parsed.password = "";
    return parsed.toString();
  } catch {
    return locator.trim();
  }
}

function isAutoDeployPolicyStatus(
  value: unknown,
): value is SerializedResourceAutoDeployPolicy["status"] {
  return value === "enabled" || value === "disabled" || value === "blocked";
}

function isAutoDeployTriggerKind(
  value: unknown,
): value is SerializedResourceAutoDeployPolicy["triggerKind"] {
  return value === "git-push" || value === "generic-signed-webhook";
}

function isSourceEventKind(value: unknown): value is SourceEventKind {
  return value === "push" || value === "tag";
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((item) => typeof item === "string")
  );
}

function insertableFromRecord(record: SourceEventRecord): Insertable<SourceEventsTable> {
  return {
    id: record.sourceEventId,
    project_id: record.projectId ?? null,
    source_kind: record.sourceKind,
    event_kind: record.eventKind,
    source_identity: { ...record.sourceIdentity },
    ref: record.ref,
    revision: record.revision,
    delivery_id: record.deliveryId ?? null,
    idempotency_key: record.idempotencyKey ?? null,
    dedupe_key: record.dedupeKey,
    dedupe_status: record.dedupeStatus,
    dedupe_of_source_event_id: record.dedupeOfSourceEventId ?? null,
    verification: { ...record.verification },
    status: record.status,
    matched_resource_ids: record.matchedResourceIds,
    ignored_reasons: record.ignoredReasons,
    policy_results: record.policyResults.map((result) => ({ ...result })),
    created_deployment_ids: record.createdDeploymentIds,
    received_at: record.receivedAt,
  };
}

function recordFromRow(row: SourceEventRow): SourceEventRecord {
  return {
    sourceEventId: row.id,
    ...(row.project_id ? { projectId: row.project_id } : {}),
    matchedResourceIds: [...row.matched_resource_ids],
    sourceKind: row.source_kind as SourceEventSourceKind,
    eventKind: row.event_kind as SourceEventKind,
    sourceIdentity: row.source_identity as unknown as SourceEventRecord["sourceIdentity"],
    ref: row.ref,
    revision: row.revision,
    ...(row.delivery_id ? { deliveryId: row.delivery_id } : {}),
    ...(row.idempotency_key ? { idempotencyKey: row.idempotency_key } : {}),
    dedupeKey: row.dedupe_key,
    dedupeStatus: row.dedupe_status as SourceEventDedupeStatus,
    ...(row.dedupe_of_source_event_id
      ? { dedupeOfSourceEventId: row.dedupe_of_source_event_id }
      : {}),
    verification: row.verification as unknown as SourceEventVerificationSummary,
    status: row.status as SourceEventStatus,
    ignoredReasons: row.ignored_reasons as SourceEventIgnoredReason[],
    policyResults: row.policy_results as unknown as SourceEventPolicyResult[],
    createdDeploymentIds: [...row.created_deployment_ids],
    receivedAt: row.received_at,
  };
}

function listItemFromRow(row: SourceEventRow): SourceEventListItem {
  return {
    sourceEventId: row.id,
    ...(row.project_id ? { projectId: row.project_id } : {}),
    resourceIds: [...row.matched_resource_ids],
    sourceKind: row.source_kind as SourceEventSourceKind,
    eventKind: row.event_kind as SourceEventKind,
    ref: row.ref,
    revision: row.revision,
    status: row.status as SourceEventStatus,
    dedupeStatus: row.dedupe_status as SourceEventDedupeStatus,
    ignoredReasons: row.ignored_reasons as SourceEventIgnoredReason[],
    createdDeploymentIds: [...row.created_deployment_ids],
    receivedAt: row.received_at,
  };
}

function detailFromRow(row: SourceEventRow): SourceEventDetail {
  const record = recordFromRow(row);
  return {
    sourceEventId: record.sourceEventId,
    ...(record.projectId ? { projectId: record.projectId } : {}),
    matchedResourceIds: [...record.matchedResourceIds],
    sourceKind: record.sourceKind,
    eventKind: record.eventKind,
    sourceIdentity: { ...record.sourceIdentity },
    ref: record.ref,
    revision: record.revision,
    verification: { ...record.verification },
    status: record.status,
    ...(record.dedupeOfSourceEventId
      ? { dedupeOfSourceEventId: record.dedupeOfSourceEventId }
      : {}),
    policyResults: record.policyResults.map((result) => ({ ...result })),
    createdDeploymentIds: [...record.createdDeploymentIds],
    receivedAt: record.receivedAt,
  };
}
