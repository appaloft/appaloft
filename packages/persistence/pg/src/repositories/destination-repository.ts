import {
  createRepositorySpanName,
  type DestinationRepository,
  type RepositoryContext,
  yunduTraceAttributes,
} from "@yundu/application";
import {
  Destination,
  type DestinationByIdSpec,
  type DestinationByServerAndNameSpec,
  type DestinationMutationSpec,
  type DestinationMutationSpecVisitor,
  type DestinationSelectionSpec,
  type DestinationSelectionSpecVisitor,
  type UpsertDestinationSpec,
} from "@yundu/core";
import { type Insertable, type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database } from "../schema";
import { rehydrateDestination, resolveRepositoryExecutor } from "./shared";

type DestinationSelectionQuery = SelectQueryBuilder<
  Database,
  "destinations",
  Selectable<Database["destinations"]>
>;

class KyselyDestinationSelectionVisitor
  implements DestinationSelectionSpecVisitor<DestinationSelectionQuery>
{
  visitDestinationById(
    query: DestinationSelectionQuery,
    spec: DestinationByIdSpec,
  ): DestinationSelectionQuery {
    return query.where("id", "=", spec.id.value);
  }

  visitDestinationByServerAndName(
    query: DestinationSelectionQuery,
    spec: DestinationByServerAndNameSpec,
  ): DestinationSelectionQuery {
    return query.where("server_id", "=", spec.serverId.value).where("name", "=", spec.name.value);
  }
}

class KyselyDestinationMutationVisitor
  implements DestinationMutationSpecVisitor<{ values: Insertable<Database["destinations"]> }>
{
  visitUpsertDestination(spec: UpsertDestinationSpec) {
    return {
      values: {
        id: spec.state.id.value,
        server_id: spec.state.serverId.value,
        name: spec.state.name.value,
        kind: spec.state.kind.value,
        created_at: spec.state.createdAt.value,
      },
    };
  }
}

export class PgDestinationRepository implements DestinationRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async upsert(
    context: RepositoryContext,
    destination: Destination,
    spec: DestinationMutationSpec,
  ): Promise<void> {
    void destination;
    const executor = resolveRepositoryExecutor(this.db, context);
    const mutation = spec.accept(new KyselyDestinationMutationVisitor());
    await context.tracer.startActiveSpan(
      createRepositorySpanName("destination", "upsert"),
      {
        attributes: {
          [yunduTraceAttributes.repositoryName]: "destination",
          [yunduTraceAttributes.mutationSpecName]: spec.constructor.name,
        },
      },
      async () => {
        await executor
          .insertInto("destinations")
          .values(mutation.values)
          .onConflict((conflict) =>
            conflict.column("id").doUpdateSet({
              server_id: mutation.values.server_id,
              name: mutation.values.name,
              kind: mutation.values.kind,
            }),
          )
          .execute();
      },
    );
  }

  async findOne(
    context: RepositoryContext,
    spec: DestinationSelectionSpec,
  ): Promise<Destination | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("destination", "find_one"),
      {
        attributes: {
          [yunduTraceAttributes.repositoryName]: "destination",
          [yunduTraceAttributes.selectionSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const row = await spec
          .accept(
            executor.selectFrom("destinations").selectAll(),
            new KyselyDestinationSelectionVisitor(),
          )
          .executeTakeFirst();

        return row ? Destination.rehydrate(rehydrateDestination(row)) : null;
      },
    );
  }
}
