import {
  AcceptDependencyResourceProvisioningPlanCommand,
  AttachResourceStorageCommand,
  BindResourceDependencyCommand,
  ConfigureDependencyResourceBackupPolicyCommand,
  ConfigurePreviewPolicyCommand,
  ConfigureResourceAccessCommand,
  ConfigureResourceAutoDeployCommand,
  ConfigureResourceHealthCommand,
  ConfigureResourceNetworkCommand,
  ConfigureResourceRuntimeCommand,
  ConfigureResourceSourceCommand,
  ConfigureRuntimeMonitoringThresholdsCommand,
  ConfigureScheduledRuntimePrunePolicyCommand,
  ConfigureScheduledTaskCommand,
  ConfigureServerCredentialCommand,
  type ConfigureServerCredentialCommandInput,
  CreateDependencyResourceProvisioningPlanCommand,
  type CreateDeploymentCommandInput,
  CreateEnvironmentCommand,
  CreateProjectCommand,
  CreateResourceCommand,
  CreateScheduledTaskCommand,
  CreateSshCredentialCommand,
  type CreateSshCredentialCommandInput,
  CreateStorageVolumeCommand,
  compareResourceProfileDrift,
  DeleteDependencyResourceCommand,
  type DependencyResourceBackupPolicyRead,
  type DependencyResourceSummary,
  type DeploymentConfiguredRuntimePrunePolicy,
  deploymentSnapshotRuntimePrunePolicyId,
  type EnvironmentSummary,
  ListDependencyResourceBackupPoliciesQuery,
  ListDependencyResourcesQuery,
  ListEnvironmentsQuery,
  ListProjectsQuery,
  ListResourceDependencyBindingsQuery,
  ListResourcesQuery,
  ListScheduledTasksQuery,
  ListServersQuery,
  ListStorageVolumesQuery,
  type ManagedDependencyResourceKind,
  PrepareServerRuntimeCommand,
  type PreviewPolicySettings,
  type PreviewPolicySummary,
  type ProjectSummary,
  ProvisionDependencyResourceCommand,
  RegisterServerCommand,
  type RegisterServerCommandInput,
  type RequestedDeploymentServiceConfig,
  type ResourceDependencyBindingSummary,
  type ResourceDetail,
  type ResourceDetailAutoDeployPolicy,
  type ResourceDetailProfileDiagnostic,
  ResourceEffectiveConfigQuery,
  type ResourceEffectiveConfigView,
  type ResourceProfileConfigurationEntry,
  type ResourceSummary,
  type RuntimeMonitoringSignal,
  type RuntimeMonitoringThresholdMetric,
  type RuntimeMonitoringThresholdRule,
  type RuntimeMonitoringThresholdsReadback,
  resourceProfileFromResourceDetail,
  type ScheduledTaskDefinitionSummary,
  type ServerSummary,
  SetEnvironmentVariableCommand,
  type SetEnvironmentVariableCommandInput,
  ShowPreviewPolicyQuery,
  ShowResourceQuery,
  ShowResourceSecretReferenceQuery,
  ShowRuntimeMonitoringThresholdsQuery,
  type StorageVolumeSummary,
  TestServerConnectivityCommand,
} from "@appaloft/application";
import {
  type ConfigureResourceNetworkInput,
  type ConfigureResourceRuntimeInput,
  type CreateProjectInput,
  type CreateResourceInput,
  createQuickDeployGeneratedResourceName,
  normalizeQuickDeployGeneratedNameBase,
  type QuickDeployCreateEnvironmentInput,
  type QuickDeployEnvironmentVariableInput,
  type QuickDeployProvisionDependencyResourcesInput,
  type QuickDeployReference,
  type QuickDeployResourceReference,
  type QuickDeployServerCredential,
  type QuickDeployServerReference,
  type QuickDeployWorkflowInput,
  type QuickDeployWorkflowStep,
  type QuickDeployWorkflowStepOutput,
  quickDeployWorkflow,
} from "@appaloft/contracts";
import {
  type DomainError,
  domainError,
  type EnvironmentKind,
  environmentKinds,
  err,
  ok,
  type Result,
} from "@appaloft/core";
import { type AppaloftDeploymentConfig } from "@appaloft/deployment-config";
import { Effect, Either } from "effect";

import { type CliInteraction, effectCliInteraction } from "../interaction.js";
import { CliRuntime, resultToEffect } from "../runtime.js";
import {
  type RemoteStateSession,
  type ServerAppliedRouteDomainIntent,
  type SourceLinkDependencyProvenance,
  type SourceLinkDependencyProvenanceEntry,
  type SourceLinkRecord,
  type SourceLinkScheduledTaskProvenance,
  type SourceLinkScheduledTaskProvenanceEntry,
  type SourceLinkStorageProvenance,
  type SourceLinkStorageProvenanceEntry,
} from "./deployment-remote-state.js";
import {
  type DeploymentMethod,
  deploymentMethods,
  isRemoteOrImageSource,
  normalizeCliPathOrSource,
} from "./deployment-source.js";
import { type DeploymentStateBackendDecision } from "./deployment-state.js";

export interface DeploymentPromptSeed {
  projectId?: string;
  serverId?: string;
  destinationId?: string;
  environmentId?: string;
  resourceId?: string;
  server?: DeploymentServerDraft;
  environment?: DeploymentEnvironmentDraft;
  environmentVariables?: DeploymentEnvironmentVariableSeed[];
  resource?: ResourceDraftInput;
  sourceLocator?: string;
  deploymentMethod?: DeploymentMethod;
  installCommand?: string;
  buildCommand?: string;
  startCommand?: string;
  runtimeName?: string;
  runtimeNameTemplate?: string;
  publishDirectory?: string;
  port?: number;
  upstreamProtocol?: ResourceNetworkProfileInput["upstreamProtocol"];
  exposureMode?: ResourceNetworkProfileInput["exposureMode"];
  targetServiceName?: string;
  hostPort?: number;
  healthCheckPath?: string;
  healthCheck?: ResourceRuntimeProfileInput["healthCheck"];
  dockerfilePath?: string;
  dockerComposeFilePath?: string;
  buildTarget?: string;
  replicas?: number;
  sourceProfile?: Partial<
    Pick<ResourceSourceInput, "gitRef" | "commitSha" | "baseDirectory" | "version" | "versionKind">
  >;
  sourceFingerprint?: string;
  stateBackend?: DeploymentStateBackendDecision;
  stateBackendPrepared?: boolean;
  serverAppliedRoutes?: DeploymentServerAppliedRouteSeed[];
  services?: DeploymentServiceSeed[];
  dependencyGraph?: DeploymentDependencySeed[];
  storageGraph?: DeploymentStorageSeed[];
  scheduledTaskGraph?: DeploymentScheduledTaskSeed[];
  autoDeployPolicy?: DeploymentAutoDeploySeed;
  generatedAccessProfile?: DeploymentGeneratedAccessProfileSeed;
  monitoringThresholds?: DeploymentMonitoringThresholdsSeed;
  runtimePrunePolicy?: DeploymentRuntimePrunePolicySeed;
  resourceSecretRequirements?: DeploymentResourceSecretRequirementSeed[];
  previewPolicy?: DeploymentPreviewPolicySeed;
  isPullRequestPreview?: boolean;
  profileDriftPreflight?: boolean;
}

type ResourceDraftInput = Pick<CreateResourceInput, "name"> &
  Partial<Pick<CreateResourceInput, "kind" | "description" | "services">>;
type ResourceSourceInput = NonNullable<CreateResourceInput["source"]>;
type ResourceRuntimeProfileInput = NonNullable<CreateResourceInput["runtimeProfile"]>;
type ResourceNetworkProfileInput = NonNullable<CreateResourceInput["networkProfile"]>;
type ConfigurableResourceSourceInput = ResourceSourceInput;
type ResourceRuntimeProfileDraftInput = Partial<ResourceRuntimeProfileInput>;
type ConfigurableResourceNetworkProfileInput = ConfigureResourceNetworkInput["networkProfile"];
type ConfigurableResourceRuntimeProfileInput = ConfigureResourceRuntimeInput["runtimeProfile"];
export type DeploymentEnvironmentVariableSeed = QuickDeployEnvironmentVariableInput;
export type DeploymentServerAppliedRouteSeed = ServerAppliedRouteDomainIntent;
export interface DeploymentServiceSeed extends RequestedDeploymentServiceConfig {}
export interface DeploymentDependencySeed {
  key: string;
  kind: ManagedDependencyResourceKind;
  source: "managed";
  bindEnv: string;
  backupPolicy?: DeploymentDependencyBackupPolicySeed;
  previewLifecycle?: "ephemeral";
}
export interface DeploymentDependencyBackupPolicySeed {
  enabled: boolean;
  intervalHours?: number;
  retentionDays?: number;
  retryOnFailure: boolean;
}
export interface DeploymentStorageSeed {
  key: string;
  kind: "volume";
  source: "managed";
  mountPath: string;
  mountMode: "read-write" | "read-only";
  previewLifecycle?: "ephemeral";
}
export interface DeploymentScheduledTaskSeed {
  key: string;
  schedule: string;
  timezone: string;
  command: string;
  timeoutSeconds: number;
  retryLimit: number;
  concurrencyPolicy: "forbid";
  status: "enabled" | "disabled";
  previewLifecycle?: "ephemeral";
}
export interface DeploymentAutoDeploySeed {
  enabled: boolean;
  triggerKind: "git-push";
  refs?: string[];
  eventKinds: ("push" | "tag")[];
  dedupeWindowSeconds?: number;
}
export interface DeploymentGeneratedAccessProfileSeed {
  generatedAccessMode: "inherit" | "disabled";
  pathPrefix: string;
}
export interface DeploymentMonitoringThresholdRuleSeed {
  signal: RuntimeMonitoringSignal;
  metric: RuntimeMonitoringThresholdMetric;
  warning?: number;
  critical?: number;
  comparator: "greater-than-or-equal";
}
export interface DeploymentMonitoringThresholdsSeed {
  enabled: boolean;
  rules: DeploymentMonitoringThresholdRuleSeed[];
}
export type DeploymentRuntimePrunePolicySeed = DeploymentConfiguredRuntimePrunePolicy;
export interface DeploymentResourceSecretRequirementSeed {
  key: string;
  refKey: string;
  required: boolean;
}
export type DeploymentPreviewPolicySeed = PreviewPolicySettings;
export const deploymentEntryModes = ["static-site"] as const;
export type DeploymentEntryMode = (typeof deploymentEntryModes)[number];

export interface DeploymentEnvironmentVariablesFromConfigOptions {
  env?: Record<string, string | undefined>;
  previewContext?: {
    previewId: string;
    pullRequestNumber: number;
  };
}

export interface DeploymentServerDraft {
  name?: string;
  host?: string;
  providerKey?: string;
  targetKind?: RegisterServerCommandInput["targetKind"];
  port?: number;
  proxyKind?: RegisterServerCommandInput["proxyKind"];
  credential?: ConfigureServerCredentialCommandInput["credential"];
  reusableSshCredential?: CreateSshCredentialCommandInput;
}

export interface DeploymentEnvironmentDraft {
  name: string;
  kind: EnvironmentKind;
}

interface ResolvedWorkflowReference<CreateInput> {
  reference: QuickDeployReference<CreateInput>;
  label: string;
}

interface ResolvedWorkflowServerReference {
  reference: QuickDeployServerReference;
  label: string;
}

interface ResolvedWorkflowResourceReference {
  reference: QuickDeployResourceReference;
  label: string;
}

const defaultProjectName = "Local Workspace";
const defaultEnvironmentName = "local";
const defaultServerName = "local-machine";
const defaultServerHost = "127.0.0.1";
const defaultServerPort = 22;
const defaultServerProviderKey = "local-shell";
const defaultRemoteServerProviderKey = "generic-ssh";
const defaultApplicationInternalPort = 3000;
const defaultStaticInternalPort = 80;
const defaultStaticPublishDirectory = "/dist";
const ciEnvSecretReferencePrefix = "ci-env:";
const resourceSecretReferencePrefix = "resource-secret:";

function cliRuntimeEffect<A, E>(
  effect: Effect.Effect<A, E, unknown>,
): Effect.Effect<A, E, CliRuntime> {
  return effect as Effect.Effect<A, E, CliRuntime>;
}

function trimToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function slugify(value: string): string {
  return normalizeQuickDeployGeneratedNameBase(value);
}

