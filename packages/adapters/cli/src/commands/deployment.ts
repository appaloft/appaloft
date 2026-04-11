import { Args, Command as EffectCommand, Options } from "@effect/cli";
import {
  CreateDeploymentCommand,
  DeploymentLogsQuery,
  ListDeploymentsQuery,
  RollbackDeploymentCommand,
} from "@yundu/application";

import { optionalNumber, optionalValue, runCommand, runQuery } from "../runtime.js";

const pathOrSourceArg = Args.text({ name: "pathOrSource" });
const deploymentIdArg = Args.text({ name: "deploymentId" });

const projectOption = Options.text("project").pipe(Options.optional);
const serverOption = Options.text("server").pipe(Options.optional);
const environmentOption = Options.text("environment").pipe(Options.optional);
const methodOption = Options.choice("method", [
  "auto",
  "dockerfile",
  "docker-compose",
  "prebuilt-image",
  "workspace-commands",
] as const).pipe(Options.withDefault("auto"));
const installOption = Options.text("install").pipe(Options.optional);
const buildOption = Options.text("build").pipe(Options.optional);
const startOption = Options.text("start").pipe(Options.optional);
const portOption = Options.text("port").pipe(Options.optional);
const healthPathOption = Options.text("health-path").pipe(Options.optional);

export const deployCommand = EffectCommand.make(
  "deploy",
  {
    pathOrSource: pathOrSourceArg,
    project: projectOption,
    server: serverOption,
    environment: environmentOption,
    method: methodOption,
    install: installOption,
    build: buildOption,
    start: startOption,
    port: portOption,
    healthPath: healthPathOption,
  },
  ({
    build,
    environment,
    healthPath,
    install,
    method,
    pathOrSource,
    port,
    project,
    server,
    start,
  }) =>
    runCommand(
      CreateDeploymentCommand.create({
        projectId: optionalValue(project),
        serverId: optionalValue(server),
        environmentId: optionalValue(environment),
        sourceLocator: pathOrSource,
        deploymentMethod: method,
        installCommand: optionalValue(install),
        buildCommand: optionalValue(build),
        startCommand: optionalValue(start),
        ...(optionalNumber(port) === undefined ? {} : { port: optionalNumber(port) }),
        ...(optionalValue(healthPath) === undefined
          ? {}
          : { healthCheckPath: optionalValue(healthPath) }),
      }),
    ),
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
  },
  ({ project }) =>
    runQuery(
      ListDeploymentsQuery.create({
        projectId: optionalValue(project),
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
