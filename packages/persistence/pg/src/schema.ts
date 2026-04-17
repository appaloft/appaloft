import { type ColumnType } from "kysely";

type TimestampColumn = ColumnType<string, string | undefined, never>;

export interface ProjectsTable {
  id: string;
  name: string;
  slug: string;
  description: string | null;
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
  provider_key: string;
  challenge_type: string;
  issued_at: string | null;
  expires_at: string | null;
  fingerprint: string | null;
  secret_ref: string | null;
  attempts: ColumnType<
    Record<string, unknown>[],
    Record<string, unknown>[],
    Record<string, unknown>[]
  >;
  created_at: TimestampColumn;
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

export interface Database {
  projects: ProjectsTable;
  servers: ServersTable;
  ssh_credentials: SshCredentialsTable;
  destinations: DestinationsTable;
  environments: EnvironmentsTable;
  resources: ResourcesTable;
  environment_variables: EnvironmentVariablesTable;
  deployments: DeploymentsTable;
  domain_bindings: DomainBindingsTable;
  certificates: CertificatesTable;
  audit_logs: AuditLogsTable;
  provider_job_logs: ProviderJobLogsTable;
}
