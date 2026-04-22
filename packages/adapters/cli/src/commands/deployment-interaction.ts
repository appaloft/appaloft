import {
  ConfigureResourceRuntimeCommand,
  ConfigureServerCredentialCommand,
  type ConfigureServerCredentialCommandInput,
  type CreateDeploymentCommandInput,
  CreateEnvironmentCommand,
  CreateProjectCommand,
  CreateResourceCommand,
  type CreateResourceCommandInput,
  CreateSshCredentialCommand,
  type CreateSshCredentialCommandInput,
  type EnvironmentSummary,
  ListEnvironmentsQuery,
  ListProjectsQuery,
  ListResourcesQuery,
  ListServersQuery,
  type ProjectSummary,
  RegisterServerCommand,
  type RegisterServerCommandInput,
  type ResourceSummary,
  type ServerSummary,
  SetEnvironmentVariableCommand,
  type SetEnvironmentVariableCommandInput,
} from "@appaloft/application";
import {
  createQuickDeployGeneratedResourceName,
  normalizeQuickDeployGeneratedNameBase,
} from "@appaloft/contracts";
import {
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
} from "./deployment-remote-state.js";
import {
  type DeploymentMethod,
  deploymentMethods,
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
  sourceProfile?: Partial<Pick<ResourceSourceInput, "gitRef" | "commitSha">>;
  sourceFingerprint?: string;
  stateBackend?: DeploymentStateBackendDecision;
  stateBackendPrepared?: boolean;
  serverAppliedRoutes?: DeploymentServerAppliedRouteSeed[];
}

type ResourceDraftInput = Pick<CreateResourceCommandInput, "name"> &
  Partial<Pick<CreateResourceCommandInput, "kind" | "description" | "services">>;
type ResourceSourceInput = NonNullable<CreateResourceCommandInput["source"]>;
type ResourceRuntimeProfileInput = NonNullable<CreateResourceCommandInput["runtimeProfile"]>;
type ResourceNetworkProfileInput = NonNullable<CreateResourceCommandInput["networkProfile"]>;
type ResourceRuntimeProfileDraftInput = Partial<ResourceRuntimeProfileInput>;
export type DeploymentEnvironmentVariableSeed = Omit<
  SetEnvironmentVariableCommandInput,
  "environmentId"
> & {
  environmentId?: string;
};
export type DeploymentServerAppliedRouteSeed = ServerAppliedRouteDomainIntent;

export interface DeploymentEnvironmentVariablesFromConfigOptions {
  env?: Record<string, string | undefined>;
}

export interface DeploymentServerDraft {
  name?: string;
  host?: string;
  providerKey?: string;
  port?: number;
  proxyKind?: RegisterServerCommandInput["proxyKind"];
  credential?: ConfigureServerCredentialCommandInput["credential"];
  reusableSshCredential?: CreateSshCredentialCommandInput;
}

export interface DeploymentEnvironmentDraft {
  name: string;
  kind: EnvironmentKind;
}

interface ResolvedReference {
  id: string;
  label: string;
}

