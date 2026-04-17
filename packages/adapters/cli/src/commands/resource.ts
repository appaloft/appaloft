import {
  ConfigureResourceHealthCommand,
  CreateResourceCommand,
  ListResourcesQuery,
  OpenTerminalSessionCommand,
  ResourceDiagnosticSummaryQuery,
  ResourceHealthQuery,
  ResourceProxyConfigurationPreviewQuery,
  ResourceRuntimeLogsQuery,
} from "@appaloft/application";
import { resourceKinds } from "@appaloft/core";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import {
  optionalNumber,
  optionalValue,
  runCommand,
  runQuery,
  runResourceRuntimeLogsQuery,
} from "../runtime.js";

const resourceIdArg = Args.text({ name: "resourceId" });
const projectOption = Options.text("project").pipe(Options.optional);
const environmentOption = Options.text("environment").pipe(Options.optional);
const createProjectOption = Options.text("project");
const createEnvironmentOption = Options.text("environment");
const nameOption = Options.text("name");
const kindOption = Options.choice("kind", resourceKinds).pipe(Options.withDefault("application"));
const destinationOption = Options.text("destination").pipe(Options.optional);
const descriptionOption = Options.text("description").pipe(Options.optional);
const internalPortOption = Options.text("internal-port").pipe(Options.optional);
const portOption = Options.text("port").pipe(Options.optional);
const deploymentOption = Options.text("deployment").pipe(Options.optional);
const directoryOption = Options.text("directory").pipe(Options.optional);
const rowsOption = Options.text("rows").pipe(Options.withDefault("24"));
const colsOption = Options.text("cols").pipe(Options.withDefault("80"));
const serviceOption = Options.text("service").pipe(Options.optional);
const routeScopeOption = Options.choice("scope", ["planned", "latest", "deployment-snapshot"]).pipe(
  Options.withDefault("latest"),
);
const diagnosticsOption = Options.boolean("diagnostics").pipe(Options.withDefault(false));
const liveOption = Options.boolean("live").pipe(Options.withDefault(false));
const includeChecksOption = Options.boolean("checks").pipe(Options.withDefault(true));
const publicAccessProbeOption = Options.boolean("public-access-probe").pipe(
  Options.withDefault(false),
);
const runtimeProbeOption = Options.boolean("runtime-probe").pipe(Options.withDefault(false));
const healthPathOption = Options.text("path").pipe(Options.withDefault("/"));
const healthMethodOption = Options.choice("method", ["GET", "HEAD", "POST", "OPTIONS"]).pipe(
  Options.withDefault("GET"),
);
const healthSchemeOption = Options.choice("scheme", ["http", "https"]).pipe(
  Options.withDefault("http"),
);
const healthHostOption = Options.text("host").pipe(Options.withDefault("localhost"));
const healthPortOption = Options.text("health-port").pipe(Options.optional);
const healthExpectedStatusOption = Options.text("expected-status").pipe(Options.withDefault("200"));
const healthExpectedTextOption = Options.text("expected-text").pipe(Options.optional);
const healthIntervalOption = Options.text("interval").pipe(Options.withDefault("5"));
const healthTimeoutOption = Options.text("timeout").pipe(Options.withDefault("5"));
const healthRetriesOption = Options.text("retries").pipe(Options.withDefault("10"));
const healthStartPeriodOption = Options.text("start-period").pipe(Options.withDefault("5"));
const disableHealthOption = Options.boolean("disable").pipe(Options.withDefault(false));
const tailOption = Options.text("tail").pipe(Options.withDefault("100"));
const diagnosticTailOption = Options.text("tail").pipe(Options.withDefault("20"));
const includeDeploymentLogsOption = Options.boolean("deployment-logs").pipe(
  Options.withDefault(true),
);
const includeRuntimeLogsOption = Options.boolean("runtime-logs").pipe(Options.withDefault(false));
const includeProxyConfigurationOption = Options.boolean("proxy-configuration").pipe(
  Options.withDefault(false),
);
const jsonOption = Options.boolean("json").pipe(Options.withDefault(true));
const followOption = Options.boolean("follow").pipe(Options.withDefault(false));

const listCommand = EffectCommand.make(
  "list",
  {
    project: projectOption,
    environment: environmentOption,
  },
  ({ environment, project }) =>
    runQuery(
      ListResourcesQuery.create({
        projectId: optionalValue(project),
        environmentId: optionalValue(environment),
      }),
    ),
).pipe(EffectCommand.withDescription("List resources"));

const createCommand = EffectCommand.make(
  "create",
  {
    project: createProjectOption,
    environment: createEnvironmentOption,
    name: nameOption,
    kind: kindOption,
    destination: destinationOption,
    description: descriptionOption,
    internalPort: internalPortOption,
    port: portOption,
  },
  ({ description, destination, environment, internalPort, kind, name, port, project }) => {
    const internalPortValue = optionalNumber(internalPort) ?? optionalNumber(port);
    return runCommand(
      CreateResourceCommand.create({
        projectId: project,
        environmentId: environment,
        name,
        kind,
        destinationId: optionalValue(destination),
        description: optionalValue(description),
        ...(internalPortValue
          ? {
              networkProfile: {
                internalPort: internalPortValue,
                upstreamProtocol: "http",
                exposureMode: "reverse-proxy",
              },
            }
          : {}),
      }),
    );
  },
).pipe(EffectCommand.withDescription("Create a resource"));

