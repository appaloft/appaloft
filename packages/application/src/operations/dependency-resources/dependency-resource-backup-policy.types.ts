import { type Result } from "@appaloft/core";

import { type RepositoryContext } from "../../execution-context";

export interface DependencyResourceBackupPolicy {
  id: string;
  version: string;
  dependencyResourceId: string;
  retentionDays: number;
  scheduleIntervalHours: number;
  providerKey?: string;
  retryOnFailure?: boolean;
}

export interface DependencyResourceBackupPolicyRecord
  extends Omit<DependencyResourceBackupPolicy, "providerKey" | "retryOnFailure"> {
  providerKey: string | null;
  retryOnFailure: boolean;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string;
  updatedAt: string;
}

export interface DependencyResourceBackupPolicyListFilter {
  dependencyResourceId?: string;
  enabledOnly?: boolean;
  dueAt?: string;
}

export interface DependencyResourceBackupPolicyRepository {
  findOne(
    context: RepositoryContext,
    policyId: string,
  ): Promise<Result<DependencyResourceBackupPolicyRecord | null>>;
  listRecords(
    context: RepositoryContext,
    filter?: DependencyResourceBackupPolicyListFilter,
  ): Promise<Result<DependencyResourceBackupPolicyRecord[]>>;
  upsert(
    context: RepositoryContext,
    record: DependencyResourceBackupPolicyRecord,
  ): Promise<Result<DependencyResourceBackupPolicyRecord>>;
  markRun(
    context: RepositoryContext,
    input: {
      policyId: string;
      lastRunAt: string;
      nextRunAt: string;
      updatedAt: string;
    },
  ): Promise<Result<DependencyResourceBackupPolicyRecord>>;
}

export interface DependencyResourceBackupPolicyRead {
  schemaVersion: "dependency-resource-backup-policies.policy/v1";
  id: string;
  version: string;
  dependencyResourceId: string;
  retentionDays: number;
  scheduleIntervalHours: number;
  providerKey: string | null;
  retryOnFailure: boolean;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string;
  updatedAt: string;
}

export interface ConfigureDependencyResourceBackupPolicyResult {
  id: string;
}

export interface ListDependencyResourceBackupPoliciesResult {
  schemaVersion: "dependency-resource-backup-policies.list/v1";
  items: DependencyResourceBackupPolicyRead[];
}

export interface ShowDependencyResourceBackupPolicyResult {
  schemaVersion: "dependency-resource-backup-policies.show/v1";
  policy: DependencyResourceBackupPolicyRead | null;
}

export interface ScheduledDependencyBackupRunInput {
  policy: DependencyResourceBackupPolicyRecord;
  scheduledAt?: string;
}

export interface ScheduledDependencyBackupRunResult {
  schemaVersion: "dependency-resource-backup-policies.run/v1";
  processAttemptId: string;
  policyId: string;
  dependencyResourceId: string;
  backupId: string;
  nextRunAt: string;
}

export function dependencyResourceBackupPolicyRecordReadback(
  policy: DependencyResourceBackupPolicyRecord,
): DependencyResourceBackupPolicyRead {
  return {
    schemaVersion: "dependency-resource-backup-policies.policy/v1",
    id: policy.id,
    version: policy.version,
    dependencyResourceId: policy.dependencyResourceId,
    retentionDays: policy.retentionDays,
    scheduleIntervalHours: policy.scheduleIntervalHours,
    providerKey: policy.providerKey,
    retryOnFailure: policy.retryOnFailure,
    enabled: policy.enabled,
    lastRunAt: policy.lastRunAt,
    nextRunAt: policy.nextRunAt,
    updatedAt: policy.updatedAt,
  };
}
