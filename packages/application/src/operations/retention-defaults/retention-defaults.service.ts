import { type Result } from "@appaloft/core";

import { type RepositoryContext } from "../../execution-context";

export type RetentionDefaultScope = "organization" | "system";

export type RetentionDefaultCategory =
  | "audit-rows"
  | "domain-event-streams"
  | "process-attempts"
  | "provider-job-logs"
  | "resource-runtime-log-archives"
  | "runtime-monitoring-samples";

export interface RetentionDefaultRecord {
  id: string;
  scope: RetentionDefaultScope;
  organizationId?: string;
  category: RetentionDefaultCategory;
  retentionDays: number;
  dryRunSchedulingEnabled: boolean;
  destructiveSchedulingEnabled: boolean;
  enabled: boolean;
  updatedAt: string;
  updatedByActorId?: string;
  updatedByActorKind?: "deploy-token" | "system" | "user";
}

export interface RetentionDefaultListFilter {
  scope?: RetentionDefaultScope;
  organizationId?: string;
  category?: RetentionDefaultCategory;
  enabledOnly?: boolean;
}

export interface RetentionDefaultRepository {
  findOne(
    context: RepositoryContext,
    input: {
      scope?: RetentionDefaultScope;
      organizationId?: string;
      category: RetentionDefaultCategory;
    },
  ): Promise<Result<RetentionDefaultRecord | null>>;
  list(
    context: RepositoryContext,
    filter?: RetentionDefaultListFilter,
  ): Promise<Result<RetentionDefaultRecord[]>>;
  upsert(
    context: RepositoryContext,
    record: RetentionDefaultRecord,
  ): Promise<Result<RetentionDefaultRecord>>;
}

export interface RetentionDefaultRead {
  schemaVersion: "retention-defaults.policy/v1";
  id: string;
  scope: RetentionDefaultScope;
  organizationId?: string;
  category: RetentionDefaultCategory;
  retentionDays: number;
  dryRunSchedulingEnabled: boolean;
  destructiveSchedulingEnabled: boolean;
  enabled: boolean;
  updatedAt: string;
  updatedByActorId?: string;
  updatedByActorKind?: "deploy-token" | "system" | "user";
}

export interface ConfigureRetentionDefaultsResult {
  id: string;
}

export interface ListRetentionDefaultsResult {
  schemaVersion: "retention-defaults.list/v1";
  items: RetentionDefaultRead[];
}

export interface ShowRetentionDefaultResult {
  schemaVersion: "retention-defaults.show/v1";
  policy: RetentionDefaultRead | null;
}

export function retentionDefaultRecordReadback(
  record: RetentionDefaultRecord,
): RetentionDefaultRead {
  return {
    schemaVersion: "retention-defaults.policy/v1",
    id: record.id,
    scope: record.scope,
    ...(record.organizationId ? { organizationId: record.organizationId } : {}),
    category: record.category,
    retentionDays: record.retentionDays,
    dryRunSchedulingEnabled: record.dryRunSchedulingEnabled,
    destructiveSchedulingEnabled: record.destructiveSchedulingEnabled,
    enabled: record.enabled,
    updatedAt: record.updatedAt,
    ...(record.updatedByActorId ? { updatedByActorId: record.updatedByActorId } : {}),
    ...(record.updatedByActorKind ? { updatedByActorKind: record.updatedByActorKind } : {}),
  };
}
