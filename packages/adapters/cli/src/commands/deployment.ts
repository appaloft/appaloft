import { Args, Command as EffectCommand, Options } from "@effect/cli";
import {
  CreateDeploymentCommand,
  DeploymentLogsQuery,
  ListDeploymentsQuery,
  RollbackDeploymentCommand,
} from "@yundu/application";
import { Effect } from "effect";

import {
  optionalNumber,
  optionalValue,
  runCommand,
  runDeploymentCommand,
  runQuery,
} from "../runtime.js";
import { resolveInteractiveDeploymentInput } from "./deployment-interaction.js";
import { deploymentMethods, normalizeCliPathOrSource } from "./deployment-source.js";

const pathOrSourceArg = Args.text({ name: "pathOrSource" }).pipe(Args.optional);
const deploymentIdArg = Args.text({ name: "deploymentId" });

const projectOption = Options.text("project").pipe(Options.optional);
const serverOption = Options.text("server").pipe(Options.optional);
const destinationOption = Options.text("destination").pipe(Options.optional);
const environmentOption = Options.text("environment").pipe(Options.optional);
const resourceOption = Options.text("resource").pipe(Options.optional);
const configOption = Options.text("config").pipe(Options.optional);
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

export const deployCommand = EffectCommand.make(
  "deploy",
  {
    pathOrSource: pathOrSourceArg,
    project: projectOption,
    server: serverOption,
    destination: destinationOption,
    environment: environmentOption,
    resource: resourceOption,
    config: configOption,
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
    config,
    destination,
    environment,
    healthPath,
    install,
    method,
    pathOrSource,
    port,
    project,
    resource,
    server,
    start,
  }) =>
    Effect.gen(function* () {
      const sourceLocator = optionalValue(pathOrSource);
      const deploymentMethod = optionalValue(method);
      const portValue = optionalNumber(port);
      const configFilePath = optionalValue(config);
      const projectId = optionalValue(project);
      const serverId = optionalValue(server);
      const destinationId = optionalValue(destination);
      const environmentId = optionalValue(environment);
      const resourceId = optionalValue(resource);
      const installCommand = optionalValue(install);
      const buildCommand = optionalValue(build);
      const startCommand = optionalValue(start);
      const healthCheckPath = optionalValue(healthPath);
      const seed = {
        ...(configFilePath ? { configFilePath } : {}),
        ...(projectId ? { projectId } : {}),
        ...(serverId ? { serverId } : {}),
        ...(destinationId ? { destinationId } : {}),
        ...(environmentId ? { environmentId } : {}),
        ...(resourceId ? { resourceId } : {}),
        ...(deploymentMethod ? { deploymentMethod } : {}),
        ...(installCommand ? { installCommand } : {}),
        ...(buildCommand ? { buildCommand } : {}),
        ...(startCommand ? { startCommand } : {}),
        ...(portValue === undefined ? {} : { port: portValue }),
        ...(healthCheckPath ? { healthCheckPath } : {}),
      };
      const input = sourceLocator
        ? {
            ...seed,
            sourceLocator: normalizeCliPathOrSource(sourceLocator, deploymentMethod ?? "auto"),
          }
        : yield* resolveInteractiveDeploymentInput(seed);

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

export const rollbackCommand = EffectCommand.make(
  "rollback",
  {
    deploymentId: deploymentIdArg,
  },
  ({ deploymentId }) => runCommand(RollbackDeploymentCommand.create({ deploymentId })),
).pipe(EffectCommand.withDescription("Rollback a deployment"));
