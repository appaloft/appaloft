import {
  appaloftTraceAttributes,
  createRepositorySpanName,
  type DeployTokenListInput,
  type DeployTokenReadModel,
  type DeployTokenRepository,
  type DeployTokenSummary,
  type RepositoryContext,
} from "@appaloft/application";
import {
  type ActiveDeployTokenByVerifierDigestSpec,
  CreatedAt,
  DeploymentTargetId,
  DeployToken,
  type DeployTokenByIdSpec,
  DeployTokenId,
  type DeployTokenMutationSpec,
  type DeployTokenMutationSpecVisitor,
  DeployTokenScope,
  DeployTokenSecretSuffix,
  type DeployTokenSelectionSpec,
  type DeployTokenSelectionSpecVisitor,
  DeployTokenStatusValue,
  DeployTokenVerifierDigest,
  DeployTokenWorkflowCommandValue,
  DisplayNameText,
  EnvironmentId,
  ExpiresAt,
  LastUsedAt,
  type MarkDeployTokenUsedSpec,
  OrganizationId,
  ProjectId,
  ResourceId,
  type RevokeDeployTokenSpec,
  RevokedAt,
  type RotateDeployTokenSpec,
  RotatedAt,
  SourceRepositoryFullName,
  type UpsertDeployTokenSpec,
} from "@appaloft/core";
import {
  type Insertable,
  type Kysely,
  type Selectable,
  type SelectQueryBuilder,
  type Transaction,
} from "kysely";

import { type Database, type DeployTokenScopeJson } from "../schema";
import { resolveRepositoryContextOrganizationId, resolveRepositoryExecutor } from "./shared";

type DeployTokenSelectionQuery = SelectQueryBuilder<
  Database,
  "deploy_tokens",
  Selectable<Database["deploy_tokens"]>
>;
type DeployTokenRow = Selectable<Database["deploy_tokens"]>;
type DeployTokenSafeRow = Omit<DeployTokenRow, "verifier_digest">;

class KyselyDeployTokenSelectionVisitor
  implements DeployTokenSelectionSpecVisitor<DeployTokenSelectionQuery>
{
  visitDeployTokenById(
    query: DeployTokenSelectionQuery,
    spec: DeployTokenByIdSpec,
  ): DeployTokenSelectionQuery {
    return query.where("id", "=", spec.id.value);
  }

  visitActiveDeployTokenByVerifierDigest(
    query: DeployTokenSelectionQuery,
    spec: ActiveDeployTokenByVerifierDigestSpec,
  ): DeployTokenSelectionQuery {
    return query
      .where("verifier_digest", "=", spec.verifierDigest.value)
      .where("status", "=", "active")
      .where((builder) =>
        builder.or([builder("expires_at", "is", null), builder("expires_at", ">", spec.at.value)]),
      );
  }
}

class KyselyDeployTokenMutationVisitor
  implements DeployTokenMutationSpecVisitor<{ values: Insertable<Database["deploy_tokens"]> }>
{
  visitUpsertDeployToken(spec: UpsertDeployTokenSpec) {
    return this.valuesFromState(spec.state);
  }

  visitRotateDeployToken(spec: RotateDeployTokenSpec) {
    return this.valuesFromState(spec.state);
  }

  visitRevokeDeployToken(spec: RevokeDeployTokenSpec) {
    return this.valuesFromState(spec.state);
  }

  visitMarkDeployTokenUsed(spec: MarkDeployTokenUsedSpec) {
    return this.valuesFromState(spec.state);
  }

  private valuesFromState(state: UpsertDeployTokenSpec["state"]) {
    return {
      values: {
        id: state.id.value,
        organization_id: state.organizationId.value,
        display_name: state.displayName.value,
        verifier_digest: state.verifierDigest.value,
        secret_suffix: state.secretSuffix.value,
        status: state.status.value,
        scope: scopeToJson(state.scope),
        created_at: state.createdAt.value,
        expires_at: state.expiresAt?.value ?? null,
        last_used_at: state.lastUsedAt?.value ?? null,
        rotated_at: state.rotatedAt?.value ?? null,
        revoked_at: state.revokedAt?.value ?? null,
      },
    };
  }
}