function inferNameFromSource(sourceLocator: string): string {
  const withoutQuery = sourceLocator.split(/[?#]/)[0] ?? sourceLocator;
  const segments = withoutQuery.split(/[\\/]/).filter(Boolean);
  return slugify(segments.at(-1) ?? defaultProjectName);
}

function inferGeneratedResourceNameFromSource(sourceLocator: string): string {
  return createQuickDeployGeneratedResourceName(inferNameFromSource(sourceLocator));
}

export function resourceKindForDeploymentMethod(
  deploymentMethod: DeploymentMethod,
): NonNullable<CreateResourceInput["kind"]> {
  if (deploymentMethod === "static") {
    return "static-site";
  }

  return deploymentMethod === "docker-compose" ? "compose-stack" : "application";
}

export function normalizeUrlFirstDeploymentEntry(input: {
  requestedDeploymentMethod?: DeploymentMethod;
  entryMode?: DeploymentEntryMode;
  sourceLocator?: string;
  publishDirectory?: string;
}): Result<{
  deploymentMethod?: DeploymentMethod;
  publishDirectory?: string;
}> {
  if (!input.entryMode) {
    return ok({
      ...(input.requestedDeploymentMethod
        ? { deploymentMethod: input.requestedDeploymentMethod }
        : {}),
      ...(input.publishDirectory ? { publishDirectory: input.publishDirectory } : {}),
    });
  }

  if (
    input.entryMode === "static-site" &&
    input.requestedDeploymentMethod &&
    input.requestedDeploymentMethod !== "auto" &&
    input.requestedDeploymentMethod !== "static"
  ) {
    return err(
      domainError.validation("Static site entry cannot use a non-static deployment method", {
        phase: "deployment-entry",
        entryMode: input.entryMode,
        requestedDeploymentMethod: input.requestedDeploymentMethod,
      }),
    );
  }

  const sourceLocator = input.sourceLocator?.trim();
  const defaultPublishDirectory =
    sourceLocator && !isRemoteOrImageSource(sourceLocator) ? "." : undefined;
  const publishDirectory = input.publishDirectory ?? defaultPublishDirectory;

  return ok({
    deploymentMethod: "static",
    ...(publishDirectory ? { publishDirectory } : {}),
  });
}

function inferResourceFromSource(
  sourceLocator: string,
  deploymentMethod: DeploymentMethod,
): ResourceDraftInput {
  return {
    name: inferGeneratedResourceNameFromSource(sourceLocator),
    kind: resourceKindForDeploymentMethod(deploymentMethod),
  };
}

function resourceDraftWithConfigServices(
  resource: ResourceDraftInput,
  services: DeploymentServiceSeed[] | undefined,
): ResourceDraftInput {
  if (!services || services.length === 0) {
    return resource;
  }

  return {
    ...resource,
    kind: services.length > 1 ? "compose-stack" : (resource.kind ?? "application"),
    services: services.map((service) => ({
      name: service.name,
      kind: service.kind,
    })),
  };
}

export function sourceKindForDeploymentInput(
  sourceLocator: string,
  deploymentMethod: DeploymentMethod,
): ResourceSourceInput["kind"] {
  if (deploymentMethod === "prebuilt-image") {
    return "docker-image";
  }

  if (deploymentMethod === "docker-compose") {
    return "compose";
  }

  if (/^(https?|ssh):\/\//.test(sourceLocator) || sourceLocator.endsWith(".git")) {
    return "git-public";
  }

  if (sourceLocator.endsWith(".zip")) {
    return "zip-artifact";
  }

  if (sourceLocator.startsWith("docker://") || sourceLocator.startsWith("image://")) {
    return "docker-image";
  }

  return "local-folder";
}

export function sourceBindingForDeploymentInput(
  sourceLocator: string,
  deploymentMethod: DeploymentMethod,
  profile: Partial<
    Pick<ResourceSourceInput, "gitRef" | "commitSha" | "baseDirectory" | "version" | "versionKind">
  > = {},
): ResourceSourceInput {
  return {
    kind: sourceKindForDeploymentInput(sourceLocator, deploymentMethod),
    locator: sourceLocator,
    displayName: inferNameFromSource(sourceLocator),
    ...(profile.gitRef ? { gitRef: profile.gitRef } : {}),
    ...(profile.commitSha ? { commitSha: profile.commitSha } : {}),
    ...(profile.baseDirectory ? { baseDirectory: profile.baseDirectory } : {}),
    ...(profile.version ? { version: profile.version } : {}),
    ...(profile.versionKind ? { versionKind: profile.versionKind } : {}),
  };
}

export function runtimeProfileFromDeploymentInput(
  deploymentMethod: DeploymentMethod,
  input: ResourceRuntimeProfileDraftInput,
): ResourceRuntimeProfileInput {
  if (deploymentMethod === "static") {
    return {
      strategy: "static",
      ...(input.installCommand ? { installCommand: input.installCommand } : {}),
      ...(input.buildCommand ? { buildCommand: input.buildCommand } : {}),
      ...(input.runtimeName ? { runtimeName: input.runtimeName } : {}),
      ...(input.publishDirectory ? { publishDirectory: input.publishDirectory } : {}),
      ...(input.dockerfilePath ? { dockerfilePath: input.dockerfilePath } : {}),
      ...(input.dockerComposeFilePath
        ? { dockerComposeFilePath: input.dockerComposeFilePath }
        : {}),
      ...(input.buildTarget ? { buildTarget: input.buildTarget } : {}),
      ...(input.replicas ? { replicas: input.replicas } : {}),
      ...(input.healthCheckPath ? { healthCheckPath: input.healthCheckPath } : {}),
      ...(input.healthCheck ? { healthCheck: input.healthCheck } : {}),
    };
  }

  return {
    strategy: deploymentMethod,
    ...(input.installCommand ? { installCommand: input.installCommand } : {}),
    ...(input.buildCommand ? { buildCommand: input.buildCommand } : {}),
    ...(input.startCommand ? { startCommand: input.startCommand } : {}),
    ...(input.runtimeName ? { runtimeName: input.runtimeName } : {}),
    ...(input.publishDirectory ? { publishDirectory: input.publishDirectory } : {}),
    ...(input.dockerfilePath ? { dockerfilePath: input.dockerfilePath } : {}),
    ...(input.dockerComposeFilePath ? { dockerComposeFilePath: input.dockerComposeFilePath } : {}),
    ...(input.buildTarget ? { buildTarget: input.buildTarget } : {}),
    ...(input.replicas ? { replicas: input.replicas } : {}),
    ...(input.healthCheckPath ? { healthCheckPath: input.healthCheckPath } : {}),
    ...(input.healthCheck ? { healthCheck: input.healthCheck } : {}),
  };
}

export function networkProfileFromDeploymentInput(
  deploymentMethod: DeploymentMethod,
  input: {
    port?: number;
    upstreamProtocol?: ResourceNetworkProfileInput["upstreamProtocol"];
    exposureMode?: ResourceNetworkProfileInput["exposureMode"];
    targetServiceName?: string;
    hostPort?: number;
  },
): ResourceNetworkProfileInput {
  return {
    internalPort:
      input.port ??
      (deploymentMethod === "static" ? defaultStaticInternalPort : defaultApplicationInternalPort),
    upstreamProtocol: input.upstreamProtocol ?? "http",
    exposureMode: input.exposureMode ?? "reverse-proxy",
    ...(input.targetServiceName ? { targetServiceName: input.targetServiceName } : {}),
    ...(input.hostPort ? { hostPort: input.hostPort } : {}),
  };
}

function healthCheckFromConfig(
  config: AppaloftDeploymentConfig,
): ResourceRuntimeProfileInput["healthCheck"] | undefined {
  const healthCheck = config.runtime?.healthCheck ?? config.health;
  const path = healthCheck?.path ?? config.runtime?.healthCheckPath;
  if (!healthCheck && !path) {
    return undefined;
  }

  return defaultHttpHealthCheckPolicy({
    enabled: healthCheck?.enabled ?? true,
    path: path ?? "/",
    intervalSeconds: healthCheck?.intervalSeconds ?? 5,
    timeoutSeconds: healthCheck?.timeoutSeconds ?? 5,
    retries: healthCheck?.retries ?? 10,
  });
}

function healthCheckFromServiceConfig(
  service: NonNullable<AppaloftDeploymentConfig["services"]>[string],
): DeploymentServiceSeed["healthCheck"] | undefined {
  const healthCheck = service.runtime?.healthCheck ?? service.health;
  const path = healthCheck?.path ?? service.runtime?.healthCheckPath;
  if (!healthCheck && !path) {
    return undefined;
  }

  const enabled = healthCheck?.enabled ?? true;
  return {
    enabled,
    type: "http",
    intervalSeconds: healthCheck?.intervalSeconds ?? 5,
    timeoutSeconds: healthCheck?.timeoutSeconds ?? 5,
    retries: healthCheck?.retries ?? 10,
    startPeriodSeconds: 5,
    ...(enabled
      ? {
          http: {
            method: "GET",
            scheme: "http",
            host: "localhost",
            path: path ?? "/",
            expectedStatusCode: 200,
          },
        }
      : {}),
  };
}

function runtimeFromServiceConfig(
  service: NonNullable<AppaloftDeploymentConfig["services"]>[string],
): DeploymentServiceSeed["runtime"] | undefined {
  const runtime = service.runtime;
  if (!runtime) {
    return undefined;
  }
  const buildCommand = runtime.buildCommand ?? runtime.build?.command;
  const startCommand = runtime.startCommand ?? runtime.start?.command;

  return {
    ...(runtime.strategy ? { strategy: runtime.strategy } : {}),
    ...(runtime.installCommand ? { installCommand: runtime.installCommand } : {}),
    ...(buildCommand ? { buildCommand } : {}),
    ...(startCommand ? { startCommand } : {}),
    ...(runtime.publishDirectory ? { publishDirectory: runtime.publishDirectory } : {}),
    ...(runtime.dockerfilePath ? { dockerfilePath: runtime.dockerfilePath } : {}),
    ...(runtime.dockerComposeFilePath
      ? { dockerComposeFilePath: runtime.dockerComposeFilePath }
      : {}),
    ...(runtime.buildTarget ? { buildTarget: runtime.buildTarget } : {}),
    ...(runtime.healthCheckPath ? { healthCheckPath: runtime.healthCheckPath } : {}),
  };
}

function sourceFromServiceConfig(
  service: NonNullable<AppaloftDeploymentConfig["services"]>[string],
): DeploymentServiceSeed["source"] | undefined {
  const source = service.source;
  if (!source) {
    return undefined;
  }

  return {
    ...(source.type ? { type: source.type } : {}),
    ...(source.repository ? { repository: source.repository } : {}),
    ...(source.image ? { image: source.image } : {}),
    ...(source.gitRef ? { gitRef: source.gitRef } : {}),
    ...(source.commitSha ? { commitSha: source.commitSha } : {}),
    ...(source.baseDirectory ? { baseDirectory: source.baseDirectory } : {}),
    ...(source.version ? { version: source.version } : {}),
    ...(source.versionKind ? { versionKind: source.versionKind } : {}),
  };
}

function networkFromServiceConfig(
  service: NonNullable<AppaloftDeploymentConfig["services"]>[string],
): DeploymentServiceSeed["network"] | undefined {
  const network = service.network;
  if (!network) {
    return undefined;
  }

  return {
    ...(network.internalPort ? { internalPort: network.internalPort } : {}),
    ...(network.upstreamProtocol ? { upstreamProtocol: network.upstreamProtocol } : {}),
    ...(network.exposureMode ? { exposureMode: network.exposureMode } : {}),
    ...(network.targetServiceName ? { targetServiceName: network.targetServiceName } : {}),
    ...(network.hostPort ? { hostPort: network.hostPort } : {}),
  };
}

function secretsFromServiceConfig(
  service: NonNullable<AppaloftDeploymentConfig["services"]>[string],
): DeploymentServiceSeed["secrets"] | undefined {
  const secrets = service.secrets;
  if (!secrets) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(secrets).map(([key, reference]) => [
      key,
      {
        from: reference.from,
        ...(reference.required !== undefined ? { required: reference.required } : {}),
        ...(reference.description ? { description: reference.description } : {}),
      },
    ]),
  );
}

export function defaultHttpHealthCheckPolicy(input: {
  enabled?: boolean;
  path?: string;
  intervalSeconds?: number;
  timeoutSeconds?: number;
  retries?: number;
}): NonNullable<ResourceRuntimeProfileInput["healthCheck"]> {
  const enabled = input.enabled ?? true;
  return {
    enabled,
    type: "http",
    intervalSeconds: input.intervalSeconds ?? 5,
    timeoutSeconds: input.timeoutSeconds ?? 5,
    retries: input.retries ?? 10,
    startPeriodSeconds: 5,
    ...(enabled
      ? {
          http: {
            method: "GET",
            scheme: "http",
            host: "localhost",
            path: input.path ?? "/",
            expectedStatusCode: 200,
          },
        }
      : {}),
  };
}

export function deploymentPromptSeedFromConfig(
  config: AppaloftDeploymentConfig,
): DeploymentPromptSeed {
  const sourceIsImage = config.source?.type === "image";
  const healthCheckPath =
    config.runtime?.healthCheckPath ?? config.runtime?.healthCheck?.path ?? config.health?.path;
  const sourceProfile = {
    ...(!sourceIsImage && config.source?.baseDirectory
      ? { baseDirectory: config.source.baseDirectory }
      : {}),
    ...(!sourceIsImage && config.source?.gitRef ? { gitRef: config.source.gitRef } : {}),
    ...(!sourceIsImage && config.source?.commitSha ? { commitSha: config.source.commitSha } : {}),
    ...(config.source?.version ? { version: config.source.version } : {}),
    ...(config.source?.versionKind ? { versionKind: config.source.versionKind } : {}),
  };
  const healthCheck = healthCheckFromConfig(config);
  const serverAppliedRoutes = config.access?.domains?.map((domain) => ({
    host: domain.host,
    pathPrefix: domain.pathPrefix,
    tlsMode: domain.tlsMode,
    ...(domain.redirectTo ? { redirectTo: domain.redirectTo } : {}),
    ...(domain.redirectStatus ? { redirectStatus: domain.redirectStatus } : {}),
  }));
  const dependencyGraph = Object.entries(config.dependencies ?? {})
    .sort(compareConfigKeys)
    .map(
      ([key, dependency]) =>
        ({
          key,
          kind: dependency.kind,
          source: dependency.source,
          bindEnv: dependency.bind.env,
          ...(dependency.backup
            ? {
                backupPolicy: {
                  enabled: dependency.backup.enabled,
                  ...(dependency.backup.intervalHours
                    ? { intervalHours: dependency.backup.intervalHours }
                    : {}),
                  ...(dependency.backup.retentionDays
                    ? { retentionDays: dependency.backup.retentionDays }
                    : {}),
                  retryOnFailure: dependency.backup.retryOnFailure,
                },
              }
            : {}),
          ...(dependency.preview?.lifecycle
            ? { previewLifecycle: dependency.preview.lifecycle }
            : {}),
        }) satisfies DeploymentDependencySeed,
    );
  const storageGraph = Object.entries(config.storage ?? {})
    .sort(compareConfigKeys)
    .map(
      ([key, storage]) =>
        ({
          key,
          kind: storage.kind,
          source: storage.source,
          mountPath: storage.mount.path,
          mountMode: storage.mount.mode ?? "read-write",
          ...(storage.preview?.lifecycle ? { previewLifecycle: storage.preview.lifecycle } : {}),
        }) satisfies DeploymentStorageSeed,
    );
  const scheduledTaskGraph = Object.entries(config.scheduledTasks ?? {})
    .sort(compareConfigKeys)
    .map(
      ([key, task]) =>
        ({
          key,
          schedule: task.schedule,
          timezone: task.timezone,
          command: task.command,
          timeoutSeconds: task.timeoutSeconds,
          retryLimit: task.retryLimit,
          concurrencyPolicy: task.concurrencyPolicy,
          status: task.status,
          ...(task.preview?.lifecycle ? { previewLifecycle: task.preview.lifecycle } : {}),
        }) satisfies DeploymentScheduledTaskSeed,
    );
  const services = Object.entries(config.services ?? {})
    .sort(compareConfigKeys)
    .map(([name, service]) => {
      const healthCheck = healthCheckFromServiceConfig(service);
      const runtime = runtimeFromServiceConfig(service);
      const source = sourceFromServiceConfig(service);
      const network = networkFromServiceConfig(service);
      const secrets = secretsFromServiceConfig(service);
      return {
        name,
        kind: service.kind,
        ...(source ? { source } : {}),
        ...(runtime ? { runtime } : {}),
        ...(network ? { network } : {}),
        ...(healthCheck ? { healthCheck } : {}),
        ...(service.replicas ? { replicas: service.replicas } : {}),
        ...(service.env ? { env: { ...service.env } } : {}),
        ...(secrets ? { secrets } : {}),
      } satisfies DeploymentServiceSeed;
    });
  const autoDeployPolicy = config.autoDeploy
    ? ({
        enabled: config.autoDeploy.enabled,
        triggerKind: config.autoDeploy.trigger,
        ...(config.autoDeploy.refs ? { refs: config.autoDeploy.refs } : {}),
        eventKinds: config.autoDeploy.events,
        ...(config.autoDeploy.dedupeWindowSeconds
          ? { dedupeWindowSeconds: config.autoDeploy.dedupeWindowSeconds }
          : {}),
      } satisfies DeploymentAutoDeploySeed)
    : undefined;
  const generatedAccessProfile = config.access?.generated
    ? ({
        generatedAccessMode: config.access.generated.enabled ? "inherit" : "disabled",
        pathPrefix: config.access.generated.pathPrefix,
      } satisfies DeploymentGeneratedAccessProfileSeed)
    : undefined;
  const monitoringThresholds = config.monitoring?.thresholds
    ? ({
        enabled: config.monitoring.thresholds.enabled,
        rules: config.monitoring.thresholds.rules.map(
          (rule) =>
            ({
              signal: rule.signal,
              metric: rule.metric,
              ...(rule.warning !== undefined ? { warning: rule.warning } : {}),
              ...(rule.critical !== undefined ? { critical: rule.critical } : {}),
              comparator: rule.comparator,
            }) satisfies DeploymentMonitoringThresholdRuleSeed,
        ),
      } satisfies DeploymentMonitoringThresholdsSeed)
    : undefined;
  const runtimePrunePolicy = config.retention?.runtimePrune
    ? ({
        retentionDays: config.retention.runtimePrune.retentionDays,
        destructive: config.retention.runtimePrune.destructive,
        categories: [...config.retention.runtimePrune.categories],
        retryOnFailure: config.retention.runtimePrune.retryOnFailure,
        enabled: config.retention.runtimePrune.enabled,
      } satisfies DeploymentRuntimePrunePolicySeed)
    : undefined;
  const previewPolicy = config.preview?.pullRequest?.policy
    ? ({
        sameRepositoryPreviews: config.preview.pullRequest.policy.sameRepositoryPreviews,
        forkPreviews: config.preview.pullRequest.policy.forkPreviews,
        secretBackedPreviews: config.preview.pullRequest.policy.secretBackedPreviews,
        ...(config.preview.pullRequest.policy.maxActivePreviews !== undefined
          ? { maxActivePreviews: config.preview.pullRequest.policy.maxActivePreviews }
          : {}),
        ...(config.preview.pullRequest.policy.previewTtlHours !== undefined
          ? { previewTtlHours: config.preview.pullRequest.policy.previewTtlHours }
          : {}),
      } satisfies DeploymentPreviewPolicySeed)
    : undefined;
  const resourceSecretRequirements = Object.entries(config.secrets ?? {})
    .sort(compareConfigKeys)
    .flatMap(([key, reference]) => {
      const secretRef = reference.from.trim();
      if (!secretRef.startsWith(resourceSecretReferencePrefix)) {
        return [];
      }

      return [
        {
          key,
          refKey: secretRef.slice(resourceSecretReferencePrefix.length).trim(),
          required: reference.required ?? true,
        } satisfies DeploymentResourceSecretRequirementSeed,
      ];
    });
  const buildCommand = config.runtime?.buildCommand ?? config.runtime?.build?.command;
  const startCommand = config.runtime?.startCommand ?? config.runtime?.start?.command;

  return {
    ...(sourceIsImage && config.source?.image
      ? { sourceLocator: config.source.image }
      : config.source?.repository
        ? { sourceLocator: config.source.repository }
        : {}),
    ...(Object.keys(sourceProfile).length > 0 ? { sourceProfile } : {}),
    ...(config.runtime?.strategy
      ? { deploymentMethod: config.runtime.strategy }
      : sourceIsImage
        ? { deploymentMethod: "prebuilt-image" as const }
        : config.runtime?.type === "node"
          ? { deploymentMethod: "workspace-commands" as const }
          : {}),
    ...(config.runtime?.installCommand ? { installCommand: config.runtime.installCommand } : {}),
    ...(buildCommand ? { buildCommand } : {}),
    ...(startCommand ? { startCommand } : {}),
    ...(config.runtime?.name ? { runtimeNameTemplate: config.runtime.name } : {}),
    ...(config.runtime?.publishDirectory
      ? { publishDirectory: config.runtime.publishDirectory }
      : {}),
    ...(config.runtime?.dockerfilePath ? { dockerfilePath: config.runtime.dockerfilePath } : {}),
    ...(config.runtime?.dockerComposeFilePath
      ? { dockerComposeFilePath: config.runtime.dockerComposeFilePath }
      : {}),
    ...(config.runtime?.buildTarget ? { buildTarget: config.runtime.buildTarget } : {}),
    ...(config.replicas ? { replicas: config.replicas } : {}),
    ...(config.network?.internalPort ? { port: config.network.internalPort } : {}),
    ...(config.network?.upstreamProtocol
      ? { upstreamProtocol: config.network.upstreamProtocol }
      : {}),
    ...(config.network?.exposureMode ? { exposureMode: config.network.exposureMode } : {}),
    ...(config.network?.targetServiceName
      ? { targetServiceName: config.network.targetServiceName }
      : {}),
    ...(config.network?.hostPort ? { hostPort: config.network.hostPort } : {}),
    ...(healthCheckPath ? { healthCheckPath } : {}),
    ...(healthCheck ? { healthCheck } : {}),
    ...(serverAppliedRoutes && serverAppliedRoutes.length > 0 ? { serverAppliedRoutes } : {}),
    ...(services.length > 0 ? { services } : {}),
    ...(dependencyGraph.length > 0 ? { dependencyGraph } : {}),
    ...(storageGraph.length > 0 ? { storageGraph } : {}),
    ...(scheduledTaskGraph.length > 0 ? { scheduledTaskGraph } : {}),
    ...(autoDeployPolicy ? { autoDeployPolicy } : {}),
    ...(generatedAccessProfile ? { generatedAccessProfile } : {}),
    ...(monitoringThresholds ? { monitoringThresholds } : {}),
    ...(runtimePrunePolicy ? { runtimePrunePolicy } : {}),
    ...(resourceSecretRequirements.length > 0 ? { resourceSecretRequirements } : {}),
    ...(previewPolicy ? { previewPolicy } : {}),
  };
}

function mergeDeploymentPromptSeeds(
  base: DeploymentPromptSeed,
  overlay: DeploymentPromptSeed,
): DeploymentPromptSeed {
  return {
    ...base,
    ...overlay,
    sourceProfile: {
      ...(base.sourceProfile ?? {}),
      ...(overlay.sourceProfile ?? {}),
    },
  };
}

export function applicationDeploymentPromptSeedsFromConfig(
  config: AppaloftDeploymentConfig,
): Array<{ key: string; seed: DeploymentPromptSeed }> {
  return Object.entries(config.applications ?? {})
    .sort(compareConfigKeys)
    .map(([key, application]) => {
      const applicationConfig: AppaloftDeploymentConfig = {
        source: application.source,
        runtime: application.runtime,
        network: application.network,
        health: application.health,
        access: application.access,
        replicas: application.replicas,
        env: application.env,
        secrets: application.secrets,
        services: application.services,
      };
      const seed = deploymentPromptSeedFromConfig(applicationConfig);
      const resourceServices = seed.services;

      return {
        key,
        seed: mergeDeploymentPromptSeeds(seed, {
          resource: {
            name: application.resource.name,
            kind:
              application.resource.kind ??
              (resourceServices && resourceServices.length > 1 ? "compose-stack" : "application"),
            ...(application.resource.description
              ? { description: application.resource.description }
              : {}),
            ...(resourceServices && resourceServices.length > 0
              ? {
                  services: resourceServices.map((service) => ({
                    name: service.name,
                    kind: service.kind,
                  })),
                }
              : {}),
          },
        }),
      };
    });
}

function compareConfigKeys([leftKey]: [string, unknown], [rightKey]: [string, unknown]): number {
  return leftKey.localeCompare(rightKey);
}

function secretResolutionError(input: {
  message: string;
  secretKey: string;
  secretRef: string;
}): ReturnType<typeof domainError.validation> {
  return domainError.validation(input.message, {
    phase: "config-secret-resolution",
    secretKey: input.secretKey,
    secretRef: input.secretRef,
  });
}

function exposureForConfigEnvKey(key: string): DeploymentEnvironmentVariableSeed["exposure"] {
  return /^(PUBLIC_|VITE_)/.test(key) ? "build-time" : "runtime";
}

function renderConfigEnvValueTemplate(input: {
  key: string;
  value: string;
  previewContext?: DeploymentEnvironmentVariablesFromConfigOptions["previewContext"];
}): Result<string> {
  let missingVariable: "preview_id" | "pr_number" | undefined;
  const rendered = input.value.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, rawToken) => {
    const token = String(rawToken).toLowerCase();
    if (token === "preview_id") {
      const previewId = input.previewContext?.previewId.trim().toLowerCase();
      if (!previewId) {
        missingVariable = "preview_id";
        return "";
      }
      return previewId;
    }

    if (token === "pr_number") {
      const pullRequestNumber = input.previewContext?.pullRequestNumber;
      if (pullRequestNumber === undefined || pullRequestNumber === null) {
        missingVariable = "pr_number";
        return "";
      }
      return String(pullRequestNumber);
    }

    return match;
  });

  if (missingVariable) {
    return err(
      domainError.validation("Deployment config env template requires preview context", {
        phase: "config-template-resolution",
        field: `env.${input.key}`,
        variable: missingVariable,
      }),
    );
  }

  return ok(rendered);
}

