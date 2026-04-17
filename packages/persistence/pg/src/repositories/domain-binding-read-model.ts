import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  type DomainBindingReadModel,
  type DomainBindingSummary,
  type RepositoryContext,
} from "@appaloft/application";
import { type Kysely } from "kysely";

import { type Database } from "../schema";
import {
  normalizeTimestamp,
  resolveRepositoryExecutor,
  type SerializedDomainDnsObservation,
  type SerializedDomainRouteFailure,
  type SerializedDomainVerificationAttempt,
} from "./shared";

export class PgDomainBindingReadModel implements DomainBindingReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async list(
    context: RepositoryContext,
    input?: {
      projectId?: string;
      environmentId?: string;
      resourceId?: string;
    },
  ): Promise<DomainBindingSummary[]> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("domain_binding", "list"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "domain_binding",
        },
      },
      async () => {
        let query = executor
          .selectFrom("domain_bindings")
          .selectAll()
          .orderBy("created_at", "desc");

        if (input?.projectId) {
          query = query.where("project_id", "=", input.projectId);
        }

        if (input?.environmentId) {
          query = query.where("environment_id", "=", input.environmentId);
        }

        if (input?.resourceId) {
          query = query.where("resource_id", "=", input.resourceId);
        }

        const rows = await query.execute();
        return rows.map((row): DomainBindingSummary => {
          const verificationAttempts = (row.verification_attempts ??
            []) as unknown as SerializedDomainVerificationAttempt[];
          const dnsObservation = row.dns_observation as SerializedDomainDnsObservation | null;
          const routeFailure = row.route_failure as SerializedDomainRouteFailure | null;

          return {
            id: row.id,
            projectId: row.project_id,
            environmentId: row.environment_id,
            resourceId: row.resource_id,
            serverId: row.server_id,
            destinationId: row.destination_id,
            domainName: row.domain_name,
            pathPrefix: row.path_prefix,
            proxyKind: row.proxy_kind as DomainBindingSummary["proxyKind"],
            tlsMode: row.tls_mode as DomainBindingSummary["tlsMode"],
            certificatePolicy: row.certificate_policy as DomainBindingSummary["certificatePolicy"],
            status: row.status as DomainBindingSummary["status"],
            ...(dnsObservation
              ? {
                  dnsObservation: {
                    status: dnsObservation.status,
                    expectedTargets: dnsObservation.expectedTargets,
                    observedTargets: dnsObservation.observedTargets,
                    ...(dnsObservation.checkedAt
                      ? {
                          checkedAt:
                            normalizeTimestamp(dnsObservation.checkedAt) ??
                            dnsObservation.checkedAt,
                        }
                      : {}),
                    ...(dnsObservation.message ? { message: dnsObservation.message } : {}),
                  },
                }
              : {}),
            ...(routeFailure
              ? {
                  routeFailure: {
                    deploymentId: routeFailure.deploymentId,
                    failedAt: normalizeTimestamp(routeFailure.failedAt) ?? routeFailure.failedAt,
                    errorCode: routeFailure.errorCode,
                    failurePhase: routeFailure.failurePhase,
                    retriable: routeFailure.retriable,
                    ...(routeFailure.errorMessage
                      ? { errorMessage: routeFailure.errorMessage }
                      : {}),
                  },
                }
              : {}),
            verificationAttemptCount: verificationAttempts.length,
            createdAt: normalizeTimestamp(row.created_at) ?? row.created_at,
          };
        });
      },
    );
  }
}
