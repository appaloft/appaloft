import { type RepositoryContext } from "@yundu/application";
import {
  AccessRoute,
  BuildStrategyKindValue,
  CertificatePolicyValue,
  CommandText,
  ConfigKey,
  ConfigScopeValue,
  ConfigValueText,
  CreatedAt,
  DeploymentId,
  DeploymentLogEntry,
  type DeploymentLogEntry as DeploymentLogEntryType,
  DeploymentLogSourceValue,
  DeploymentPhaseValue,
  DeploymentStatusValue,
  DeploymentTargetCredentialKindValue,
  DeploymentTargetDescriptor,
  DeploymentTargetId,
  DeploymentTargetName,
  DeploymentTargetUsername,
  DescriptionText,
  DestinationId,
  DestinationKindValue,
  DestinationName,
  DetectSummary,
  DisplayNameText,
  DomainBindingId,
  DomainBindingStatusValue,
  DomainVerificationAttemptId,
  type DomainVerificationAttemptState,
  DomainVerificationAttemptStatusValue,
  DomainVerificationMethodValue,
  EdgeProxyKindValue,
  EdgeProxyStatusValue,
  EnvironmentConfigSet,
  EnvironmentConfigSnapshot,
  EnvironmentConfigSnapshotEntry,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  type EnvironmentConfigSnapshot as EnvironmentSnapshot,
  EnvironmentSnapshotId,
  ErrorCodeText,
  ExecutionStrategyKindValue,
  FilePathText,
  FinishedAt,
  GeneratedAt,
  HealthCheckPathText,
  HostAddress,
  IdempotencyKeyValue,
  ImageReference,
  LogLevelValue,
  MessageText,
  OccurredAt,
  PackagingModeValue,
  PlanStepText,
  PortNumber,
  ProjectId,
  ProjectName,
  ProjectSlug,
  ProviderKey,
  PublicDomainName,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  ResourceServiceKindValue,
  ResourceServiceName,
  ResourceSlug,
  RoutePathPrefix,
  RuntimeExecutionPlan,
  RuntimePlan,
  RuntimePlanId,
  RuntimePlanStrategyValue,
  type RuntimePlan as RuntimePlanType,
  RuntimeVerificationStep,
  RuntimeVerificationStepKindValue,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
  SshCredentialId,
  SshCredentialName,
  SshPrivateKeyText,
  SshPublicKeyText,
  StartedAt,
  TargetKindValue,
  TlsModeValue,
  UpdatedAt,
  VariableExposureValue,
  VariableKindValue,
} from "@yundu/core";
import { type Kysely, type Selectable, type Transaction } from "kysely";

import { type Database } from "../schema";

export type EnvironmentVariableRow = Selectable<Database["environment_variables"]>;
type SourceKindInput = Parameters<typeof SourceKindValue.rehydrate>[0];
type BuildStrategyInput = Parameters<typeof BuildStrategyKindValue.rehydrate>[0];
type PackagingModeInput = Parameters<typeof PackagingModeValue.rehydrate>[0];
type ExecutionStrategyInput = Parameters<typeof ExecutionStrategyKindValue.rehydrate>[0];
type TargetKindInput = Parameters<typeof TargetKindValue.rehydrate>[0];
type EdgeProxyKindInput = Parameters<typeof EdgeProxyKindValue.rehydrate>[0];
type EdgeProxyStatusInput = Parameters<typeof EdgeProxyStatusValue.rehydrate>[0];
type TlsModeInput = Parameters<typeof TlsModeValue.rehydrate>[0];
type ConfigScopeInput = Parameters<typeof ConfigScopeValue.rehydrate>[0];
type VariableKindInput = Parameters<typeof VariableKindValue.rehydrate>[0];
type VariableExposureInput = Parameters<typeof VariableExposureValue.rehydrate>[0];
type EnvironmentKindInput = Parameters<typeof EnvironmentKindValue.rehydrate>[0];
type DeploymentStatusInput = Parameters<typeof DeploymentStatusValue.rehydrate>[0];
type DestinationKindInput = Parameters<typeof DestinationKindValue.rehydrate>[0];
type DeploymentPhaseInput = Parameters<typeof DeploymentPhaseValue.rehydrate>[0];
type LogLevelInput = Parameters<typeof LogLevelValue.rehydrate>[0];
type ResourceKindInput = Parameters<typeof ResourceKindValue.rehydrate>[0];
type ResourceServiceKindInput = Parameters<typeof ResourceServiceKindValue.rehydrate>[0];
type RuntimePlanStrategyInput = Parameters<typeof RuntimePlanStrategyValue.rehydrate>[0];
type DeploymentTargetCredentialKindInput = Parameters<
  typeof DeploymentTargetCredentialKindValue.rehydrate