export function deploymentEnvironmentVariablesFromConfig(
  config: AppaloftDeploymentConfig,
  options: DeploymentEnvironmentVariablesFromConfigOptions = {},
): Result<DeploymentEnvironmentVariableSeed[]> {
  const variables: DeploymentEnvironmentVariableSeed[] = [];

  for (const [key, value] of Object.entries(config.env ?? {}).sort(compareConfigKeys)) {
    const renderedValue = renderConfigEnvValueTemplate({
      key,
      value: String(value),
      ...(options.previewContext ? { previewContext: options.previewContext } : {}),
    });
    if (renderedValue.isErr()) {
      return err(renderedValue.error);
    }

    variables.push({
      key,
      value: renderedValue.value,
      kind: "plain-config",
      exposure: exposureForConfigEnvKey(key),
      scope: "environment",
      isSecret: false,
    });
  }

  const env = options.env ?? process.env;
  for (const [key, reference] of Object.entries(config.secrets ?? {}).sort(compareConfigKeys)) {
    const secretRef = reference.from.trim();
    const required = reference.required ?? true;

    if (secretRef.startsWith(resourceSecretReferencePrefix)) {
      continue;
    }

    if (!secretRef.startsWith(ciEnvSecretReferencePrefix)) {
      if (!required) {
        continue;
      }

      return err(
        secretResolutionError({
          message: "Deployment config secret reference uses an unsupported resolver",
          secretKey: key,
          secretRef,
        }),
      );
    }

    const envName = secretRef.slice(ciEnvSecretReferencePrefix.length).trim();
    if (!envName) {
      if (!required) {
        continue;
      }

      return err(
        secretResolutionError({
          message: "Deployment config CI secret reference is missing an environment name",
          secretKey: key,
          secretRef,
        }),
      );
    }

    const value = env[envName];
    if (value === undefined) {
      if (!required) {
        continue;
      }

      return err(
        secretResolutionError({
          message: "Required deployment config CI secret reference was not found",
          secretKey: key,
          secretRef,
        }),
      );
    }

    variables.push({
      key,
      value,
      kind: "secret",
      exposure: "runtime",
      scope: "environment",
      isSecret: true,
    });
  }

  return ok(variables);
}

function requireNonEmpty(label: string) {
  return (value: string) => (value.trim() ? null : `${label} is required`);
}

function requirePositiveInteger(label: string) {
  return (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return `${label} is required`;
    }

    const parsed = Number(trimmed);
    return Number.isInteger(parsed) && parsed > 0 ? null : `${label} must be a positive integer`;
  };
}

function findProject(projects: ProjectSummary[], name: string): ProjectSummary | undefined {
  const slug = slugify(name);
  return projects.find((project) => project.slug === slug || slugify(project.name) === slug);
}

function findServer(
  servers: ServerSummary[],
  input: { host: string; port: number; providerKey: string },
): ServerSummary | undefined {
  return servers.find(
    (server) =>
      server.host === input.host &&
      server.port === input.port &&
      server.providerKey === input.providerKey,
  );
}

function findEnvironment(
  environments: EnvironmentSummary[],
  input: { projectId: string; name: string; kind: EnvironmentKind },
): EnvironmentSummary | undefined {
  const slug = slugify(input.name);
  return environments.find(
    (environment) =>
      environment.projectId === input.projectId &&
      slugify(environment.name) === slug &&
      environment.kind === input.kind,
  );
}

function findResource(
  resources: ResourceSummary[],
  input: { projectId: string; environmentId: string; name: string },
): ResourceSummary | undefined {
  const slug = slugify(input.name);
  return resources.find(
    (resource) =>
      resource.projectId === input.projectId &&
      resource.environmentId === input.environmentId &&
      resource.slug === slug,
  );
}

function hasDomainErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function stringDomainErrorDetail(error: DomainError, key: string): string | undefined {
  const value = error.details?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function listProjects() {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(ListProjectsQuery.create());
    const result = yield* Effect.promise(() => cli.executeQuery(message));
    return yield* resultToEffect(result);
  });
}

function listServers() {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(ListServersQuery.create());
    const result = yield* Effect.promise(() => cli.executeQuery(message));
    return yield* resultToEffect(result);
  });
}

function listEnvironments(projectId?: string) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(ListEnvironmentsQuery.create({ projectId }));
    const result = yield* Effect.promise(() => cli.executeQuery(message));
    return yield* resultToEffect(result);
  });
}

function listResources(projectId?: string, environmentId?: string) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(ListResourcesQuery.create({ projectId, environmentId }));
    const result = yield* Effect.promise(() => cli.executeQuery(message));
    return yield* resultToEffect(result);
  });
}

function createProject(input: { name: string }) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(CreateProjectCommand.create(input));
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
  });
}

function createServer(input: RegisterServerCommandInput) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(RegisterServerCommand.create(input));
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
  });
}

function createSshCredential(input: CreateSshCredentialCommandInput) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(CreateSshCredentialCommand.create(input));
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
  });
}

function configureServerCredential(input: ConfigureServerCredentialCommandInput) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(ConfigureServerCredentialCommand.create(input));
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
  });
}

function prepareServerRuntime(input: {
  serverId: string;
  mode?: "prepare" | "repair" | "upgrade";
}) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(PrepareServerRuntimeCommand.create(input));
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
  });
}

function testServerConnectivity(input: { serverId: string }) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(TestServerConnectivityCommand.create(input));
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
  });
}

function serverCredentialFromSeed(
  seed: DeploymentPromptSeed,
): QuickDeployServerCredential | undefined {
  if (seed.server?.reusableSshCredential) {
    return {
      mode: "create-ssh-and-configure",
      input: seed.server.reusableSshCredential,
    };
  }

  if (seed.server?.credential) {
    return {
      mode: "configure",
      credential: seed.server.credential,
    };
  }

  return undefined;
}

function createEnvironment(input: { projectId: string; name: string; kind: EnvironmentKind }) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(CreateEnvironmentCommand.create(input));
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
  });
}

function createResource(input: CreateResourceInput) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(CreateResourceCommand.create(input));
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    const created = yield* Effect.either(resultToEffect(result));
    if (Either.isRight(created)) {
      return created.right;
    }

    if (
      hasDomainErrorCode(created.left, "resource_slug_conflict") &&
      input.projectId &&
      input.environmentId
    ) {
      const existingResourceId = stringDomainErrorDetail(created.left, "resourceId");
      if (existingResourceId) {
        return { id: existingResourceId };
      }

      const existing = findResource(
        (yield* listResources(input.projectId, input.environmentId)).items,
        {
          projectId: input.projectId,
          environmentId: input.environmentId,
          name: input.name,
        },
      );

      if (existing) {
        return { id: existing.id };
      }
    }

    return yield* Effect.fail(created.left);
  });
}

function configureResourceRuntime(input: {
  resourceId: string;
  runtimeProfile: ResourceRuntimeProfileInput;
}) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(
      ConfigureResourceRuntimeCommand.create({
        resourceId: input.resourceId,
        runtimeProfile: input.runtimeProfile,
      }),
    );
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
  });
}

function configureResourceSource(input: {
  resourceId: string;
  source: ConfigurableResourceSourceInput;
}) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(
      ConfigureResourceSourceCommand.create({
        resourceId: input.resourceId,
        source: input.source,
      }),
    );
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
  });
}

function configureResourceNetwork(input: {
  resourceId: string;
  networkProfile: ResourceNetworkProfileInput;
}) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(
      ConfigureResourceNetworkCommand.create({
        resourceId: input.resourceId,
        networkProfile: input.networkProfile,
      }),
    );
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
  });
}

function configureResourceHealth(input: {
  resourceId: string;
  healthCheck: NonNullable<ResourceRuntimeProfileInput["healthCheck"]>;
}) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(
      ConfigureResourceHealthCommand.create({
        resourceId: input.resourceId,
        healthCheck: input.healthCheck,
      }),
    );
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
  });
}

function configureResourceAccess(input: {
  resourceId: string;
  accessProfile: DeploymentGeneratedAccessProfileSeed;
}) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(
      ConfigureResourceAccessCommand.create({
        resourceId: input.resourceId,
        accessProfile: input.accessProfile,
      }),
    );
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
  });
}

function showRuntimeMonitoringThresholds(resourceId: string) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const query = yield* resultToEffect(
      ShowRuntimeMonitoringThresholdsQuery.create({
        scope: { kind: "resource", resourceId },
      }),
    );
    const result = yield* Effect.promise(() =>
      cli.executeQuery<RuntimeMonitoringThresholdsReadback>(query),
    );
    return yield* resultToEffect(result);
  });
}

function configureRuntimeMonitoringThresholds(input: {
  resourceId: string;
  thresholds: DeploymentMonitoringThresholdsSeed;
  policyId?: string;
}) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(
      ConfigureRuntimeMonitoringThresholdsCommand.create({
        ...(input.policyId ? { policyId: input.policyId } : {}),
        scope: { kind: "resource", resourceId: input.resourceId },
        enabled: input.thresholds.enabled,
        rules: input.thresholds.rules,
      }),
    );
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
  });
}

function configureRuntimePrunePolicy(input: {
  serverId: string;
  policy: DeploymentRuntimePrunePolicySeed;
}) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(
      ConfigureScheduledRuntimePrunePolicyCommand.create({
        policyId: deploymentSnapshotRuntimePrunePolicyId(input.serverId),
        version: "repository-config",
        scope: "deployment-snapshot",
        serverId: input.serverId,
        retentionDays: input.policy.retentionDays,
        destructive: input.policy.destructive,
        categories: input.policy.categories,
        retryOnFailure: input.policy.retryOnFailure,
        enabled: input.policy.enabled,
      }),
    );
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
  });
}

function showResource(resourceId: string) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(
      ShowResourceQuery.create({
        resourceId,
        includeLatestDeployment: false,
        includeAccessSummary: false,
        includeProfileDiagnostics: false,
      }),
    );
    const result = yield* Effect.promise(() => cli.executeQuery(message));
    return yield* resultToEffect(result);
  });
}

function showResourceSecretReference(input: {
  resourceId: string;
  key: string;
  exposure: "runtime";
}) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(
      ShowResourceSecretReferenceQuery.create({
        resourceId: input.resourceId,
        key: input.key,
        exposure: input.exposure,
      }),
    );
    const result = yield* Effect.promise(() => cli.executeQuery(message));
    return yield* resultToEffect(result);
  });
}

function generatedAccessProfileMatchesConfig(input: {
  current: ResourceDetail["accessProfile"] | undefined;
  desired: DeploymentGeneratedAccessProfileSeed;
}): boolean {
  return (
    input.current?.generatedAccessMode === input.desired.generatedAccessMode &&
    input.current?.pathPrefix === input.desired.pathPrefix
  );
}

function runtimeMonitoringRuleMatchesConfig(input: {
  current: RuntimeMonitoringThresholdRule | undefined;
  desired: DeploymentMonitoringThresholdRuleSeed | undefined;
}): boolean {
  return (
    input.current?.signal === input.desired?.signal &&
    input.current?.metric === input.desired?.metric &&
    input.current?.warning === input.desired?.warning &&
    input.current?.critical === input.desired?.critical &&
    input.current?.comparator === input.desired?.comparator
  );
}

function runtimeMonitoringThresholdsMatchConfig(input: {
  current: RuntimeMonitoringThresholdsReadback["policy"] | undefined | null;
  desired: DeploymentMonitoringThresholdsSeed;
  resourceId: string;
}): boolean {
  const current = input.current;
  if (
    !current ||
    current.scope.kind !== "resource" ||
    current.scope.resourceId !== input.resourceId ||
    current.enabled !== input.desired.enabled ||
    current.rules.length !== input.desired.rules.length
  ) {
    return false;
  }

  return current.rules.every((rule, index) =>
    runtimeMonitoringRuleMatchesConfig({
      current: rule,
      desired: input.desired.rules[index],
    }),
  );
}

function previewPolicyMatchesConfig(input: {
  current: PreviewPolicySummary | undefined | null;
  desired: DeploymentPreviewPolicySeed;
  projectId: string;
  resourceId: string;
}): boolean {
  const current = input.current;
  if (
    !current ||
    current.source !== "configured" ||
    current.scope.kind !== "resource" ||
    current.scope.projectId !== input.projectId ||
    current.scope.resourceId !== input.resourceId
  ) {
    return false;
  }

  return (
    current.settings.sameRepositoryPreviews === input.desired.sameRepositoryPreviews &&
    current.settings.forkPreviews === input.desired.forkPreviews &&
    current.settings.secretBackedPreviews === input.desired.secretBackedPreviews &&
    current.settings.maxActivePreviews === input.desired.maxActivePreviews &&
    current.settings.previewTtlHours === input.desired.previewTtlHours
  );
}

function sourceProfilesMatch(input: {
  current: ResourceDetail["source"] | undefined;
  desired: ConfigurableResourceSourceInput;
}): boolean {
  if (!input.current) {
    return false;
  }

  const current = {
    kind: input.current.kind,
    locator: input.current.locator,
    displayName: input.current.displayName,
    ...(input.current.gitRef ? { gitRef: input.current.gitRef } : {}),
    ...(input.current.commitSha ? { commitSha: input.current.commitSha } : {}),
    ...(input.current.baseDirectory ? { baseDirectory: input.current.baseDirectory } : {}),
  };
  const desired = {
    kind: input.desired.kind,
    locator: input.desired.locator,
    displayName: input.desired.displayName,
    ...(input.desired.gitRef ? { gitRef: input.desired.gitRef } : {}),
    ...(input.desired.commitSha ? { commitSha: input.desired.commitSha } : {}),
    ...(input.desired.baseDirectory ? { baseDirectory: input.desired.baseDirectory } : {}),
  };

  return JSON.stringify(current) === JSON.stringify(desired);
}

export function shouldConfigureReusableResourceSource(input: {
  seed: DeploymentPromptSeed;
  sourceLocator: string;
  deploymentMethod: DeploymentMethod;
}): boolean {
  return Boolean(
    input.deploymentMethod === "prebuilt-image" ||
      input.deploymentMethod === "docker-compose" ||
      isRemoteOrImageSource(input.sourceLocator) ||
      input.seed.sourceProfile?.gitRef ||
      input.seed.sourceProfile?.commitSha ||
      input.seed.sourceProfile?.baseDirectory,
  );
}

function resolveReusableResourceSource(input: {
  seed: DeploymentPromptSeed;
  resourceId: string;
  sourceLocator: string;
  deploymentMethod: DeploymentMethod;
  source: ConfigurableResourceSourceInput;
}) {
  return Effect.gen(function* () {
    if (!shouldConfigureReusableResourceSource(input)) {
      return undefined;
    }

    const resource = yield* showResource(input.resourceId);
    if (sourceProfilesMatch({ current: resource.source, desired: input.source })) {
      return undefined;
    }

    return input.source;
  });
}

function configurableRuntimeProfileFromDetail(
  runtimeProfile: ResourceDetail["runtimeProfile"] | undefined,
): ConfigurableResourceRuntimeProfileInput | undefined {
  if (!runtimeProfile) {
    return undefined;
  }

  return {
    strategy: runtimeProfile.strategy,
    ...(runtimeProfile.installCommand ? { installCommand: runtimeProfile.installCommand } : {}),
    ...(runtimeProfile.buildCommand ? { buildCommand: runtimeProfile.buildCommand } : {}),
    ...(runtimeProfile.startCommand ? { startCommand: runtimeProfile.startCommand } : {}),
    ...(runtimeProfile.runtimeName ? { runtimeName: runtimeProfile.runtimeName } : {}),
    ...(runtimeProfile.publishDirectory
      ? { publishDirectory: runtimeProfile.publishDirectory }
      : {}),
    ...(runtimeProfile.dockerfilePath ? { dockerfilePath: runtimeProfile.dockerfilePath } : {}),
    ...(runtimeProfile.dockerComposeFilePath
      ? { dockerComposeFilePath: runtimeProfile.dockerComposeFilePath }
      : {}),
    ...(runtimeProfile.buildTarget ? { buildTarget: runtimeProfile.buildTarget } : {}),
  };
}

function configurableRuntimeProfileFromDeploymentInput(
  runtimeProfile: ResourceRuntimeProfileInput,
): ConfigurableResourceRuntimeProfileInput {
  const {
    healthCheck: _healthCheck,
    healthCheckPath: _healthCheckPath,
    ...configurableRuntimeProfile
  } = runtimeProfile;

  return configurableRuntimeProfile;
}

function normalizedConfigurableRuntimeProfile(
  runtimeProfile: ConfigurableResourceRuntimeProfileInput | undefined,
): ConfigurableResourceRuntimeProfileInput | undefined {
  if (!runtimeProfile) {
    return undefined;
  }

  return {
    ...runtimeProfile,
    ...(trimToUndefined(runtimeProfile.runtimeName ?? "")
      ? { runtimeName: trimToUndefined(runtimeProfile.runtimeName ?? "") }
      : {}),
  };
}

function configurableRuntimeProfilesMatch(input: {
  current: ConfigurableResourceRuntimeProfileInput | undefined;
  desired: ConfigurableResourceRuntimeProfileInput | undefined;
}): boolean {
  return (
    JSON.stringify(normalizedConfigurableRuntimeProfile(input.current)) ===
    JSON.stringify(normalizedConfigurableRuntimeProfile(input.desired))
  );
}

function runtimeProfileUpdateForReusedResource(input: {
  currentRuntimeProfile: ResourceDetail["runtimeProfile"] | undefined;
  desiredRuntimeProfile: ResourceRuntimeProfileInput;
}): ResourceRuntimeProfileInput | undefined {
  const currentConfigurable = configurableRuntimeProfileFromDetail(input.currentRuntimeProfile);
  const desiredConfigurable = configurableRuntimeProfileFromDeploymentInput(
    input.desiredRuntimeProfile,
  );
  const currentRuntimeName = trimToUndefined(currentConfigurable?.runtimeName ?? "");
  const desiredRuntimeName = trimToUndefined(desiredConfigurable.runtimeName ?? "");
  const effectiveDesired = {
    ...(currentConfigurable ?? {}),
    ...desiredConfigurable,
    ...(desiredRuntimeName
      ? { runtimeName: desiredRuntimeName }
      : currentRuntimeName
        ? { runtimeName: currentRuntimeName }
        : {}),
  } satisfies ConfigurableResourceRuntimeProfileInput;

  if (
    configurableRuntimeProfilesMatch({
      current: currentConfigurable,
      desired: effectiveDesired,
    })
  ) {
    return undefined;
  }

  return effectiveDesired;
}

function networkProfilesMatch(input: {
  current: ResourceDetail["networkProfile"] | undefined;
  desired: ResourceNetworkProfileInput;
}): boolean {
  return JSON.stringify(input.current) === JSON.stringify(input.desired);
}

function shouldConfigureReusableResourceNetwork(seed: DeploymentPromptSeed): boolean {
  return Boolean(
    seed.port ||
      seed.upstreamProtocol ||
      seed.exposureMode ||
      seed.targetServiceName ||
      seed.hostPort,
  );
}

function resolveReusableResourceNetworkProfile(input: {
  seed: DeploymentPromptSeed;
  resourceId: string;
  networkProfile: ResourceNetworkProfileInput;
}) {
  return Effect.gen(function* () {
    if (!shouldConfigureReusableResourceNetwork(input.seed)) {
      return undefined;
    }

    const resource = yield* showResource(input.resourceId);
    if (networkProfilesMatch({ current: resource.networkProfile, desired: input.networkProfile })) {
      return undefined;
    }

    return input.networkProfile satisfies ConfigurableResourceNetworkProfileInput;
  });
}

function shouldConfigureReusableResourceRuntime(seed: DeploymentPromptSeed): boolean {
  return Boolean(
    (seed.deploymentMethod && seed.deploymentMethod !== "workspace-commands") ||
      seed.installCommand ||
      seed.buildCommand ||
      seed.startCommand ||
      seed.runtimeName ||
      seed.publishDirectory ||
      seed.dockerfilePath ||
      seed.dockerComposeFilePath ||
      seed.buildTarget,
  );
}

