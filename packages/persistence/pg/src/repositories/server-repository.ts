import {
  appaloftTraceAttributes,
  createRepositorySpanName,
  type RepositoryContext,
  type ServerRepository,
} from "@appaloft/application";
import {
  DeploymentTarget,
  type DeploymentTargetByIdSpec,
  type DeploymentTargetByProviderAndHostSpec,
  type DeploymentTargetMutationSpec,
  type DeploymentTargetMutationSpecVisitor,
  type DeploymentTargetSelectionSpec,
  type DeploymentTargetSelectionSpecVisitor,
  type UpsertDeploymentTargetSpec,
} from "@appaloft/core";
import { type Insertable, type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database } from "../schema";
import { rehydrateDeploymentTarget, resolveRepositoryExecutor } from "./shared";

type ServerSelectionQuery = SelectQueryBuilder<
  Database,
  "servers",
  Selectable<Database["servers"]>
>;

class KyselyServerSelectionVisitor
  implements DeploymentTargetSelectionSpecVisitor<ServerSelectionQuery>
{
  visitDeploymentTargetById(
    query: ServerSelectionQuery,
    spec: DeploymentTargetByIdSpec,
  ): ServerSelectionQuery {
    return query.where("id", "=", spec.id.value);
  }

  visitDeploymentTargetByProviderAndHost(
    query: ServerSelectionQuery,
    spec: DeploymentTargetByProviderAndHostSpec,
  ): ServerSelectionQuery {
    return query
      .where("provider_key", "=", spec.providerKey.value)
      .where("host", "=", spec.host.value);
  }
}

class KyselyServerMutationVisitor
  implements DeploymentTargetMutationSpecVisitor<{ values: Insertable<Database["servers"]> }>
{
  visitUpsertDeploymentTarget(spec: UpsertDeploymentTargetSpec) {
    return {
      values: {
        id: spec.state.id.value,
        name: spec.state.name.value,
        host: spec.state.host.value,
        port: spec.state.port.value,
        provider_key: spec.state.providerKey.value,
        lifecycle_status: spec.state.lifecycleStatus.value,
        deactivated_at: spec.state.deactivatedAt?.value ?? null,
        deactivation_reason: spec.state.deactivationReason?.value ?? null,
        deleted_at: spec.state.deletedAt?.value ?? null,
        edge_proxy_kind: spec.state.edgeProxy?.kind.value ?? null,
        edge_proxy_status: spec.state.edgeProxy?.status.value ?? null,
        edge_proxy_last_attempt_at: spec.state.edgeProxy?.lastAttemptAt?.value ?? null,
        edge_proxy_last_succeeded_at: spec.state.edgeProxy?.lastSucceededAt?.value ?? null,
        edge_proxy_last_error_code: spec.state.edgeProxy?.lastErrorCode?.value ?? null,
        edge_proxy_last_error_message: spec.state.edgeProxy?.lastErrorMessage?.value ?? null,
        credential_id: spec.state.credential?.credentialId?.value ?? null,
        credential_kind: spec.state.credential?.kind.value ?? null,
        credential_username: spec.state.credential?.username?.value ?? null,
        credential_public_key: spec.state.credential?.publicKey?.value ?? null,
        credential_private_key: spec.state.credential?.privateKey?.value ?? null,
        created_at: spec.state.createdAt.value,
      },
    };
  }
}

export class PgServerRepository implements ServerRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async upsert(
    context: RepositoryContext,
    server: DeploymentTarget,
    spec: DeploymentTargetMutationSpec,
  ): Promise<void> {
    void server;
    const executor = resolveRepositoryExecutor(this.db, context);
    const mutation = spec.accept(new KyselyServerMutationVisitor());
    await context.tracer.startActiveSpan(
      createRepositorySpanName("server", "upsert"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "server",
          [appaloftTraceAttributes.mutationSpecName]: spec.constructor.name,
        },
      },
      async () => {
        await executor
          .insertInto("servers")
          .values(mutation.values)
          .onConflict((conflict) =>
            conflict.column("id").doUpdateSet({
              name: mutation.values.name,
              host: mutation.values.host,
              port: mutation.values.port,
              provider_key: mutation.values.provider_key,
              lifecycle_status: mutation.values.lifecycle_status,
              deactivated_at: mutation.values.deactivated_at,
              deactivation_reason: mutation.values.deactivation_reason,
              deleted_at: mutation.values.deleted_at,
              edge_proxy_kind: mutation.values.edge_proxy_kind,
              edge_proxy_status: mutation.values.edge_proxy_status,
              edge_proxy_last_attempt_at: mutation.values.edge_proxy_last_attempt_at,
              edge_proxy_last_succeeded_at: mutation.values.edge_proxy_last_succeeded_at,
              edge_proxy_last_error_code: mutation.values.edge_proxy_last_error_code,
              edge_proxy_last_error_message: mutation.values.edge_proxy_last_error_message,
              credential_id: mutation.values.credential_id,
              credential_kind: mutation.values.credential_kind,
              credential_username: mutation.values.credential_username,
              credential_public_key: mutation.values.credential_public_key,
              credential_private_key: mutation.values.credential_private_key,
            }),
          )
          .execute();
      },
    );
  }

  async findOne(
    context: RepositoryContext,
    spec: DeploymentTargetSelectionSpec,
  ): Promise<DeploymentTarget | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("server", "find_one"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "server",
          [appaloftTraceAttributes.selectionSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const row = await spec
          .accept(executor.selectFrom("servers").selectAll(), new KyselyServerSelectionVisitor())
          .executeTakeFirst();

        return row ? DeploymentTarget.rehydrate(rehydrateDeploymentTarget(row)) : null;
      },
    );
  }
}
