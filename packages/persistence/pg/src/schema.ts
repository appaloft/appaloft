import { type ColumnType } from "kysely";

type TimestampColumn = ColumnType<string, string | undefined, never>;
type UpdatableTimestampColumn = ColumnType<string, string, string>;
type NullableUpdatableTimestampColumn = ColumnType<
  string | null,
  string | null | undefined,
  string | null
>;

export interface ProjectsTable {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  lifecycle_status: ColumnType<string, string | undefined, string>;
  archived_at: ColumnType<string | null, string | null | undefined, string | null>;
  archive_reason: ColumnType<string | null, string | null | undefined, string | null>;
  created_at: TimestampColumn;
}

export interface ServersTable {
  id: string;
  name: string;
  host: string;
  port: number;
  provider_key: string;
  lifecycle_status: ColumnType<string, string | undefined, string>;
  deactivated_at: ColumnType<string | null, string | null | undefined, string | null>;
  deactivation_reason: ColumnType<string | null, string | null | undefined, string | null>;
  deleted_at: ColumnType<string | null, string | null | undefined, string | null>;
  edge_proxy_kind: string | null;
  edge_proxy_status: string | null;
  edge_proxy_last_attempt_at: string | null;
  edge_proxy_last_succeeded_at: string | null;
  edge_proxy_last_error_code: string | null;
  edge_proxy_last_error_message: string | null;
  credential_id: string | null;
  credential_kind: string | null;
  credential_username: string | null;
  credential_public_key: string | null;
  credential_private_key: string | null;
  created_at: TimestampColumn;
}

export interface SshCredentialsTable {
  id: string;
  name: string;
  kind: string;
  username: string | null;
  public_key: string | null;
  private_key: string;
  created_at: TimestampColumn;
  rotated_at: NullableUpdatableTimestampColumn;
}

export interface DestinationsTable {
  id: string;
  server_id: string;
  name: string;
  kind: string;
  created_at: TimestampColumn;
}

export interface EnvironmentsTable {
  id: string;
  project_id: string;
  name: string;
  kind: string;
  parent_environment_id: string | null;
  lifecycle_status: ColumnType<string, string | undefined, string>;
  locked_at: ColumnType<string | null, string | null | undefined, string | null>;
  lock_reason: ColumnType<string | null, string | null | undefined, string | null>;
  archived_at: ColumnType<string | null, string | null | undefined, string | null>;
  archive_reason: ColumnType<string | null, string | null | undefined, string | null>;
  created_at: TimestampColumn;
}

export interface ResourcesTable {
  id: string;
  project_id: string;
  environment_id: string;
  destination_id: string | null;
  name: string;
  slug: string;
  kind: string;
  description: string | null;
  services: ColumnType<
    Record<string, unknown>[],
    Record<string, unknown>[],
    Record<string, unknown>[]
  >;
  source_binding: ColumnType<
    Record<string, unknown> | null,
    Record<string, unknown> | null,
    Record<string, unknown> | null
  >;
  runtime_profile: ColumnType<
    Record<string, unknown> | null,
    Record<string, unknown> | null,
    Record<string, unknown> | null
  >;
  network_profile: ColumnType<
    Record<string, unknown> | null,
    Record<string, unknown> | null,
    Record<string, unknown> | null
  >;
  access_profile: ColumnType<
    Record<string, unknown> | null,
    Record<string, unknown> | null,
    Record<string, unknown> | null
  >;
  lifecycle_status: string;
  archived_at: string | null;
  archive_reason: string | null;
  deleted_at: string | null;
  created_at: TimestampColumn;
}

export interface EnvironmentVariablesTable {
  id: string;
  environment_id: string;
  key: string;
  value: string;
  kind: string;
  exposure: string;
  scope: string;
  is_secret: boolean;
  updated_at: TimestampColumn;
}

export interface ResourceVariablesTable {
  id: string;
  resource_id: string;
  key: string;
  value: string;
  kind: string;
  exposure: string;
  scope: string;
  is_secret: boolean;
  updated_at: TimestampColumn;
}