function resolveReusableResourceRuntimeProfile(input: {
  seed: DeploymentPromptSeed;
  resourceId: string;
  runtimeProfile: ResourceRuntimeProfileInput;
}) {
  return Effect.gen(function* () {
    if (!shouldConfigureReusableResourceRuntime(input.seed)) {
      return undefined;
    }

    const resource = yield* showResource(input.resourceId);
    return runtimeProfileUpdateForReusedResource({
      currentRuntimeProfile: resource.runtimeProfile,
      desiredRuntimeProfile: input.runtimeProfile,
    });
  });
}

function desiredHealthPolicyFromSeed(
  seed: DeploymentPromptSeed,
): NonNullable<ResourceRuntimeProfileInput["healthCheck"]> | undefined {
  if (seed.healthCheck) {
    return seed.healthCheck;
  }

  if (!seed.healthCheckPath) {
    return undefined;
  }

  return defaultHttpHealthCheckPolicy({ path: seed.healthCheckPath });
}

function healthPoliciesMatch(input: {
  current: ResourceDetail["runtimeProfile"] | undefined;
  desired: NonNullable<ResourceRuntimeProfileInput["healthCheck"]>;
}): boolean {
  const current = input.current?.healthCheck;
  return JSON.stringify(current) === JSON.stringify(input.desired);
}

function resolveReusableResourceHealthPolicy(input: {
  seed: DeploymentPromptSeed;
  resourceId: string;
}) {
  return Effect.gen(function* () {
    const desired = desiredHealthPolicyFromSeed(input.seed);
    if (!desired) {
      return undefined;
    }

    const resource = yield* showResource(input.resourceId);
    if (healthPoliciesMatch({ current: resource.runtimeProfile, desired })) {
      return undefined;
    }

    return desired;
  });
}

function setEnvironmentVariable(input: SetEnvironmentVariableCommandInput) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(SetEnvironmentVariableCommand.create(input));
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
  });
}

function provisionDependencyResources(input: QuickDeployProvisionDependencyResourcesInput) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const dependencyResourceIds: string[] = [];
    const bindingIds: string[] = [];

    for (const item of input.items) {
      const planMessage = yield* resultToEffect(
        CreateDependencyResourceProvisioningPlanCommand.create(
          item.mode === "create"
            ? {
                mode: "create",
                create: {
                  kind: item.kind,
                  projectId: input.projectId,
                  environmentId: input.environmentId,
                  name: item.name,
                  ...(item.capabilities && item.capabilities.length > 0
                    ? { capabilities: item.capabilities }
                    : {}),
                  ...(item.serverId ? { serverId: item.serverId } : {}),
                  ...(item.providerKey ? { providerKey: item.providerKey } : {}),
                  ...(item.description ? { description: item.description } : {}),
                },
              }
            : {
                mode: "reuse",
                reuse: {
                  kind: item.kind,
                  projectId: input.projectId,
                  environmentId: input.environmentId,
                  name: item.name,
                  connectionUrl: item.connectionUrl,
                  ...(item.capabilities && item.capabilities.length > 0
                    ? { capabilities: item.capabilities }
                    : {}),
                  ...(item.secretRef ? { secretRef: item.secretRef } : {}),
                  ...(item.connectionSecret ? { connectionSecret: item.connectionSecret } : {}),
                  ...(item.description ? { description: item.description } : {}),
                },
              },
        ),
      );
      const planResult = yield* Effect.promise(() => cli.executeCommand(planMessage));
      const plan = yield* resultToEffect(planResult);
      const acceptMessage = yield* resultToEffect(
        AcceptDependencyResourceProvisioningPlanCommand.create({
          planId: plan.plan.id,
          acknowledgeMutation: true,
        }),
      );
      const acceptedResult = yield* Effect.promise(() => cli.executeCommand(acceptMessage));
      const accepted = yield* resultToEffect(acceptedResult);
      const dependencyResourceId = accepted.plan.dependencyResourceId;
      if (!dependencyResourceId) {
        return yield* Effect.fail(
          domainError.validation(
            `Dependency provisioning plan ${accepted.plan.id} did not realize a resource`,
            {
              phase: "quick-deploy-dependency-provisioning",
              planId: accepted.plan.id,
            },
          ),
        );
      }

      dependencyResourceIds.push(dependencyResourceId);
      const bindingMessage = yield* resultToEffect(
        BindResourceDependencyCommand.create({
          resourceId: input.resourceId,
          dependencyResourceId,
          targetName: item.binding?.targetName ?? item.requirementId,
          ...(item.binding?.scope ? { scope: item.binding.scope } : {}),
          ...(item.binding?.injectionMode ? { injectionMode: item.binding.injectionMode } : {}),
        }),
      );
      const bindingResult = yield* Effect.promise(() => cli.executeCommand(bindingMessage));
      const binding = yield* resultToEffect(bindingResult);
      bindingIds.push(binding.id);
    }

    return {
      dependencyResourceIds,
      bindingIds,
    };
  });
}

function shortSourceFingerprintHash(sourceFingerprint: string): string {
  return new Bun.CryptoHasher("sha256").update(sourceFingerprint).digest("hex").slice(0, 10);
}

function repositoryConfigDependencyName(input: {
  dependency: DeploymentDependencySeed;
  resourceId: string;
  sourceFingerprint?: string;
}): string {
  const base =
    input.dependency.previewLifecycle === "ephemeral" && input.sourceFingerprint
      ? `preview-${shortSourceFingerprintHash(input.sourceFingerprint)}-${input.dependency.key}`
      : `${input.resourceId}-${input.dependency.key}`;

  return normalizeQuickDeployGeneratedNameBase(base);
}

function isManagedDependencyResource(
  resource: DependencyResourceSummary | undefined,
  dependency: DeploymentDependencySeed,
): resource is DependencyResourceSummary {
  return Boolean(
    resource &&
      resource.kind === dependency.kind &&
      !resource.deletedAt &&
      (resource.providerManaged || resource.sourceMode === "appaloft-managed"),
  );
}

function isReadyManagedDependencyResource(
  resource: DependencyResourceSummary | undefined,
  dependency: DeploymentDependencySeed,
): boolean {
  return Boolean(
    isManagedDependencyResource(resource, dependency) &&
      resource.lifecycleStatus === "ready" &&
      resource.bindingReadiness.status === "ready" &&
      (resource.sourceMode !== "appaloft-managed" ||
        !resource.providerManaged ||
        resource.providerRealization?.status === "ready"),
  );
}

function findDependencyResourceById(
  resources: readonly DependencyResourceSummary[],
  dependencyResourceId: string,
): DependencyResourceSummary | undefined {
  return resources.find((resource) => resource.id === dependencyResourceId);
}

function findManagedDependencyResourceByName(input: {
  resources: readonly DependencyResourceSummary[];
  dependency: DeploymentDependencySeed;
  name: string;
}): DependencyResourceSummary | undefined {
  const slug = slugify(input.name);
  return input.resources.find(
    (resource) =>
      isManagedDependencyResource(resource, input.dependency) &&
      (resource.slug === slug || slugify(resource.name) === slug),
  );
}

function repositoryConfigDependencyConflict(input: {
  dependency: DeploymentDependencySeed;
  resourceId: string;
  targetName: string;
  existingBinding: ResourceDependencyBindingSummary;
  expectedDependencyResourceId?: string;
}): DomainError {
  return {
    code: "repository_config_dependency_binding_conflict",
    category: "user",
    message: "Repository config dependency target is already bound to another dependency",
    retryable: false,
    details: {
      phase: "config-dependency-resolution",
      resourceId: input.resourceId,
      dependencyKey: input.dependency.key,
      targetName: input.targetName,
      existingBindingId: input.existingBinding.id,
      existingDependencyResourceId: input.existingBinding.dependencyResourceId,
      ...(input.expectedDependencyResourceId
        ? { expectedDependencyResourceId: input.expectedDependencyResourceId }
        : {}),
    },
  };
}

function repositoryConfigDependencyResourceConflict(input: {
  dependency: DeploymentDependencySeed;
  resourceId: string;
  targetName: string;
  dependencyResource: DependencyResourceSummary;
  sourceFingerprint?: string;
}): DomainError {
  return {
    code: "repository_config_dependency_resource_conflict",
    category: "user",
    message: "Repository config dependency resource exists without matching provenance",
    retryable: false,
    details: {
      phase: "config-dependency-resolution",
      resourceId: input.resourceId,
      dependencyKey: input.dependency.key,
      targetName: input.targetName,
      dependencyResourceId: input.dependencyResource.id,
      ...(input.sourceFingerprint ? { sourceFingerprint: input.sourceFingerprint } : {}),
    },
  };
}

function repositoryConfigDependencyProvenanceError(input: {
  dependency: DeploymentDependencySeed;
  sourceFingerprint: string;
  resourceId: string;
  targetName: string;
}): DomainError {
  return {
    code: "repository_config_dependency_provenance_unavailable",
    category: "user",
    message: "Preview dependency cleanup provenance could not be recorded",
    retryable: false,
    details: {
      phase: "config-dependency-resolution",
      sourceFingerprint: input.sourceFingerprint,
      resourceId: input.resourceId,
      dependencyKey: input.dependency.key,
      targetName: input.targetName,
    },
  };
}

function listDependencyResourcesForConfig(input: {
  projectId: string;
  environmentId: string;
  kind: DeploymentDependencySeed["kind"];
}) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(
      ListDependencyResourcesQuery.create({
        projectId: input.projectId,
        environmentId: input.environmentId,
        kind: input.kind,
        limit: 100,
      }),
    );
    const result = yield* Effect.promise(() => cli.executeQuery(message));
    return yield* resultToEffect(result);
  });
}

function listResourceDependencyBindingsForConfig(resourceId: string) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(
      ListResourceDependencyBindingsQuery.create({
        resourceId,
      }),
    );
    const result = yield* Effect.promise(() => cli.executeQuery(message));
    return yield* resultToEffect(result);
  });
}

function provisionRepositoryConfigDependency(input: {
  dependency: DeploymentDependencySeed;
  projectId: string;
  environmentId: string;
  serverId: string;
  name: string;
}) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(
      ProvisionDependencyResourceCommand.create({
        kind: input.dependency.kind,
        projectId: input.projectId,
        environmentId: input.environmentId,
        serverId: input.serverId,
        name: input.name,
      }),
    );
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
  });
}

function deleteRepositoryConfigDependency(input: { dependencyResourceId: string }) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(
      DeleteDependencyResourceCommand.create({
        dependencyResourceId: input.dependencyResourceId,
      }),
    );
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
  });
}

function bindRepositoryConfigDependency(input: {
  resourceId: string;
  dependencyResourceId: string;
  targetName: string;
}) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(
      BindResourceDependencyCommand.create({
        resourceId: input.resourceId,
        dependencyResourceId: input.dependencyResourceId,
        targetName: input.targetName,
        scope: "runtime-only",
        injectionMode: "env",
      }),
    );
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
  });
}

function repositoryConfigDependencyBackupPolicyId(dependencyResourceId: string): string {
  return `dbp_cfg_${new Bun.CryptoHasher("sha256")
    .update(`repository-config:${dependencyResourceId}`)
    .digest("hex")
    .slice(0, 24)}`;
}

function dependencyBackupPolicyMatchesConfig(
  current: DependencyResourceBackupPolicyRead,
  desired: DeploymentDependencyBackupPolicySeed,
): boolean {
  if (!desired.enabled) {
    return current.enabled === false;
  }
  if (!desired.intervalHours || !desired.retentionDays) {
    return false;
  }
  return (
    current.enabled === true &&
    current.scheduleIntervalHours === desired.intervalHours &&
    current.retentionDays === desired.retentionDays &&
    current.retryOnFailure === desired.retryOnFailure &&
    current.providerKey === null
  );
}

function repositoryConfigDependencyBackupPolicyConflict(input: {
  dependency: DeploymentDependencySeed;
  dependencyResourceId: string;
  existingPolicy: DependencyResourceBackupPolicyRead;
}): DomainError {
  return {
    code: "repository_config_dependency_backup_policy_conflict",
    category: "user",
    message: "Repository config dependency backup policy would mutate a manual policy",
    retryable: false,
    details: {
      phase: "config-dependency-backup-resolution",
      dependencyKey: input.dependency.key,
      dependencyResourceId: input.dependencyResourceId,
      existingPolicyId: input.existingPolicy.id,
    },
  };
}

function repositoryConfigDependencyBackupPolicyError(input: {
  dependency: DeploymentDependencySeed;
  dependencyResourceId: string;
  reason: string;
}) {
  return domainError.validation("Repository config dependency backup policy is invalid", {
    phase: "config-dependency-backup-resolution",
    dependencyKey: input.dependency.key,
    dependencyResourceId: input.dependencyResourceId,
    reason: input.reason,
  });
}

function listDependencyBackupPoliciesForConfig(dependencyResourceId: string) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(
      ListDependencyResourceBackupPoliciesQuery.create({
        dependencyResourceId,
      }),
    );
    const result = yield* Effect.promise(() => cli.executeQuery(message));
    return yield* resultToEffect(result);
  });
}

function configureRepositoryConfigDependencyBackupPolicy(input: {
  dependency: DeploymentDependencySeed;
  dependencyResourceId: string;
  policyId: string;
  currentPolicy?: DependencyResourceBackupPolicyRead;
}) {
  return Effect.gen(function* () {
    const desired = input.dependency.backupPolicy;
    if (!desired) {
      return;
    }
    if (desired.enabled && (!desired.intervalHours || !desired.retentionDays)) {
      return yield* Effect.fail(
        repositoryConfigDependencyBackupPolicyError({
          dependency: input.dependency,
          dependencyResourceId: input.dependencyResourceId,
          reason: "interval_and_retention_required",
        }),
      );
    }

    const retentionDays = desired.enabled
      ? (desired.retentionDays as number)
      : input.currentPolicy?.retentionDays;
    const scheduleIntervalHours = desired.enabled
      ? (desired.intervalHours as number)
      : input.currentPolicy?.scheduleIntervalHours;
    if (!retentionDays || !scheduleIntervalHours) {
      return;
    }

    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(
      ConfigureDependencyResourceBackupPolicyCommand.create({
        policyId: input.policyId,
        dependencyResourceId: input.dependencyResourceId,
        retentionDays,
        scheduleIntervalHours,
        retryOnFailure: desired.retryOnFailure,
        enabled: desired.enabled,
      }),
    );
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    yield* resultToEffect(result);
  });
}

function ensureRepositoryConfigDependencyBackupPolicy(input: {
  dependency: DeploymentDependencySeed;
  dependencyResourceId: string;
}) {
  return Effect.gen(function* () {
    const desired = input.dependency.backupPolicy;
    if (!desired) {
      return;
    }

    const policyId = repositoryConfigDependencyBackupPolicyId(input.dependencyResourceId);
    const policies = yield* listDependencyBackupPoliciesForConfig(input.dependencyResourceId);
    const ownedPolicy = policies.items.find((policy) => policy.id === policyId);

    if (ownedPolicy && dependencyBackupPolicyMatchesConfig(ownedPolicy, desired)) {
      return;
    }

    if (!ownedPolicy) {
      const matchingManualPolicy = policies.items.find((policy) =>
        dependencyBackupPolicyMatchesConfig(policy, desired),
      );
      if (matchingManualPolicy || !desired.enabled) {
        return;
      }
      const manualPolicy = policies.items[0];
      if (manualPolicy) {
        return yield* Effect.fail(
          repositoryConfigDependencyBackupPolicyConflict({
            dependency: input.dependency,
            dependencyResourceId: input.dependencyResourceId,
            existingPolicy: manualPolicy,
          }),
        );
      }
    }

    yield* configureRepositoryConfigDependencyBackupPolicy({
      dependency: input.dependency,
      dependencyResourceId: input.dependencyResourceId,
      policyId,
      ...(ownedPolicy ? { currentPolicy: ownedPolicy } : {}),
    });
  });
}

function buildDependencyProvenance(input: {
  sourceFingerprint: string;
  existing?: SourceLinkDependencyProvenance;
  entries: SourceLinkDependencyProvenanceEntry[];
}): SourceLinkDependencyProvenance {
  const byKey = new Map<string, SourceLinkDependencyProvenanceEntry>();
  for (const entry of input.existing?.entries ?? []) {
    byKey.set(`${entry.key}:${entry.targetName}`, entry);
  }
  for (const entry of input.entries) {
    byKey.set(`${entry.key}:${entry.targetName}`, entry);
  }

  return {
    schemaVersion: "source-link.dependency-provenance/v1",
    source: "repository-config",
    sourceFingerprint: input.sourceFingerprint,
    entries: [...byKey.values()].sort((left, right) => left.key.localeCompare(right.key)),
  };
}