>[0];
type DomainBindingStatusInput = Parameters<typeof DomainBindingStatusValue.rehydrate>[0];
type DomainVerificationMethodInput = Parameters<typeof DomainVerificationMethodValue.rehydrate>[0];
type DomainVerificationAttemptStatusInput = Parameters<
  typeof DomainVerificationAttemptStatusValue.rehydrate
>[0];
type CertificatePolicyInput = Parameters<typeof CertificatePolicyValue.rehydrate>[0];

export interface SerializedSourceDescriptor extends Record<string, unknown> {
  kind: SourceKindInput;
  locator: string;
  displayName: string;
  metadata?: Record<string, string>;
}

export interface SerializedRuntimeExecutionPlan extends Record<string, unknown> {
  kind: ExecutionStrategyInput;
  workingDirectory?: string;
  installCommand?: string;
  buildCommand?: string;
  startCommand?: string;
  healthCheckPath?: string;
  port?: number;
  image?: string;
  dockerfilePath?: string;
  composeFile?: string;
  accessRoutes?: Array<{
    proxyKind: EdgeProxyKindInput;
    domains: string[];
    pathPrefix: string;
    tlsMode: TlsModeInput;
    targetPort?: number;
  }>;
  verificationSteps?: Array<{
    kind: "internal-http" | "public-http";
    label: string;
  }>;
  metadata?: Record<string, string>;
}

export interface SerializedDeploymentTargetDescriptor extends Record<string, unknown> {
  kind: TargetKindInput;
  providerKey: string;
  serverIds: string[];
  metadata?: Record<string, string>;
}

export interface SerializedRuntimePlan extends Record<string, unknown> {
  id: string;
  source: SerializedSourceDescriptor;
  buildStrategy: BuildStrategyInput;
  packagingMode: PackagingModeInput;
  execution: SerializedRuntimeExecutionPlan;
  target: SerializedDeploymentTargetDescriptor;
  detectSummary: string;
  steps: string[];
  generatedAt: string;
}

export interface SerializedEnvironmentSnapshotVariable extends Record<string, unknown> {
  key: string;
  value: string;
  kind: VariableKindInput;
  exposure: VariableExposureInput;
  scope: ConfigScopeInput;
  isSecret: boolean;
}

export interface SerializedEnvironmentSnapshot extends Record<string, unknown> {
  id: string;
  environmentId: string;
  createdAt: string;
  precedence: ConfigScopeInput[];
  variables: SerializedEnvironmentSnapshotVariable[];
}

export interface SerializedDeploymentLog extends Record<string, unknown> {
  timestamp: string;
  source?: "yundu" | "application";
  phase: DeploymentPhaseInput;
  level: LogLevelInput;
  message: string;
}

export interface SerializedResourceService extends Record<string, unknown> {
  name: string;
  kind: ResourceServiceKindInput;
}

export interface SerializedResourceSourceBinding extends Record<string, unknown> {
  kind: SourceKindInput;
  locator: string;
  displayName: string;
  metadata?: Record<string, string>;
}

export interface SerializedResourceRuntimeProfile extends Record<string, unknown> {
  strategy: RuntimePlanStrategyInput;
  installCommand?: string;
  buildCommand?: string;
  startCommand?: string;
  port?: number;
  healthCheckPath?: string;
}

