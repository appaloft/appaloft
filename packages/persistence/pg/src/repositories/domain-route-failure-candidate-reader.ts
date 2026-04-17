import {
  appaloftTraceAttributes,
  createRepositorySpanName,
  type DomainRouteFailureCandidate,
  type DomainRouteFailureCandidateReader,
  type RepositoryContext,
} from "@appaloft/application";
import { type Kysely } from "kysely";

import { type Database } from "../schema";
import { resolveRepositoryExecutor } from "./shared";

const affectedDomainBindingStatuses = ["bound", "certificate_pending", "ready", "not_ready"];

export class PgDomainRouteFailureCandidateReader implements DomainRouteFailureCandidateReader {
  constructor(private readonly db: Kysely<Database>) {}

  async listAffectedBindings(
    context: RepositoryContext,
    input: { deploymentId: string },
  ): Promise<DomainRouteFailureCandidate[]> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("domain_route_failure_candidate", "list_affected_bindings"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "domain_route_failure_candidate",
        },
      },
      async () => {
        const deployment = await executor
          .selectFrom("deployments")
          .select(["project_id", "environment_id", "resource_id", "server_id", "destination_id"])
          .where("id", "=", input.deploymentId)
          .executeTakeFirst();

        if (!deployment) {
          return [];
        }

        const rows = await executor
          .selectFrom("domain_bindings")
          .select(["id"])
          .where("project_id", "=", deployment.project_id)
          .where("environment_id", "=", deployment.environment_id)
          .where("resource_id", "=", deployment.resource_id)
          .where("server_id", "=", deployment.server_id)
          .where("destination_id", "=", deployment.destination_id)
          .where("status", "in", affectedDomainBindingStatuses)
          .execute();

        return rows.map((row) => ({
          domainBindingId: row.id,
        }));
      },
    );
  }
}
