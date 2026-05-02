import {
  type AndResourceAccessFailureEvidenceSelectionSpec,
  appaloftTraceAttributes,
  createReadModelSpanName,
  type RepositoryContext,
  type ResourceAccessFailureDiagnostic,
  type ResourceAccessFailureEvidenceByHostnameSpec,
  type ResourceAccessFailureEvidenceByPathSpec,
  type ResourceAccessFailureEvidenceByRequestIdSpec,
  type ResourceAccessFailureEvidenceByResourceIdSpec,
  type ResourceAccessFailureEvidenceReadModel,
  type ResourceAccessFailureEvidenceRecord,
  type ResourceAccessFailureEvidenceRecorder,
  type ResourceAccessFailureEvidenceRecordInput,
  type ResourceAccessFailureEvidenceSelectionSpec,
  type ResourceAccessFailureEvidenceSelectionSpecVisitor,
  type ResourceAccessFailureEvidenceUnexpiredAtSpec,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database, type ResourceAccessFailureEvidenceTable } from "../schema";
import { normalizeTimestamp, resolveRepositoryExecutor } from "./shared";

type EvidenceRow = Selectable<ResourceAccessFailureEvidenceTable>;
type EvidenceSelectionQuery = SelectQueryBuilder<
  Database,
  "resource_access_failure_evidence",
  Selectable<ResourceAccessFailureEvidenceTable>
>;

interface EvidenceSelectionTranslation {
  query: EvidenceSelectionQuery;
  expiresAfter?: string;
  requestId?: string;
  resourceId?: string;
}

function diagnosticRecord(diagnostic: ResourceAccessFailureDiagnostic): Record<string, unknown> {
  return diagnostic as unknown as Record<string, unknown>;
}

function toRecord(row: EvidenceRow): ResourceAccessFailureEvidenceRecord {
  return {
    requestId: row.request_id,
    diagnostic: row.diagnostic as unknown as ResourceAccessFailureDiagnostic,
    capturedAt: normalizeTimestamp(row.captured_at) ?? row.captured_at,
    expiresAt: normalizeTimestamp(row.expires_at) ?? row.expires_at,
  };
}

function unavailableError(operation: string, cause: unknown) {
  return domainError.resourceAccessFailureEvidenceUnavailable(
    "Resource access failure evidence is temporarily unavailable.",
    {
      operation,
      cause: cause instanceof Error ? cause.name : "unknown",
    },
  );
}

class KyselyResourceAccessFailureEvidenceSelectionVisitor
  implements ResourceAccessFailureEvidenceSelectionSpecVisitor<EvidenceSelectionTranslation>
{
  visitResourceAccessFailureEvidenceByRequestId(
    translation: EvidenceSelectionTranslation,
    spec: ResourceAccessFailureEvidenceByRequestIdSpec,
  ): EvidenceSelectionTranslation {
    return {
      ...translation,
      requestId: spec.requestId,
      query: translation.query.where("request_id", "=", spec.requestId),
    };
  }

  visitResourceAccessFailureEvidenceByResourceId(
    translation: EvidenceSelectionTranslation,
    spec: ResourceAccessFailureEvidenceByResourceIdSpec,
  ): EvidenceSelectionTranslation {
    return {
      ...translation,
      resourceId: spec.resourceId,
      query: translation.query.where("resource_id", "=", spec.resourceId),
    };
  }

  visitResourceAccessFailureEvidenceByHostname(
    translation: EvidenceSelectionTranslation,
    spec: ResourceAccessFailureEvidenceByHostnameSpec,
  ): EvidenceSelectionTranslation {
    return {
      ...translation,
      query: translation.query.where("hostname", "=", spec.hostname),
    };
  }

  visitResourceAccessFailureEvidenceByPath(
    translation: EvidenceSelectionTranslation,
    spec: ResourceAccessFailureEvidenceByPathSpec,
  ): EvidenceSelectionTranslation {
    return {
      ...translation,
      query: translation.query.where("path", "=", spec.path),
    };
  }

  visitResourceAccessFailureEvidenceUnexpiredAt(
    translation: EvidenceSelectionTranslation,
    spec: ResourceAccessFailureEvidenceUnexpiredAtSpec,
  ): EvidenceSelectionTranslation {
    return {
      ...translation,
      expiresAfter: spec.at,
      query: translation.query.where("expires_at", ">", spec.at),
    };
  }

  visitAndResourceAccessFailureEvidenceSelectionSpec(
    translation: EvidenceSelectionTranslation,
    spec: AndResourceAccessFailureEvidenceSelectionSpec,
  ): EvidenceSelectionTranslation {
    return spec.right.accept(spec.left.accept(translation, this), this);
  }
}