export interface StorageVolumesTable {
  id: string;
  project_id: string;
  environment_id: string;
  name: string;
  slug: string;
  kind: string;
  source_path: string | null;
  description: string | null;
  backup_relationship: ColumnType<
    Record<string, unknown> | null,
    Record<string, unknown> | null,
    Record<string, unknown> | null
  >;
  lifecycle_status: string;
  created_at: TimestampColumn;
  deleted_at: NullableUpdatableTimestampColumn;
}

export interface DependencyResourcesTable {
  id: string;
  project_id: string;
  environment_id: string;
  name: string;
  slug: string;
  kind: string;
  source_mode: string;
  provider_key: string;
  provider_managed: boolean;
  description: string | null;
  endpoint: ColumnType<
    Record<string, unknown> | null,
    Record<string, unknown> | null,
    Record<string, unknown> | null
  >;
  connection_secret_ref: string | null;
  provider_realization: ColumnType<
    Record<string, unknown> | null,
    Record<string, unknown> | null,
    Record<string, unknown> | null
  >;
  backup_relationship: ColumnType<
    Record<string, unknown> | null,
    Record<string, unknown> | null,
    Record<string, unknown> | null
  >;
  binding_readiness: ColumnType<
    Record<string, unknown> | null,
    Record<string, unknown> | null,
    Record<string, unknown> | null
  >;
  lifecycle_status: string;
  created_at: TimestampColumn;
  deleted_at: NullableUpdatableTimestampColumn;
}

export interface DependencyResourceBackupsTable {
  id: string;
  dependency_resource_id: string;
  project_id: string;
  environment_id: string;
  dependency_kind: string;
  provider_key: string;
  status: string;
  attempt_id: string;
  requested_at: TimestampColumn;
  retention_status: string;
  provider_artifact_handle: string | null;
  completed_at: NullableUpdatableTimestampColumn;
  failed_at: NullableUpdatableTimestampColumn;
  failure_code: string | null;
  failure_message: string | null;
  latest_restore_attempt: ColumnType<
    Record<string, unknown> | null,
    Record<string, unknown> | null,
    Record<string, unknown> | null
  >;
  created_at: TimestampColumn;
}

export interface ResourceStorageAttachmentsTable {
  id: string;
  resource_id: string;
  storage_volume_id: string;
  destination_path: string;
  mount_mode: string;
  attached_at: TimestampColumn;
}

export interface ResourceDependencyBindingsTable {
  id: string;
  project_id: string;
  environment_id: string;
  resource_id: string;
  dependency_resource_id: string;
  target_name: string;
  scope: string;
  injection_mode: string;
  secret_ref: string | null;
  secret_version: string | null;
  secret_rotated_at: NullableUpdatableTimestampColumn;
  lifecycle_status: string;
  created_at: TimestampColumn;
  removed_at: NullableUpdatableTimestampColumn;
}

export interface DependencyBindingSecretsTable {
  ref: string;
  binding_id: string;
  resource_id: string;
  secret_version: string;
  payload: ColumnType<JsonRecord, JsonRecord, JsonRecord>;
  metadata: ColumnType<JsonRecord, JsonRecord, JsonRecord>;
  created_at: TimestampColumn;
}

export interface DeploymentsTable {
  id: string;
  project_id: string;
  environment_id: string;
  resource_id: string;
  server_id: string;
  destination_id: string;
  status: string;
  runtime_plan: ColumnType<
    Record<string, unknown>,
    Record<string, unknown>,
    Record<string, unknown>
  >;
  environment_snapshot: ColumnType<
    Record<string, unknown>,
    Record<string, unknown>,
    Record<string, unknown>
  >;
  dependency_binding_references: ColumnType<
    Record<string, unknown>[],
    Record<string, unknown>[] | undefined,
    Record<string, unknown>[]
  >;
  logs: ColumnType<Record<string, unknown>[], Record<string, unknown>[], Record<string, unknown>[]>;
  created_at: TimestampColumn;
  started_at: string | null;
  finished_at: string | null;
  trigger_kind: ColumnType<string, string | undefined, string>;
  source_deployment_id: string | null;
  rollback_candidate_deployment_id: string | null;
  rollback_of_deployment_id: string | null;
  supersedes_deployment_id: string | null;
  superseded_by_deployment_id: string | null;
}

