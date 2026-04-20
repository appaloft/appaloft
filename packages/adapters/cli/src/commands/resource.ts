import {
  ConfigureResourceHealthCommand,
  ConfigureResourceNetworkCommand,
  ConfigureResourceRuntimeCommand,
  ConfigureResourceSourceCommand,
  CreateResourceCommand,
  ListResourcesQuery,
  OpenTerminalSessionCommand,
  ResourceDiagnosticSummaryQuery,
  ResourceHealthQuery,
  ResourceProxyConfigurationPreviewQuery,
  ResourceRuntimeLogsQuery,
  ShowResourceQuery,
} from "@appaloft/application";
import {
  resourceExposureModes,
  resourceKinds,
  resourceNetworkProtocols,
  runtimePlanStrategies,
  sourceKinds,
} from "@appaloft/core";
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
const configureNetworkInternalPortOption = Options.text("internal-port");
const sourceKindOption = Options.choice("kind", sourceKinds);
const sourceLocatorOption = Options.text("locator");
const sourceDisplayNameOption = Options.text("display-name").pipe(Options.optional);
const sourceGitRefOption = Options.text("git-ref").pipe(Options.optional);
const sourceCommitShaOption = Options.text("commit-sha").pipe(Options.optional);
const sourceBaseDirectoryOption = Options.text("base-directory").pipe(Options.optional);
const sourceOriginalLocatorOption = Options.text("original-locator").pipe(Options.optional);
const sourceRepositoryIdOption = Options.text("repository-id").pipe(Options.optional);
const sourceRepositoryFullNameOption = Options.text("repository-full-name").pipe(Options.optional);
const sourceDefaultBranchOption = Options.text("default-branch").pipe(Options.optional);
const sourceImageNameOption = Options.text("image-name").pipe(Options.optional);
const sourceImageTagOption = Options.text("image-tag").pipe(Options.optional);
const sourceImageDigestOption = Options.text("image-digest").pipe(Options.optional);
const runtimeStrategyOption = Options.choice("strategy", runtimePlanStrategies).pipe(
  Options.withDefault("auto"),
);
const runtimeInstallCommandOption = Options.text("install-command").pipe(Options.optional);
const runtimeBuildCommandOption = Options.text("build-command").pipe(Options.optional);
const runtimeStartCommandOption = Options.text("start-command").pipe(Options.optional);
const runtimePublishDirectoryOption = Options.text("publish-directory").pipe(Options.optional);
const runtimeDockerfilePathOption = Options.text("dockerfile-path").pipe(Options.optional);
const runtimeDockerComposeFilePathOption = Options.text("docker-compose-file-path").pipe(
  Options.optional,
);
const runtimeBuildTargetOption = Options.text("build-target").pipe(Options.optional);
const portOption = Options.text("port").pipe(Options.optional);
const upstreamProtocolOption = Options.choice("upstream-protocol", resourceNetworkProtocols).pipe(
  Options.withDefault("http"),
);
const exposureModeOption = Options.choice("exposure-mode", resourceExposureModes).pipe(
  Options.withDefault("reverse-proxy"),
);
const targetServiceOption = Options.text("target-service").pipe(Options.optional);
const hostPortOption = Options.text("host-port").pipe(Options.optional);
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

const showCommand = EffectCommand.make(
  "show",
  {
    resourceId: resourceIdArg,
    json: jsonOption,
  },
  ({ json, resourceId }) => {
    void json;
    return runQuery(
      ShowResourceQuery.create({
        resourceId,
        includeLatestDeployment: true,
        includeAccessSummary: true,
        includeProfileDiagnostics: true,
      }),
    );
  },
).pipe(EffectCommand.withDescription("Show resource profile"));

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

const configureNetworkCommand = EffectCommand.make(
  "configure-network",
  {
    resourceId: resourceIdArg,
    internalPort: configureNetworkInternalPortOption,
    upstreamProtocol: upstreamProtocolOption,
    exposureMode: exposureModeOption,
    targetService: targetServiceOption,
    hostPort: hostPortOption,
    json: jsonOption,
  },
  ({ exposureMode, hostPort, internalPort, json, resourceId, targetService, upstreamProtocol }) => {
    void json;
    const targetServiceName = optionalValue(targetService);
    const hostPortRaw = optionalValue(hostPort);

    return runCommand(
      ConfigureResourceNetworkCommand.create({
        resourceId,
        networkProfile: {
          internalPort: Number(internalPort),
          upstreamProtocol,
          exposureMode,
          ...(targetServiceName ? { targetServiceName } : {}),
          ...(hostPortRaw !== undefined ? { hostPort: Number(hostPortRaw) } : {}),
        },
      }),
    );
  },
).pipe(EffectCommand.withDescription("Configure resource network profile"));

