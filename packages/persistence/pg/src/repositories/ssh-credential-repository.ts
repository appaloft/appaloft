import {
  createRepositorySpanName,
  type RepositoryContext,
  type SshCredentialRepository,
  yunduTraceAttributes,
} from "@yundu/application";
import {
  SshCredential,
  type SshCredentialByIdSpec,
  type SshCredentialMutationSpec,
  type SshCredentialMutationSpecVisitor,
  type SshCredentialSelectionSpec,
  type SshCredentialSelectionSpecVisitor,
  type UpsertSshCredentialSpec,
} from "@yundu/core";
import { type Insertable, type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database } from "../schema";
import { rehydrateSshCredential, resolveRepositoryExecutor } from "./shared";

type SshCredentialSelectionQuery = SelectQueryBuilder<
  Database,
  "ssh_credentials",
  Selectable<Database["ssh_credentials"]>
>;

class KyselySshCredentialSelectionVisitor
  implements SshCredentialSelectionSpecVisitor<SshCredentialSelectionQuery>
{
  visitSshCredentialById(
    query: SshCredentialSelectionQuery,
    spec: SshCredentialByIdSpec,
  ): SshCredentialSelectionQuery {
    return query.where("id", "=", spec.id.value);
  }
}

class KyselySshCredentialMutationVisitor
  implements SshCredentialMutationSpecVisitor<{ values: Insertable<Database["ssh_credentials"]> }>
{
  visitUpsertSshCredential(spec: UpsertSshCredentialSpec) {
    return {
      values: {
        id: spec.state.id.value,
        name: spec.state.name.value,
        kind: spec.state.kind.value,
        username: spec.state.username?.value ?? null,
        public_key: spec.state.publicKey?.value ?? null,
        private_key: spec.state.privateKey.value,
        created_at: spec.state.createdAt.value,
      },
    };
  }
}

export class PgSshCredentialRepository implements SshCredentialRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async upsert(
    context: RepositoryContext,
    credential: SshCredential,
    spec: SshCredentialMutationSpec,
  ): Promise<void> {
    void credential;
    const executor = resolveRepositoryExecutor(this.db, context);
    const mutation = spec.accept(new KyselySshCredentialMutationVisitor());
    await context.tracer.startActiveSpan(
      createRepositorySpanName("ssh_credential", "upsert"),
      {
        attributes: {
          [yunduTraceAttributes.repositoryName]: "ssh_credential",
          [yunduTraceAttributes.mutationSpecName]: spec.constructor.name,
        },
      },
      async () => {
        await executor
          .insertInto("ssh_credentials")
          .values(mutation.values)
          .onConflict((conflict) =>
            conflict.column("id").doUpdateSet({
              name: mutation.values.name,
              kind: mutation.values.kind,
              username: mutation.values.username,
              public_key: mutation.values.public_key,
              private_key: mutation.values.private_key,
            }),
          )
          .execute();
      },
    );
  }

  async findOne(
    context: RepositoryContext,
    spec: SshCredentialSelectionSpec,
  ): Promise<SshCredential | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("ssh_credential", "find_one"),
      {
        attributes: {
          [yunduTraceAttributes.repositoryName]: "ssh_credential",
          [yunduTraceAttributes.selectionSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const row = await spec
          .accept(
            executor.selectFrom("ssh_credentials").selectAll(),
            new KyselySshCredentialSelectionVisitor(),
          )
          .executeTakeFirst();

        return row ? SshCredential.rehydrate(rehydrateSshCredential(row)) : null;
      },
    );
  }
}