export interface DomainBindingsTable {
  id: string;
  project_id: string;
  environment_id: string;
  resource_id: string;
  server_id: string;
  destination_id: string;
  domain_name: string;
  path_prefix: string;
  proxy_kind: string;
  tls_mode: string;
  redirect_to: string | null;
  redirect_status: number | null;
  certificate_policy: string;
  status: string;
  verification_attempts: ColumnType<
    Record<string, unknown>[],
    Record<string, unknown>[],
    Record<string, unknown>[]
  >;
  dns_observation: ColumnType<
    Record<string, unknown> | null,
    Record<string, unknown> | null,
    Record<string, unknown> | null
  >;
  route_failure: ColumnType<
    Record<string, unknown> | null,
    Record<string, unknown> | null,
    Record<string, unknown> | null
  >;
  idempotency_key: string | null;
  created_at: TimestampColumn;
}

export interface CertificatesTable {
  id: string;
  domain_binding_id: string;
  domain_name: string;
  status: string;
  source: string;
  provider_key: string;
  challenge_type: string;
  issued_at: string | null;
  expires_at: string | null;
  fingerprint: string | null;
  secret_ref: string | null;
  safe_metadata: ColumnType<
    Record<string, unknown>,
    Record<string, unknown>,
    Record<string, unknown>
  >;
  secret_refs: ColumnType<
    Record<string, unknown>,
    Record<string, unknown>,
    Record<string, unknown>
  >;
  attempts: ColumnType<
    Record<string, unknown>[],
    Record<string, unknown>[],
    Record<string, unknown>[]
  >;
  created_at: TimestampColumn;
}

export interface CertificateSecretsTable {
  ref: string;
  certificate_id: string;
  domain_binding_id: string;
  attempt_id: string;
  source: string;
  kind: string;
  payload: ColumnType<Record<string, unknown>, Record<string, unknown>, Record<string, unknown>>;
  metadata: ColumnType<Record<string, unknown>, Record<string, unknown>, Record<string, unknown>>;
  created_at: TimestampColumn;
  updated_at: UpdatableTimestampColumn;
}

export interface AuditLogsTable {
  id: string;
  aggregate_id: string;
  event_type: string;
  payload: ColumnType<Record<string, unknown>, Record<string, unknown>, Record<string, unknown>>;
  created_at: TimestampColumn;
}

export interface ProviderJobLogsTable {
  id: string;
  deployment_id: string;
  provider_key: string;
  payload: ColumnType<Record<string, unknown>, Record<string, unknown>, Record<string, unknown>>;
  created_at: TimestampColumn;
}

export interface SourceLinksTable {
  source_fingerprint: string;
  project_id: string;
  environment_id: string;
  resource_id: string;
  server_id: string | null;
  destination_id: string | null;
  updated_at: UpdatableTimestampColumn;
  reason: string | null;
  metadata: ColumnType<Record<string, unknown>, Record<string, unknown>, Record<string, unknown>>;
}

type JsonRecord = Record<string, unknown>;

export interface DefaultAccessDomainPoliciesTable {
  id: string;
  scope_key: string;
  scope_kind: string;
  server_id: string | null;
  mode: string;
  provider_key: string | null;
  template_ref: string | null;
  last_idempotency_key: string | null;
  updated_at: UpdatableTimestampColumn;
}

export interface ServerAppliedRouteStatesTable {
  route_set_id: string;
  project_id: string;
  environment_id: string;
  resource_id: string;
  server_id: string;
  destination_id: string | null;
  source_fingerprint: string | null;
  domains: ColumnType<JsonRecord[], JsonRecord[], JsonRecord[]>;
  status: string;
  updated_at: UpdatableTimestampColumn;
  last_applied: ColumnType<JsonRecord | null, JsonRecord | null, JsonRecord | null>;
  last_failure: ColumnType<JsonRecord | null, JsonRecord | null, JsonRecord | null>;
  metadata: ColumnType<JsonRecord, JsonRecord, JsonRecord>;
}