function ensureRepositoryConfigDependencies(input: {
  seed: DeploymentPromptSeed;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId?: string;
}) {
  return Effect.gen(function* () {
    const dependencyGraph = input.seed.dependencyGraph ?? [];
    if (dependencyGraph.length === 0) {
      return;
    }

    const cli = yield* CliRuntime;
    const provenanceRequiredDependency = dependencyGraph.find(
      (dependency) => dependency.previewLifecycle === "ephemeral" && input.seed.sourceFingerprint,
    );
    if (provenanceRequiredDependency && !cli.sourceLinkStore?.recordDependencyProvenance) {
      return yield* Effect.fail(
        repositoryConfigDependencyProvenanceError({
          dependency: provenanceRequiredDependency,
          sourceFingerprint: input.seed.sourceFingerprint ?? "",
          resourceId: input.resourceId,
          targetName: provenanceRequiredDependency.bindEnv,
        }),
      );
    }

    const target = {
      projectId: input.projectId,
      environmentId: input.environmentId,
      resourceId: input.resourceId,
      serverId: input.serverId,
      ...(input.destinationId ? { destinationId: input.destinationId } : {}),
    };
    let existingSourceLink: SourceLinkRecord | null = null;
    if (input.seed.sourceFingerprint) {
      const existingSourceLinkResult = yield* Effect.promise(
        () =>
          cli.sourceLinkStore?.read(input.seed.sourceFingerprint ?? "") ??
          Promise.resolve(ok(null)),
      );
      existingSourceLink = yield* resultToEffect(existingSourceLinkResult);
    }
    const bindingsResult = yield* listResourceDependencyBindingsForConfig(input.resourceId);
    const bindings = [...bindingsResult.items];
    const provenanceEntries: SourceLinkDependencyProvenanceEntry[] = [];

    for (const dependency of dependencyGraph) {
      const targetName = dependency.bindEnv;
      const resourceName = repositoryConfigDependencyName({
        dependency,
        resourceId: input.resourceId,
        ...(input.seed.sourceFingerprint
          ? { sourceFingerprint: input.seed.sourceFingerprint }
          : {}),
      });
      const dependencyResourcesResult = yield* listDependencyResourcesForConfig({
        projectId: input.projectId,
        environmentId: input.environmentId,
        kind: dependency.kind,
      });
      const dependencyResources = [...dependencyResourcesResult.items];
      const existingProvenanceEntry =
        existingSourceLink &&
        input.seed.sourceFingerprint &&
        existingSourceLink.dependencyProvenance?.sourceFingerprint === input.seed.sourceFingerprint
          ? existingSourceLink.dependencyProvenance.entries.find(
              (entry) =>
                entry.key === dependency.key &&
                entry.targetName === targetName &&
                entry.resourceId === input.resourceId,
            )
          : undefined;
      const activeTargetBinding = bindings.find(
        (binding) => binding.status === "active" && binding.target.targetName === targetName,
      );
      const isEphemeralPreviewDependency = Boolean(
        dependency.previewLifecycle === "ephemeral" && input.seed.sourceFingerprint,
      );
      const provenanceResource = existingProvenanceEntry
        ? findDependencyResourceById(
            dependencyResources,
            existingProvenanceEntry.dependencyResourceId,
          )
        : undefined;
      const namedResource = findManagedDependencyResourceByName({
        resources: dependencyResources,
        dependency,
        name: resourceName,
      });
      let dependencyResource = isManagedDependencyResource(provenanceResource, dependency)
        ? provenanceResource
        : isEphemeralPreviewDependency
          ? undefined
          : namedResource;

      if (
        isEphemeralPreviewDependency &&
        existingProvenanceEntry &&
        provenanceResource &&
        !isReadyManagedDependencyResource(provenanceResource, dependency) &&
        (!activeTargetBinding || activeTargetBinding.dependencyResourceId === provenanceResource.id)
      ) {
        if (activeTargetBinding) {
          return yield* Effect.fail(
            repositoryConfigDependencyConflict({
              dependency,
              resourceId: input.resourceId,
              targetName,
              existingBinding: activeTargetBinding,
              expectedDependencyResourceId: provenanceResource.id,
            }),
          );
        }

        yield* deleteRepositoryConfigDependency({
          dependencyResourceId: provenanceResource.id,
        });
        dependencyResource = undefined;
      }

      if (isEphemeralPreviewDependency && !existingProvenanceEntry && namedResource) {
        return yield* Effect.fail(
          repositoryConfigDependencyResourceConflict({
            dependency,
            resourceId: input.resourceId,
            targetName,
            dependencyResource: namedResource,
            ...(input.seed.sourceFingerprint
              ? { sourceFingerprint: input.seed.sourceFingerprint }
              : {}),
          }),
        );
      }

      if (isEphemeralPreviewDependency && !existingProvenanceEntry && activeTargetBinding) {
        return yield* Effect.fail(
          repositoryConfigDependencyConflict({
            dependency,
            resourceId: input.resourceId,
            targetName,
            existingBinding: activeTargetBinding,
          }),
        );
      }

      if (
        isEphemeralPreviewDependency &&
        existingProvenanceEntry &&
        namedResource &&
        namedResource.id !== existingProvenanceEntry.dependencyResourceId &&
        !provenanceResource
      ) {
        return yield* Effect.fail(
          repositoryConfigDependencyResourceConflict({
            dependency,
            resourceId: input.resourceId,
            targetName,
            dependencyResource: namedResource,
            ...(input.seed.sourceFingerprint
              ? { sourceFingerprint: input.seed.sourceFingerprint }
              : {}),
          }),
        );
      }

      if (!dependencyResource && activeTargetBinding) {
        const activeBindingResource = findDependencyResourceById(
          dependencyResources,
          activeTargetBinding.dependencyResourceId,
        );
        if (
          dependency.previewLifecycle !== "ephemeral" &&
          isManagedDependencyResource(activeBindingResource, dependency)
        ) {
          dependencyResource = activeBindingResource;
        }
      }

      if (!dependencyResource) {
        const provisioned = yield* provisionRepositoryConfigDependency({
          dependency,
          projectId: input.projectId,
          environmentId: input.environmentId,
          serverId: input.serverId,
          name: resourceName,
        });
        dependencyResource = {
          id: provisioned.id,
          projectId: input.projectId,
          environmentId: input.environmentId,
          name: resourceName,
          slug: slugify(resourceName),
          kind: dependency.kind,
          sourceMode: "appaloft-managed",
          providerKey: "",
          providerManaged: true,
          lifecycleStatus: "provisioning",
          desiredCapabilities: [],
          capabilityReadbacks: [],
          bindingReadiness: { status: "blocked", reason: "provisioning" },
          createdAt: new Date().toISOString(),
        } satisfies DependencyResourceSummary;
        dependencyResources.push(dependencyResource);
      }

      if (
        activeTargetBinding &&
        activeTargetBinding.dependencyResourceId !== dependencyResource.id
      ) {
        return yield* Effect.fail(
          repositoryConfigDependencyConflict({
            dependency,
            resourceId: input.resourceId,
            targetName,
            existingBinding: activeTargetBinding,
            expectedDependencyResourceId: dependencyResource.id,
          }),
        );
      }

      yield* ensureRepositoryConfigDependencyBackupPolicy({
        dependency,
        dependencyResourceId: dependencyResource.id,
      });

      const binding = activeTargetBinding
        ? { id: activeTargetBinding.id }
        : yield* bindRepositoryConfigDependency({
            resourceId: input.resourceId,
            dependencyResourceId: dependencyResource.id,
            targetName,
          });
      if (!activeTargetBinding) {
        bindings.push({
          id: binding.id,
          projectId: input.projectId,
          environmentId: input.environmentId,
          resourceId: input.resourceId,
          dependencyResourceId: dependencyResource.id,
          kind: dependency.kind,
          sourceMode: "appaloft-managed",
          providerKey: dependencyResource.providerKey,
          providerManaged: true,
          lifecycleStatus: dependencyResource.lifecycleStatus,
          target: {
            targetName,
            scope: "runtime-only",
            injectionMode: "env",
          },
          bindingReadiness: { status: "ready" },
          snapshotReadiness: { status: "deferred" },
          status: "active",
          createdAt: new Date().toISOString(),
        });
      }

      if (dependency.previewLifecycle === "ephemeral" && input.seed.sourceFingerprint) {
        provenanceEntries.push({
          key: dependency.key,
          kind: dependency.kind,
          source: dependency.source,
          lifecycle: dependency.previewLifecycle,
          resourceId: input.resourceId,
          dependencyResourceId: dependencyResource.id,
          bindingId: binding.id,
          targetName,
          createdAt: existingProvenanceEntry?.createdAt ?? new Date().toISOString(),
        });
      }
    }

    if (provenanceEntries.length === 0 || !input.seed.sourceFingerprint) {
      return;
    }

    if (!cli.sourceLinkStore?.recordDependencyProvenance) {
      return yield* Effect.fail(
        repositoryConfigDependencyProvenanceError({
          dependency: dependencyGraph[0] as DeploymentDependencySeed,
          sourceFingerprint: input.seed.sourceFingerprint,
          resourceId: input.resourceId,
          targetName: provenanceEntries[0]?.targetName ?? "",
        }),
      );
    }

    const provenance = buildDependencyProvenance({
      sourceFingerprint: input.seed.sourceFingerprint,
      entries: provenanceEntries,
      ...(existingSourceLink?.dependencyProvenance
        ? { existing: existingSourceLink.dependencyProvenance }
        : {}),
    });
    const persisted = yield* Effect.promise(
      () =>
        cli.sourceLinkStore?.recordDependencyProvenance?.({
          sourceFingerprint: input.seed.sourceFingerprint ?? "",
          target,
          dependencyProvenance: provenance,
          updatedAt: new Date().toISOString(),
        }) ?? Promise.resolve(ok(null as never)),
    );
    yield* resultToEffect(persisted);
  });
}

function repositoryConfigStorageName(input: {
  storage: DeploymentStorageSeed;
  resourceId: string;
  sourceFingerprint?: string;
}): string {
  const base =
    input.storage.previewLifecycle === "ephemeral" && input.sourceFingerprint
      ? `preview-${shortSourceFingerprintHash(input.sourceFingerprint)}-${input.storage.key}`
      : `${input.resourceId}-${input.storage.key}`;

  return normalizeQuickDeployGeneratedNameBase(base);
}

function isManagedStorageVolume(
  storageVolume: StorageVolumeSummary | undefined,
): storageVolume is StorageVolumeSummary {
  return Boolean(
    storageVolume &&
      storageVolume.kind === "named-volume" &&
      storageVolume.lifecycleStatus === "active" &&
      !storageVolume.deletedAt &&
      !storageVolume.sourcePath,
  );
}

function findStorageVolumeById(
  storageVolumes: readonly StorageVolumeSummary[],
  storageVolumeId: string,
): StorageVolumeSummary | undefined {
  return storageVolumes.find((storageVolume) => storageVolume.id === storageVolumeId);
}

function findManagedStorageVolumeByName(input: {
  storageVolumes: readonly StorageVolumeSummary[];
  name: string;
}): StorageVolumeSummary | undefined {
  const slug = slugify(input.name);
  return input.storageVolumes.find(
    (storageVolume) =>
      isManagedStorageVolume(storageVolume) &&
      (storageVolume.slug === slug || slugify(storageVolume.name) === slug),
  );
}

function repositoryConfigStorageAttachmentConflict(input: {
  storage: DeploymentStorageSeed;
  resourceId: string;
  existingAttachment: NonNullable<ResourceDetail["storageAttachments"]>[number];
  expectedStorageVolumeId?: string;
}): DomainError {
  return {
    code: "repository_config_storage_attachment_conflict",
    category: "user",
    message: "Repository config storage mount path is already attached to another storage volume",
    retryable: false,
    details: {
      phase: "config-storage-resolution",
      resourceId: input.resourceId,
      storageKey: input.storage.key,
      destinationPath: input.storage.mountPath,
      mountMode: input.storage.mountMode,
      existingAttachmentId: input.existingAttachment.id,
      existingStorageVolumeId: input.existingAttachment.storageVolumeId,
      existingMountMode: input.existingAttachment.mountMode,
      ...(input.expectedStorageVolumeId
        ? { expectedStorageVolumeId: input.expectedStorageVolumeId }
        : {}),
    },
  };
}

function repositoryConfigStorageVolumeConflict(input: {
  storage: DeploymentStorageSeed;
  resourceId: string;
  storageVolume: StorageVolumeSummary;
  sourceFingerprint?: string;
}): DomainError {
  return {
    code: "repository_config_storage_volume_conflict",
    category: "user",
    message: "Repository config storage volume exists without matching provenance",
    retryable: false,
    details: {
      phase: "config-storage-resolution",
      resourceId: input.resourceId,
      storageKey: input.storage.key,
      destinationPath: input.storage.mountPath,
      storageVolumeId: input.storageVolume.id,
      ...(input.sourceFingerprint ? { sourceFingerprint: input.sourceFingerprint } : {}),
    },
  };
}

function repositoryConfigStorageProvenanceError(input: {
  storage: DeploymentStorageSeed;
  sourceFingerprint: string;
  resourceId: string;
}): DomainError {
  return {
    code: "repository_config_storage_provenance_unavailable",
    category: "user",
    message: "Preview storage cleanup provenance could not be recorded",
    retryable: false,
    details: {
      phase: "config-storage-resolution",
      sourceFingerprint: input.sourceFingerprint,
      resourceId: input.resourceId,
      storageKey: input.storage.key,
      destinationPath: input.storage.mountPath,
    },
  };
}

function repositoryConfigStorageDuplicatePathError(input: {
  storage: DeploymentStorageSeed;
  conflictingStorageKey: string;
}): DomainError {
  return domainError.validation("Repository config storage mount path is declared more than once", {
    phase: "config-storage-resolution",
    storageKey: input.storage.key,
    conflictingStorageKey: input.conflictingStorageKey,
    destinationPath: input.storage.mountPath,
  });
}

function listStorageVolumesForConfig(input: { projectId: string; environmentId: string }) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(
      ListStorageVolumesQuery.create({
        projectId: input.projectId,
        environmentId: input.environmentId,
      }),
    );
    const result = yield* Effect.promise(() => cli.executeQuery(message));
    return yield* resultToEffect(result);
  });
}

function createRepositoryConfigStorageVolume(input: {
  projectId: string;
  environmentId: string;
  name: string;
}) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(
      CreateStorageVolumeCommand.create({
        projectId: input.projectId,
        environmentId: input.environmentId,
        name: input.name,
        kind: "named-volume",
        backupRelationship: {
          retentionRequired: false,
        },
      }),
    );
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
  });
}

function attachRepositoryConfigStorage(input: {
  resourceId: string;
  storageVolumeId: string;
  destinationPath: string;
  mountMode: DeploymentStorageSeed["mountMode"];
}) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(
      AttachResourceStorageCommand.create({
        resourceId: input.resourceId,
        storageVolumeId: input.storageVolumeId,
        destinationPath: input.destinationPath,
        mountMode: input.mountMode,
      }),
    );
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
  });
}

function buildStorageProvenance(input: {
  sourceFingerprint: string;
  existing?: SourceLinkStorageProvenance;
  entries: SourceLinkStorageProvenanceEntry[];
}): SourceLinkStorageProvenance {
  const byKey = new Map<string, SourceLinkStorageProvenanceEntry>();
  for (const entry of input.existing?.entries ?? []) {
    byKey.set(`${entry.key}:${entry.destinationPath}`, entry);
  }
  for (const entry of input.entries) {
    byKey.set(`${entry.key}:${entry.destinationPath}`, entry);
  }

  return {
    schemaVersion: "source-link.storage-provenance/v1",
    source: "repository-config",
    sourceFingerprint: input.sourceFingerprint,
    entries: [...byKey.values()].sort((left, right) => left.key.localeCompare(right.key)),
  };
}

function ensureRepositoryConfigStorage(input: {
  seed: DeploymentPromptSeed;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId?: string;
}) {
  return Effect.gen(function* () {
    const storageGraph = input.seed.storageGraph ?? [];
    if (storageGraph.length === 0) {
      return;
    }

    const seenMountPaths = new Map<string, string>();
    for (const storage of storageGraph) {
      const existingKey = seenMountPaths.get(storage.mountPath);
      if (existingKey) {
        return yield* Effect.fail(
          repositoryConfigStorageDuplicatePathError({
            storage,
            conflictingStorageKey: existingKey,
          }),
        );
      }
      seenMountPaths.set(storage.mountPath, storage.key);
    }

    const cli = yield* CliRuntime;
    const provenanceRequiredStorage = storageGraph.find(
      (storage) => storage.previewLifecycle === "ephemeral" && input.seed.sourceFingerprint,
    );
    if (provenanceRequiredStorage && !cli.sourceLinkStore?.recordStorageProvenance) {
      return yield* Effect.fail(
        repositoryConfigStorageProvenanceError({
          storage: provenanceRequiredStorage,
          sourceFingerprint: input.seed.sourceFingerprint ?? "",
          resourceId: input.resourceId,
        }),
      );
    }

    const target = {
      projectId: input.projectId,
      environmentId: input.environmentId,
      resourceId: input.resourceId,
      serverId: input.serverId,
      ...(input.destinationId ? { destinationId: input.destinationId } : {}),
    };
    let existingSourceLink: SourceLinkRecord | null = null;
    if (input.seed.sourceFingerprint) {
      const existingSourceLinkResult = yield* Effect.promise(
        () =>
          cli.sourceLinkStore?.read(input.seed.sourceFingerprint ?? "") ??
          Promise.resolve(ok(null)),
      );
      existingSourceLink = yield* resultToEffect(existingSourceLinkResult);
    }

    const resource = yield* showResource(input.resourceId);
    const attachments = [...(resource.storageAttachments ?? [])];
    const storageVolumesResult = yield* listStorageVolumesForConfig({
      projectId: input.projectId,
      environmentId: input.environmentId,
    });
    const storageVolumes = [...storageVolumesResult.items];
    const provenanceEntries: SourceLinkStorageProvenanceEntry[] = [];

    for (const storage of storageGraph) {
      const volumeName = repositoryConfigStorageName({
        storage,
        resourceId: input.resourceId,
        ...(input.seed.sourceFingerprint
          ? { sourceFingerprint: input.seed.sourceFingerprint }
          : {}),
      });
      const existingProvenanceEntry =
        existingSourceLink &&
        input.seed.sourceFingerprint &&
        existingSourceLink.storageProvenance?.sourceFingerprint === input.seed.sourceFingerprint
          ? existingSourceLink.storageProvenance.entries.find(
              (entry) =>
                entry.key === storage.key &&
                entry.destinationPath === storage.mountPath &&
                entry.resourceId === input.resourceId,
            )
          : undefined;
      const activeMountAttachment = attachments.find(
        (attachment) => attachment.destinationPath === storage.mountPath,
      );
      const isEphemeralPreviewStorage = Boolean(
        storage.previewLifecycle === "ephemeral" && input.seed.sourceFingerprint,
      );
      const provenanceVolume = existingProvenanceEntry
        ? findStorageVolumeById(storageVolumes, existingProvenanceEntry.storageVolumeId)
        : undefined;
      const namedVolume = findManagedStorageVolumeByName({
        storageVolumes,
        name: volumeName,
      });
      let storageVolume = isManagedStorageVolume(provenanceVolume)
        ? provenanceVolume
        : isEphemeralPreviewStorage
          ? undefined
          : namedVolume;

      if (isEphemeralPreviewStorage && !existingProvenanceEntry && namedVolume) {
        return yield* Effect.fail(
          repositoryConfigStorageVolumeConflict({
            storage,
            resourceId: input.resourceId,
            storageVolume: namedVolume,
            ...(input.seed.sourceFingerprint
              ? { sourceFingerprint: input.seed.sourceFingerprint }
              : {}),
          }),
        );
      }

      if (isEphemeralPreviewStorage && !existingProvenanceEntry && activeMountAttachment) {
        return yield* Effect.fail(
          repositoryConfigStorageAttachmentConflict({
            storage,
            resourceId: input.resourceId,
            existingAttachment: activeMountAttachment,
          }),
        );
      }

      if (
        isEphemeralPreviewStorage &&
        existingProvenanceEntry &&
        namedVolume &&
        namedVolume.id !== existingProvenanceEntry.storageVolumeId &&
        !provenanceVolume
      ) {
        return yield* Effect.fail(
          repositoryConfigStorageVolumeConflict({
            storage,
            resourceId: input.resourceId,
            storageVolume: namedVolume,
            ...(input.seed.sourceFingerprint
              ? { sourceFingerprint: input.seed.sourceFingerprint }
              : {}),
          }),
        );
      }

      if (!storageVolume) {
        const created = yield* createRepositoryConfigStorageVolume({
          projectId: input.projectId,
          environmentId: input.environmentId,
          name: volumeName,
        });
        storageVolume = {
          id: created.id,
          projectId: input.projectId,
          environmentId: input.environmentId,
          name: volumeName,
          slug: slugify(volumeName),
          kind: "named-volume",
          lifecycleStatus: "active",
          attachmentCount: 0,
          attachments: [],
          createdAt: new Date().toISOString(),
        } satisfies StorageVolumeSummary;
        storageVolumes.push(storageVolume);
      }

      if (
        activeMountAttachment &&
        (activeMountAttachment.storageVolumeId !== storageVolume.id ||
          activeMountAttachment.mountMode !== storage.mountMode)
      ) {
        return yield* Effect.fail(
          repositoryConfigStorageAttachmentConflict({
            storage,
            resourceId: input.resourceId,
            existingAttachment: activeMountAttachment,
            expectedStorageVolumeId: storageVolume.id,
          }),
        );
      }

      const attachment = activeMountAttachment
        ? { id: activeMountAttachment.id }
        : yield* attachRepositoryConfigStorage({
            resourceId: input.resourceId,
            storageVolumeId: storageVolume.id,
            destinationPath: storage.mountPath,
            mountMode: storage.mountMode,
          });
      if (!activeMountAttachment) {
        attachments.push({
          id: attachment.id,
          storageVolumeId: storageVolume.id,
          storageVolumeName: storageVolume.name,
          storageVolumeKind: storageVolume.kind,
          destinationPath: storage.mountPath,
          mountMode: storage.mountMode,
          attachedAt: new Date().toISOString(),
        });
      }

      if (storage.previewLifecycle === "ephemeral" && input.seed.sourceFingerprint) {
        provenanceEntries.push({
          key: storage.key,
          kind: storage.kind,
          source: storage.source,
          lifecycle: storage.previewLifecycle,
          resourceId: input.resourceId,
          storageVolumeId: storageVolume.id,
          attachmentId: attachment.id,
          destinationPath: storage.mountPath,
          createdAt: existingProvenanceEntry?.createdAt ?? new Date().toISOString(),
        });
      }
    }

    if (provenanceEntries.length === 0 || !input.seed.sourceFingerprint) {
      return;
    }

    if (!cli.sourceLinkStore?.recordStorageProvenance) {
      return yield* Effect.fail(
        repositoryConfigStorageProvenanceError({
          storage: storageGraph[0] as DeploymentStorageSeed,
          sourceFingerprint: input.seed.sourceFingerprint,
          resourceId: input.resourceId,
        }),
      );
    }

    const provenance = buildStorageProvenance({
      sourceFingerprint: input.seed.sourceFingerprint,
      entries: provenanceEntries,
      ...(existingSourceLink?.storageProvenance
        ? { existing: existingSourceLink.storageProvenance }
        : {}),
    });
    const persisted = yield* Effect.promise(
      () =>
        cli.sourceLinkStore?.recordStorageProvenance?.({
          sourceFingerprint: input.seed.sourceFingerprint ?? "",
          target,
          storageProvenance: provenance,
          updatedAt: new Date().toISOString(),
        }) ?? Promise.resolve(ok(null as never)),
    );
    yield* resultToEffect(persisted);
  });
}

