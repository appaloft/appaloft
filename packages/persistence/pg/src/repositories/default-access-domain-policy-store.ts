import {
  type DefaultAccessDomainPolicyMode,
  type DefaultAccessDomainPolicyRecord,
  type DefaultAccessDomainPolicyScope,
  type DefaultAccessDomainPolicyStore,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Kysely, type Selectable } from "kysely";

import { type Database, type DefaultAccessDomainPoliciesTable } from "../schema";

type DefaultAccessDomainPolicyRow = Selectable<DefaultAccessDomainPoliciesTable>;

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

export class PgDefaultAccessDomainPolicyStore implements DefaultAccessDomainPolicyStore {
  constructor(private readonly db: Kysely<Database>) {}

  async read(
    scope: DefaultAccessDomainPolicyScope,
  ): Promise<Result<DefaultAccessDomainPolicyRecord | null>> {
    const scopeResult = validateScope(scope);
    if (scopeResult.isErr()) {
      return err(scopeResult.error);
    }

    try {
      const row = await this.db
        .selectFrom("default_access_domain_policies")
        .selectAll()
        .where("scope_key", "=", scopeKey(scope))
        .executeTakeFirst();

      return ok(row ? mapRow(row) : null);
    } catch (error) {
      return err(persistenceError("Default access domain policy could not be read", error));
    }
  }

  async upsert(
    record: DefaultAccessDomainPolicyRecord,
  ): Promise<Result<DefaultAccessDomainPolicyRecord>> {
    const recordResult = validateRecord(record);
    if (recordResult.isErr()) {
      return err(recordResult.error);
    }

    try {
      const persisted = await this.db
        .insertInto("default_access_domain_policies")
        .values({
          id: record.id,
          scope_key: scopeKey(record.scope),
          scope_kind: record.scope.kind,
          server_id: record.scope.kind === "deployment-target" ? record.scope.serverId : null,
          mode: record.mode,
          provider_key: record.providerKey ?? null,
          template_ref: record.templateRef ?? null,
          last_idempotency_key: record.idempotencyKey ?? null,
          updated_at: record.updatedAt,
        })
        .onConflict((conflict) =>
          conflict.column("scope_key").doUpdateSet({
            scope_kind: record.scope.kind,
            server_id: record.scope.kind === "deployment-target" ? record.scope.serverId : null,
            mode: record.mode,
            provider_key: record.providerKey ?? null,
            template_ref: record.templateRef ?? null,
            last_idempotency_key: record.idempotencyKey ?? null,
            updated_at: record.updatedAt,
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