export interface MutationCoordinationsTable {
  coordination_scope_kind: string;
  coordination_scope_key: string;
  operation_key: string;
  coordination_mode: string;
  owner_id: string;
  owner_label: string;
  acquired_at: UpdatableTimestampColumn;
  heartbeat_at: UpdatableTimestampColumn;
  lease_expires_at: UpdatableTimestampColumn;
  metadata: ColumnType<JsonRecord, JsonRecord, JsonRecord>;
}

export interface ProcessAttemptJournalTable {
  id: string;
  kind: string;
  status: string;
  operation_key: string;
  dedupe_key: string | null;
  correlation_id: string | null;
  request_id: string | null;
  phase: string | null;
  step: string | null;
  project_id: string | null;
  resource_id: string | null;
  deployment_id: string | null;
  server_id: string | null;
  domain_binding_id: string | null;
  certificate_id: string | null;
  started_at: string | null;
  updated_at: UpdatableTimestampColumn;
  finished_at: string | null;
  error_code: string | null;
  error_category: string | null;
  retriable: boolean | null;
  next_eligible_at: string | null;
  next_actions: ColumnType<string[], string[], string[]>;
  safe_details: ColumnType<JsonRecord, JsonRecord, JsonRecord>;
}

export interface ResourceAccessFailureEvidenceTable {
  request_id: string;
  diagnostic: ColumnType<JsonRecord, JsonRecord, JsonRecord>;
  resource_id: string | null;
  deployment_id: string | null;
  domain_binding_id: string | null;
  server_id: string | null;
  destination_id: string | null;
  route_id: string | null;
  hostname: string | null;
  path: string | null;
  captured_at: UpdatableTimestampColumn;
  expires_at: UpdatableTimestampColumn;
}

export interface ResourceRuntimeControlAttemptsTable {
  id: string;
  resource_id: string;
  deployment_id: string | null;
  server_id: string;
  destination_id: string;
  operation: string;
  status: string;
  runtime_state: string;
  blocked_reason: string | null;
  error_code: string | null;
  phases: ColumnType<JsonRecord[], JsonRecord[] | undefined, JsonRecord[]>;
  reason: string | null;
  idempotency_key: string | null;
  started_at: string;
  completed_at: string | null;
  updated_at: UpdatableTimestampColumn;
}

export interface Database {
  projects: ProjectsTable;
  servers: ServersTable;
  ssh_credentials: SshCredentialsTable;
  destinations: DestinationsTable;
  environments: EnvironmentsTable;
  resources: ResourcesTable;
  environment_variables: EnvironmentVariablesTable;
  resource_variables: ResourceVariablesTable;
  dependency_resources: DependencyResourcesTable;
  dependency_resource_backups: DependencyResourceBackupsTable;
  resource_dependency_bindings: ResourceDependencyBindingsTable;
  dependency_binding_secrets: DependencyBindingSecretsTable;
  storage_volumes: StorageVolumesTable;
  resource_storage_attachments: ResourceStorageAttachmentsTable;
  deployments: DeploymentsTable;
  domain_bindings: DomainBindingsTable;
  certificates: CertificatesTable;
  certificate_secrets: CertificateSecretsTable;
  audit_logs: AuditLogsTable;
  provider_job_logs: ProviderJobLogsTable;
  source_links: SourceLinksTable;
  default_access_domain_policies: DefaultAccessDomainPoliciesTable;
  server_applied_route_states: ServerAppliedRouteStatesTable;
  mutation_coordinations: MutationCoordinationsTable;
  process_attempt_journal: ProcessAttemptJournalTable;
  resource_access_failure_evidence: ResourceAccessFailureEvidenceTable;
  resource_runtime_control_attempts: ResourceRuntimeControlAttemptsTable;
}