function scheduledTaskCommandFingerprint(task: DeploymentScheduledTaskSeed): string {
  return new Bun.CryptoHasher("sha256")
    .update(
      [
        task.schedule,
        task.timezone,
        task.command,
        String(task.timeoutSeconds),
        String(task.retryLimit),
        task.concurrencyPolicy,
        task.status,
      ].join("\0"),
    )
    .digest("hex");
}

function repositoryConfigScheduledTaskProvenanceError(input: {
  task: DeploymentScheduledTaskSeed;
  sourceFingerprint?: string;
  resourceId: string;
}): DomainError {
  return {
    code: "repository_config_scheduled_task_provenance_unavailable",
    category: "user",
    message: "Repository config scheduled task provenance could not be recorded",
    retryable: false,
    details: {
      phase: "config-scheduled-task-resolution",
      resourceId: input.resourceId,
      taskKey: input.task.key,
      ...(input.sourceFingerprint ? { sourceFingerprint: input.sourceFingerprint } : {}),
    },
  };
}

function repositoryConfigScheduledTaskConflict(input: {
  task: DeploymentScheduledTaskSeed;
  resourceId: string;
  sourceFingerprint: string;
  existingTaskId?: string;
  existingResourceId?: string;
  provenanceSourceFingerprint?: string;
}): DomainError {
  return {
    code: "repository_config_scheduled_task_conflict",
    category: "user",
    message: "Repository config scheduled task provenance points at another context",
    retryable: false,
    details: {
      phase: "config-scheduled-task-resolution",
      resourceId: input.resourceId,
      taskKey: input.task.key,
      sourceFingerprint: input.sourceFingerprint,
      ...(input.existingTaskId ? { existingTaskId: input.existingTaskId } : {}),
      ...(input.existingResourceId ? { existingResourceId: input.existingResourceId } : {}),
      ...(input.provenanceSourceFingerprint
        ? { provenanceSourceFingerprint: input.provenanceSourceFingerprint }
        : {}),
    },
  };
}

function scheduledTaskMatchesConfig(
  task: ScheduledTaskDefinitionSummary,
  seed: DeploymentScheduledTaskSeed,
): boolean {
  return (
    task.schedule === seed.schedule &&
    task.timezone === seed.timezone &&
    task.commandIntent === seed.command &&
    task.timeoutSeconds === seed.timeoutSeconds &&
    task.retryLimit === seed.retryLimit &&
    task.concurrencyPolicy === seed.concurrencyPolicy &&
    task.status === seed.status
  );
}

function findScheduledTaskById(
  tasks: readonly ScheduledTaskDefinitionSummary[],
  taskId: string,
): ScheduledTaskDefinitionSummary | undefined {
  return tasks.find((task) => task.taskId === taskId);
}

function findExactScheduledTask(
  tasks: readonly ScheduledTaskDefinitionSummary[],
  seed: DeploymentScheduledTaskSeed,
): ScheduledTaskDefinitionSummary | undefined {
  return tasks.find((task) => scheduledTaskMatchesConfig(task, seed));
}

function listScheduledTasksForConfig(resourceId: string) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(
      ListScheduledTasksQuery.create({
        resourceId,
        limit: 100,
      }),
    );
    const result = yield* Effect.promise(() => cli.executeQuery(message));
    return yield* resultToEffect(result);
  });
}

function createRepositoryConfigScheduledTask(input: {
  resourceId: string;
  task: DeploymentScheduledTaskSeed;
}) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(
      CreateScheduledTaskCommand.create({
        resourceId: input.resourceId,
        schedule: input.task.schedule,
        timezone: input.task.timezone,
        commandIntent: input.task.command,
        timeoutSeconds: input.task.timeoutSeconds,
        retryLimit: input.task.retryLimit,
        concurrencyPolicy: input.task.concurrencyPolicy,
        status: input.task.status,
        idempotencyKey: `repository-config:${input.task.key}`,
      }),
    );
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
  });
}

function configureRepositoryConfigScheduledTask(input: {
  taskId: string;
  resourceId: string;
  task: DeploymentScheduledTaskSeed;
}) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(
      ConfigureScheduledTaskCommand.create({
        taskId: input.taskId,
        resourceId: input.resourceId,
        schedule: input.task.schedule,
        timezone: input.task.timezone,
        commandIntent: input.task.command,
        timeoutSeconds: input.task.timeoutSeconds,
        retryLimit: input.task.retryLimit,
        concurrencyPolicy: input.task.concurrencyPolicy,
        status: input.task.status,
        idempotencyKey: `repository-config:${input.task.key}`,
      }),
    );
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
  });
}

function buildScheduledTaskProvenance(input: {
  sourceFingerprint: string;
  existing?: SourceLinkScheduledTaskProvenance;
  entries: SourceLinkScheduledTaskProvenanceEntry[];
}): SourceLinkScheduledTaskProvenance {
  const byKey = new Map<string, SourceLinkScheduledTaskProvenanceEntry>();
  for (const entry of input.existing?.entries ?? []) {
    byKey.set(entry.key, entry);
  }
  for (const entry of input.entries) {
    byKey.set(entry.key, entry);
  }

  return {
    schemaVersion: "source-link.scheduled-task-provenance/v1",
    source: "repository-config",
    sourceFingerprint: input.sourceFingerprint,
    entries: [...byKey.values()].sort((left, right) => left.key.localeCompare(right.key)),
  };
}

function ensureRepositoryConfigScheduledTasks(input: {
  seed: DeploymentPromptSeed;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId?: string;
}) {
  return Effect.gen(function* () {
    const scheduledTaskGraph = input.seed.scheduledTaskGraph ?? [];
    if (scheduledTaskGraph.length === 0) {
      return;
    }

    const cli = yield* CliRuntime;
    const firstTask = scheduledTaskGraph[0] as DeploymentScheduledTaskSeed;
    const sourceFingerprint = input.seed.sourceFingerprint;
    if (!sourceFingerprint || !cli.sourceLinkStore?.recordScheduledTaskProvenance) {
      return yield* Effect.fail(
        repositoryConfigScheduledTaskProvenanceError({
          task: firstTask,
          ...(sourceFingerprint ? { sourceFingerprint } : {}),
          resourceId: input.resourceId,
        }),
      );
    }

    const target = {
      projectId: input.projectId,
      environmentId: input.environmentId,
      resourceId: input.resourceId,
      serverId: input.serverId,
      ...(input.destinationId ? { destinationId: input.destinationId } : {}),
    };
    const existingSourceLinkResult = yield* Effect.promise(
      () => cli.sourceLinkStore?.read(sourceFingerprint) ?? Promise.resolve(ok(null)),
    );
    const existingSourceLink = yield* resultToEffect(existingSourceLinkResult);
    const existingProvenance = existingSourceLink?.scheduledTaskProvenance;
    if (existingProvenance && existingProvenance.sourceFingerprint !== sourceFingerprint) {
      return yield* Effect.fail(
        repositoryConfigScheduledTaskConflict({
          task: firstTask,
          resourceId: input.resourceId,
          sourceFingerprint,
          provenanceSourceFingerprint: existingProvenance.sourceFingerprint,
        }),
      );
    }

    const tasksResult = yield* listScheduledTasksForConfig(input.resourceId);
    const tasks = [...tasksResult.items];
    const provenanceEntries: SourceLinkScheduledTaskProvenanceEntry[] = [];

    for (const task of scheduledTaskGraph) {
      const existingProvenanceEntry = existingProvenance?.entries.find(
        (entry) => entry.key === task.key,
      );
      if (existingProvenanceEntry && existingProvenanceEntry.resourceId !== input.resourceId) {
        return yield* Effect.fail(
          repositoryConfigScheduledTaskConflict({
            task,
            resourceId: input.resourceId,
            sourceFingerprint,
            existingTaskId: existingProvenanceEntry.taskId,
            existingResourceId: existingProvenanceEntry.resourceId,
          }),
        );
      }

      const provenanceTask = existingProvenanceEntry
        ? findScheduledTaskById(tasks, existingProvenanceEntry.taskId)
        : undefined;
      const exactTask = provenanceTask ? undefined : findExactScheduledTask(tasks, task);
      let resolvedTask = provenanceTask ?? exactTask;

      if (resolvedTask && !scheduledTaskMatchesConfig(resolvedTask, task)) {
        const configured = yield* configureRepositoryConfigScheduledTask({
          taskId: resolvedTask.taskId,
          resourceId: input.resourceId,
          task,
        });
        resolvedTask = configured.task;
        const taskIndex = tasks.findIndex((item) => item.taskId === resolvedTask?.taskId);
        if (taskIndex >= 0) {
          tasks[taskIndex] = configured.task;
        }
      }

      if (!resolvedTask) {
        const created = yield* createRepositoryConfigScheduledTask({
          resourceId: input.resourceId,
          task,
        });
        resolvedTask = created.task;
        tasks.push(created.task);
      }

      provenanceEntries.push({
        key: task.key,
        source: "repository-config",
        lifecycle: task.previewLifecycle === "ephemeral" ? "ephemeral" : "persistent",
        resourceId: input.resourceId,
        taskId: resolvedTask.taskId,
        commandFingerprint: scheduledTaskCommandFingerprint(task),
        createdAt: existingProvenanceEntry?.createdAt ?? new Date().toISOString(),
      });
    }

    const provenance = buildScheduledTaskProvenance({
      sourceFingerprint,
      entries: provenanceEntries,
      ...(existingProvenance ? { existing: existingProvenance } : {}),
    });
    const persisted = yield* Effect.promise(
      () =>
        cli.sourceLinkStore?.recordScheduledTaskProvenance?.({
          sourceFingerprint,
          target,
          scheduledTaskProvenance: provenance,
          updatedAt: new Date().toISOString(),
        }) ?? Promise.resolve(ok(null as never)),
    );
    yield* resultToEffect(persisted);
  });
}

function stringArraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function autoDeployPolicyMatchesConfig(
  current: ResourceDetailAutoDeployPolicy | undefined,
  desired: DeploymentAutoDeploySeed,
): boolean {
  if (!desired.enabled) {
    return !current || current.status === "disabled";
  }
  if (!current || current.status !== "enabled" || !desired.refs) {
    return false;
  }

  return (
    current.triggerKind === desired.triggerKind &&
    stringArraysEqual(current.refs, desired.refs) &&
    stringArraysEqual(current.eventKinds, desired.eventKinds) &&
    current.dedupeWindowSeconds === desired.dedupeWindowSeconds
  );
}

function autoDeployResolutionError(input: { message: string; resourceId: string; reason: string }) {
  return domainError.validation(input.message, {
    phase: "config-auto-deploy-resolution",
    resourceId: input.resourceId,
    reason: input.reason,
  });
}

function showResourceForAutoDeploy(resourceId: string) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(
      ShowResourceQuery.create({
        resourceId,
        includeLatestDeployment: false,
        includeAccessSummary: false,
        includeProfileDiagnostics: false,
      }),
    );
    const result = yield* Effect.promise(() => cli.executeQuery<ResourceDetail>(message));
    return yield* resultToEffect(result);
  });
}

function configureRepositoryConfigAutoDeploy(input: {
  resourceId: string;
  policy: DeploymentAutoDeploySeed;
}) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(
      ConfigureResourceAutoDeployCommand.create({
        resourceId: input.resourceId,
        mode: input.policy.enabled ? "enable" : "disable",
        ...(input.policy.enabled
          ? {
              policy: {
                triggerKind: input.policy.triggerKind,
                refs: input.policy.refs ?? [],
                eventKinds: input.policy.eventKinds,
                ...(input.policy.dedupeWindowSeconds
                  ? { dedupeWindowSeconds: input.policy.dedupeWindowSeconds }
                  : {}),
              },
            }
          : {}),
        idempotencyKey: "repository-config:auto-deploy",
      }),
    );
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
  });
}

function ensureRepositoryConfigAutoDeploy(input: {
  seed: DeploymentPromptSeed;
  resourceId: string;
}) {
  return Effect.gen(function* () {
    const policy = input.seed.autoDeployPolicy;
    if (!policy) {
      return;
    }

    if (policy.enabled && (!policy.refs || policy.refs.length === 0)) {
      return yield* Effect.fail(
        autoDeployResolutionError({
          message: "Repository config autoDeploy refs are required when enabled",
          resourceId: input.resourceId,
          reason: "refs_required",
        }),
      );
    }

    const detail = yield* showResourceForAutoDeploy(input.resourceId);
    if (autoDeployPolicyMatchesConfig(detail.autoDeployPolicy, policy)) {
      return;
    }
    if (!policy.enabled && !detail.autoDeployPolicy) {
      return;
    }

    yield* configureRepositoryConfigAutoDeploy({
      resourceId: input.resourceId,
      policy,
    });
  });
}

function ensureRepositoryConfigGeneratedAccessProfile(input: {
  seed: DeploymentPromptSeed;
  resourceId: string;
}) {
  return Effect.gen(function* () {
    const accessProfile = input.seed.generatedAccessProfile;
    if (!accessProfile) {
      return;
    }

    const detail = yield* showResource(input.resourceId);
    if (
      generatedAccessProfileMatchesConfig({
        current: detail.accessProfile,
        desired: accessProfile,
      })
    ) {
      return;
    }

    yield* configureResourceAccess({
      resourceId: input.resourceId,
      accessProfile,
    });
  });
}

function ensureRepositoryConfigMonitoringThresholds(input: {
  seed: DeploymentPromptSeed;
  resourceId: string;
}) {
  return Effect.gen(function* () {
    const thresholds = input.seed.monitoringThresholds;
    if (!thresholds) {
      return;
    }

    const readback = yield* showRuntimeMonitoringThresholds(input.resourceId);
    if (
      runtimeMonitoringThresholdsMatchConfig({
        current: readback.policy,
        desired: thresholds,
        resourceId: input.resourceId,
      })
    ) {
      return;
    }

    const exactPolicy =
      readback.policy?.scope.kind === "resource" &&
      readback.policy.scope.resourceId === input.resourceId
        ? readback.policy
        : undefined;
    yield* configureRuntimeMonitoringThresholds({
      resourceId: input.resourceId,
      thresholds,
      ...(exactPolicy ? { policyId: exactPolicy.policyId } : {}),
    });
  });
}

function showPreviewPolicy(input: { projectId: string; resourceId: string }) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(
      ShowPreviewPolicyQuery.create({
        scope: {
          kind: "resource",
          projectId: input.projectId,
          resourceId: input.resourceId,
        },
      }),
    );
    const result = yield* Effect.promise(() => cli.executeQuery(message));
    return yield* resultToEffect(result);
  });
}

function configureRepositoryConfigPreviewPolicy(input: {
  projectId: string;
  resourceId: string;
  policy: DeploymentPreviewPolicySeed;
}) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(
      ConfigurePreviewPolicyCommand.create({
        scope: {
          kind: "resource",
          projectId: input.projectId,
          resourceId: input.resourceId,
        },
        policy: input.policy,
        idempotencyKey: "repository-config:preview-policy",
      }),
    );
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
  });
}

function ensureRepositoryConfigPreviewPolicy(input: {
  seed: DeploymentPromptSeed;
  projectId: string;
  resourceId: string;
}) {
  return Effect.gen(function* () {
    const policy = input.seed.previewPolicy;
    if (!policy || input.seed.isPullRequestPreview) {
      return;
    }

    const readback = yield* showPreviewPolicy({
      projectId: input.projectId,
      resourceId: input.resourceId,
    });
    if (
      previewPolicyMatchesConfig({
        current: readback.policy,
        desired: policy,
        projectId: input.projectId,
        resourceId: input.resourceId,
      })
    ) {
      return;
    }

    yield* configureRepositoryConfigPreviewPolicy({
      projectId: input.projectId,
      resourceId: input.resourceId,
      policy,
    });
  });
}

function ensureRepositoryConfigRuntimePrunePolicy(input: {
  seed: DeploymentPromptSeed;
  serverId: string;
}) {
  return Effect.gen(function* () {
    const policy = input.seed.runtimePrunePolicy;
    if (!policy) {
      return;
    }

    yield* configureRuntimePrunePolicy({
      serverId: input.serverId,
      policy,
    });
  });
}

function ensureRepositoryConfigResourceSecretRequirements(input: {
  seed: DeploymentPromptSeed;
  resourceId: string;
}) {
  return Effect.gen(function* () {
    const requirements = input.seed.resourceSecretRequirements ?? [];
    for (const requirement of requirements) {
      const secretRef = `${resourceSecretReferencePrefix}${requirement.refKey}`;
      if (!requirement.refKey) {
        if (!requirement.required) {
          continue;
        }

        return yield* Effect.fail(
          secretResolutionError({
            message: "Deployment config Resource secret reference is missing a secret key",
            secretKey: requirement.key,
            secretRef,
          }),
        );
      }

      if (requirement.refKey !== requirement.key) {
        return yield* Effect.fail(
          secretResolutionError({
            message:
              "Deployment config Resource secret references must use the same key as the target",
            secretKey: requirement.key,
            secretRef,
          }),
        );
      }

      const result = yield* Effect.either(
        showResourceSecretReference({
          resourceId: input.resourceId,
          key: requirement.refKey,
          exposure: "runtime",
        }),
      );
      if (Either.isRight(result)) {
        continue;
      }

      if (!requirement.required && hasDomainErrorCode(result.left, "not_found")) {
        continue;
      }

      if (hasDomainErrorCode(result.left, "not_found")) {
        return yield* Effect.fail(
          secretResolutionError({
            message: "Required deployment config Resource secret reference was not found",
            secretKey: requirement.key,
            secretRef,
          }),
        );
      }

      return yield* Effect.fail(result.left);
    }
  });
}

function printDeploymentSummary(input: {
  sourceLocator: string;
  deploymentMethod: DeploymentMethod;
  project: { label: string };
  server: { label: string };
  environment: { label: string };
  resource: { label: string };
}) {
  return Effect.sync(() => {
    process.stderr.write(
      `${[
        "Deployment summary:",
        `  Source: ${input.sourceLocator}`,
        `  Method: ${input.deploymentMethod}`,
        `  Project: ${input.project.label}`,
        `  Server: ${input.server.label}`,
        `  Environment: ${input.environment.label}`,
        `  Resource: ${input.resource.label}`,
      ].join("\n")}\n`,
    );
  });
}