interface ResolvedOptionalReference {
  id?: string;
  label: string;
  resource?: ResourceDraftInput;
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
): NonNullable<CreateResourceCommandInput["kind"]> {
  if (deploymentMethod === "static") {
    return "static-site";
  }

  return deploymentMethod === "docker-compose" ? "compose-stack" : "application";
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
  profile: Partial<Pick<ResourceSourceInput, "gitRef" | "commitSha">> = {},
): ResourceSourceInput {
  return {
    kind: sourceKindForDeploymentInput(sourceLocator, deploymentMethod),
    locator: sourceLocator,
    displayName: inferNameFromSource(sourceLocator),
    ...(profile.gitRef ? { gitRef: profile.gitRef } : {}),
    ...(profile.commitSha ? { commitSha: profile.commitSha } : {}),
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
  if (!healthCheck) {
    return undefined;
  }

  return {
    enabled: healthCheck.enabled ?? true,
    type: "http",
    intervalSeconds: healthCheck.intervalSeconds ?? 5,
    timeoutSeconds: healthCheck.timeoutSeconds ?? 5,
    retries: healthCheck.retries ?? 10,
    startPeriodSeconds: 5,
    http: {
      method: "GET",
      scheme: "http",
      host: "localhost",
      path: path ?? "/",
      expectedStatusCode: 200,
    },
  };
}

export function deploymentPromptSeedFromConfig(
  config: AppaloftDeploymentConfig,
): DeploymentPromptSeed {
  const healthCheckPath =
    config.runtime?.healthCheckPath ?? config.runtime?.healthCheck?.path ?? config.health?.path;
  const sourceProfile = {
    ...(config.source?.gitRef ? { gitRef: config.source.gitRef } : {}),
    ...(config.source?.commitSha ? { commitSha: config.source.commitSha } : {}),
  };
  const healthCheck = healthCheckFromConfig(config);
  const serverAppliedRoutes = config.access?.domains.map((domain) => ({
    host: domain.host,
    pathPrefix: domain.pathPrefix,
    tlsMode: domain.tlsMode,
    ...(domain.redirectTo ? { redirectTo: domain.redirectTo } : {}),
    ...(domain.redirectStatus ? { redirectStatus: domain.redirectStatus } : {}),
  }));

  return {
    ...(Object.keys(sourceProfile).length > 0 ? { sourceProfile } : {}),
    ...(config.runtime?.strategy ? { deploymentMethod: config.runtime.strategy } : {}),
    ...(config.runtime?.installCommand ? { installCommand: config.runtime.installCommand } : {}),
    ...(config.runtime?.buildCommand ? { buildCommand: config.runtime.buildCommand } : {}),
    ...(config.runtime?.startCommand ? { startCommand: config.runtime.startCommand } : {}),
    ...(config.runtime?.name ? { runtimeNameTemplate: config.runtime.name } : {}),
    ...(config.runtime?.publishDirectory
      ? { publishDirectory: config.runtime.publishDirectory }
      : {}),
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
  };
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

export function deploymentEnvironmentVariablesFromConfig(
  config: AppaloftDeploymentConfig,
  options: DeploymentEnvironmentVariablesFromConfigOptions = {},
): Result<DeploymentEnvironmentVariableSeed[]> {
  const variables: DeploymentEnvironmentVariableSeed[] = [];

  for (const [key, value] of Object.entries(config.env ?? {}).sort(compareConfigKeys)) {
    variables.push({
      key,
      value: String(value),
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

function applyServerCredential(input: { serverId: string; seed: DeploymentPromptSeed }) {
  return Effect.gen(function* () {
    const reusableCredential = input.seed.server?.reusableSshCredential;
    if (reusableCredential) {
      const created = yield* createSshCredential(reusableCredential);
      yield* configureServerCredential({
        serverId: input.serverId,
        credential: {
          kind: "stored-ssh-private-key",
          credentialId: created.id,
          ...(reusableCredential.username ? { username: reusableCredential.username } : {}),
        },
      });
      return;
    }

    const credential = input.seed.server?.credential;
    if (credential) {
      yield* configureServerCredential({
        serverId: input.serverId,
        credential,
      });
    }
  });
}

function createEnvironment(input: { projectId: string; name: string; kind: EnvironmentKind }) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(CreateEnvironmentCommand.create(input));
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
  });
}

function createResource(input: {
  projectId: string;
  environmentId: string;
  resource: ResourceDraftInput;
  source: ResourceSourceInput;
  runtimeProfile: ResourceRuntimeProfileInput;
  networkProfile: ResourceNetworkProfileInput;
}) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(
      CreateResourceCommand.create({
        projectId: input.projectId,
        environmentId: input.environmentId,
        name: input.resource.name,
        kind: input.resource.kind ?? "application",
        ...(input.resource.description ? { description: input.resource.description } : {}),
        ...(input.resource.services && input.resource.services.length > 0
          ? { services: input.resource.services }
          : {}),
        source: input.source,
        runtimeProfile: input.runtimeProfile,
        networkProfile: input.networkProfile,
      }),
    );
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
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

function setEnvironmentVariable(input: SetEnvironmentVariableCommandInput) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(SetEnvironmentVariableCommand.create(input));
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
  });
}

function applyEnvironmentVariables(input: {
  environmentId: string;
  variables?: DeploymentEnvironmentVariableSeed[];
}) {
  return Effect.gen(function* () {
    for (const variable of input.variables ?? []) {
      yield* setEnvironmentVariable({
        ...variable,
        environmentId: variable.environmentId ?? input.environmentId,
      });
    }
  });
}

function printDeploymentSummary(input: {
  sourceLocator: string;
  deploymentMethod: DeploymentMethod;
  project: ResolvedReference;
  server: ResolvedReference;
  environment: ResolvedReference;
  resource: ResolvedOptionalReference;
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
}) {
  return Effect.gen(function* () {
    if (input.seed.projectId) {
      return {
        id: input.seed.projectId,
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
        id: existing.id,
        label: `${existing.name} (${existing.slug})`,
      };
    }

    const created = yield* createProject({ name: projectName.trim() });
    return {
      id: created.id,
      label: projectName.trim(),
    };
  });
}

