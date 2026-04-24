import { type ColumnType } from "kysely";

type TimestampColumn = ColumnType<string, string | undefined, never>;
type UpdatableTimestampColumn = ColumnType<string, string, string>;

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
  logs: ColumnType<Record<string, unknown>[], Record<string, unknown>[], Record<string, unknown>[]>;
  created_at: TimestampColumn;
  started_at: string | null;
  finished_at: string | null;
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

export interface Database {
  projects: ProjectsTable;
  servers: ServersTable;
  ssh_credentials: SshCredentialsTable;
  destinations: DestinationsTable;
  environments: EnvironmentsTable;
  resources: ResourcesTable;
  environment_variables: EnvironmentVariablesTable;
  resource_variables: ResourceVariablesTable;
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
}
