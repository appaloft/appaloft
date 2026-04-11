import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { Args, Command as EffectCommand, Options } from "@effect/cli";
import {
  CreateDeploymentCommand,
  DeploymentLogsQuery,
  ListDeploymentsQuery,
  RollbackDeploymentCommand,
} from "@yundu/application";

import {
  optionalNumber,
  optionalValue,
  runCommand,
  runDeploymentCommand,
  runQuery,
} from "../runtime.js";

const pathOrSourceArg = Args.text({ name: "pathOrSource" });
const deploymentIdArg = Args.text({ name: "deploymentId" });

const projectOption = Options.text("project").pipe(Options.optional);
const serverOption = Options.text("server").pipe(Options.optional);
const environmentOption = Options.text("environment").pipe(Options.optional);
const deploymentMethods = [
  "auto",
  "dockerfile",
  "docker-compose",
  "prebuilt-image",
  "workspace-commands",
] as const;
type DeploymentMethod = (typeof deploymentMethods)[number];
const methodOption = Options.choice("method", deploymentMethods).pipe(Options.withDefault("auto"));
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

function isRemoteOrImageSource(locator: string): boolean {
  return (
    /^(https?|ssh|git):\/\//.test(locator) ||
    /^[^/\\]+@[^/\\]+:/.test(locator) ||
    locator.startsWith("docker://") ||
    locator.startsWith("image://")
  );
}

function normalizeCliPathOrSource(locator: string, method: DeploymentMethod): string {
  if (method === "prebuilt-image" || isRemoteOrImageSource(locator) || isAbsolute(locator)) {
    return locator;
  }

  const bases = [process.env.PWD, process.cwd()].filter(
    (base): base is string => typeof base === "string" && base.length > 0,
  );
  for (const base of bases) {
    const candidate = resolve(base, locator);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return locator;
}

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
    appLogLines: appLogLinesOption,
  },
  ({
    appLogLines,
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
    runDeploymentCommand(
      CreateDeploymentCommand.create({
        projectId: optionalValue(project),
        serverId: optionalValue(server),
        environmentId: optionalValue(environment),
        sourceLocator: normalizeCliPathOrSource(pathOrSource, method),
        deploymentMethod: method,
        installCommand: optionalValue(install),
        buildCommand: optionalValue(build),
        startCommand: optionalValue(start),
        ...(optionalNumber(port) === undefined ? {} : { port: optionalNumber(port) }),
        ...(optionalValue(healthPath) === undefined
          ? {}
          : { healthCheckPath: optionalValue(healthPath) }),
      }),
      {
        appLogLines: parseAppLogLines(appLogLines),
      },
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