function resolveServer(input: {
  interaction: CliInteraction;
  servers: ServerSummary[];
  seed: DeploymentPromptSeed;
}) {
  return Effect.gen(function* () {
    if (input.seed.serverId) {
      yield* applyServerCredential({
        serverId: input.seed.serverId,
        seed: input.seed,
      });
      return {
        id: input.seed.serverId,
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
      yield* applyServerCredential({
        serverId: existing.id,
        seed: input.seed,
      });
      return {
        id: existing.id,
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
    const created = yield* createServer({
      name: name.trim(),
      host: host.trim(),
      providerKey: providerKey.trim(),
      port,
      ...(input.seed.server?.proxyKind ? { proxyKind: input.seed.server.proxyKind } : {}),
    });
    yield* applyServerCredential({
      serverId: created.id,
      seed: input.seed,
    });
    return {
      id: created.id,
      label: `${name.trim()} ${providerKey.trim()} ${host.trim()}:${port}`,
    };
  });
}

function resolveEnvironment(input: {
  interaction: CliInteraction;
  seed: DeploymentPromptSeed;
  projectId: string;
}) {
  return Effect.gen(function* () {
    if (input.seed.environmentId) {
      return {
        id: input.seed.environmentId,
        label: input.seed.environmentId,
      };
    }

    const environments = (yield* listEnvironments(input.projectId)).items;
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
    const existing = findEnvironment(environments, {
      projectId: input.projectId,
      name,
      kind,
    });
    if (existing) {
      return {
        id: existing.id,
        label: `${existing.name} (${existing.kind})`,
      };
    }

    const created = yield* createEnvironment({
      projectId: input.projectId,
      name: name.trim(),
      kind,
    });
    return {
      id: created.id,
      label: `${name.trim()} (${kind})`,
    };
  });
}

function resolveResource(input: {
  interaction: CliInteraction;
  seed: DeploymentPromptSeed;
  projectId: string;
  environmentId: string;
  sourceLocator: string;
  deploymentMethod: DeploymentMethod;
  runtimeProfile: ResourceRuntimeProfileInput;
  networkProfile: ResourceNetworkProfileInput;
}) {
  return Effect.gen(function* () {
    const reuseResolvedResource = (resource: { id: string; label: string }) =>
      Effect.gen(function* () {
        yield* configureResourceRuntime({
          resourceId: resource.id,
          runtimeProfile: input.runtimeProfile,
        });
        return resource;
      });

    if (input.seed.resourceId) {
      return yield* reuseResolvedResource({
        id: input.seed.resourceId,
        label: input.seed.resourceId,
      });
    }

    const sourceResource =
      input.seed.resource ?? inferResourceFromSource(input.sourceLocator, input.deploymentMethod);
    const sourceResourceLabel = `${sourceResource.name} (${sourceResource.kind ?? "application"})`;
    const resources = (yield* listResources(input.projectId, input.environmentId)).items;

    const createOrReuseSourceResource = (resource: NonNullable<typeof sourceResource>) =>
      Effect.gen(function* () {
        const existing = findResource(resources, {
          projectId: input.projectId,
          environmentId: input.environmentId,
          name: resource.name,
        });

        if (existing) {
          return yield* reuseResolvedResource({
            id: existing.id,
            label: `${existing.name} (${existing.kind})`,
          });
        }

        const created = yield* createResource({
          projectId: input.projectId,
          environmentId: input.environmentId,
          resource,
          source: sourceBindingForDeploymentInput(
            input.sourceLocator,
            input.deploymentMethod,
            input.seed.sourceProfile,
          ),
          runtimeProfile: input.runtimeProfile,
          networkProfile: input.networkProfile,
        });
        return {
          id: created.id,
          label: sourceResourceLabel,
        };
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
      label: selectedResource ? `${selectedResource.name} (${selectedResource.kind})` : resourceId,
    });
  });
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

export function resolveInteractiveDeploymentInput(
  seed: DeploymentPromptSeed,
  interaction: CliInteraction = effectCliInteraction,
) {
  return Effect.gen(function* () {
    if (!seed.sourceLocator && (!process.stdin.isTTY || !process.stdout.isTTY)) {
      yield* Effect.sync(() => {
        process.exitCode = 1;
      });
      return yield* Effect.fail(
        domainError.validation("pathOrSource is required outside an interactive terminal"),
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
      const server = yield* resolveServer({
        interaction,
        servers,
        seed: resolvedSeed,
      });
      const environment = yield* resolveEnvironment({
        interaction,
        seed: resolvedSeed,
        projectId: project.id,
      });
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
        projectId: project.id,
        environmentId: environment.id,
        sourceLocator: normalizedSourceLocator,
        deploymentMethod,
        runtimeProfile,
        networkProfile,
      });
      yield* applyEnvironmentVariables({
        environmentId: environment.id,
        ...(resolvedSeed.environmentVariables
          ? { variables: resolvedSeed.environmentVariables }
          : {}),
      });
      yield* persistSourceLinkIfNeeded({
        seed: resolvedSeed,
        projectId: project.id,
        serverId: server.id,
        ...(resolvedSeed.destinationId ? { destinationId: resolvedSeed.destinationId } : {}),
        environmentId: environment.id,
        resourceId: resource.id,
      });
      yield* persistServerAppliedRouteDesiredStateIfNeeded({
        seed: resolvedSeed,
        projectId: project.id,
        serverId: server.id,
        ...(resolvedSeed.destinationId ? { destinationId: resolvedSeed.destinationId } : {}),
        environmentId: environment.id,
        resourceId: resource.id,
      });

      yield* printDeploymentSummary({
        sourceLocator: normalizedSourceLocator,
        deploymentMethod,
        project,
        server,
        environment,
        resource,
      });

      return {
        projectId: project.id,
        serverId: server.id,
        ...(resolvedSeed.destinationId ? { destinationId: resolvedSeed.destinationId } : {}),
        environmentId: environment.id,
        resourceId: resource.id,
      } satisfies CreateDeploymentCommandInput;
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
  });
}
