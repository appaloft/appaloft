import {
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
import { Effect } from "effect";

import { type CliInteraction, effectCliInteraction } from "../interaction.js";
import { CliRuntime, resultToEffect } from "../runtime.js";
import {
  type DeploymentMethod,
  deploymentMethods,
  normalizeCliPathOrSource,
} from "./deployment-source.js";

export interface DeploymentPromptSeed {
  projectId?: string;
  serverId?: string;
  destinationId?: string;
  environmentId?: string;
  resourceId?: string;
  server?: DeploymentServerDraft;
  environmentVariables?: DeploymentEnvironmentVariableSeed[];
  resource?: ResourceDraftInput;
  sourceLocator?: string;
  deploymentMethod?: DeploymentMethod;
  installCommand?: string;
  buildCommand?: string;
  startCommand?: string;
  publishDirectory?: string;
  port?: number;
  upstreamProtocol?: ResourceNetworkProfileInput["upstreamProtocol"];
  exposureMode?: ResourceNetworkProfileInput["exposureMode"];
  targetServiceName?: string;
  hostPort?: number;
  healthCheckPath?: string;
  healthCheck?: ResourceRuntimeProfileInput["healthCheck"];
  sourceProfile?: Partial<Pick<ResourceSourceInput, "gitRef" | "commitSha">>;
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

  return {
    ...(Object.keys(sourceProfile).length > 0 ? { sourceProfile } : {}),
    ...(config.runtime?.strategy ? { deploymentMethod: config.runtime.strategy } : {}),
    ...(config.runtime?.installCommand ? { installCommand: config.runtime.installCommand } : {}),
    ...(config.runtime?.buildCommand ? { buildCommand: config.runtime.buildCommand } : {}),
    ...(config.runtime?.startCommand ? { startCommand: config.runtime.startCommand } : {}),
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
    const name = canPrompt
      ? yield* input.interaction.text({
          message: "Environment name",
          defaultValue: defaultEnvironmentName,
          validate: requireNonEmpty("Environment name"),
        })
      : defaultEnvironmentName;
    const kind = canPrompt
      ? yield* input.interaction.select<EnvironmentKind>({
          message: "Environment kind",
          choices: environmentKinds.map((environmentKind) => ({
            title: environmentKind,
            value: environmentKind,
          })),
        })
      : "local";
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
    if (input.seed.resourceId) {
      return {
        id: input.seed.resourceId,
        label: input.seed.resourceId,
      };
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
          return {
            id: existing.id,
            label: `${existing.name} (${existing.kind})`,
          };
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

    return {
      id: resourceId,
      label: selectedResource ? `${selectedResource.name} (${selectedResource.kind})` : resourceId,
    };
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
    const projects = (yield* listProjects()).items;
    const servers = (yield* listServers()).items;
    const project = yield* resolveProject({
      interaction,
      projects,
      seed,
      sourceLocator: normalizedSourceLocator,
    });
    const server = yield* resolveServer({
      interaction,
      servers,
      seed,
    });
    const environment = yield* resolveEnvironment({
      interaction,
      seed,
      projectId: project.id,
    });
    const advancedConfig = yield* resolveAdvancedDeploymentConfig({
      interaction,
      seed,
      deploymentMethod,
    });
    const runtimeProfile = runtimeProfileFromDeploymentInput(deploymentMethod, advancedConfig);
    const networkProfile = networkProfileFromDeploymentInput(deploymentMethod, advancedConfig);
    const resource = yield* resolveResource({
      interaction,
      seed,
      projectId: project.id,
      environmentId: environment.id,
      sourceLocator: normalizedSourceLocator,
      deploymentMethod,
      runtimeProfile,
      networkProfile,
    });
    yield* applyEnvironmentVariables({
      environmentId: environment.id,
      ...(seed.environmentVariables ? { variables: seed.environmentVariables } : {}),
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
      ...(seed.destinationId ? { destinationId: seed.destinationId } : {}),
      environmentId: environment.id,
      resourceId: resource.id,
    } satisfies CreateDeploymentCommandInput;
  });
}
