import {
  type CreateDeploymentCommandInput,
  CreateEnvironmentCommand,
  CreateProjectCommand,
  CreateResourceCommand,
  type CreateResourceCommandInput,
  type EnvironmentSummary,
  ListEnvironmentsQuery,
  ListProjectsQuery,
  ListResourcesQuery,
  ListServersQuery,
  type ProjectSummary,
  RegisterServerCommand,
  type ResourceSummary,
  type ServerSummary,
} from "@appaloft/application";
import {
  createQuickDeployGeneratedResourceName,
  normalizeQuickDeployGeneratedNameBase,
} from "@appaloft/contracts";
import { domainError, type EnvironmentKind, environmentKinds } from "@appaloft/core";
import { Effect } from "effect";

import { type CliInteraction, effectCliInteraction } from "../interaction.js";
import { CliRuntime, resultToEffect } from "../runtime.js";
import {
  type DeploymentMethod,
  deploymentMethods,
  normalizeCliPathOrSource,
} from "./deployment-source.js";

interface DeploymentPromptSeed {
  projectId?: string;
  serverId?: string;
  destinationId?: string;
  environmentId?: string;
  resourceId?: string;
  resource?: ResourceDraftInput;
  sourceLocator?: string;
  deploymentMethod?: DeploymentMethod;
  installCommand?: string;
  buildCommand?: string;
  startCommand?: string;
  port?: number;
  healthCheckPath?: string;
}

type ResourceDraftInput = Pick<CreateResourceCommandInput, "name"> &
  Partial<Pick<CreateResourceCommandInput, "kind" | "description" | "services">>;
type ResourceSourceInput = NonNullable<CreateResourceCommandInput["source"]>;
type ResourceRuntimeProfileInput = NonNullable<CreateResourceCommandInput["runtimeProfile"]>;
type ResourceNetworkProfileInput = NonNullable<CreateResourceCommandInput["networkProfile"]>;
type ResourceRuntimeProfileDraftInput = Partial<ResourceRuntimeProfileInput>;

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
const defaultApplicationInternalPort = 3000;

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

function resourceKindForDeploymentMethod(
  deploymentMethod: DeploymentMethod,
): NonNullable<CreateResourceCommandInput["kind"]> {
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

function sourceKindForDeploymentInput(
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

function sourceBindingForDeploymentInput(
  sourceLocator: string,
  deploymentMethod: DeploymentMethod,
): ResourceSourceInput {
  return {
    kind: sourceKindForDeploymentInput(sourceLocator, deploymentMethod),
    locator: sourceLocator,
    displayName: inferNameFromSource(sourceLocator),
  };
}

function runtimeProfileFromDeploymentInput(
  deploymentMethod: DeploymentMethod,
  input: ResourceRuntimeProfileDraftInput,
): ResourceRuntimeProfileInput {
  return {
    strategy: deploymentMethod,
    ...(input.installCommand ? { installCommand: input.installCommand } : {}),
    ...(input.buildCommand ? { buildCommand: input.buildCommand } : {}),
    ...(input.startCommand ? { startCommand: input.startCommand } : {}),
    ...(input.healthCheckPath ? { healthCheckPath: input.healthCheckPath } : {}),
  };
}

function networkProfileFromDeploymentInput(input: { port?: number }): ResourceNetworkProfileInput {
  return {
    internalPort: input.port ?? defaultApplicationInternalPort,
    upstreamProtocol: "http",
    exposureMode: "reverse-proxy",
  };
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

function createServer(input: { name: string; host: string; providerKey: string; port: number }) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const message = yield* resultToEffect(RegisterServerCommand.create(input));
    const result = yield* Effect.promise(() => cli.executeCommand(message));
    return yield* resultToEffect(result);
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

    const projectName = yield* input.interaction.text({
      message: "Project name",
      defaultValue: inferNameFromSource(input.sourceLocator),
      validate: requireNonEmpty("Project name"),
    });
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
      return {
        id: input.seed.serverId,
        label: input.seed.serverId,
      };
    }

    const host = yield* input.interaction.text({
      message: "Server host",
      defaultValue: defaultServerHost,
      validate: requireNonEmpty("Server host"),
    });
    const providerKey = yield* input.interaction.text({
      message: "Server provider",
      defaultValue: defaultServerProviderKey,
      validate: requireNonEmpty("Server provider"),
    });
    const port = Number(
      yield* input.interaction.text({
        message: "Server port",
        defaultValue: String(defaultServerPort),
        validate: requirePositiveInteger("Server port"),
      }),
    );
    const existing = findServer(input.servers, {
      host: host.trim(),
      providerKey: providerKey.trim(),
      port,
    });
    if (existing) {
      return {
        id: existing.id,
        label: `${existing.name} ${existing.providerKey} ${existing.host}:${existing.port}`,
      };
    }

    const name = yield* input.interaction.text({
      message: "Server name",
      defaultValue: defaultServerName,
      validate: requireNonEmpty("Server name"),
    });
    const created = yield* createServer({
      name: name.trim(),
      host: host.trim(),
      providerKey: providerKey.trim(),
      port,
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
    const name = yield* input.interaction.text({
      message: "Environment name",
      defaultValue: defaultEnvironmentName,
      validate: requireNonEmpty("Environment name"),
    });
    const kind = yield* input.interaction.select<EnvironmentKind>({
      message: "Environment kind",
      choices: environmentKinds.map((environmentKind) => ({
        title: environmentKind,
        value: environmentKind,
      })),
    });
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
          source: sourceBindingForDeploymentInput(input.sourceLocator, input.deploymentMethod),
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
}) {
  return Effect.gen(function* () {
    const canPrompt = Boolean(process.stdin.isTTY && process.stdout.isTTY);
    const hasSeedAdvancedConfig = Boolean(
      input.seed.installCommand ||
        input.seed.buildCommand ||
        input.seed.startCommand ||
        input.seed.port ||
        input.seed.healthCheckPath,
    );
    const shouldConfigure =
      hasSeedAdvancedConfig ||
      (canPrompt &&
        (yield* input.interaction.confirm({
          message: "Advanced config?",
          defaultValue: false,
        })));

    if (!shouldConfigure) {
      return { port: input.seed.port ?? defaultApplicationInternalPort };
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
    const startCommand =
      input.seed.startCommand ??
      (canPrompt
        ? trimToUndefined(
            yield* input.interaction.text({
              message: "Start command",
              defaultValue: "",
            }),
          )
        : undefined);
    const port =
      input.seed.port ??
      (canPrompt
        ? Number(
            yield* input.interaction.text({
              message: "Application port",
              defaultValue: String(defaultApplicationInternalPort),
              validate: requirePositiveInteger("Application port"),
            }),
          )
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
      ...(Number.isInteger(port) && port > 0 ? { port } : {}),
      ...(healthCheckPath ? { healthCheckPath } : {}),
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
    const advancedConfig = yield* resolveAdvancedDeploymentConfig({ interaction, seed });
    const runtimeProfile = runtimeProfileFromDeploymentInput(deploymentMethod, advancedConfig);
    const networkProfile = networkProfileFromDeploymentInput(advancedConfig);
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
