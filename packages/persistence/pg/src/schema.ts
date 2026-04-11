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
  server_id: string;
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
  environments: EnvironmentsTable;
  environment_variables: EnvironmentVariablesTable;
  deployments: DeploymentsTable;
  audit_logs: AuditLogsTable;
  provider_job_logs: ProviderJobLogsTable;
}
