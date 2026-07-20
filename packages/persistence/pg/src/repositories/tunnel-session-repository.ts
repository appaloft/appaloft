import {
  type RepositoryContext,
  type TunnelSessionRecord,
  type TunnelSessionRepository,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Kysely, type Selectable } from "kysely";

import { type Database } from "../schema";
import { resolveRepositoryContextOrganizationId, resolveRepositoryExecutor } from "./shared";

type Row = Selectable<Database["tunnel_sessions"]>;

function timestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toRecord(row: Row): TunnelSessionRecord {
  return {
    id: row.id,
    providerKey: row.provider_key as TunnelSessionRecord["providerKey"],
    originUrl: row.origin_url,
    publicUrl: row.public_url,
    status: row.status as TunnelSessionRecord["status"],
    expiresAt: timestamp(row.expires_at),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    revokedAt: row.revoked_at ? timestamp(row.revoked_at) : null,
    failureCode: row.failure_code,
    providerHandle: row.provider_handle as TunnelSessionRecord["providerHandle"],
  };
}

export class PgTunnelSessionRepository implements TunnelSessionRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async findOne(
    context: RepositoryContext,
    sessionId: string,
  ): Promise<Result<TunnelSessionRecord | null>> {
    try {
      const executor = resolveRepositoryExecutor(this.db, context);
      let query = executor.selectFrom("tunnel_sessions").selectAll().where("id", "=", sessionId);
      const organizationId = resolveRepositoryContextOrganizationId(context);
      if (organizationId) query = query.where("organization_id", "=", organizationId);
      const row = await query.executeTakeFirst();
      return ok(row ? toRecord(row) : null);
    } catch (error) {
      return err(
        domainError.infra("Tunnel session could not be read", {
          phase: "tunnel-session-read",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }

  async listRecords(
    context: RepositoryContext,
    filter: Parameters<TunnelSessionRepository["listRecords"]>[1] = {},
  ): Promise<Result<TunnelSessionRecord[]>> {
    try {
      const executor = resolveRepositoryExecutor(this.db, context);
      let query = executor.selectFrom("tunnel_sessions").selectAll();
      const organizationId = resolveRepositoryContextOrganizationId(context);
      if (organizationId) query = query.where("organization_id", "=", organizationId);
      if (filter?.statuses?.length) query = query.where("status", "in", filter.statuses);
      if (filter?.expiresAtOrBefore)
        query = query.where("expires_at", "<=", filter.expiresAtOrBefore);
      if (filter?.limit) query = query.limit(filter.limit);
      return ok((await query.orderBy("created_at", "desc").execute()).map(toRecord));
    } catch (error) {
      return err(
        domainError.infra("Tunnel sessions could not be listed", {
          phase: "tunnel-session-list",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }

  async save(
    context: RepositoryContext,
    record: TunnelSessionRecord,
  ): Promise<Result<TunnelSessionRecord>> {
    try {
      const executor = resolveRepositoryExecutor(this.db, context);
      const organizationId = resolveRepositoryContextOrganizationId(context);
      const values = {
        id: record.id,
        organization_id: organizationId ?? null,
        provider_key: record.providerKey,
        origin_url: record.originUrl,
        public_url: record.publicUrl,
        status: record.status,
        expires_at: record.expiresAt,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
        revoked_at: record.revokedAt,
        failure_code: record.failureCode,
        provider_handle: record.providerHandle as unknown as Record<string, unknown> | null,
      };
      await executor
        .insertInto("tunnel_sessions")
        .values(values)
        .onConflict((conflict) =>
          conflict.column("id").doUpdateSet({
            provider_key: values.provider_key,
            origin_url: values.origin_url,
            public_url: values.public_url,
            status: values.status,
            updated_at: values.updated_at,
            revoked_at: values.revoked_at,
            failure_code: values.failure_code,
            provider_handle: values.provider_handle,
          }),
        )
        .execute();
      return ok(record);
    } catch (error) {
      return err(
        domainError.infra("Tunnel session could not be persisted", {
          phase: "tunnel-session-write",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }
}
