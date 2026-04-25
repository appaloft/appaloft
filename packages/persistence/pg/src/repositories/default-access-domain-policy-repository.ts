import {
  type DefaultAccessDomainPolicyByScopeSpec,
  type DefaultAccessDomainPolicyMode,
  type DefaultAccessDomainPolicyRecord,
  type DefaultAccessDomainPolicyRepository,
  type DefaultAccessDomainPolicyScope,
  type DefaultAccessDomainPolicySelectionSpec,
  type DefaultAccessDomainPolicySelectionSpecVisitor,
  type DefaultAccessDomainPolicyUpsertSpec,
  type DefaultAccessDomainPolicyUpsertSpecVisitor,
  type UpsertDefaultAccessDomainPolicySpec,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Insertable, type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database, type DefaultAccessDomainPoliciesTable } from "../schema";

type DefaultAccessDomainPolicyRow = Selectable<DefaultAccessDomainPoliciesTable>;
type DefaultAccessDomainPolicySelectionQuery = SelectQueryBuilder<
  Database,
  "default_access_domain_policies",
  Selectable<Database["default_access_domain_policies"]>
>;
type WhereCapableQuery<TResult> = {
  where(column: string, op: "=", value: unknown): TResult;
};

class KyselyDefaultAccessDomainPolicySelectionVisitor<TResult extends WhereCapableQuery<TResult>>
  implements DefaultAccessDomainPolicySelectionSpecVisitor<TResult>
{
  visitDefaultAccessDomainPolicyByScope(
    query: TResult,
    spec: DefaultAccessDomainPolicyByScopeSpec,
  ): TResult {
    return query.where("scope_key", "=", scopeKey(spec.scope));
  }
}

class KyselyDefaultAccessDomainPolicyUpsertVisitor
  implements
    DefaultAccessDomainPolicyUpsertSpecVisitor<{
      values: Insertable<Database["default_access_domain_policies"]>;
    }>
{
  visitUpsertDefaultAccessDomainPolicy(spec: UpsertDefaultAccessDomainPolicySpec) {
    return {
      values: {
        id: spec.record.id,
        scope_key: scopeKey(spec.record.scope),
        scope_kind: spec.record.scope.kind,
        server_id:
          spec.record.scope.kind === "deployment-target" ? spec.record.scope.serverId : null,
        mode: spec.record.mode,
        provider_key: spec.record.providerKey ?? null,
        template_ref: spec.record.templateRef ?? null,
        last_idempotency_key: spec.record.idempotencyKey ?? null,
        updated_at: spec.record.updatedAt,
      },
    };
  }
}

function persistenceError(message: string, error: unknown) {
  return domainError.infra(message, {
    phase: "policy-persistence",
    adapter: "persistence.pg",
    errorMessage: error instanceof Error ? error.message : String(error),
  });
}

function scopeKey(scope: DefaultAccessDomainPolicyScope): string {
  return scope.kind === "system" ? "system" : `deployment-target:${scope.serverId}`;
}

function validateScope(scope: DefaultAccessDomainPolicyScope): Result<void> {
  if (scope.kind === "deployment-target" && !scope.serverId.trim()) {
    return err(
      domainError.validation("Server id is required for deployment-target scope", {
        phase: "policy-admission",
        field: "scope.serverId",
      }),
    );
  }

  return ok(undefined);
}

function validateRecord(record: DefaultAccessDomainPolicyRecord): Result<void> {
  const scopeResult = validateScope(record.scope);
  if (scopeResult.isErr()) {
    return err(scopeResult.error);
  }

  if (record.mode === "provider" && !record.providerKey?.trim()) {
    return err(
      domainError.validation("Provider key is required for provider mode", {
        phase: "policy-admission",
        field: "providerKey",
      }),
    );
  }

  if (record.mode === "custom-template") {
    if (!record.providerKey?.trim()) {
      return err(
        domainError.validation("Provider key is required for custom-template mode", {
          phase: "policy-admission",
          field: "providerKey",
        }),
      );
    }

    if (!record.templateRef?.trim()) {
      return err(
        domainError.validation("Template ref is required for custom-template mode", {
          phase: "policy-admission",
          field: "templateRef",
        }),
      );
    }
  }

  if (record.mode === "disabled" && (record.providerKey || record.templateRef)) {
    return err(
      domainError.validation("Disabled mode cannot persist provider or template fields", {
        phase: "policy-admission",
      }),
    );
  }

  return ok(undefined);
}

function normalizeTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function modeField(value: string): DefaultAccessDomainPolicyMode {
  if (value === "provider" || value === "custom-template") {
    return value;
  }

  return "disabled";
}

function mapRow(row: DefaultAccessDomainPolicyRow): DefaultAccessDomainPolicyRecord {
  return {
    id: row.id,
    scope:
      row.scope_kind === "deployment-target" && row.server_id
        ? { kind: "deployment-target", serverId: row.server_id }
        : { kind: "system" },
    mode: modeField(row.mode),
    updatedAt: normalizeTimestamp(row.updated_at),
    ...(row.provider_key ? { providerKey: row.provider_key } : {}),
    ...(row.template_ref ? { templateRef: row.template_ref } : {}),
    ...(row.last_idempotency_key ? { idempotencyKey: row.last_idempotency_key } : {}),
  };
}

export class PgDefaultAccessDomainPolicyRepository implements DefaultAccessDomainPolicyRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async findOne(
    spec: DefaultAccessDomainPolicySelectionSpec,
  ): Promise<Result<DefaultAccessDomainPolicyRecord | null>> {
    const validation = spec.accept(ok(undefined), {
      visitDefaultAccessDomainPolicyByScope: (_query, scopeSpec) => validateScope(scopeSpec.scope),
    } satisfies DefaultAccessDomainPolicySelectionSpecVisitor<Result<void>>);
    if (validation.isErr()) {
      return err(validation.error);
    }

    try {
      const row = await spec
        .accept(
          this.db.selectFrom("default_access_domain_policies").selectAll(),
          new KyselyDefaultAccessDomainPolicySelectionVisitor<DefaultAccessDomainPolicySelectionQuery>(),
        )
        .executeTakeFirst();

      return ok(row ? mapRow(row) : null);
    } catch (error) {
      return err(persistenceError("Default access domain policy could not be read", error));
    }
  }

  async list(): Promise<Result<DefaultAccessDomainPolicyRecord[]>> {
    try {
      const rows = await this.db
        .selectFrom("default_access_domain_policies")
        .selectAll()
        .orderBy("scope_kind", "asc")
        .orderBy("server_id", "asc")
        .execute();

      return ok(rows.map(mapRow));
    } catch (error) {
      return err(persistenceError("Default access domain policies could not be listed", error));
    }
  }

  async upsert(
    record: DefaultAccessDomainPolicyRecord,
    spec: DefaultAccessDomainPolicyUpsertSpec,
  ): Promise<Result<DefaultAccessDomainPolicyRecord>> {
    const recordResult = validateRecord(record);
    if (recordResult.isErr()) {
      return err(recordResult.error);
    }

    try {
      const mutation = spec.accept(new KyselyDefaultAccessDomainPolicyUpsertVisitor());
      const persisted = await this.db
        .insertInto("default_access_domain_policies")
        .values(mutation.values)
        .onConflict((conflict) =>
          conflict.column("scope_key").doUpdateSet({
            scope_kind: mutation.values.scope_kind,
            server_id: mutation.values.server_id,
            mode: mutation.values.mode,
            provider_key: mutation.values.provider_key,
            template_ref: mutation.values.template_ref,
            last_idempotency_key: mutation.values.last_idempotency_key,
            updated_at: mutation.values.updated_at,
          }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();

      return ok(mapRow(persisted));
    } catch (error) {
      return err(persistenceError("Default access domain policy could not be persisted", error));
    }
  }
}
