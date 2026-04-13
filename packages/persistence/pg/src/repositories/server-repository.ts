import {
  createRepositorySpanName,
  type RepositoryContext,
  type ServerRepository,
  yunduTraceAttributes,
} from "@yundu/application";
import {
  DeploymentTarget,
  type DeploymentTargetByIdSpec,
  type DeploymentTargetByProviderAndHostSpec,
  type DeploymentTargetMutationSpec,
  type DeploymentTargetMutationSpecVisitor,
  type DeploymentTargetSelectionSpec,
  type DeploymentTargetSelectionSpecVisitor,
  type UpsertDeploymentTargetSpec,
} from "@yundu/core";
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
          [yunduTraceAttributes.repositoryName]: "server",
          [yunduTraceAttributes.mutationSpecName]: spec.constructor.name,
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
          [yunduTraceAttributes.repositoryName]: "server",
          [yunduTraceAttributes.selectionSpecName]: spec.constructor.name,
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