function resolveProject(input: {
  interaction: CliInteraction;
  projects: ProjectSummary[];
  seed: DeploymentPromptSeed;
  sourceLocator: string;
}): Effect.Effect<ResolvedWorkflowReference<CreateProjectInput>, unknown, CliRuntime> {
  return cliRuntimeEffect(
    Effect.gen(function* () {
      if (input.seed.projectId) {
        return {
          reference: { mode: "existing", id: input.seed.projectId },
          label: input.seed.projectId,
        };
      }

      const defaultName = inferNameFromSource(input.sourceLocator);
      const canPrompt = Boolean(process.stdin.isTTY && process.stdout.isTTY);
      const projectName = canPrompt
        ? yield* input.interaction.text({
            message: "Project name",
            defaultValue: defaultName,
            validate: requireNonEmpty("Project name"),
          })
        : defaultName;
      const existing = findProject(input.projects, projectName);
      if (existing) {
        return {
          reference: { mode: "existing", id: existing.id },
          label: `${existing.name} (${existing.slug})`,
        };
      }

      return {
        reference: { mode: "create", input: { name: projectName.trim() } },
        label: projectName.trim(),
      };
    }),
  );
}

function resolveServer(input: {
  interaction: CliInteraction;
  servers: ServerSummary[];
  seed: DeploymentPromptSeed;
}): Effect.Effect<ResolvedWorkflowServerReference, unknown, CliRuntime> {
  return cliRuntimeEffect(
    Effect.gen(function* () {
      const credential = serverCredentialFromSeed(input.seed);
      if (input.seed.serverId) {
        return {
          reference: {
            mode: "existing",
            id: input.seed.serverId,
            ...(credential ? { credential } : {}),
          },
          label: input.seed.serverId,
        };
      }

      const canPrompt = Boolean(process.stdin.isTTY && process.stdout.isTTY);
      const defaultProviderKey = input.seed.server?.host
        ? defaultRemoteServerProviderKey
        : defaultServerProviderKey;
      const host =
        input.seed.server?.host ??
        (canPrompt
          ? yield* input.interaction.text({
              message: "Server host",
              defaultValue: defaultServerHost,
              validate: requireNonEmpty("Server host"),
            })
          : defaultServerHost);
      const providerKey =
        input.seed.server?.providerKey ??
        (canPrompt
          ? yield* input.interaction.text({
              message: "Server provider",
              defaultValue: defaultProviderKey,
              validate: requireNonEmpty("Server provider"),
            })
          : defaultProviderKey);
      const port =
        input.seed.server?.port ??
        (canPrompt
          ? Number(
              yield* input.interaction.text({
                message: "Server port",
                defaultValue: String(defaultServerPort),
                validate: requirePositiveInteger("Server port"),
              }),
            )
          : defaultServerPort);
      const existing = findServer(input.servers, {
        host: host.trim(),
        providerKey: providerKey.trim(),
        port,
      });
      if (existing) {
        return {
          reference: {
            mode: "existing",
            id: existing.id,
            ...(credential ? { credential } : {}),
          },
          label: `${existing.name} ${existing.providerKey} ${existing.host}:${existing.port}`,
        };
      }

      const name =
        input.seed.server?.name ??
        (canPrompt
          ? yield* input.interaction.text({
              message: "Server name",
              defaultValue: defaultServerName,
              validate: requireNonEmpty("Server name"),
            })
          : defaultServerName);
      return {
        reference: {
          mode: "create",
          input: {
            name: name.trim(),
            host: host.trim(),
            providerKey: providerKey.trim(),
            targetKind: input.seed.server?.targetKind ?? "single-server",
            port,
            proxyKind: input.seed.server?.proxyKind ?? "traefik",
          },
          ...(credential ? { credential } : {}),
        },
        label: `${name.trim()} ${providerKey.trim()} ${host.trim()}:${port}`,
      };
    }),
  );
}

function resolveEnvironment(input: {
  interaction: CliInteraction;
  seed: DeploymentPromptSeed;
  projectId?: string;
}): Effect.Effect<
  ResolvedWorkflowReference<QuickDeployCreateEnvironmentInput>,
  unknown,
  CliRuntime
> {
  return cliRuntimeEffect(
    Effect.gen(function* () {
      if (input.seed.environmentId) {
        return {
          reference: { mode: "existing", id: input.seed.environmentId },
          label: input.seed.environmentId,
        };
      }

      const environments = input.projectId ? (yield* listEnvironments(input.projectId)).items : [];
      const canPrompt = Boolean(process.stdin.isTTY && process.stdout.isTTY);
      const name =
        input.seed.environment?.name ??
        (canPrompt
          ? yield* input.interaction.text({
              message: "Environment name",
              defaultValue: defaultEnvironmentName,
              validate: requireNonEmpty("Environment name"),
            })
          : defaultEnvironmentName);
      const kind =
        input.seed.environment?.kind ??
        (canPrompt
          ? yield* input.interaction.select<EnvironmentKind>({
              message: "Environment kind",
              choices: environmentKinds.map((environmentKind) => ({
                title: environmentKind,
                value: environmentKind,
              })),
            })
          : "local");
      const existing = input.projectId
        ? findEnvironment(environments, {
            projectId: input.projectId,
            name,
            kind,
          })
        : undefined;
      if (existing) {
        return {
          reference: { mode: "existing", id: existing.id },
          label: `${existing.name} (${existing.kind})`,
        };
      }

      return {
        reference: {
          mode: "create",
          input: {
            name: name.trim(),
            kind,
          },
        },
        label: `${name.trim()} (${kind})`,
      };
    }),
  );
}

function resolveResource(input: {
  interaction: CliInteraction;
  seed: DeploymentPromptSeed;
  projectId?: string;
  environmentId?: string;
  sourceLocator: string;
  deploymentMethod: DeploymentMethod;
  runtimeProfile: ResourceRuntimeProfileInput;
  networkProfile: ResourceNetworkProfileInput;
}): Effect.Effect<ResolvedWorkflowResourceReference, unknown, CliRuntime> {
  return cliRuntimeEffect(
    Effect.gen(function* () {
      const reuseResolvedResource = (resource: { id: string; label: string }) =>
        Effect.gen(function* () {
          const source = yield* resolveReusableResourceSource({
            seed: input.seed,
            resourceId: resource.id,
            sourceLocator: input.sourceLocator,
            deploymentMethod: input.deploymentMethod,
            source: sourceBindingForDeploymentInput(
              input.sourceLocator,
              input.deploymentMethod,
              input.seed.sourceProfile,
            ),
          });
          const runtimeProfile = yield* resolveReusableResourceRuntimeProfile({
            seed: input.seed,
            resourceId: resource.id,
            runtimeProfile: input.runtimeProfile,
          });
          const healthCheck = yield* resolveReusableResourceHealthPolicy({
            seed: input.seed,
            resourceId: resource.id,
          });
          const networkProfile = yield* resolveReusableResourceNetworkProfile({
            seed: input.seed,
            resourceId: resource.id,
            networkProfile: input.networkProfile,
          });
          return {
            reference: {
              mode: "existing",
              id: resource.id,
              ...(source ? { configureSource: { source } } : {}),
              ...(networkProfile ? { configureNetwork: { networkProfile } } : {}),
              ...(runtimeProfile ? { configureRuntime: { runtimeProfile } } : {}),
              ...(healthCheck ? { configureHealth: { healthCheck } } : {}),
            },
            label: resource.label,
          } satisfies ResolvedWorkflowResourceReference;
        });

      if (input.seed.resourceId) {
        return yield* reuseResolvedResource({
          id: input.seed.resourceId,
          label: input.seed.resourceId,
        });
      }

      const sourceResource =
        input.seed.resource ??
        resourceDraftWithConfigServices(
          inferResourceFromSource(input.sourceLocator, input.deploymentMethod),
          input.seed.services,
        );
      const sourceResourceLabel = `${sourceResource.name} (${sourceResource.kind ?? "application"})`;
      const resources =
        input.projectId && input.environmentId
          ? (yield* listResources(input.projectId, input.environmentId)).items
          : [];

      const createOrReuseSourceResource = (resource: NonNullable<typeof sourceResource>) =>
        Effect.gen(function* () {
          const existing =
            input.projectId && input.environmentId
              ? findResource(resources, {
                  projectId: input.projectId,
                  environmentId: input.environmentId,
                  name: resource.name,
                })
              : undefined;

          if (existing) {
            return yield* reuseResolvedResource({
              id: existing.id,
              label: `${existing.name} (${existing.kind})`,
            });
          }

          return {
            reference: {
              mode: "create",
              input: {
                name: resource.name,
                kind: resource.kind ?? "application",
                ...(resource.description ? { description: resource.description } : {}),
                ...(resource.services && resource.services.length > 0
                  ? { services: resource.services }
                  : {}),
                ...(input.projectId ? { projectId: input.projectId } : {}),
                ...(input.environmentId ? { environmentId: input.environmentId } : {}),
                source: sourceBindingForDeploymentInput(
                  input.sourceLocator,
                  input.deploymentMethod,
                  input.seed.sourceProfile,
                ),
                runtimeProfile: input.runtimeProfile,
                networkProfile: input.networkProfile,
              },
            },
            label: sourceResourceLabel,
          } satisfies ResolvedWorkflowResourceReference;
        });

      if (input.seed.resource) {
        return yield* createOrReuseSourceResource(input.seed.resource);
      }

      if (resources.length === 0) {
        return yield* createOrReuseSourceResource(sourceResource);
      }

      const sourceResourceChoice = "__source_resource__";
      const resourceId = yield* input.interaction.select<string | undefined>({
        message: "Resource",
        choices: [
          ...(sourceResource
            ? [
                {
                  title: `Use source as resource: ${sourceResourceLabel}`,
                  value: sourceResourceChoice,
                  description:
                    "The deployment will reuse or create this resource by project/environment slug.",
                },
              ]
            : []),
          ...resources.map((resource: ResourceSummary) => ({
            title: `${resource.name} (${resource.kind})`,
            value: resource.id,
            description: `deployments: ${resource.deploymentCount}`,
          })),
        ],
      });
      const selectedResource = resources.find((resource) => resource.id === resourceId);

      if (resourceId === sourceResourceChoice && sourceResource) {
        return yield* createOrReuseSourceResource(sourceResource);
      }

      if (!resourceId) {
        return yield* createOrReuseSourceResource(sourceResource);
      }

      return yield* reuseResolvedResource({
        id: resourceId,
        label: selectedResource
          ? `${selectedResource.name} (${selectedResource.kind})`
          : resourceId,
      });
    }),
  );
}

function resolveAdvancedDeploymentConfig(input: {
  interaction: CliInteraction;
  seed: DeploymentPromptSeed;
  deploymentMethod: DeploymentMethod;
}) {
  return Effect.gen(function* () {
    const canPrompt = Boolean(process.stdin.isTTY && process.stdout.isTTY);
    const isStatic = input.deploymentMethod === "static";
    const hasSeedAdvancedConfig = Boolean(
      input.seed.installCommand ||
        input.seed.buildCommand ||
        input.seed.startCommand ||
        input.seed.runtimeName ||
        input.seed.publishDirectory ||
        input.seed.dockerfilePath ||
        input.seed.dockerComposeFilePath ||
        input.seed.buildTarget ||
        input.seed.replicas ||
        input.seed.port ||
        input.seed.upstreamProtocol ||
        input.seed.exposureMode ||
        input.seed.targetServiceName ||
        input.seed.hostPort ||
        input.seed.healthCheckPath ||
        input.seed.healthCheck,
    );
    const shouldConfigure =
      isStatic ||
      hasSeedAdvancedConfig ||
      (canPrompt &&
        (yield* input.interaction.confirm({
          message: "Advanced config?",
          defaultValue: false,
        })));

    if (!shouldConfigure) {
      return {
        port:
          input.seed.port ??
          (isStatic ? defaultStaticInternalPort : defaultApplicationInternalPort),
        ...(input.seed.runtimeName ? { runtimeName: input.seed.runtimeName } : {}),
        ...(input.seed.replicas ? { replicas: input.seed.replicas } : {}),
        ...(input.seed.upstreamProtocol ? { upstreamProtocol: input.seed.upstreamProtocol } : {}),
        ...(input.seed.exposureMode ? { exposureMode: input.seed.exposureMode } : {}),
        ...(input.seed.targetServiceName
          ? { targetServiceName: input.seed.targetServiceName }
          : {}),
        ...(input.seed.hostPort ? { hostPort: input.seed.hostPort } : {}),
        ...(input.seed.healthCheck ? { healthCheck: input.seed.healthCheck } : {}),
      };
    }

    if (isStatic && !input.seed.publishDirectory && !canPrompt) {
      yield* Effect.sync(() => {
        process.exitCode = 1;
      });
      return yield* Effect.fail(
        domainError.validation(
          "Static deployments require --publish-dir outside an interactive terminal",
          {
            phase: "input-collection",
            runtimePlanStrategy: "static",
          },
        ),
      );
    }

    const installCommand =
      input.seed.installCommand ??
      (canPrompt
        ? trimToUndefined(
            yield* input.interaction.text({
              message: "Install command",
              defaultValue: "",
            }),
          )
        : undefined);
    const buildCommand =
      input.seed.buildCommand ??
      (canPrompt
        ? trimToUndefined(
            yield* input.interaction.text({
              message: "Build command",
              defaultValue: "",
            }),
          )
        : undefined);
    const startCommand = isStatic
      ? undefined
      : (input.seed.startCommand ??
        (canPrompt
          ? trimToUndefined(
              yield* input.interaction.text({
                message: "Start command",
                defaultValue: "",
              }),
            )
          : undefined));
    const publishDirectory = isStatic
      ? (input.seed.publishDirectory ??
        (canPrompt
          ? trimToUndefined(
              yield* input.interaction.text({
                message: "Static publish directory",
                defaultValue: defaultStaticPublishDirectory,
                validate: requireNonEmpty("Static publish directory"),
              }),
            )
          : undefined))
      : undefined;
    const dockerfilePath = input.seed.dockerfilePath;
    const dockerComposeFilePath = input.seed.dockerComposeFilePath;
    const buildTarget = input.seed.buildTarget;
    const port =
      input.seed.port ??
      (canPrompt
        ? Number(
            yield* input.interaction.text({
              message: isStatic ? "Static server port" : "Application port",
              defaultValue: String(
                isStatic ? defaultStaticInternalPort : defaultApplicationInternalPort,
              ),
              validate: requirePositiveInteger("Application port"),
            }),
          )
        : isStatic
          ? defaultStaticInternalPort
          : defaultApplicationInternalPort);
    const healthCheckPath =
      input.seed.healthCheckPath ??
      (canPrompt
        ? trimToUndefined(
            yield* input.interaction.text({
              message: "Health check path",
              defaultValue: "",
            }),
          )
        : undefined);

    return {
      ...(installCommand ? { installCommand } : {}),
      ...(buildCommand ? { buildCommand } : {}),
      ...(startCommand ? { startCommand } : {}),
      ...(input.seed.runtimeName ? { runtimeName: input.seed.runtimeName } : {}),
      ...(publishDirectory ? { publishDirectory } : {}),
      ...(dockerfilePath ? { dockerfilePath } : {}),
      ...(dockerComposeFilePath ? { dockerComposeFilePath } : {}),
      ...(buildTarget ? { buildTarget } : {}),
      ...(input.seed.replicas ? { replicas: input.seed.replicas } : {}),
      ...(Number.isInteger(port) && port > 0 ? { port } : {}),
      ...(input.seed.upstreamProtocol ? { upstreamProtocol: input.seed.upstreamProtocol } : {}),
      ...(input.seed.exposureMode ? { exposureMode: input.seed.exposureMode } : {}),
      ...(input.seed.targetServiceName ? { targetServiceName: input.seed.targetServiceName } : {}),
      ...(input.seed.hostPort ? { hostPort: input.seed.hostPort } : {}),
      ...(healthCheckPath ? { healthCheckPath } : {}),
      ...(input.seed.healthCheck ? { healthCheck: input.seed.healthCheck } : {}),
    };
  });
}

function releaseDeploymentStateSession(session: RemoteStateSession) {
  return Effect.gen(function* () {
    const released = yield* Effect.promise(() => session.release());
    yield* resultToEffect(released);
  });
}

function prepareDeploymentStateBackendIfNeeded(seed: DeploymentPromptSeed) {
  return Effect.gen(function* () {
    const decision = seed.stateBackend;
    if (!decision?.requiresRemoteStateLifecycle || seed.stateBackendPrepared) {
      return undefined;
    }

    const cli = yield* CliRuntime;
    if (!cli.prepareDeploymentStateBackend) {
      return yield* Effect.fail(
        domainError.validation(
          "SSH remote state lifecycle is required before deployment config bootstrap",
          {
            phase: "remote-state-resolution",
            stateBackend: decision.kind,
            storageScope: decision.storageScope,
            reason: "remote_state_lifecycle_adapter_missing",
          },
        ),
      );
    }

    const prepare = cli.prepareDeploymentStateBackend;
    const result = yield* Effect.promise(() => prepare(decision));
    return yield* resultToEffect(result);
  });
}

function configDomainResolutionError(input: {
  message: string;
  reason: string;
  domainCount: number;
}) {
  return domainError.validation(input.message, {
    phase: "config-domain-resolution",
    reason: input.reason,
    domainCount: String(input.domainCount),
  });
}

function requireServerAppliedRouteStateSupportIfNeeded(seed: DeploymentPromptSeed) {
  return Effect.gen(function* () {
    const routes = seed.serverAppliedRoutes ?? [];
    if (routes.length === 0) {
      return;
    }

    if (seed.stateBackend?.kind === "postgres-control-plane") {
      return yield* Effect.fail(
        configDomainResolutionError({
          message: "Config access domains require managed domain workflow mapping",
          reason: "managed_config_domains_not_implemented",
          domainCount: routes.length,
        }),
      );
    }

    if (seed.stateBackend?.kind !== "ssh-pglite") {
      return yield* Effect.fail(
        configDomainResolutionError({
          message: "Config access domains require SSH-server route state",
          reason: "server_applied_config_domains_require_ssh_pglite",
          domainCount: routes.length,
        }),
      );
    }

    const cli = yield* CliRuntime;
    if (!cli.serverAppliedRouteStore) {
      return yield* Effect.fail(
        configDomainResolutionError({
          message: "Config access domains require server-applied route state storage",
          reason: "server_applied_route_store_missing",
          domainCount: routes.length,
        }),
      );
    }
  });
}

function validateServerAppliedRouteNetworkIfNeeded(input: {
  seed: DeploymentPromptSeed;
  networkProfile: ResourceNetworkProfileInput;
}) {
  return Effect.gen(function* () {
    const routes = input.seed.serverAppliedRoutes ?? [];
    if (routes.length === 0 || input.networkProfile.exposureMode === "reverse-proxy") {
      return;
    }

    return yield* Effect.fail(
      configDomainResolutionError({
        message: "Config access domains require a reverse-proxy resource network profile",
        reason: "server_applied_config_domains_require_reverse_proxy",
        domainCount: routes.length,
      }),
    );
  });
}

function primaryProfileDrift(diagnostics: ResourceDetailProfileDiagnostic[]) {
  return diagnostics.find((diagnostic) => diagnostic.code === "resource_profile_drift");
}

function configurationIdentity(input: { key: string; exposure: string }): string {
  return `${input.key}:${input.exposure}`;
}

