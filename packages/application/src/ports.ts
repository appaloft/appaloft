import {
  type BuildStrategyKind,
  type ConfigScope,
  type Deployment,
  type DeploymentLogSource,
  type DeploymentMutationSpec,
  type DeploymentSelectionSpec,
  type DeploymentStatus,
  type DeploymentTargetState,
  type Destination,
  type DestinationKind,
  type DestinationMutationSpec,
  type DestinationSelectionSpec,
  type DomainEvent,
  type EnvironmentKind,
  type EnvironmentMutationSpec,
  type EnvironmentProfile,
  type EnvironmentSelectionSpec,
  type EnvironmentSnapshot,
  type ExecutionStrategyKind,
  type LogLevel,
  type PackagingMode,
  type Project,
  type ProjectMutationSpec,
  type ProjectSelectionSpec,
  type Resource,
  type ResourceKind,
  type ResourceMutationSpec,
  type ResourceSelectionSpec,
  type ResourceServiceKind,
  type Result,
  type RollbackPlan,
  type RuntimePlan,
  type Server,
  type ServerMutationSpec,
  type ServerSelectionSpec,
  type SourceDescriptor,
  type SourceKind,
  type TargetKind,
  type VariableExposure,
  type VariableKind,
} from "@yundu/core";
import { type ExecutionContext, type RepositoryContext } from "./execution-context";

export interface Clock {
  now(): string;
}

export interface IdGenerator {
  next(prefix: string): string;
}

export interface AppLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface EventBus {
  publish(context: ExecutionContext, events: DomainEvent[]): Promise<void>;
}

export type DeploymentProgressPhase =
  | "detect"
  | "plan"
  | "package"
  | "deploy"
  | "verify"
  | "rollback";

export type DeploymentProgressStatus = "running" | "succeeded" | "failed";

export interface DeploymentProgressEvent {
  timestamp: string;
  source: DeploymentLogSource;
  phase: DeploymentProgressPhase;
  level: LogLevel;
  message: string;
  deploymentId?: string;
  status?: DeploymentProgressStatus;
  step?: {
    current: number;
    total: number;
    label: string;
  };
  stream?: "stdout" | "stderr";
}

export type DeploymentProgressListener = (
  context: ExecutionContext,
  event: DeploymentProgressEvent,
) => void;

export interface DeploymentProgressReporter {
  report(context: ExecutionContext, event: DeploymentProgressEvent): void;
}

export interface DeploymentProgressObserver {
  subscribe(listener: DeploymentProgressListener): () => void;
}

export interface ProjectRepository {
  findOne(context: RepositoryContext, spec: ProjectSelectionSpec): Promise<Project | null>;
  upsert(context: RepositoryContext, project: Project, spec: ProjectMutationSpec): Promise<void>;
}

export interface ServerRepository {
  findOne(context: RepositoryContext, spec: ServerSelectionSpec): Promise<Server | null>;
  upsert(context: RepositoryContext, server: Server, spec: ServerMutationSpec): Promise<void>;
}

export interface DestinationRepository {
  findOne(context: RepositoryContext, spec: DestinationSelectionSpec): Promise<Destination | null>;
  upsert(
    context: RepositoryContext,
    destination: Destination,
    spec: DestinationMutationSpec,
  ): Promise<void>;
}

export interface EnvironmentRepository {
  findOne(
    context: RepositoryContext,
    spec: EnvironmentSelectionSpec,
  ): Promise<EnvironmentProfile | null>;
  upsert(
    context: RepositoryContext,
    environment: EnvironmentProfile,
    spec: EnvironmentMutationSpec,
  ): Promise<void>;
}

export interface ResourceRepository {
  findOne(context: RepositoryContext, spec: ResourceSelectionSpec): Promise<Resource | null>;
  upsert(context: RepositoryContext, resource: Resource, spec: ResourceMutationSpec): Promise<void>;
}

export interface DeploymentRepository {
  findOne(context: RepositoryContext, spec: DeploymentSelectionSpec): Promise<Deployment | null>;
  upsert(
    context: RepositoryContext,
    deployment: Deployment,
    spec: DeploymentMutationSpec,
  ): Promise<void>;
}

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  description?: string;
  createdAt: string;
}

export interface ServerSummary {
  id: string;
  name: string;
  host: string;
  port: number;
  providerKey: string;
  createdAt: string;
}

export type ServerConnectivityStatus = "passed" | "failed" | "skipped";

export interface ServerConnectivityCheck {
  name: string;
  status: ServerConnectivityStatus;
  message: string;
  durationMs: number;
  metadata?: Record<string, string>;
}

export interface ServerConnectivityResult {
  serverId: string;
  name: string;
  host: string;
  port: number;
  providerKey: string;
  checkedAt: string;
  status: "healthy" | "degraded" | "unreachable";
  checks: ServerConnectivityCheck[];
}

export interface EnvironmentSummary {
  id: string;
  projectId: string;
  name: string;
  kind: EnvironmentKind;
  parentEnvironmentId?: string;
  createdAt: string;
  maskedVariables: Array<{
    key: string;
    value: string;
    scope: ConfigScope;
    exposure: VariableExposure;
    isSecret: boolean;
    kind: VariableKind;
  }>;
}

