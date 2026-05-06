import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  createRepositorySpanName,
  type PreviewPolicyDecisionProjection,
  type PreviewPolicyDecisionReadModel,
  type PreviewPolicyDecisionReasonCode,
  type PreviewPolicyDecisionRecorder,
  type RepositoryContext,
} from "@appaloft/application";
import { type Insertable, type Kysely, type Selectable } from "kysely";

import { type Database } from "../schema";
import { normalizeTimestamp, resolveRepositoryExecutor } from "./shared";

type PreviewPolicyDecisionRow = Selectable<Database["preview_policy_decisions"]>;

export class PgPreviewPolicyDecisionProjection
  implements PreviewPolicyDecisionRecorder, PreviewPolicyDecisionReadModel
{
  constructor(private readonly db: Kysely<Database>) {}

  async record(
    context: RepositoryContext,
    projection: PreviewPolicyDecisionProjection,
  ): Promise<void> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const values = rowFromProjection(projection);

    await context.tracer.startActiveSpan(
      createRepositorySpanName("preview_policy_decision", "record"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "preview_policy_decision",
          "appaloft.preview_policy_decision.status": projection.status,
        },
      },
      async () => {
        await executor
          .insertInto("preview_policy_decisions")
          .values(values)
          .onConflict((conflict) =>
            conflict.column("source_event_id").doUpdateSet({
              project_id: values.project_id,
              environment_id: values.environment_id,
              resource_id: values.resource_id,
              provider: values.provider,
              event_kind: values.event_kind,
              event_action: values.event_action,
              repository_full_name: values.repository_full_name,
              head_repository_full_name: values.head_repository_full_name,
              pull_request_number: values.pull_request_number,
              head_sha: values.head_sha,
              base_ref: values.base_ref,
              fork: values.fork,
              secret_backed: values.secret_backed,
              requested_secret_scope_count: values.requested_secret_scope_count,
              status: values.status,
              phase: values.phase,
              deployment_eligible: values.deployment_eligible,
              reason_code: values.reason_code,
              preview_environment_id: values.preview_environment_id,
              deployment_id: values.deployment_id,
              evaluated_at: values.evaluated_at,
            }),
          )
          .execute();
      },
    );
  }

  async findOne(
    context: RepositoryContext,
    input: { sourceEventId: string },
  ): Promise<PreviewPolicyDecisionProjection | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("preview_policy_decision", "find_one"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "preview_policy_decision",
        },
      },
      async () => {
        const row = await executor
          .selectFrom("preview_policy_decisions")
          .selectAll()
          .where("source_event_id", "=", input.sourceEventId)
          .executeTakeFirst();

        return row ? projectionFromRow(row) : null;
      },
    );
  }
}

function rowFromProjection(
  projection: PreviewPolicyDecisionProjection,
): Insertable<Database["preview_policy_decisions"]> {
  return {
    source_event_id: projection.sourceEventId,
    project_id: projection.projectId,
    environment_id: projection.environmentId,
    resource_id: projection.resourceId,
    provider: projection.provider,
    event_kind: projection.eventKind,
    event_action: projection.eventAction,
    repository_full_name: projection.repositoryFullName,
    head_repository_full_name: projection.headRepositoryFullName,
    pull_request_number: projection.pullRequestNumber,
    head_sha: projection.headSha,
    base_ref: projection.baseRef,
    fork: projection.fork,
    secret_backed: projection.secretBacked,
    requested_secret_scope_count: projection.requestedSecretScopeCount,
    status: projection.status,
    phase: projection.phase,
    deployment_eligible: projection.deploymentEligible,
    reason_code: projection.reasonCode ?? null,
    preview_environment_id: projection.previewEnvironmentId ?? null,
    deployment_id: projection.deploymentId ?? null,
    evaluated_at: projection.evaluatedAt,
  };
}

function projectionFromRow(row: PreviewPolicyDecisionRow): PreviewPolicyDecisionProjection {
  return {
    sourceEventId: row.source_event_id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    resourceId: row.resource_id,
    provider: "github",
    eventKind: "pull-request",
    eventAction: eventActionFromRow(row.event_action),
    repositoryFullName: row.repository_full_name,
    headRepositoryFullName: row.head_repository_full_name,
    pullRequestNumber: row.pull_request_number,
    headSha: row.head_sha,
    baseRef: row.base_ref,
    fork: row.fork,
    secretBacked: row.secret_backed,
    requestedSecretScopeCount: row.requested_secret_scope_count,
    status: row.status === "allowed" ? "allowed" : "blocked",
    phase: "preview-policy-evaluation",
    deploymentEligible: row.deployment_eligible,
    evaluatedAt: normalizedRequiredTimestamp(row.evaluated_at),
    ...(row.reason_code ? { reasonCode: reasonCodeFromRow(row.reason_code) } : {}),
    ...(row.preview_environment_id ? { previewEnvironmentId: row.preview_environment_id } : {}),
    ...(row.deployment_id ? { deploymentId: row.deployment_id } : {}),
  };
}

function eventActionFromRow(value: string): PreviewPolicyDecisionProjection["eventAction"] {
  return value === "reopened" || value === "synchronize" ? value : "opened";
}

function reasonCodeFromRow(value: string): PreviewPolicyDecisionReasonCode {
  switch (value) {
    case "preview_same_repository_disabled":
    case "preview_fork_disabled":
    case "preview_fork_secrets_blocked":
    case "preview_secret_backed_disabled":
      return value;
    default:
      return "preview_event_unverified";
  }
}

function normalizedRequiredTimestamp(value: string | Date): string {
  return normalizeTimestamp(value) ?? String(value);
}