export interface SerializedDomainVerificationAttempt extends Record<string, unknown> {
  id: string;
  method: DomainVerificationMethodInput;
  status: DomainVerificationAttemptStatusInput;
  expectedTarget: string;
  createdAt: string;
}

export type RepositoryExecutor = Kysely<Database> | Transaction<Database>;

function isRepositoryExecutor(value: unknown): value is RepositoryExecutor {
  return Boolean(
    value &&
      typeof value === "object" &&
      "selectFrom" in value &&
      typeof value.selectFrom === "function",
  );
}

export function resolveRepositoryExecutor(
  db: Kysely<Database>,
  context: RepositoryContext,
): RepositoryExecutor {
  return isRepositoryExecutor(context.transaction) ? context.transaction : db;
}

export async function withRepositoryTransaction<T>(
  db: Kysely<Database>,
  context: RepositoryContext,
  callback: (executor: RepositoryExecutor) => Promise<T>,
): Promise<T> {
  if (isRepositoryExecutor(context.transaction)) {
    return callback(context.transaction);
  }

  return db.transaction().execute(async (transaction) => callback(transaction));
}

export function normalizeTimestamp(value: string | Date | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

export function serializeRuntimePlan(plan: RuntimePlanType): SerializedRuntimePlan {
  return {
    id: plan.id,
    source: {
      kind: plan.source.kind,
      locator: plan.source.locator,
      displayName: plan.source.displayName,
      ...(plan.source.metadata ? { metadata: plan.source.metadata } : {}),
    },
    buildStrategy: plan.buildStrategy,
    packagingMode: plan.packagingMode,
    execution: {
      kind: plan.execution.kind,
      ...(plan.execution.workingDirectory
        ? { workingDirectory: plan.execution.workingDirectory }
        : {}),
      ...(plan.execution.installCommand ? { installCommand: plan.execution.installCommand } : {}),
      ...(plan.execution.buildCommand ? { buildCommand: plan.execution.buildCommand } : {}),
      ...(plan.execution.startCommand ? { startCommand: plan.execution.startCommand } : {}),
      ...(plan.execution.healthCheckPath
        ? { healthCheckPath: plan.execution.healthCheckPath }
        : {}),
      ...(typeof plan.execution.port === "number" ? { port: plan.execution.port } : {}),
      ...(plan.execution.image ? { image: plan.execution.image } : {}),
      ...(plan.execution.dockerfilePath ? { dockerfilePath: plan.execution.dockerfilePath } : {}),
      ...(plan.execution.composeFile ? { composeFile: plan.execution.composeFile } : {}),
      ...(plan.execution.accessRoutes.length > 0
        ? {
            accessRoutes: plan.execution.accessRoutes.map((route) => ({
              proxyKind: route.proxyKind,
              domains: route.domains,
              pathPrefix: route.pathPrefix,
              tlsMode: route.tlsMode,
              ...(typeof route.targetPort === "number" ? { targetPort: route.targetPort } : {}),
            })),
          }
        : {}),
      ...(plan.execution.verificationSteps.length > 0
        ? {
            verificationSteps: plan.execution.verificationSteps.map((step) => ({
              kind: step.kind,
              label: step.label,
            })),
          }
        : {}),
      ...(plan.execution.metadata ? { metadata: plan.execution.metadata } : {}),
    },
    target: {
      kind: plan.target.kind,
      providerKey: plan.target.providerKey,
      serverIds: plan.target.serverIds,
      ...(plan.target.metadata ? { metadata: plan.target.metadata } : {}),
    },
    detectSummary: plan.detectSummary,
    steps: plan.steps,
    generatedAt: plan.generatedAt,
  };
}

export function rehydrateRuntimePlan(raw: unknown): RuntimePlan {
  const record = raw as SerializedRuntimePlan;
  const source = record.source;
  const execution = record.execution;
  const target = record.target;

  return RuntimePlan.rehydrate({
    id: RuntimePlanId.rehydrate(record.id),
    source: SourceDescriptor.rehydrate({
      kind: SourceKindValue.rehydrate(source.kind),
      locator: SourceLocator.rehydrate(source.locator),
      displayName: DisplayNameText.rehydrate(source.displayName),
      ...(source.metadata ? { metadata: source.metadata } : {}),
    }),
    buildStrategy: BuildStrategyKindValue.rehydrate(record.buildStrategy),
    packagingMode: PackagingModeValue.rehydrate(record.packagingMode),
    execution: RuntimeExecutionPlan.rehydrate({
      kind: ExecutionStrategyKindValue.rehydrate(execution.kind),
      ...(execution.workingDirectory
        ? { workingDirectory: FilePathText.rehydrate(execution.workingDirectory) }
        : {}),
      ...(execution.installCommand
        ? { installCommand: CommandText.rehydrate(execution.installCommand) }
        : {}),
      ...(execution.buildCommand
        ? { buildCommand: CommandText.rehydrate(execution.buildCommand) }
        : {}),
      ...(execution.startCommand
        ? { startCommand: CommandText.rehydrate(execution.startCommand) }
        : {}),
      ...(execution.healthCheckPath
        ? { healthCheckPath: HealthCheckPathText.rehydrate(execution.healthCheckPath) }
        : {}),
      ...(typeof execution.port === "number" ? { port: PortNumber.rehydrate(execution.port) } : {}),
      ...(execution.image ? { image: ImageReference.rehydrate(execution.image) } : {}),
      ...(execution.dockerfilePath
        ? { dockerfilePath: FilePathText.rehydrate(execution.dockerfilePath) }
        : {}),
      ...(execution.composeFile
        ? { composeFile: FilePathText.rehydrate(execution.composeFile) }
        : {}),
      ...(execution.accessRoutes
        ? {
            accessRoutes: execution.accessRoutes.map((route) =>
              AccessRoute.rehydrate({
                proxyKind: EdgeProxyKindValue.rehydrate(route.proxyKind),
                domains: route.domains.map((domain) => PublicDomainName.rehydrate(domain)),
                pathPrefix: RoutePathPrefix.rehydrate(route.pathPrefix),
                tlsMode: TlsModeValue.rehydrate(route.tlsMode),
                ...(typeof route.targetPort === "number"
                  ? { targetPort: PortNumber.rehydrate(route.targetPort) }
                  : {}),
              }),
            ),
          }
        : {}),
      ...(execution.verificationSteps
        ? {
            verificationSteps: execution.verificationSteps.map((step) =>
              RuntimeVerificationStep.rehydrate({
                kind: RuntimeVerificationStepKindValue.rehydrate(step.kind),
                label: PlanStepText.rehydrate(step.label),
              }),
            ),
          }
        : {}),
      ...(execution.metadata ? { metadata: execution.metadata } : {}),
    }),
    target: DeploymentTargetDescriptor.rehydrate({
      kind: TargetKindValue.rehydrate(target.kind),
      providerKey: ProviderKey.rehydrate(target.providerKey),
      serverIds: target.serverIds.map((id) => DeploymentTargetId.rehydrate(id)),
      ...(target.metadata ? { metadata: target.metadata } : {}),
    }),
    detectSummary: DetectSummary.rehydrate(record.detectSummary),
    steps: record.steps.map((step) => PlanStepText.rehydrate(step)),
    generatedAt: GeneratedAt.rehydrate(record.generatedAt),
  });
}

export function serializeEnvironmentSnapshot(
  snapshot: EnvironmentSnapshot,
): SerializedEnvironmentSnapshot {
  const state = snapshot.toState();
  return {
    id: state.id.value,
    environmentId: state.environmentId.value,
    createdAt: state.createdAt.value,
    precedence: state.precedence.map((scope) => scope.value),
    variables: state.variables.map((variable) => ({
      key: variable.key.value,
      value: variable.value.value,
      kind: variable.kind.value,
      exposure: variable.exposure.value,
      scope: variable.scope.value,
      isSecret: variable.isSecret,
    })),
  };
}

export function rehydrateEnvironmentSnapshot(raw: unknown): EnvironmentConfigSnapshot {
  const record = raw as SerializedEnvironmentSnapshot;
  return EnvironmentConfigSnapshot.rehydrate({
    id: EnvironmentSnapshotId.rehydrate(record.id),
    environmentId: EnvironmentId.rehydrate(record.environmentId),
    createdAt: GeneratedAt.rehydrate(record.createdAt),
    precedence: record.precedence.map((scope) => ConfigScopeValue.rehydrate(scope)),
    variables: record.variables.map((variable) =>
      EnvironmentConfigSnapshotEntry.rehydrate({
        key: ConfigKey.rehydrate(variable.key),
        value: ConfigValueText.rehydrate(variable.value),
        kind: VariableKindValue.rehydrate(variable.kind),
        exposure: VariableExposureValue.rehydrate(variable.exposure),
        scope: ConfigScopeValue.rehydrate(variable.scope),
        isSecret: variable.isSecret,
      }).toState(),
    ),
  });
}

export function serializeDeploymentLogs(logs: DeploymentLogEntryType[]): SerializedDeploymentLog[] {
  return logs.map((log) => {
    const state = log.toState();
    return {
      timestamp: state.timestamp.value,
      source: state.source.value,
      phase: state.phase.value,
      level: state.level.value,
      message: state.message.value,
    };
  });
}

export function rehydrateDeploymentLogs(raw: unknown): DeploymentLogEntry[] {
  return ((raw as SerializedDeploymentLog[] | null | undefined) ?? []).map((entry) =>
    DeploymentLogEntry.rehydrate({
      timestamp: OccurredAt.rehydrate(entry.timestamp),
      source: DeploymentLogSourceValue.rehydrate(entry.source ?? "yundu"),
      phase: DeploymentPhaseValue.rehydrate(entry.phase as DeploymentPhaseInput),
      level: LogLevelValue.rehydrate(entry.level as LogLevelInput),
      message: MessageText.rehydrate(entry.message),
    }),
  );
}

export function serializeEnvironmentVariables(
  set: EnvironmentConfigSet,
): InsertableEnvironmentVariable[] {
  return set.map((variable, index) => ({
    id: "",
    environment_id: "",
    key: variable.key,
    value: variable.value,
    kind: variable.kind,
    exposure: variable.exposure,
    scope: variable.scope,
    is_secret: variable.isSecret,
    updated_at: variable.updatedAt,
    index,
  }));
}

export interface InsertableEnvironmentVariable {
  id: string;
  environment_id: string;
  key: string;
  value: string;
  kind: string;
  exposure: string;
  scope: string;
  is_secret: boolean;
  updated_at: string;
  index: number;
}

export function rehydrateEnvironmentConfigSet(
  rows: EnvironmentVariableRow[],
): EnvironmentConfigSet {
  return EnvironmentConfigSet.rehydrate(
    rows.map((variable) => ({
      key: ConfigKey.rehydrate(variable.key),
      value: ConfigValueText.rehydrate(variable.value),
      kind: VariableKindValue.rehydrate(variable.kind as VariableKindInput),
      exposure: VariableExposureValue.rehydrate(variable.exposure as VariableExposureInput),
      scope: ConfigScopeValue.rehydrate(variable.scope as ConfigScopeInput),
      isSecret: variable.is_secret,
      updatedAt: UpdatedAt.rehydrate(
        normalizeTimestamp(variable.updated_at) ?? variable.updated_at,
      ),
    })),
  );
}

export function rehydrateProject(row: Selectable<Database["projects"]>) {
  return {
    id: ProjectId.rehydrate(row.id),
    name: ProjectName.rehydrate(row.name),
    slug: ProjectSlug.rehydrate(row.slug),
    createdAt: CreatedAt.rehydrate(normalizeTimestamp(row.created_at) ?? row.created_at),
    ...(row.description ? { description: DescriptionText.rehydrate(row.description) } : {}),
  };
}

export function rehydrateDeploymentTarget(row: Selectable<Database["servers"]>) {
  return {
    id: DeploymentTargetId.rehydrate(row.id),
    name: DeploymentTargetName.rehydrate(row.name),
    host: HostAddress.rehydrate(row.host),
    port: PortNumber.rehydrate(row.port),
    providerKey: ProviderKey.rehydrate(row.provider_key),
    targetKind: TargetKindValue.rehydrate("single-server"),
    ...(row.credential_kind
      ? {
          credential: {
            kind: DeploymentTargetCredentialKindValue.rehydrate(
              row.credential_kind as DeploymentTargetCredentialKindInput,
            ),
            ...(row.credential_id
              ? { credentialId: SshCredentialId.rehydrate(row.credential_id) }
              : {}),
            ...(row.credential_username
              ? { username: DeploymentTargetUsername.rehydrate(row.credential_username) }
              : {}),
            ...(row.credential_public_key
              ? { publicKey: SshPublicKeyText.rehydrate(row.credential_public_key) }
              : {}),
            ...(row.credential_private_key
              ? { privateKey: SshPrivateKeyText.rehydrate(row.credential_private_key) }
              : {}),
          },
        }
      : {}),
    ...(row.edge_proxy_kind && row.edge_proxy_status
      ? {
          edgeProxy: {
            kind: EdgeProxyKindValue.rehydrate(row.edge_proxy_kind as EdgeProxyKindInput),
            status: EdgeProxyStatusValue.rehydrate(row.edge_proxy_status as EdgeProxyStatusInput),
            ...(row.edge_proxy_last_attempt_at
              ? {
                  lastAttemptAt: UpdatedAt.rehydrate(
                    normalizeTimestamp(row.edge_proxy_last_attempt_at) ??
                      row.edge_proxy_last_attempt_at,
                  ),
                }
              : {}),
            ...(row.edge_proxy_last_succeeded_at
              ? {
                  lastSucceededAt: UpdatedAt.rehydrate(
                    normalizeTimestamp(row.edge_proxy_last_succeeded_at) ??
                      row.edge_proxy_last_succeeded_at,
                  ),
                }
              : {}),
            ...(row.edge_proxy_last_error_code
              ? { lastErrorCode: ErrorCodeText.rehydrate(row.edge_proxy_last_error_code) }
              : {}),
            ...(row.edge_proxy_last_error_message
              ? { lastErrorMessage: MessageText.rehydrate(row.edge_proxy_last_error_message) }
              : {}),
          },
        }
      : {}),
    createdAt: CreatedAt.rehydrate(normalizeTimestamp(row.created_at) ?? row.created_at),
  };
}

export function rehydrateSshCredential(row: Selectable<Database["ssh_credentials"]>) {
  return {
    id: SshCredentialId.rehydrate(row.id),
    name: SshCredentialName.rehydrate(row.name),
    kind: DeploymentTargetCredentialKindValue.rehydrate(
      row.kind as DeploymentTargetCredentialKindInput,
    ),
    ...(row.username ? { username: DeploymentTargetUsername.rehydrate(row.username) } : {}),
    ...(row.public_key ? { publicKey: SshPublicKeyText.rehydrate(row.public_key) } : {}),
    privateKey: SshPrivateKeyText.rehydrate(row.private_key),
    createdAt: CreatedAt.rehydrate(normalizeTimestamp(row.created_at) ?? row.created_at),
  };
}

export function rehydrateDestination(row: Selectable<Database["destinations"]>) {
  return {
    id: DestinationId.rehydrate(row.id),
    serverId: DeploymentTargetId.rehydrate(row.server_id),
    name: DestinationName.rehydrate(row.name),
    kind: DestinationKindValue.rehydrate(row.kind as DestinationKindInput),
    createdAt: CreatedAt.rehydrate(normalizeTimestamp(row.created_at) ?? row.created_at),
  };
}

export function rehydrateEnvironmentRow(
  environmentRow: Selectable<Database["environments"]>,
  variables: EnvironmentVariableRow[],
) {
  return {
    id: EnvironmentId.rehydrate(environmentRow.id),
    projectId: ProjectId.rehydrate(environmentRow.project_id),
    name: EnvironmentName.rehydrate(environmentRow.name),
    kind: EnvironmentKindValue.rehydrate(environmentRow.kind as EnvironmentKindInput),
    createdAt: CreatedAt.rehydrate(
      normalizeTimestamp(environmentRow.created_at) ?? environmentRow.created_at,
    ),
    variables: EnvironmentConfigSet.rehydrate(
      variables.map((variable) => ({
        key: ConfigKey.rehydrate(variable.key),
        value: ConfigValueText.rehydrate(variable.value),
        kind: VariableKindValue.rehydrate(variable.kind as VariableKindInput),
        exposure: VariableExposureValue.rehydrate(variable.exposure as VariableExposureInput),
        scope: ConfigScopeValue.rehydrate(variable.scope as ConfigScopeInput),
        isSecret: variable.is_secret,
        updatedAt: UpdatedAt.rehydrate(
          normalizeTimestamp(variable.updated_at) ?? variable.updated_at,
        ),
      })),
    ),
    ...(environmentRow.parent_environment_id
      ? { parentEnvironmentId: EnvironmentId.rehydrate(environmentRow.parent_environment_id) }
      : {}),
  };
}

export function serializeResourceServices(
  services: Array<{
    name: ResourceServiceName;
    kind: ResourceServiceKindValue;
  }>,
): SerializedResourceService[] {
  return services.map((service) => ({
    name: service.name.value,
    kind: service.kind.value,
  }));
}

export function serializeDomainVerificationAttempts(
  attempts: DomainVerificationAttemptState[],
): SerializedDomainVerificationAttempt[] {
  return attempts.map((attempt) => ({
    id: attempt.id.value,
    method: attempt.method.value,
    status: attempt.status.value,
    expectedTarget: attempt.expectedTarget.value,
    createdAt: attempt.createdAt.value,
  }));
}

export function rehydrateDomainBindingRow(row: Selectable<Database["domain_bindings"]>) {
  const verificationAttempts = (row.verification_attempts ??
    []) as unknown as SerializedDomainVerificationAttempt[];

  return {
    id: DomainBindingId.rehydrate(row.id),
    projectId: ProjectId.rehydrate(row.project_id),
    environmentId: EnvironmentId.rehydrate(row.environment_id),
    resourceId: ResourceId.rehydrate(row.resource_id),
    serverId: DeploymentTargetId.rehydrate(row.server_id),
    destinationId: DestinationId.rehydrate(row.destination_id),
    domainName: PublicDomainName.rehydrate(row.domain_name),
    pathPrefix: RoutePathPrefix.rehydrate(row.path_prefix),
    proxyKind: EdgeProxyKindValue.rehydrate(row.proxy_kind as EdgeProxyKindInput),
    tlsMode: TlsModeValue.rehydrate(row.tls_mode as TlsModeInput),
    certificatePolicy: CertificatePolicyValue.rehydrate(
      row.certificate_policy as CertificatePolicyInput,
    ),
    status: DomainBindingStatusValue.rehydrate(row.status as DomainBindingStatusInput),
    verificationAttempts: verificationAttempts.map((attempt) => ({
      id: DomainVerificationAttemptId.rehydrate(attempt.id),
      method: DomainVerificationMethodValue.rehydrate(attempt.method),
      status: DomainVerificationAttemptStatusValue.rehydrate(attempt.status),
      expectedTarget: MessageText.rehydrate(attempt.expectedTarget),
      createdAt: CreatedAt.rehydrate(attempt.createdAt),
    })),
    createdAt: CreatedAt.rehydrate(normalizeTimestamp(row.created_at) ?? row.created_at),
    ...(row.idempotency_key
      ? { idempotencyKey: IdempotencyKeyValue.rehydrate(row.idempotency_key) }
      : {}),
  };
}

export function rehydrateResourceRow(row: Selectable<Database["resources"]>) {
  const services = (row.services ?? []) as unknown as SerializedResourceService[];
  const sourceBinding = row.source_binding
    ? (row.source_binding as unknown as SerializedResourceSourceBinding)
    : undefined;
  const runtimeProfile = row.runtime_profile
    ? (row.runtime_profile as unknown as SerializedResourceRuntimeProfile)
    : undefined;

  return {
    id: ResourceId.rehydrate(row.id),
    projectId: ProjectId.rehydrate(row.project_id),
    environmentId: EnvironmentId.rehydrate(row.environment_id),
    ...(row.destination_id ? { destinationId: DestinationId.rehydrate(row.destination_id) } : {}),
    name: ResourceName.rehydrate(row.name),
    slug: ResourceSlug.rehydrate(row.slug),
    kind: ResourceKindValue.rehydrate(row.kind as ResourceKindInput),
    services: services.map((service) => ({
      name: ResourceServiceName.rehydrate(service.name),
      kind: ResourceServiceKindValue.rehydrate(service.kind),
    })),
    ...(sourceBinding
      ? {
          sourceBinding: {
            kind: SourceKindValue.rehydrate(sourceBinding.kind),
            locator: SourceLocator.rehydrate(sourceBinding.locator),
            displayName: DisplayNameText.rehydrate(sourceBinding.displayName),
            ...(sourceBinding.metadata ? { metadata: { ...sourceBinding.metadata } } : {}),
          },
        }
      : {}),
    ...(runtimeProfile
      ? {
          runtimeProfile: {
            strategy: RuntimePlanStrategyValue.rehydrate(runtimeProfile.strategy),
            ...(runtimeProfile.installCommand
              ? { installCommand: CommandText.rehydrate(runtimeProfile.installCommand) }
              : {}),
            ...(runtimeProfile.buildCommand
              ? { buildCommand: CommandText.rehydrate(runtimeProfile.buildCommand) }
              : {}),
            ...(runtimeProfile.startCommand
              ? { startCommand: CommandText.rehydrate(runtimeProfile.startCommand) }
              : {}),
            ...(runtimeProfile.port ? { port: PortNumber.rehydrate(runtimeProfile.port) } : {}),
            ...(runtimeProfile.healthCheckPath
              ? { healthCheckPath: HealthCheckPathText.rehydrate(runtimeProfile.healthCheckPath) }
              : {}),
          },
        }
      : {}),
    createdAt: CreatedAt.rehydrate(normalizeTimestamp(row.created_at) ?? row.created_at),
    ...(row.description ? { description: DescriptionText.rehydrate(row.description) } : {}),
  };
}

export function rehydrateDeploymentRow(row: Selectable<Database["deployments"]>) {
  const startedAt = normalizeTimestamp(row.started_at);
  const finishedAt = normalizeTimestamp(row.finished_at);

  return {
    id: DeploymentId.rehydrate(row.id),
    projectId: ProjectId.rehydrate(row.project_id),
    environmentId: EnvironmentId.rehydrate(row.environment_id),
    resourceId: ResourceId.rehydrate(row.resource_id),
    serverId: DeploymentTargetId.rehydrate(row.server_id),
    destinationId: DestinationId.rehydrate(row.destination_id),
    status: DeploymentStatusValue.rehydrate(row.status as DeploymentStatusInput),
    runtimePlan: rehydrateRuntimePlan(row.runtime_plan),
    environmentSnapshot: rehydrateEnvironmentSnapshot(row.environment_snapshot),
    logs: rehydrateDeploymentLogs(row.logs),
    createdAt: CreatedAt.rehydrate(normalizeTimestamp(row.created_at) ?? row.created_at),
    ...(startedAt ? { startedAt: StartedAt.rehydrate(startedAt) } : {}),
    ...(finishedAt ? { finishedAt: FinishedAt.rehydrate(finishedAt) } : {}),
    ...(row.rollback_of_deployment_id
      ? { rollbackOfDeploymentId: DeploymentId.rehydrate(row.rollback_of_deployment_id) }
      : {}),
  };
}