export class PgResourceAccessFailureEvidenceProjection
  implements ResourceAccessFailureEvidenceRecorder, ResourceAccessFailureEvidenceReadModel
{
  constructor(private readonly db: Kysely<Database>) {}

  async record(
    context: RepositoryContext,
    input: ResourceAccessFailureEvidenceRecordInput,
  ): Promise<Result<ResourceAccessFailureEvidenceRecord>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("resource_access_failure_evidence", "record"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "resource_access_failure_evidence",
          [appaloftTraceAttributes.requestId]: input.diagnostic.requestId,
          [appaloftTraceAttributes.resourceId]: input.diagnostic.route?.resourceId,
        },
      },
      async () => {
        try {
          await executor
            .deleteFrom("resource_access_failure_evidence")
            .where("expires_at", "<=", input.capturedAt)
            .execute();

          const route = input.diagnostic.route;
          const affected = input.diagnostic.affected;
          await executor
            .insertInto("resource_access_failure_evidence")
            .values({
              request_id: input.diagnostic.requestId,
              diagnostic: diagnosticRecord(input.diagnostic),
              resource_id: route?.resourceId ?? null,
              deployment_id: route?.deploymentId ?? null,
              domain_binding_id: route?.domainBindingId ?? null,
              server_id: route?.serverId ?? null,
              destination_id: route?.destinationId ?? null,
              route_id: route?.routeId ?? null,
              hostname: affected?.hostname ?? route?.host ?? null,
              path: affected?.path ?? route?.pathPrefix ?? null,
              captured_at: input.capturedAt,
              expires_at: input.expiresAt,
            })
            .onConflict((oc) =>
              oc.column("request_id").doUpdateSet({
                diagnostic: diagnosticRecord(input.diagnostic),
                resource_id: route?.resourceId ?? null,
                deployment_id: route?.deploymentId ?? null,
                domain_binding_id: route?.domainBindingId ?? null,
                server_id: route?.serverId ?? null,
                destination_id: route?.destinationId ?? null,
                route_id: route?.routeId ?? null,
                hostname: affected?.hostname ?? route?.host ?? null,
                path: affected?.path ?? route?.pathPrefix ?? null,
                captured_at: input.capturedAt,
                expires_at: input.expiresAt,
              }),
            )
            .execute();

          return ok({
            requestId: input.diagnostic.requestId,
            diagnostic: input.diagnostic,
            capturedAt: input.capturedAt,
            expiresAt: input.expiresAt,
          });
        } catch (cause) {
          return err(unavailableError("record", cause));
        }
      },
    );
  }

  async findOne(
    context: RepositoryContext,
    spec: ResourceAccessFailureEvidenceSelectionSpec,
  ): Promise<Result<ResourceAccessFailureEvidenceRecord | null>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const translation = spec.accept(
      {
        query: executor.selectFrom("resource_access_failure_evidence").selectAll(),
      },
      new KyselyResourceAccessFailureEvidenceSelectionVisitor(),
    );
    return context.tracer.startActiveSpan(
      createReadModelSpanName("resource_access_failure_evidence", "find_one"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "resource_access_failure_evidence",
          [appaloftTraceAttributes.requestId]: translation.requestId,
          [appaloftTraceAttributes.resourceId]: translation.resourceId,
        },
      },
      async () => {
        try {
          if (translation.expiresAfter) {
            await executor
              .deleteFrom("resource_access_failure_evidence")
              .where("expires_at", "<=", translation.expiresAfter)
              .execute();
          }

          const row = await translation.query.executeTakeFirst();
          return ok(row ? toRecord(row) : null);
        } catch (cause) {
          return err(unavailableError("find_one", cause));
        }
      },
    );
  }
}