export interface ResourceSummary {
  id: string;
  projectId: string;
  environmentId: string;
  destinationId?: string;
  name: string;
  slug: string;
  kind: ResourceKind;
  description?: string;
  createdAt: string;
  services: Array<{
    name: string;
    kind: ResourceServiceKind;
  }>;
  deploymentCount: number;
  lastDeploymentId?: string;
  lastDeploymentStatus?: DeploymentStatus;
}

export interface DeploymentLogSummary {
  timestamp: string;
  source: DeploymentLogSource;
  phase: "detect" | "plan" | "package" | "deploy" | "verify" | "rollback";
  level: LogLevel;
  message: string;
  masked?: boolean;
}

export interface EnvironmentDiffSummary {
  key: string;
  exposure: VariableExposure;
  change: "added" | "removed" | "changed" | "unchanged";
  left?: {
    key: string;
    value: string;
    scope: ConfigScope;
    exposure: VariableExposure;
    isSecret: boolean;
    kind: VariableKind;
  };
  right?: {
    key: string;
    value: string;
    scope: ConfigScope;
    exposure: VariableExposure;
    isSecret: boolean;
    kind: VariableKind;
  };
}

export interface DeploymentSummary {
  id: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId: string;
  status: DeploymentStatus;
  runtimePlan: {
    id: string;
    source: {
      kind: SourceKind;
      locator: string;
      displayName: string;
      metadata?: Record<string, string>;
    };
    buildStrategy: BuildStrategyKind;
    packagingMode: PackagingMode;
    execution: {
      kind: ExecutionStrategyKind;
      workingDirectory?: string;
      installCommand?: string;
      buildCommand?: string;
      startCommand?: string;
      healthCheckPath?: string;
      port?: number;
      image?: string;
      dockerfilePath?: string;
      composeFile?: string;
      metadata?: Record<string, string>;
    };
    target: {
      kind: TargetKind;
      providerKey: string;
      serverIds: string[];
      metadata?: Record<string, string>;
    };
    detectSummary: string;
    generatedAt: string;
    steps: string[];
  };
  environmentSnapshot: {
    id: string;
    environmentId: string;
    createdAt: string;
    precedence: string[];
    variables: Array<{
      key: string;
      value: string;
      kind: VariableKind;
      exposure: VariableExposure;
      scope: ConfigScope;
      isSecret: boolean;
    }>;
  };
  logs: DeploymentLogSummary[];
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  rollbackOfDeploymentId?: string;
  logCount: number;
}

export interface ProjectReadModel {
  list(context: RepositoryContext): Promise<ProjectSummary[]>;
}

export interface ServerReadModel {
  list(context: RepositoryContext): Promise<ServerSummary[]>;
}

export interface EnvironmentReadModel {
  list(context: RepositoryContext, projectId?: string): Promise<EnvironmentSummary[]>;
  findById(context: RepositoryContext, id: string): Promise<EnvironmentSummary | null>;
}

export interface ResourceReadModel {
  list(
    context: RepositoryContext,
    input?: {
      projectId?: string;
      environmentId?: string;
    },
  ): Promise<ResourceSummary[]>;
}

export interface DeploymentReadModel {
  list(
    context: RepositoryContext,
    input?: {
      projectId?: string;
      resourceId?: string;
    },
  ): Promise<DeploymentSummary[]>;
  findLogs(context: RepositoryContext, id: string): Promise<DeploymentLogSummary[]>;
}

export interface SourceDetectionResult {
  source: SourceDescriptor;
  reasoning: string[];
}

export type RequestedDeploymentMethod =
  | "auto"
  | "dockerfile"
  | "docker-compose"
  | "prebuilt-image"
  | "workspace-commands";

export interface RequestedDeploymentConfig {
  method: RequestedDeploymentMethod;
  installCommand?: string;
  buildCommand?: string;
  startCommand?: string;
  port?: number;
  healthCheckPath?: string;
}

export interface DeploymentConfiguredProject {
  name: string;
  description?: string;
}

export interface DeploymentConfiguredEnvironment {
  name: string;
  kind?: EnvironmentKind;
}

export interface DeploymentConfiguredResource {
  name: string;
  kind?: ResourceKind;
  description?: string;
  services?: Array<{
    name: string;
    kind: ResourceServiceKind;
  }>;
}

export interface DeploymentConfiguredDestination {
  name?: string;
  kind?: DestinationKind;
}

export interface DeploymentConfiguredTarget {
  key?: string;
  name?: string;
  providerKey: string;
  host?: string;
  port?: number;
  destination?: DeploymentConfiguredDestination;
}

export interface DeploymentConfigSnapshot {
  configFilePath?: string;
  project?: DeploymentConfiguredProject;
  environment?: DeploymentConfiguredEnvironment;
  resource?: DeploymentConfiguredResource;
  targets?: DeploymentConfiguredTarget[];
  deployment?: Partial<RequestedDeploymentConfig> & {
    targetKey?: string;
  };
}

