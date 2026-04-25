import {
  appaloftTraceAttributes,
  createRepositorySpanName,
  type RepositoryContext,
  type SshCredentialRepository,
} from "@appaloft/application";
import {
  type RotateSshCredentialSpec,
  SshCredential,
  type SshCredentialByIdSpec,
  type SshCredentialMutationSpec,
  type SshCredentialMutationSpecVisitor,
  type SshCredentialSelectionSpec,
  type SshCredentialSelectionSpecVisitor,
  type UnusedSshCredentialByIdSpec,
  type UpsertSshCredentialSpec,
} from "@appaloft/core";
import {
  type DeleteQueryBuilder,
  type DeleteResult,
  type Insertable,
  type Kysely,
  type Selectable,
  type SelectQueryBuilder,
} from "kysely";

import { type Database } from "../schema";
import { rehydrateSshCredential, resolveRepositoryExecutor } from "./shared";

type SshCredentialSelectionQuery = SelectQueryBuilder<
  Database,
  "ssh_credentials",
  Selectable<Database["ssh_credentials"]>
>;
type SshCredentialDeleteQuery = DeleteQueryBuilder<Database, "ssh_credentials", DeleteResult>;

class KyselySshCredentialSelectionVisitor
  implements SshCredentialSelectionSpecVisitor<SshCredentialSelectionQuery>
{
  visitSshCredentialById(
    query: SshCredentialSelectionQuery,
    spec: SshCredentialByIdSpec,
  ): SshCredentialSelectionQuery {
    return query.where("id", "=", spec.id.value);
  }

  visitUnusedSshCredentialById(
    query: SshCredentialSelectionQuery,
    spec: UnusedSshCredentialByIdSpec,
  ): SshCredentialSelectionQuery {
    return query
      .where("id", "=", spec.id.value)
      .where(({ exists, not, selectFrom }) =>
        not(
          exists(
            selectFrom("servers")
              .select("servers.id")
              .whereRef("servers.credential_id", "=", "ssh_credentials.id")
              .where("servers.lifecycle_status", "in", ["active", "inactive"]),
          ),
        ),
      );
  }
}

class KyselySshCredentialDeleteVisitor
  implements SshCredentialSelectionSpecVisitor<SshCredentialDeleteQuery>
{
  visitSshCredentialById(
    query: SshCredentialDeleteQuery,
    spec: SshCredentialByIdSpec,
  ): SshCredentialDeleteQuery {
    return query.where("id", "=", spec.id.value);
  }

  visitUnusedSshCredentialById(
    query: SshCredentialDeleteQuery,
    spec: UnusedSshCredentialByIdSpec,
  ): SshCredentialDeleteQuery {
    return query
      .where("id", "=", spec.id.value)
      .where(({ exists, not, selectFrom }) =>
        not(
          exists(
            selectFrom("servers")
              .select("servers.id")
              .whereRef("servers.credential_id", "=", "ssh_credentials.id")
              .where("servers.lifecycle_status", "in", ["active", "inactive"]),
          ),
        ),
      );
  }
}

class KyselySshCredentialMutationVisitor
  implements SshCredentialMutationSpecVisitor<{ values: Insertable<Database["ssh_credentials"]> }>
{
  private valuesFromState(state: UpsertSshCredentialSpec["state"]) {
    return {
      values: {
        id: state.id.value,
        name: state.name.value,
        kind: state.kind.value,
        username: state.username?.value ?? null,
        public_key: state.publicKey?.value ?? null,
        private_key: state.privateKey.value,
        created_at: state.createdAt.value,
        rotated_at: state.rotatedAt?.value ?? null,
      },
    };
  }

  visitUpsertSshCredential(spec: UpsertSshCredentialSpec) {
    return this.valuesFromState(spec.state);
  }

  visitRotateSshCredential(spec: RotateSshCredentialSpec) {
    return this.valuesFromState(spec.state);
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
          [appaloftTraceAttributes.repositoryName]: "ssh_credential",
          [appaloftTraceAttributes.mutationSpecName]: spec.constructor.name,
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
              rotated_at: mutation.values.rotated_at,
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
          [appaloftTraceAttributes.repositoryName]: "ssh_credential",
          [appaloftTraceAttributes.selectionSpecName]: spec.constructor.name,
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

  async updateOne(
    context: RepositoryContext,
    credential: SshCredential,
    spec: SshCredentialMutationSpec,
  ): Promise<boolean> {
    void credential;
    const executor = resolveRepositoryExecutor(this.db, context);
    const mutation = spec.accept(new KyselySshCredentialMutationVisitor());
    return context.tracer.startActiveSpan(
      createRepositorySpanName("ssh_credential", "update_one"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "ssh_credential",
          [appaloftTraceAttributes.mutationSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const updated = await executor
          .updateTable("ssh_credentials")
          .set({
            name: mutation.values.name,
            kind: mutation.values.kind,
            username: mutation.values.username,
            public_key: mutation.values.public_key,
            private_key: mutation.values.private_key,
            rotated_at: mutation.values.rotated_at,
          })
          .where("id", "=", mutation.values.id)
          .returning("id")
          .executeTakeFirst();

        return Boolean(updated);
      },
    );
  }

  async deleteOne(context: RepositoryContext, spec: SshCredentialSelectionSpec): Promise<boolean> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("ssh_credential", "delete_one"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "ssh_credential",
          [appaloftTraceAttributes.selectionSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const deleted = await spec
          .accept(executor.deleteFrom("ssh_credentials"), new KyselySshCredentialDeleteVisitor())
          .returning("id")
          .executeTakeFirst();
        return Boolean(deleted);
      },
    );
  }
}
