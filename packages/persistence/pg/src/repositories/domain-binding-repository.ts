import {
  createRepositorySpanName,
  type DomainBindingRepository,
  type RepositoryContext,
  yunduTraceAttributes,
} from "@yundu/application";
import {
  type ActiveDomainBindingByOwnerAndRouteSpec,
  DomainBinding,
  type DomainBindingByIdempotencyKeySpec,
  type DomainBindingByIdSpec,
  type DomainBindingMutationSpec,
  type DomainBindingMutationSpecVisitor,
  type DomainBindingSelectionSpec,
  type DomainBindingSelectionSpecVisitor,
  type UpsertDomainBindingSpec,
} from "@yundu/core";
import { type Insertable, type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database } from "../schema";
import {
  rehydrateDomainBindingRow,
  resolveRepositoryExecutor,
  serializeDomainRouteFailure,
  serializeDomainVerificationAttempts,
} from "./shared";

type DomainBindingSelectionQuery = SelectQueryBuilder<
  Database,
  "domain_bindings",
  Selectable<Database["domain_bindings"]>
>;

class KyselyDomainBindingSelectionVisitor
  implements DomainBindingSelectionSpecVisitor<DomainBindingSelectionQuery>
{
  visitDomainBindingById(
    query: DomainBindingSelectionQuery,
    spec: DomainBindingByIdSpec,
  ): DomainBindingSelectionQuery {
    return query.where("id", "=", spec.id.value);
  }

  visitDomainBindingByIdempotencyKey(
    query: DomainBindingSelectionQuery,
    spec: DomainBindingByIdempotencyKeySpec,
  ): DomainBindingSelectionQuery {
    return query.where("idempotency_key", "=", spec.idempotencyKey);
  }

  visitActiveDomainBindingByOwnerAndRoute(
    query: DomainBindingSelectionQuery,
    spec: ActiveDomainBindingByOwnerAndRouteSpec,
  ): DomainBindingSelectionQuery {
    return query
      .where("project_id", "=", spec.projectId.value)
      .where("environment_id", "=", spec.environmentId.value)
      .where("resource_id", "=", spec.resourceId.value)
      .where("domain_name", "=", spec.domainName.value)
      .where("path_prefix", "=", spec.pathPrefix.value)
      .where("status", "<>", "failed");
  }
}

class KyselyDomainBindingMutationVisitor
  implements
    DomainBindingMutationSpecVisitor<{
      values: Insertable<Database["domain_bindings"]>;
    }>
{
  visitUpsertDomainBinding(spec: UpsertDomainBindingSpec) {
    return {
      values: {
        id: spec.state.id.value,
        project_id: spec.state.projectId.value,
        environment_id: spec.state.environmentId.value,
        resource_id: spec.state.resourceId.value,
        server_id: spec.state.serverId.value,
        destination_id: spec.state.destinationId.value,
        domain_name: spec.state.domainName.value,
        path_prefix: spec.state.pathPrefix.value,
        proxy_kind: spec.state.proxyKind.value,
        tls_mode: spec.state.tlsMode.value,
        certificate_policy: spec.state.certificatePolicy.value,
        status: spec.state.status.value,
        verification_attempts: serializeDomainVerificationAttempts(spec.state.verificationAttempts),
        route_failure: serializeDomainRouteFailure(spec.state.routeFailure),
        idempotency_key: spec.state.idempotencyKey?.value ?? null,
        created_at: spec.state.createdAt.value,
      },
    };
  }
}

export class PgDomainBindingRepository implements DomainBindingRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async upsert(
    context: RepositoryContext,
    domainBinding: DomainBinding,
    spec: DomainBindingMutationSpec,
  ): Promise<void> {
    void domainBinding;
    const executor = resolveRepositoryExecutor(this.db, context);
    const mutation = spec.accept(new KyselyDomainBindingMutationVisitor());
    await context.tracer.startActiveSpan(
      createRepositorySpanName("domain_binding", "upsert"),
      {
        attributes: {
          [yunduTraceAttributes.repositoryName]: "domain_binding",
          [yunduTraceAttributes.mutationSpecName]: spec.constructor.name,
        },
      },
      async () => {
        await executor
          .insertInto("domain_bindings")
          .values(mutation.values)
          .onConflict((conflict) =>
            conflict.column("id").doUpdateSet({
              project_id: mutation.values.project_id,
              environment_id: mutation.values.environment_id,
              resource_id: mutation.values.resource_id,
              server_id: mutation.values.server_id,
              destination_id: mutation.values.destination_id,
              domain_name: mutation.values.domain_name,
              path_prefix: mutation.values.path_prefix,
              proxy_kind: mutation.values.proxy_kind,
              tls_mode: mutation.values.tls_mode,
              certificate_policy: mutation.values.certificate_policy,
              status: mutation.values.status,
              verification_attempts: mutation.values.verification_attempts,
              route_failure: mutation.values.route_failure,
              idempotency_key: mutation.values.idempotency_key,
            }),
          )
          .execute();
      },
    );
  }

  async findOne(
    context: RepositoryContext,
    spec: DomainBindingSelectionSpec,
  ): Promise<DomainBinding | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("domain_binding", "find_one"),
      {
        attributes: {
          [yunduTraceAttributes.repositoryName]: "domain_binding",
          [yunduTraceAttributes.selectionSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const row = await spec
          .accept(
            executor.selectFrom("domain_bindings").selectAll(),
            new KyselyDomainBindingSelectionVisitor(),
          )
          .executeTakeFirst();

        return row ? DomainBinding.rehydrate(rehydrateDomainBindingRow(row)) : null;
      },
    );
  }
}