function entryConfigurationFromSeed(
  seed: DeploymentPromptSeed,
): ResourceProfileConfigurationEntry[] | undefined {
  if (!seed.environmentVariables || seed.environmentVariables.length === 0) {
    return undefined;
  }

  return seed.environmentVariables.map((variable) => ({
    key: variable.key,
    value: variable.value,
    kind: variable.kind,
    exposure: variable.exposure,
    scope: variable.scope ?? "environment",
    isSecret: variable.isSecret ?? variable.kind === "secret",
  }));
}

function resourceEffectiveConfigurationForEntryDrift(input: {
  effectiveConfig: ResourceEffectiveConfigView;
  entryConfiguration: ResourceProfileConfigurationEntry[] | undefined;
}): ResourceProfileConfigurationEntry[] | undefined {
  const entryIdentities = new Set(
    (input.entryConfiguration ?? []).map((entry) => configurationIdentity(entry)),
  );

  if (entryIdentities.size === 0) {
    return undefined;
  }

  const conflictingResourceOverrides = input.effectiveConfig.effectiveEntries.filter(
    (entry) => entry.scope === "resource" && entryIdentities.has(configurationIdentity(entry)),
  );

  if (conflictingResourceOverrides.length === 0) {
    return undefined;
  }

  return conflictingResourceOverrides.map((entry) => ({
    key: entry.key,
    value: entry.value,
    kind: entry.kind,
    exposure: entry.exposure,
    scope: entry.scope,
    isSecret: entry.isSecret,
  }));
}

function profileDriftAdmissionError(
  diagnostics: ResourceDetailProfileDiagnostic[],
  resourceId: string,
) {
  const drift = primaryProfileDrift(diagnostics);

  return {
    code: "resource_profile_drift",
    category: "user",
    message: "Existing Resource profile differs from the deployment config profile",
    retryable: false,
    details: {
      phase: "resource-profile-resolution",
      resourceId,
      driftSection: drift?.section ?? "configuration",
      driftFieldPath: drift?.fieldPath ?? drift?.path ?? "profile",
      driftComparison: drift?.comparison ?? "resource-vs-entry-profile",
      ...(drift?.configPointer ? { configPointer: drift.configPointer } : {}),
      ...(drift?.suggestedCommand ? { suggestedCommand: drift.suggestedCommand } : {}),
      blocksDeploymentAdmission: true,
    },
  } as const;
}

function normalizedServiceDriftValue(
  services: readonly { name: string; kind: string }[] | undefined,
): string {
  return JSON.stringify(
    [...(services ?? [])]
      .map((service) => ({ name: service.name, kind: service.kind }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  );
}

function serviceDriftDiagnostic(input: {
  current: readonly { name: string; kind: string }[] | undefined;
  desired: readonly { name: string; kind: string }[];
}): ResourceDetailProfileDiagnostic[] {
  if (normalizedServiceDriftValue(input.current) === normalizedServiceDriftValue(input.desired)) {
    return [];
  }

  return [
    {
      code: "resource_profile_drift",
      severity: "blocking",
      message: "Resource services differ from the deployment config service graph",
      path: "services",
      section: "runtime",
      fieldPath: "services",
      comparison: "resource-vs-entry-profile",
      resourceValue: {
        state: "present",
        displayValue: normalizedServiceDriftValue(input.current),
      },
      entryProfileValue: {
        state: "present",
        displayValue: normalizedServiceDriftValue(input.desired),
      },
      configPointer: "deployment.services",
      blocksDeploymentAdmission: true,
    },
  ];
}

function rejectExistingResourceProfileDriftIfNeeded(input: {
  seed: DeploymentPromptSeed;
  resource: ResolvedWorkflowResourceReference;
  sourceLocator: string;
  deploymentMethod: DeploymentMethod;
  runtimeProfile: ResourceRuntimeProfileInput;
  networkProfile: ResourceNetworkProfileInput;
}) {
  return Effect.gen(function* () {
    if (!input.seed.profileDriftPreflight || input.resource.reference.mode !== "existing") {
      return;
    }

    const resourceId = input.resource.reference.id;
    const query = yield* resultToEffect(
      ShowResourceQuery.create({
        resourceId,
        includeLatestDeployment: false,
        includeAccessSummary: false,
        includeProfileDiagnostics: true,
      }),
    );
    const cli = yield* CliRuntime;
    const result = yield* Effect.promise(() => cli.executeQuery<ResourceDetail>(query));
    const detail = yield* resultToEffect(result);
    const entryConfiguration = entryConfigurationFromSeed(input.seed);
    const resourceConfiguration = yield* Effect.gen(function* () {
      if (!entryConfiguration) {
        return undefined;
      }

      const effectiveConfigQuery = yield* resultToEffect(
        ResourceEffectiveConfigQuery.create({ resourceId }),
      );
      const effectiveConfigResult = yield* Effect.promise(() =>
        cli.executeQuery<ResourceEffectiveConfigView>(effectiveConfigQuery),
      );
      const effectiveConfig = yield* resultToEffect(effectiveConfigResult);
      return resourceEffectiveConfigurationForEntryDrift({
        effectiveConfig,
        entryConfiguration,
      });
    });
    const diagnostics = compareResourceProfileDrift({
      resource: {
        ...resourceProfileFromResourceDetail(detail),
        ...(resourceConfiguration ? { configuration: resourceConfiguration } : {}),
      },
      profile: {
        source: sourceBindingForDeploymentInput(
          input.sourceLocator,
          input.deploymentMethod,
          input.seed.sourceProfile,
        ),
        runtimeProfile: input.runtimeProfile,
        networkProfile: input.networkProfile,
        ...(entryConfiguration ? { configuration: entryConfiguration } : {}),
      },
      comparison: "resource-vs-entry-profile",
      comparedValueKey: "entryProfileValue",
      blocksDeploymentAdmission: true,
      configPointerPrefix: "deployment",
    });
    const serviceDrift = input.seed.services
      ? serviceDriftDiagnostic({
          current: detail.resource.services,
          desired: input.seed.services,
        })
      : [];

    if (diagnostics.length > 0 || serviceDrift.length > 0) {
      yield* Effect.sync(() => {
        process.exitCode = 1;
      });
      return yield* Effect.fail(
        profileDriftAdmissionError([...serviceDrift, ...diagnostics], resourceId),
      );
    }
  });
}

function sourceLinkConflictError(input: { field: string; expected: string; actual: string }) {
  return domainError.validation("Source link points at another deployment context", {
    phase: "source-link-resolution",
    field: input.field,
    expected: input.expected,
    actual: input.actual,
  });
}

function mergeSourceLinkSeed(seed: DeploymentPromptSeed) {
  return Effect.gen(function* () {
    if (!seed.sourceFingerprint) {
      return seed;
    }
    const sourceFingerprint = seed.sourceFingerprint;

    const cli = yield* CliRuntime;
    const recordResult = yield* Effect.promise(
      () => cli.sourceLinkStore?.read(sourceFingerprint) ?? Promise.resolve(ok(null)),
    );
    const record = yield* resultToEffect(recordResult);
    if (!record) {
      return seed;
    }

    const expectedFields = [
      ["projectId", seed.projectId, record.projectId],
      ["environmentId", seed.environmentId, record.environmentId],
      ["resourceId", seed.resourceId, record.resourceId],
      ["serverId", seed.serverId, record.serverId],
      ["destinationId", seed.destinationId, record.destinationId],
    ] as const;

    for (const [field, expected, actual] of expectedFields) {
      if (expected && actual && expected !== actual) {
        return yield* Effect.fail(sourceLinkConflictError({ field, expected, actual }));
      }
    }

    return {
      ...seed,
      projectId: seed.projectId ?? record.projectId,
      environmentId: seed.environmentId ?? record.environmentId,
      resourceId: seed.resourceId ?? record.resourceId,
      ...((seed.serverId ?? record.serverId) ? { serverId: seed.serverId ?? record.serverId } : {}),
      ...((seed.destinationId ?? record.destinationId)
        ? { destinationId: seed.destinationId ?? record.destinationId }
        : {}),
    } satisfies DeploymentPromptSeed;
  });
}

function persistSourceLinkIfNeeded(input: {
  seed: DeploymentPromptSeed;
  projectId: string;
  serverId: string;
  destinationId?: string;
  environmentId: string;
  resourceId: string;
}) {
  return Effect.gen(function* () {
    if (!input.seed.sourceFingerprint) {
      return;
    }

    const cli = yield* CliRuntime;
    if (!cli.sourceLinkStore) {
      return;
    }
    const sourceLinkStore = cli.sourceLinkStore;

    const target = {
      projectId: input.projectId,
      environmentId: input.environmentId,
      resourceId: input.resourceId,
      serverId: input.serverId,
      ...(input.destinationId ? { destinationId: input.destinationId } : {}),
    };
    const sameTargetResult = yield* Effect.promise(() =>
      sourceLinkStore.requireSameTargetOrMissing(input.seed.sourceFingerprint ?? "", target),
    );
    yield* resultToEffect(sameTargetResult);

    const created = yield* Effect.promise(() =>
      sourceLinkStore.createIfMissing({
        sourceFingerprint: input.seed.sourceFingerprint ?? "",
        target,
        updatedAt: new Date().toISOString(),
      }),
    );
    yield* resultToEffect(created);
  });
}

function persistServerAppliedRouteDesiredStateIfNeeded(input: {
  seed: DeploymentPromptSeed;
  projectId: string;
  serverId: string;
  destinationId?: string;
  environmentId: string;
  resourceId: string;
}) {
  return Effect.gen(function* () {
    const routes = input.seed.serverAppliedRoutes ?? [];
    if (routes.length === 0) {
      return;
    }

    const cli = yield* CliRuntime;
    if (!cli.serverAppliedRouteStore) {
      return yield* Effect.fail(
        configDomainResolutionError({
          message: "Config access domains require server-applied route state storage",
          reason: "server_applied_route_store_missing",
          domainCount: routes.length,
        }),
      );
    }

    const serverAppliedRouteStore = cli.serverAppliedRouteStore;
    const persisted = yield* Effect.promise(() =>
      serverAppliedRouteStore.upsertDesired({
        target: {
          projectId: input.projectId,
          environmentId: input.environmentId,
          resourceId: input.resourceId,
          serverId: input.serverId,
          ...(input.destinationId ? { destinationId: input.destinationId } : {}),
        },
        domains: routes,
        ...(input.seed.sourceFingerprint
          ? { sourceFingerprint: input.seed.sourceFingerprint }
          : {}),
        updatedAt: new Date().toISOString(),
      }),
    );
    yield* resultToEffect(persisted);
  });
}

function executeQuickDeployWorkflowStep(step: QuickDeployWorkflowStep) {
  switch (step.kind) {
    case "projects.create":
      return createProject(step.input);
    case "servers.register":
      return createServer(step.input);
    case "credentials.ssh.create":
      return createSshCredential(step.input);
    case "servers.configureCredential":
      return configureServerCredential(step.input);
    case "servers.prepareRuntime":
      return prepareServerRuntime(step.input);
    case "servers.testConnectivity":
      return testServerConnectivity(step.input);
    case "environments.create":
      return createEnvironment(step.input);
    case "resources.create":
      return createResource(step.input);
    case "resources.configureSource":
      return configureResourceSource(step.input);
    case "resources.configureAccess":
      return configureResourceAccess(step.input);
    case "resources.configureRuntime":
      return configureResourceRuntime(step.input);
    case "resources.configureHealth":
      return configureResourceHealth(step.input);
    case "resources.configureNetwork":
      return configureResourceNetwork(step.input);
    case "environments.setVariable":
      return setEnvironmentVariable(step.input);
    case "dependencyResources.provision":
      return provisionDependencyResources(step.input);
    case "deployments.create":
      return Effect.succeed({ id: "__cli_deployment_pending__" });
  }
}

function resolveDeploymentInputFromQuickDeployWorkflow(input: QuickDeployWorkflowInput) {
  return Effect.gen(function* () {
    const workflow = quickDeployWorkflow(input);
    let state = workflow.next();

    while (!state.done) {
      const step = state.value;
      if (step.kind === "deployments.create") {
        return step.input satisfies CreateDeploymentCommandInput;
      }

      const output = (yield* executeQuickDeployWorkflowStep(step)) as QuickDeployWorkflowStepOutput;
      state = workflow.next(output);
    }

    return yield* Effect.fail(
      domainError.validation("Quick Deploy workflow completed without deployment admission", {
        phase: "workflow-program",
      }),
    );
  });
}

export function resolveInteractiveDeploymentInput(
  seed: DeploymentPromptSeed,
  interaction: CliInteraction = effectCliInteraction,
): Effect.Effect<CreateDeploymentCommandInput, unknown, CliRuntime> {
  return cliRuntimeEffect(
    Effect.gen(function* () {
      if (!seed.sourceLocator && (!process.stdin.isTTY || !process.stdout.isTTY)) {
        yield* Effect.sync(() => {
          process.exitCode = 1;
        });
        return yield* Effect.fail(
          domainError.validation("pathOrSource is required outside an interactive terminal", {
            phase: "input-collection",
          }),
        );
      }

      const sourceLocator =
        seed.sourceLocator ??
        (yield* interaction.text({
          message: "Source (path/git/image/compose)",
          defaultValue: ".",
          validate: requireNonEmpty("Source"),
        }));
      const deploymentMethod =
        seed.deploymentMethod ??
        (yield* interaction.select<DeploymentMethod>({
          message: "Deployment method",
          choices: deploymentMethods.map((method) => ({
            title: method,
            value: method,
          })),
        }));
      const normalizedSourceLocator = normalizeCliPathOrSource(sourceLocator, deploymentMethod);
      const stateSession = yield* prepareDeploymentStateBackendIfNeeded(seed);

      const resolveInput = Effect.gen(function* () {
        yield* requireServerAppliedRouteStateSupportIfNeeded(seed);
        const resolvedSeed = yield* mergeSourceLinkSeed(seed);
        const projects = (yield* listProjects()).items;
        const servers = (yield* listServers()).items;
        const project = yield* resolveProject({
          interaction,
          projects,
          seed: resolvedSeed,
          sourceLocator: normalizedSourceLocator,
        });
        const projectIdForLookup =
          project.reference.mode === "existing" ? project.reference.id : undefined;
        const server = yield* resolveServer({
          interaction,
          servers,
          seed: resolvedSeed,
        });
        const environment = yield* resolveEnvironment({
          interaction,
          seed: resolvedSeed,
          ...(projectIdForLookup ? { projectId: projectIdForLookup } : {}),
        });
        const environmentIdForLookup =
          environment.reference.mode === "existing" ? environment.reference.id : undefined;
        const advancedConfig = yield* resolveAdvancedDeploymentConfig({
          interaction,
          seed: resolvedSeed,
          deploymentMethod,
        });
        const runtimeProfile = runtimeProfileFromDeploymentInput(deploymentMethod, advancedConfig);
        const networkProfile = networkProfileFromDeploymentInput(deploymentMethod, advancedConfig);
        yield* validateServerAppliedRouteNetworkIfNeeded({
          seed: resolvedSeed,
          networkProfile,
        });
        const resource = yield* resolveResource({
          interaction,
          seed: resolvedSeed,
          ...(projectIdForLookup ? { projectId: projectIdForLookup } : {}),
          ...(environmentIdForLookup ? { environmentId: environmentIdForLookup } : {}),
          sourceLocator: normalizedSourceLocator,
          deploymentMethod,
          runtimeProfile,
          networkProfile,
        });
        yield* rejectExistingResourceProfileDriftIfNeeded({
          seed: resolvedSeed,
          resource,
          sourceLocator: normalizedSourceLocator,
          deploymentMethod,
          runtimeProfile,
          networkProfile,
        });

        const workflowInput: QuickDeployWorkflowInput = {
          project: project.reference,
          server: server.reference,
          environment: environment.reference,
          resource: resource.reference,
          ...(resolvedSeed.environmentVariables && resolvedSeed.environmentVariables.length > 0
            ? { environmentVariables: resolvedSeed.environmentVariables }
            : {}),
          ...(resolvedSeed.destinationId
            ? { deployment: { destinationId: resolvedSeed.destinationId } }
            : {}),
        };
        const deploymentInput = yield* resolveDeploymentInputFromQuickDeployWorkflow(workflowInput);

        yield* persistSourceLinkIfNeeded({
          seed: resolvedSeed,
          projectId: deploymentInput.projectId,
          serverId: deploymentInput.serverId,
          ...(deploymentInput.destinationId
            ? { destinationId: deploymentInput.destinationId }
            : {}),
          environmentId: deploymentInput.environmentId,
          resourceId: deploymentInput.resourceId,
        });
        yield* ensureRepositoryConfigDependencies({
          seed: resolvedSeed,
          projectId: deploymentInput.projectId,
          serverId: deploymentInput.serverId,
          ...(deploymentInput.destinationId
            ? { destinationId: deploymentInput.destinationId }
            : {}),
          environmentId: deploymentInput.environmentId,
          resourceId: deploymentInput.resourceId,
        });
        yield* ensureRepositoryConfigStorage({
          seed: resolvedSeed,
          projectId: deploymentInput.projectId,
          serverId: deploymentInput.serverId,
          ...(deploymentInput.destinationId
            ? { destinationId: deploymentInput.destinationId }
            : {}),
          environmentId: deploymentInput.environmentId,
          resourceId: deploymentInput.resourceId,
        });
        yield* ensureRepositoryConfigScheduledTasks({
          seed: resolvedSeed,
          projectId: deploymentInput.projectId,
          serverId: deploymentInput.serverId,
          ...(deploymentInput.destinationId
            ? { destinationId: deploymentInput.destinationId }
            : {}),
          environmentId: deploymentInput.environmentId,
          resourceId: deploymentInput.resourceId,
        });
        yield* ensureRepositoryConfigRuntimePrunePolicy({
          seed: resolvedSeed,
          serverId: deploymentInput.serverId,
        });
        yield* ensureRepositoryConfigResourceSecretRequirements({
          seed: resolvedSeed,
          resourceId: deploymentInput.resourceId,
        });
        yield* ensureRepositoryConfigGeneratedAccessProfile({
          seed: resolvedSeed,
          resourceId: deploymentInput.resourceId,
        });
        yield* ensureRepositoryConfigMonitoringThresholds({
          seed: resolvedSeed,
          resourceId: deploymentInput.resourceId,
        });
        yield* ensureRepositoryConfigPreviewPolicy({
          seed: resolvedSeed,
          projectId: deploymentInput.projectId,
          resourceId: deploymentInput.resourceId,
        });
        yield* ensureRepositoryConfigAutoDeploy({
          seed: resolvedSeed,
          resourceId: deploymentInput.resourceId,
        });
        yield* persistServerAppliedRouteDesiredStateIfNeeded({
          seed: resolvedSeed,
          projectId: deploymentInput.projectId,
          serverId: deploymentInput.serverId,
          ...(deploymentInput.destinationId
            ? { destinationId: deploymentInput.destinationId }
            : {}),
          environmentId: deploymentInput.environmentId,
          resourceId: deploymentInput.resourceId,
        });

        yield* printDeploymentSummary({
          sourceLocator: normalizedSourceLocator,
          deploymentMethod,
          project,
          server,
          environment,
          resource,
        });

        return deploymentInput satisfies CreateDeploymentCommandInput;
      });

      if (!stateSession) {
        return yield* resolveInput;
      }

      const result = yield* Effect.either(resolveInput);
      yield* releaseDeploymentStateSession(stateSession);
      if (Either.isLeft(result)) {
        return yield* Effect.fail(result.left);
      }

      return result.right;
    }),
  );
}
