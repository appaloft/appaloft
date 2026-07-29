import {
  type RepositoryBindingRecord,
  type RepositoryBindingRepository,
  type RepositoryContext,
} from "@appaloft/application";
import {
  CreatedAt,
  ok,
  ProjectId,
  ProjectRepositoryBinding,
  ProjectRepositoryBindingId,
  RepositoryIdentity,
  type Result,
  UpdatedAt,
} from "@appaloft/core";
import { type Kysely, type Selectable } from "kysely";

import { type Database } from "../schema";
import { normalizeTimestamp, resolveRepositoryExecutor } from "./shared";

type RepositoryBindingRow = Selectable<Database["project_repository_bindings"]>;

function tenantId(context: RepositoryContext): string {
  return context.tenant?.tenantId ?? "tenant_instance";
}

function rehydrate(row: RepositoryBindingRow): ProjectRepositoryBinding {
  const createdAt = normalizeTimestamp(row.created_at);
  const unboundAt = normalizeTimestamp(row.unbound_at);
  if (!createdAt) throw new Error("Repository Binding created_at is missing");
  return ProjectRepositoryBinding.rehydrate({
    id: ProjectRepositoryBindingId.rehydrate(row.id),
    repositoryIdentity: RepositoryIdentity.rehydrate(row.repository_identity),
    projectId: ProjectId.rehydrate(row.project_id),
    status: row.status as "active" | "unbound",
    createdAt: CreatedAt.rehydrate(createdAt),
    ...(unboundAt ? { unboundAt: UpdatedAt.rehydrate(unboundAt) } : {}),
  });
}

export class PgRepositoryBindingRepository implements RepositoryBindingRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async findByIdentity(
    context: RepositoryContext,
    repositoryIdentity: string,
  ): Promise<RepositoryBindingRecord | null> {
    const row = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("project_repository_bindings")
      .selectAll()
      .where("tenant_id", "=", tenantId(context))
      .where("repository_identity", "=", repositoryIdentity)
      .executeTakeFirst();
    return row ? { binding: rehydrate(row) } : null;
  }

  async save(context: RepositoryContext, binding: ProjectRepositoryBinding): Promise<Result<void>> {
    const state = binding.toState();
    await resolveRepositoryExecutor(this.db, context)
      .insertInto("project_repository_bindings")
      .values({
        tenant_id: tenantId(context),
        id: state.id.value,
        repository_identity: state.repositoryIdentity.value,
        project_id: state.projectId.value,
        status: state.status,
        created_at: state.createdAt.value,
        unbound_at: state.unboundAt?.value ?? null,
      })
      .onConflict((conflict) =>
        conflict.columns(["tenant_id", "repository_identity"]).doUpdateSet({
          id: state.id.value,
          project_id: state.projectId.value,
          status: state.status,
          unbound_at: state.unboundAt?.value ?? null,
        }),
      )
      .execute();
    return ok(undefined);
  }
}