const configureRuntimeCommand = EffectCommand.make(
  "configure-runtime",
  {
    resourceId: resourceIdArg,
    strategy: runtimeStrategyOption,
    installCommand: runtimeInstallCommandOption,
    buildCommand: runtimeBuildCommandOption,
    startCommand: runtimeStartCommandOption,
    publishDirectory: runtimePublishDirectoryOption,
    dockerfilePath: runtimeDockerfilePathOption,
    dockerComposeFilePath: runtimeDockerComposeFilePathOption,
    buildTarget: runtimeBuildTargetOption,
    json: jsonOption,
  },
  ({
    buildCommand,
    buildTarget,
    dockerComposeFilePath,
    dockerfilePath,
    installCommand,
    json,
    publishDirectory,
    resourceId,
    startCommand,
    strategy,
  }) => {
    void json;
    const installCommandValue = optionalValue(installCommand);
    const buildCommandValue = optionalValue(buildCommand);
    const startCommandValue = optionalValue(startCommand);
    const publishDirectoryValue = optionalValue(publishDirectory);
    const dockerfilePathValue = optionalValue(dockerfilePath);
    const dockerComposeFilePathValue = optionalValue(dockerComposeFilePath);
    const buildTargetValue = optionalValue(buildTarget);

    return runCommand(
      ConfigureResourceRuntimeCommand.create({
        resourceId,
        runtimeProfile: {
          strategy,
          ...(installCommandValue ? { installCommand: installCommandValue } : {}),
          ...(buildCommandValue ? { buildCommand: buildCommandValue } : {}),
          ...(startCommandValue ? { startCommand: startCommandValue } : {}),
          ...(publishDirectoryValue ? { publishDirectory: publishDirectoryValue } : {}),
          ...(dockerfilePathValue ? { dockerfilePath: dockerfilePathValue } : {}),
          ...(dockerComposeFilePathValue
            ? { dockerComposeFilePath: dockerComposeFilePathValue }
            : {}),
          ...(buildTargetValue ? { buildTarget: buildTargetValue } : {}),
        },
      }),
    );
  },
).pipe(EffectCommand.withDescription("Configure resource runtime profile"));

const configureSourceCommand = EffectCommand.make(
  "configure-source",
  {
    resourceId: resourceIdArg,
    kind: sourceKindOption,
    locator: sourceLocatorOption,
    displayName: sourceDisplayNameOption,
    gitRef: sourceGitRefOption,
    commitSha: sourceCommitShaOption,
    baseDirectory: sourceBaseDirectoryOption,
    originalLocator: sourceOriginalLocatorOption,
    repositoryId: sourceRepositoryIdOption,
    repositoryFullName: sourceRepositoryFullNameOption,
    defaultBranch: sourceDefaultBranchOption,
    imageName: sourceImageNameOption,
    imageTag: sourceImageTagOption,
    imageDigest: sourceImageDigestOption,
    json: jsonOption,
  },
  ({
    baseDirectory,
    commitSha,
    defaultBranch,
    displayName,
    gitRef,
    imageDigest,
    imageName,
    imageTag,
    json,
    kind,
    locator,
    originalLocator,
    repositoryFullName,
    repositoryId,
    resourceId,
  }) => {
    void json;
    const displayNameValue = optionalValue(displayName);
    const gitRefValue = optionalValue(gitRef);
    const commitShaValue = optionalValue(commitSha);
    const baseDirectoryValue = optionalValue(baseDirectory);
    const originalLocatorValue = optionalValue(originalLocator);
    const repositoryIdValue = optionalValue(repositoryId);
    const repositoryFullNameValue = optionalValue(repositoryFullName);
    const defaultBranchValue = optionalValue(defaultBranch);
    const imageNameValue = optionalValue(imageName);
    const imageTagValue = optionalValue(imageTag);
    const imageDigestValue = optionalValue(imageDigest);

    return runCommand(
      ConfigureResourceSourceCommand.create({
        resourceId,
        source: {
          kind,
          locator,
          ...(displayNameValue ? { displayName: displayNameValue } : {}),
          ...(gitRefValue ? { gitRef: gitRefValue } : {}),
          ...(commitShaValue ? { commitSha: commitShaValue } : {}),
          ...(baseDirectoryValue ? { baseDirectory: baseDirectoryValue } : {}),
          ...(originalLocatorValue ? { originalLocator: originalLocatorValue } : {}),
          ...(repositoryIdValue ? { repositoryId: repositoryIdValue } : {}),
          ...(repositoryFullNameValue ? { repositoryFullName: repositoryFullNameValue } : {}),
          ...(defaultBranchValue ? { defaultBranch: defaultBranchValue } : {}),
          ...(imageNameValue ? { imageName: imageNameValue } : {}),
          ...(imageTagValue ? { imageTag: imageTagValue } : {}),
          ...(imageDigestValue ? { imageDigest: imageDigestValue } : {}),
        },
      }),
    );
  },
).pipe(EffectCommand.withDescription("Configure resource source profile"));

export const resourceCommand = EffectCommand.make("resource").pipe(
  EffectCommand.withDescription("Resource operations"),
  EffectCommand.withSubcommands([
    createCommand,
    listCommand,
    showCommand,
    terminalCommand,
    logsCommand,
    healthCommand,
    configureSourceCommand,
    configureRuntimeCommand,
    configureHealthCommand,
    configureNetworkCommand,
    proxyConfigCommand,
    diagnoseCommand,
  ]),
);