export interface DeploymentConfigReader {
  read(
    context: ExecutionContext,
    input: {
      sourceLocator: string;
      configFilePath?: string;
    },
  ): Promise<Result<DeploymentConfigSnapshot | null>>;
}

export interface ServerConnectivityChecker {
  test(
    context: ExecutionContext,
    input: {
      server: DeploymentTargetState;
    },
  ): Promise<Result<ServerConnectivityResult>>;
}

export interface DeploymentContextDefaultsPolicyInput {
  sourceLocator: string;
  requestedDeploymentMethod: RequestedDeploymentMethod;
}

export type ProjectContextDefault =
  | {
      mode: "required";
    }
  | {
      mode: "reuse-or-create";
      preset: "local-project";
    };

export type ServerContextDefault =
  | {
      mode: "required";
    }
  | {
      mode: "reuse-or-create";
      preset: "local-server";
    };

export type EnvironmentContextDefault =
  | {
      mode: "required";
    }
  | {
      mode: "reuse-or-create";
      preset: "local-environment";
    };

export type ResourceContextDefault =
  | {
      mode: "required";
    }
  | {
      mode: "reuse-or-create";
      preset: "local-resource";
    };

export type DestinationContextDefault =
  | {
      mode: "required";
    }
  | {
      mode: "reuse-or-create";
      preset: "local-destination";
    };

export interface DeploymentContextDefaultsDecision {
  project: ProjectContextDefault;
  server: ServerContextDefault;
  destination: DestinationContextDefault;
  environment: EnvironmentContextDefault;
  resource: ResourceContextDefault;
}

export interface DeploymentContextDefaultsPolicy {
  decide(input: DeploymentContextDefaultsPolicyInput): Result<DeploymentContextDefaultsDecision>;
}

export interface DeploymentContextDefaultsFactoryPort {
  localProjectSelection(): Result<ProjectSelectionSpec>;
  createLocalProject(): Result<Project>;
  localServerSelection(): Result<ServerSelectionSpec>;
  createLocalServer(): Result<Server>;
  localDestinationSelection(server: Server): Result<DestinationSelectionSpec>;
  createLocalDestination(server: Server): Result<Destination>;
  localEnvironmentSelection(project: Project): Result<EnvironmentSelectionSpec>;
  createLocalEnvironment(project: Project): Result<EnvironmentProfile>;
  localResourceSelection(
    project: Project,
    environment: EnvironmentProfile,
  ): Result<ResourceSelectionSpec>;
  createLocalResource(
    project: Project,
    environment: EnvironmentProfile,
    destination: Destination,
  ): Result<Resource>;
}

export interface SourceDetector {
  detect(context: ExecutionContext, locator: string): Promise<Result<SourceDetectionResult>>;
}

export interface RuntimePlanResolver {
  resolve(
    context: ExecutionContext,
    input: {
      id: string;
      source: SourceDescriptor;
      server: DeploymentTargetState;
      environmentSnapshot: EnvironmentSnapshot;
      detectedReasoning: string[];
      requestedDeployment: RequestedDeploymentConfig;
      generatedAt: string;
    },
  ): Promise<Result<RuntimePlan>>;
}

export interface ExecutionBackend {
  execute(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>>;
  rollback(
    context: ExecutionContext,
    deployment: Deployment,
    plan: RollbackPlan,
  ): Promise<Result<{ deployment: Deployment }>>;
}

export interface ProviderDescriptor {
  key: string;
  title: string;
  category: "cloud-provider" | "deploy-target" | "infra-service";
  capabilities: string[];
}

export interface IntegrationDescriptor {
  key: string;
  title: string;
  capabilities: string[];
}

export interface ProviderRegistry {
  list(): ProviderDescriptor[];
}

export interface IntegrationRegistry {
  list(): IntegrationDescriptor[];
}

export interface IntegrationAuthPort {
  getProviderAccessToken(context: ExecutionContext, providerKey: "github"): Promise<string | null>;
}

export interface GitHubRepositorySummary {
  id: string;
  name: string;
  fullName: string;
  ownerLogin: string;
  description?: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
  cloneUrl: string;
  updatedAt: string;
}

export interface GitHubRepositoryBrowser {
  listRepositories(
    context: ExecutionContext,
    input: {
      accessToken: string;
      search?: string;
    },
  ): Promise<GitHubRepositorySummary[]>;
}

export interface PluginSummary {
  name: string;
  displayName?: string;
  description?: string;
  version: string;
  kind: "user-extension" | "system-extension";
  capabilities: string[];
  compatible: boolean;
}

export interface PluginRegistry {
  list(): PluginSummary[];
}

export interface DiagnosticsStatus {
  status: "ready" | "degraded";
  checks: {
    database: boolean;
    migrations: boolean;
  };
  details?: Record<string, string>;
}

export interface DiagnosticsPort {
  readiness(): Promise<DiagnosticsStatus>;
  migrationStatus(): Promise<{
    pending: string[];
    executed: string[];
  }>;
  migrate(): Promise<{
    executed: string[];
  }>;
}