export class PgDeployTokenRepository implements DeployTokenRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async findOne(
    context: RepositoryContext,
    spec: DeployTokenSelectionSpec,
  ): Promise<DeployToken | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("deploy_token", "find_one"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "deploy_token",
          [appaloftTraceAttributes.selectionSpecName]: spec.constructor.name,
        },
      },
      async () => {
        let query = spec.accept(
          executor.selectFrom("deploy_tokens").selectAll(),
          new KyselyDeployTokenSelectionVisitor(),
        );
        const organizationId = resolveRepositoryContextOrganizationId(context);
        if (organizationId) {
          query = query.where("organization_id", "=", organizationId);
        }

        const row = await query.executeTakeFirst();

        return row ? mapRow(row) : null;
      },
    );
  }

  async upsert(
    context: RepositoryContext,
    deployToken: DeployToken,
    spec: DeployTokenMutationSpec,
  ): Promise<void> {
    void deployToken;
    const executor = resolveRepositoryExecutor(this.db, context);
    const mutation = spec.accept(new KyselyDeployTokenMutationVisitor());
    await context.tracer.startActiveSpan(
      createRepositorySpanName("deploy_token", "upsert"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "deploy_token",
          [appaloftTraceAttributes.mutationSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const organizationId = resolveRepositoryContextOrganizationId(context);
        if (organizationId && mutation.values.organization_id !== organizationId) {
          throw new Error("Deploy token organization does not match repository context");
        }
        if (organizationId) {
          const existing = await executor
            .selectFrom("deploy_tokens")
            .select("organization_id")
            .where("id", "=", mutation.values.id)
            .executeTakeFirst();
          if (existing && existing.organization_id !== organizationId) {
            throw new Error("Deploy token belongs to a different organization");
          }
        }

        await executor
          .insertInto("deploy_tokens")
          .values(mutation.values)
          .onConflict((conflict) =>
            conflict.column("id").doUpdateSet({
              organization_id: mutation.values.organization_id,
              display_name: mutation.values.display_name,
              verifier_digest: mutation.values.verifier_digest,
              secret_suffix: mutation.values.secret_suffix,
              status: mutation.values.status,
              scope: mutation.values.scope,
              expires_at: mutation.values.expires_at,
              last_used_at: mutation.values.last_used_at,
              rotated_at: mutation.values.rotated_at,
              revoked_at: mutation.values.revoked_at,
            }),
          )
          .execute();
      },
    );
  }

  async updateOne(
    context: RepositoryContext,
    deployToken: DeployToken,
    spec: DeployTokenMutationSpec,
  ): Promise<boolean> {
    void deployToken;
    const executor = resolveRepositoryExecutor(this.db, context);
    const mutation = spec.accept(new KyselyDeployTokenMutationVisitor());
    return context.tracer.startActiveSpan(
      createRepositorySpanName("deploy_token", "update_one"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "deploy_token",
          [appaloftTraceAttributes.mutationSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const organizationId = resolveRepositoryContextOrganizationId(context);
        if (organizationId && mutation.values.organization_id !== organizationId) {
          return false;
        }

        let query = executor
          .updateTable("deploy_tokens")
          .set({
            organization_id: mutation.values.organization_id,
            display_name: mutation.values.display_name,
            verifier_digest: mutation.values.verifier_digest,
            secret_suffix: mutation.values.secret_suffix,
            status: mutation.values.status,
            scope: mutation.values.scope,
            expires_at: mutation.values.expires_at,
            last_used_at: mutation.values.last_used_at,
            rotated_at: mutation.values.rotated_at,
            revoked_at: mutation.values.revoked_at,
          })
          .where("id", "=", mutation.values.id);
        if (organizationId) {
          query = query.where("organization_id", "=", organizationId);
        }

        const updated = await query.returning("id").executeTakeFirst();

        return Boolean(updated);
      },
    );
  }
}

export class PgDeployTokenReadModel implements DeployTokenReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async list(
    context: RepositoryContext,
    input: DeployTokenListInput,
  ): Promise<DeployTokenSummary[]> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("deploy_token", "list"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "deploy_token",
        },
      },
      async () => {
        const contextOrganizationId = resolveRepositoryContextOrganizationId(context);
        if (contextOrganizationId && input.organizationId !== contextOrganizationId) {
          return [];
        }

        let query = safeSelect(executor)
          .where("organization_id", "=", input.organizationId)
          .orderBy("created_at", "desc")
          .orderBy("id", "desc")
          .limit(Math.min(input.limit ?? 100, 100));

        if (input.status) {
          query = query.where("status", "=", input.status);
        }

        const rows = await query.execute();
        return rows
          .map(mapSummary)
          .filter((summary) => matchesReadFilter(summary, input))
          .slice(0, input.limit ?? 100);
      },
    );
  }

  async findOne(
    context: RepositoryContext,
    input: {
      organizationId: string;
      tokenId: string;
    },
  ): Promise<DeployTokenSummary | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("deploy_token", "find_one_summary"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "deploy_token",
        },
      },
      async () => {
        const contextOrganizationId = resolveRepositoryContextOrganizationId(context);
        if (contextOrganizationId && input.organizationId !== contextOrganizationId) {
          return null;
        }

        const row = await safeSelect(executor)
          .where("organization_id", "=", input.organizationId)
          .where("id", "=", input.tokenId)
          .executeTakeFirst();

        return row ? mapSummary(row) : null;
      },
    );
  }
}