const logsCommand = EffectCommand.make(
  "logs",
  {
    resourceId: resourceIdArg,
    deployment: deploymentOption,
    service: serviceOption,
    tail: tailOption,
    follow: followOption,
  },
  ({ deployment, follow, resourceId, service, tail }) =>
    runResourceRuntimeLogsQuery(
      ResourceRuntimeLogsQuery.create({
        resourceId,
        deploymentId: optionalValue(deployment),
        serviceName: optionalValue(service),
        tailLines: Number(tail),
        follow,
      }),
    ),
).pipe(EffectCommand.withDescription("Show resource runtime logs"));

const terminalCommand = EffectCommand.make(
  "terminal",
  {
    resourceId: resourceIdArg,
    deployment: deploymentOption,
    directory: directoryOption,
    rows: rowsOption,
    cols: colsOption,
  },
  ({ cols, deployment, directory, resourceId, rows }) =>
    runCommand(
      OpenTerminalSessionCommand.create({
        scope: {
          kind: "resource",
          resourceId,
          deploymentId: optionalValue(deployment),
        },
        relativeDirectory: optionalValue(directory),
        initialRows: Number(rows),
        initialCols: Number(cols),
      }),
    ),
).pipe(EffectCommand.withDescription("Open a resource terminal session"));

const proxyConfigCommand = EffectCommand.make(
  "proxy-config",
  {
    resourceId: resourceIdArg,
    deployment: deploymentOption,
    scope: routeScopeOption,
    diagnostics: diagnosticsOption,
  },
  ({ deployment, diagnostics, resourceId, scope }) =>
    runQuery(
      ResourceProxyConfigurationPreviewQuery.create({
        resourceId,
        deploymentId: optionalValue(deployment),
        routeScope: scope,
        includeDiagnostics: diagnostics,
      }),
    ),
).pipe(EffectCommand.withDescription("Show resource proxy configuration"));

const diagnoseCommand = EffectCommand.make(
  "diagnose",
  {
    resourceId: resourceIdArg,
    deployment: deploymentOption,
    deploymentLogs: includeDeploymentLogsOption,
    runtimeLogs: includeRuntimeLogsOption,
    proxyConfiguration: includeProxyConfigurationOption,
    tail: diagnosticTailOption,
    json: jsonOption,
  },
  ({ deployment, deploymentLogs, json, proxyConfiguration, resourceId, runtimeLogs, tail }) => {
    void json;
    return runQuery(
      ResourceDiagnosticSummaryQuery.create({
        resourceId,
        deploymentId: optionalValue(deployment),
        includeDeploymentLogTail: deploymentLogs,
        includeRuntimeLogTail: runtimeLogs,
        includeProxyConfiguration: proxyConfiguration,
        tailLines: Number(tail),
      }),
    );
  },
).pipe(EffectCommand.withDescription("Copy resource diagnostic summary context"));

const healthCommand = EffectCommand.make(
  "health",
  {
    resourceId: resourceIdArg,
    live: liveOption,
    checks: includeChecksOption,
    publicAccessProbe: publicAccessProbeOption,
    runtimeProbe: runtimeProbeOption,
    json: jsonOption,
  },
  ({ checks, json, live, publicAccessProbe, resourceId, runtimeProbe }) => {
    void json;
    return runQuery(
      ResourceHealthQuery.create({
        resourceId,
        mode: live ? "live" : "cached",
        includeChecks: checks,
        includePublicAccessProbe: publicAccessProbe,
        includeRuntimeProbe: runtimeProbe,
      }),
    );
  },
).pipe(EffectCommand.withDescription("Show current resource health"));

const configureHealthCommand = EffectCommand.make(
  "configure-health",
  {
    resourceId: resourceIdArg,
    path: healthPathOption,
    method: healthMethodOption,
    scheme: healthSchemeOption,
    host: healthHostOption,
    healthPort: healthPortOption,
    expectedStatus: healthExpectedStatusOption,
    expectedText: healthExpectedTextOption,
    interval: healthIntervalOption,
    timeout: healthTimeoutOption,
    retries: healthRetriesOption,
    startPeriod: healthStartPeriodOption,
    disable: disableHealthOption,
    json: jsonOption,
  },
  ({
    disable,
    expectedStatus,
    expectedText,
    healthPort,
    host,
    interval,
    json,
    method,
    path,
    resourceId,
    retries,
    scheme,
    startPeriod,
    timeout,
  }) => {
    void json;
    return runCommand(
      ConfigureResourceHealthCommand.create({
        resourceId,
        healthCheck: {
          enabled: !disable,
          type: "http",
          intervalSeconds: Number(interval),
          timeoutSeconds: Number(timeout),
          retries: Number(retries),
          startPeriodSeconds: Number(startPeriod),
          ...(!disable
            ? {
                http: {
                  method,
                  scheme,
                  host,
                  path,
                  expectedStatusCode: Number(expectedStatus),
                  ...(optionalNumber(healthPort) ? { port: optionalNumber(healthPort) } : {}),
                  ...(optionalValue(expectedText)
                    ? { expectedResponseText: optionalValue(expectedText) }
                    : {}),
                },
              }
            : {}),
        },
      }),
    );
  },
).pipe(EffectCommand.withDescription("Configure resource health policy"));

export const resourceCommand = EffectCommand.make("resource").pipe(
  EffectCommand.withDescription("Resource operations"),
  EffectCommand.withSubcommands([
    createCommand,
    listCommand,
    terminalCommand,
    logsCommand,
    healthCommand,
    configureHealthCommand,
    proxyConfigCommand,
    diagnoseCommand,
  ]),
);
