import { Args, Command as EffectCommand, Options } from "@effect/cli";
import {
  CreateDeploymentCommand,
  type CreateDeploymentCommandInput,
  DeploymentLogsQuery,
  ListDeploymentsQuery,
} from "@yundu/application";
import { createQuickDeployGeneratedResourceName } from "@yundu/contracts";
import { resourceKinds } from "@yundu/core";
import { Effect } from "effect";

import { optionalNumber, optionalValue, runDeploymentCommand, runQuery } from "../runtime.js";
import { resolveInteractiveDeploymentInput } from "./deployment-interaction.js";
import { deploymentMethods, normalizeCliPathOrSource } from "./deployment-source.js";

const pathOrSourceArg = Args.text({ name: "pathOrSource" }).pipe(Args.optional);
const deploymentIdArg = Args.text({ name: "deploymentId" });

const projectOption = Options.text("project").pipe(Options.optional);
const serverOption = Options.text("server").pipe(Options.optional);
const destinationOption = Options.text("destination").pipe(Options.optional);
const environmentOption = Options.text("environment").pipe(Options.optional);
const resourceOption = Options.text("resource").pipe(Options.optional);
const resourceNameOption = Options.text("resource-name").pipe(Options.optional);
const resourceKindOption = Options.choice("resource-kind", resourceKinds).pipe(Options.optional);
const resourceDescriptionOption = Options.text("resource-description").pipe(Options.optional);
const methodOption = Options.choice("method", deploymentMethods).pipe(Options.optional);
const installOption = Options.text("install").pipe(Options.optional);
const buildOption = Options.text("build").pipe(Options.optional);
const startOption = Options.text("start").pipe(Options.optional);
const portOption = Options.text("port").pipe(Options.optional);
const healthPathOption = Options.text("health-path").pipe(Options.optional);
const appLogLinesOption = Options.text("app-log-lines").pipe(Options.withDefault("3"));
function parseAppLogLines(value: string): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 3;
}

function inferResourceName(sourceLocator: string): string {
  const withoutQuery = sourceLocator.split(/[?#]/)[0] ?? sourceLocator;
  const segments = withoutQuery.split(/[\\/]/).filter(Boolean);
  return createQuickDeployGeneratedResourceName(segments.at(-1) ?? "app");
}

export const deployCommand = EffectCommand.make(
  "deploy",
  {
    pathOrSource: pathOrSourceArg,
    project: projectOption,
    server: serverOption,
    destination: destinationOption,
    environment: environmentOption,
    resource: resourceOption,
    resourceName: resourceNameOption,
    resourceKind: resourceKindOption,
    resourceDescription: resourceDescriptionOption,
    method: methodOption,
    install: installOption,
    build: buildOption,
    start: startOption,
    port: portOption,
    healthPath: healthPathOption,
    appLogLines: appLogLinesOption,
  },
  ({
    appLogLines,
    build,
    destination,
    environment,
    healthPath,
    install,
    method,
    pathOrSource,
    port,
    project,
    resource,
    resourceDescription,
    resourceKind,
    resourceName,
    server,
    start,
  }) =>
    Effect.gen(function* () {
      const sourceLocator = optionalValue(pathOrSource);
      const deploymentMethod = optionalValue(method);
      const portValue = optionalNumber(port);
      const projectId = optionalValue(project);
      const serverId = optionalValue(server);
      const destinationId = optionalValue(destination);
      const environmentId = optionalValue(environment);
      const resourceId = optionalValue(resource);
      const resourceNameValue = optionalValue(resourceName);
      const resourceKindValue = optionalValue(resourceKind);
      const resourceDescriptionValue = optionalValue(resourceDescription);
      const installCommand = optionalValue(install);
      const buildCommand = optionalValue(build);
      const startCommand = optionalValue(start);
      const healthCheckPath = optionalValue(healthPath);

      if (!sourceLocator && projectId && serverId && environmentId && resourceId) {
        const input = {
          projectId,
          serverId,
          environmentId,
          resourceId,
          ...(destinationId ? { destinationId } : {}),
        } satisfies CreateDeploymentCommandInput;

        return yield* runDeploymentCommand(CreateDeploymentCommand.create(input), {
          appLogLines: parseAppLogLines(appLogLines),
        });
      }

      const normalizedSourceLocator = sourceLocator
        ? normalizeCliPathOrSource(sourceLocator, deploymentMethod ?? "auto")
        : undefined;
      const resourceSpec =
        !resourceId && (resourceNameValue || normalizedSourceLocator)
          ? {
              name: resourceNameValue ?? inferResourceName(normalizedSourceLocator ?? "."),
              kind:
                resourceKindValue ??
                (deploymentMethod === "docker-compose" ? "compose-stack" : "application"),
              ...(resourceDescriptionValue ? { description: resourceDescriptionValue } : {}),
            }
          : undefined;
      const seed = {
        ...(projectId ? { projectId } : {}),
        ...(serverId ? { serverId } : {}),
        ...(destinationId ? { destinationId } : {}),
        ...(environmentId ? { environmentId } : {}),
        ...(resourceId ? { resourceId } : {}),
        ...(resourceSpec ? { resource: resourceSpec } : {}),
        ...(deploymentMethod ? { deploymentMethod } : {}),
        ...(installCommand ? { installCommand } : {}),
        ...(buildCommand ? { buildCommand } : {}),
        ...(startCommand ? { startCommand } : {}),
        ...(portValue === undefined ? {} : { port: portValue }),
        ...(healthCheckPath ? { healthCheckPath } : {}),
      };
      const input = yield* resolveInteractiveDeploymentInput({
        ...seed,
        ...(sourceLocator ? { sourceLocator: normalizedSourceLocator ?? sourceLocator } : {}),
      });

      return yield* runDeploymentCommand(CreateDeploymentCommand.create(input), {
        appLogLines: parseAppLogLines(appLogLines),
      });
    }),
).pipe(EffectCommand.withDescription("Create a deployment"));

export const logsCommand = EffectCommand.make(
  "logs",
  {
    deploymentId: deploymentIdArg,
  },
  ({ deploymentId }) => runQuery(DeploymentLogsQuery.create({ deploymentId })),
).pipe(EffectCommand.withDescription("Show deployment logs"));

const listDeploymentsCommand = EffectCommand.make(
  "list",
  {
    project: projectOption,
    resource: resourceOption,
  },
  ({ project, resource }) =>
    runQuery(
      ListDeploymentsQuery.create({
        projectId: optionalValue(project),
        resourceId: optionalValue(resource),
      }),
    ),
).pipe(EffectCommand.withDescription("List deployments"));

export const deploymentsCommand = EffectCommand.make("deployments").pipe(
  EffectCommand.withDescription("Deployment queries"),
  EffectCommand.withSubcommands([listDeploymentsCommand]),
);