function mapRow(row: DeployTokenRow): DeployToken {
  return DeployToken.rehydrate({
    id: DeployTokenId.rehydrate(row.id),
    organizationId: OrganizationId.rehydrate(row.organization_id),
    displayName: DisplayNameText.rehydrate(row.display_name),
    verifierDigest: DeployTokenVerifierDigest.rehydrate(row.verifier_digest),
    secretSuffix: DeployTokenSecretSuffix.rehydrate(row.secret_suffix),
    scope: scopeFromJson(row.scope),
    status: DeployTokenStatusValue.create(row.status)._unsafeUnwrap(),
    createdAt: CreatedAt.rehydrate(normalizeTimestamp(row.created_at)),
    ...(row.expires_at
      ? { expiresAt: ExpiresAt.rehydrate(normalizeTimestamp(row.expires_at)) }
      : {}),
    ...(row.last_used_at
      ? { lastUsedAt: LastUsedAt.rehydrate(normalizeTimestamp(row.last_used_at)) }
      : {}),
    ...(row.rotated_at
      ? { rotatedAt: RotatedAt.rehydrate(normalizeTimestamp(row.rotated_at)) }
      : {}),
    ...(row.revoked_at
      ? { revokedAt: RevokedAt.rehydrate(normalizeTimestamp(row.revoked_at)) }
      : {}),
  });
}

function scopeToJson(scope: DeployTokenScope): DeployTokenScopeJson {
  const state = scope.toState();
  return {
    deploymentTargetIds: state.deploymentTargetIds.map((id) => id.value),
    environmentIds: state.environmentIds.map((id) => id.value),
    projectIds: state.projectIds.map((id) => id.value),
    repositoryFullNames: state.repositoryFullNames.map((repository) => repository.value),
    resourceIds: state.resourceIds.map((id) => id.value),
    workflowCommands: state.workflowCommands.map((command) => command.value),
  };
}

function mapSummary(row: DeployTokenSafeRow): DeployTokenSummary {
  return {
    tokenId: row.id,
    organizationId: row.organization_id,
    displayName: row.display_name,
    status: DeployTokenStatusValue.create(row.status)._unsafeUnwrap().value,
    secretSuffix: row.secret_suffix,
    scope: {
      deploymentTargetIds: row.scope.deploymentTargetIds,
      environmentIds: row.scope.environmentIds,
      projectIds: row.scope.projectIds,
      repositoryFullNames: row.scope.repositoryFullNames,
      resourceIds: row.scope.resourceIds,
      workflowCommands: row.scope.workflowCommands.map(
        (command) => DeployTokenWorkflowCommandValue.create(command)._unsafeUnwrap().value,
      ),
    },
    createdAt: normalizeTimestamp(row.created_at),
    ...(row.expires_at ? { expiresAt: normalizeTimestamp(row.expires_at) } : {}),
    ...(row.last_used_at ? { lastUsedAt: normalizeTimestamp(row.last_used_at) } : {}),
    ...(row.rotated_at ? { rotatedAt: normalizeTimestamp(row.rotated_at) } : {}),
    ...(row.revoked_at ? { revokedAt: normalizeTimestamp(row.revoked_at) } : {}),
  };
}

function scopeFromJson(scope: DeployTokenScopeJson): DeployTokenScope {
  return DeployTokenScope.rehydrate({
    deploymentTargetIds: scope.deploymentTargetIds.map(DeploymentTargetId.rehydrate),
    environmentIds: scope.environmentIds.map(EnvironmentId.rehydrate),
    projectIds: scope.projectIds.map(ProjectId.rehydrate),
    repositoryFullNames: scope.repositoryFullNames.map(SourceRepositoryFullName.rehydrate),
    resourceIds: scope.resourceIds.map(ResourceId.rehydrate),
    workflowCommands: scope.workflowCommands.map((command) =>
      DeployTokenWorkflowCommandValue.create(command)._unsafeUnwrap(),
    ),
  });
}

function matchesReadFilter(summary: DeployTokenSummary, input: DeployTokenListInput): boolean {
  if (input.resourceId && !summary.scope.resourceIds.includes(input.resourceId)) {
    return false;
  }

  if (
    input.repositoryFullName &&
    !summary.scope.repositoryFullNames.includes(input.repositoryFullName)
  ) {
    return false;
  }

  return true;
}

function safeSelect(db: Kysely<Database> | Transaction<Database>) {
  return db
    .selectFrom("deploy_tokens")
    .select([
      "id",
      "organization_id",
      "display_name",
      "secret_suffix",
      "status",
      "scope",
      "created_at",
      "expires_at",
      "last_used_at",
      "rotated_at",
      "revoked_at",
    ]);
}

function normalizeTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
