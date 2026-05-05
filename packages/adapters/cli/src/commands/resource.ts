import {
  ArchiveResourceCommand,
  AttachResourceStorageCommand,
  BindResourceDependencyCommand,
  ConfigureResourceAccessCommand,
  ConfigureResourceHealthCommand,
  ConfigureResourceNetworkCommand,
  ConfigureResourceRuntimeCommand,
  ConfigureResourceSourceCommand,
  CreateResourceCommand,
  DeleteResourceCommand,
  DetachResourceStorageCommand,
  ImportResourceVariablesCommand,
  ListResourceDependencyBindingsQuery,
  ListResourcesQuery,
  OpenTerminalSessionCommand,
  ResourceAccessFailureEvidenceLookupQuery,
  ResourceDiagnosticSummaryQuery,
  ResourceEffectiveConfigQuery,
  ResourceHealthQuery,
  ResourceProxyConfigurationPreviewQuery,
  ResourceRuntimeLogsQuery,
  RotateResourceDependencyBindingSecretCommand,
  SetResourceVariableCommand,
  ShowResourceDependencyBindingQuery,
  ShowResourceQuery,
  UnbindResourceDependencyCommand,
  UnsetResourceVariableCommand,
} from "@appaloft/application";
import {
  resourceExposureModes,
  resourceGeneratedAccessModes,
  resourceKinds,
  resourceNetworkProtocols,
  runtimePlanStrategies,
  sourceKinds,
  variableExposures,
  variableKinds,
} from "@appaloft/core";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import {
  optionalNumber,
  optionalValue,
  runCommand,
  runQuery,
  runResourceRuntimeLogsQuery,
} from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const resourceIdArg = Args.text({ name: "resourceId" });
const storageVolumeIdArg = Args.text({ name: "storageVolumeId" });
const dependencyResourceIdArg = Args.text({ name: "dependencyResourceId" });
const dependencyBindingIdArg = Args.text({ name: "bindingId" });
const resourceStorageAttachmentIdArg = Args.text({ name: "attachmentId" });
const accessFailureRequestIdArg = Args.text({ name: "requestId" });
const projectOption = Options.text("project").pipe(Options.optional);
const environmentOption = Options.text("environment").pipe(Options.optional);
const createProjectOption = Options.text("project");
const createEnvironmentOption = Options.text("environment");
const nameOption = Options.text("name");
const kindOption = Options.choice("kind", resourceKinds).pipe(Options.withDefault("application"));
const destinationOption = Options.text("destination").pipe(Options.optional);
const descriptionOption = Options.text("description").pipe(Options.optional);
const archiveReasonOption = Options.text("reason").pipe(Options.optional);
const accessFailureResourceOption = Options.text("resource").pipe(Options.optional);
const accessFailureHostOption = Options.text("host").pipe(Options.optional);
const accessFailurePathOption = Options.text("path").pipe(Options.optional);
const confirmSlugOption = Options.text("confirm-slug");
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
const runtimeNameOption = Options.text("runtime-name").pipe(Options.optional);
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
const generatedAccessOption = Options.choice("generated-access", resourceGeneratedAccessModes).pipe(
  Options.withDefault("inherit"),
);
const accessPathPrefixOption = Options.text("path-prefix").pipe(Options.optional);
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
const variableExposureOption = Options.choice("exposure", variableExposures);
const variableKindOption = Options.choice("kind", variableKinds).pipe(
  Options.withDefault("plain-config"),
);
const variableSecretOption = Options.boolean("secret").pipe(Options.withDefault(false));
const importContentOption = Options.text("content");
const storageDestinationPathOption = Options.text("destination-path");
const storageMountModeOption = Options.choice("mount-mode", ["read-write", "read-only"]).pipe(
  Options.withDefault("read-write"),
);
const dependencyTargetNameOption = Options.text("target-name").pipe(
  Options.withDefault("DATABASE_URL"),
);
const dependencyScopeOption = Options.choice("scope", [
  "environment",
  "release",
  "build-only",
  "runtime-only",
]).pipe(Options.withDefault("runtime-only"));
const dependencyInjectionModeOption = Options.choice("injection-mode", [
  "env",
  "file",
  "reference",
]).pipe(Options.withDefault("env"));
const dependencySecretRefOption = Options.text("secret-ref").pipe(Options.optional);
const dependencySecretValueOption = Options.text("secret-value").pipe(Options.optional);
const confirmHistoricalSnapshotsOption = Options.boolean(
  "confirm-historical-snapshots-remain-unchanged",
).pipe(Options.withDefault(false));

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
).pipe(EffectCommand.withDescription(cliCommandDescriptions.resourceList));

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
).pipe(EffectCommand.withDescription(cliCommandDescriptions.resourceShow));

const effectiveConfigCommand = EffectCommand.make(
  "effective-config",
  {
    resourceId: resourceIdArg,
  },
  ({ resourceId }) => runQuery(ResourceEffectiveConfigQuery.create({ resourceId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.resourceEffectiveConfig));

const dependencyBindCommand = EffectCommand.make(
  "bind",
  {
    resourceId: resourceIdArg,
    dependencyResourceId: dependencyResourceIdArg,
    targetName: dependencyTargetNameOption,
    scope: dependencyScopeOption,
    injectionMode: dependencyInjectionModeOption,
  },
  ({ dependencyResourceId, injectionMode, resourceId, scope, targetName }) =>
    runCommand(
      BindResourceDependencyCommand.create({
        resourceId,
        dependencyResourceId,
        targetName,
        scope,
        injectionMode,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.resourceDependencyBind));

const dependencyUnbindCommand = EffectCommand.make(
  "unbind",
  {
    resourceId: resourceIdArg,
    bindingId: dependencyBindingIdArg,
  },
  ({ bindingId, resourceId }) =>
    runCommand(UnbindResourceDependencyCommand.create({ resourceId, bindingId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.resourceDependencyUnbind));

const dependencyRotateSecretCommand = EffectCommand.make(
  "rotate-secret",
  {
    resourceId: resourceIdArg,
    bindingId: dependencyBindingIdArg,
    secretRef: dependencySecretRefOption,
    secretValue: dependencySecretValueOption,
    confirmHistoricalSnapshotsRemainUnchanged: confirmHistoricalSnapshotsOption,
  },
  ({ bindingId, confirmHistoricalSnapshotsRemainUnchanged, resourceId, secretRef, secretValue }) =>
    runCommand(
      RotateResourceDependencyBindingSecretCommand.create({
        resourceId,
        bindingId,
        ...(optionalValue(secretRef) ? { secretRef: optionalValue(secretRef) } : {}),
        ...(optionalValue(secretValue) ? { secretValue: optionalValue(secretValue) } : {}),
        confirmHistoricalSnapshotsRemainUnchanged:
          confirmHistoricalSnapshotsRemainUnchanged as true,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.resourceDependencyRotateSecret));

const dependencyListCommand = EffectCommand.make(
  "list",
  {
    resourceId: resourceIdArg,
  },
  ({ resourceId }) => runQuery(ListResourceDependencyBindingsQuery.create({ resourceId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.resourceDependencyList));

const dependencyShowCommand = EffectCommand.make(
  "show",
  {
    resourceId: resourceIdArg,
    bindingId: dependencyBindingIdArg,
  },
  ({ bindingId, resourceId }) =>
    runQuery(ShowResourceDependencyBindingQuery.create({ resourceId, bindingId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.resourceDependencyShow));

const dependencyCommand = EffectCommand.make("dependency").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.resourceDependency),
  EffectCommand.withSubcommands([
    dependencyBindCommand,
    dependencyUnbindCommand,
    dependencyRotateSecretCommand,
    dependencyListCommand,
    dependencyShowCommand,
  ]),
);

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
).pipe(EffectCommand.withDescription(cliCommandDescriptions.resourceCreate));

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
).pipe(EffectCommand.withDescription(cliCommandDescriptions.resourceLogs));

const archiveCommand = EffectCommand.make(
  "archive",
  {
    resourceId: resourceIdArg,
    reason: archiveReasonOption,
    json: jsonOption,
  },
  ({ json, reason, resourceId }) => {
    void json;
    return runCommand(
      ArchiveResourceCommand.create({
        resourceId,
        reason: optionalValue(reason),
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.resourceArchive));

const deleteCommand = EffectCommand.make(
  "delete",
  {
    resourceId: resourceIdArg,
    confirmSlug: confirmSlugOption,
    json: jsonOption,
  },
  ({ confirmSlug, json, resourceId }) => {
    void json;
    return runCommand(
      DeleteResourceCommand.create({
        resourceId,
        confirmation: {
          resourceSlug: confirmSlug,
        },
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.resourceDelete));

const setVariableCommand = EffectCommand.make(
  "set-variable",
  {
    resourceId: resourceIdArg,
    key: Args.text({ name: "key" }),
    value: Args.text({ name: "value" }),
    kind: variableKindOption,
    exposure: variableExposureOption,
    secret: variableSecretOption,
  },
  ({ exposure, key, kind, resourceId, secret, value }) =>
    runCommand(
      SetResourceVariableCommand.create({
        resourceId,
        key,
        value,
        kind,
        exposure,
        isSecret: secret,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.resourceSetVariable));

const importVariablesCommand = EffectCommand.make(
  "import-variables",
  {
    resourceId: resourceIdArg,
    content: importContentOption,
    exposure: variableExposureOption,
  },
  ({ content, exposure, resourceId }) =>
    runCommand(
      ImportResourceVariablesCommand.create({
        resourceId,
        content,
        exposure,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.resourceImportVariables));

const unsetVariableCommand = EffectCommand.make(
  "unset-variable",
  {
    resourceId: resourceIdArg,
    key: Args.text({ name: "key" }),
    exposure: variableExposureOption,
  },
  ({ exposure, key, resourceId }) =>
    runCommand(
      UnsetResourceVariableCommand.create({
        resourceId,
        key,
        exposure,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.resourceUnsetVariable));

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
).pipe(EffectCommand.withDescription(cliCommandDescriptions.resourceTerminal));

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
).pipe(EffectCommand.withDescription(cliCommandDescriptions.resourceProxyConfig));

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
).pipe(EffectCommand.withDescription(cliCommandDescriptions.resourceDiagnose));

const accessFailureCommand = EffectCommand.make(
  "access-failure",
  {
    requestId: accessFailureRequestIdArg,
    resource: accessFailureResourceOption,
    host: accessFailureHostOption,
    path: accessFailurePathOption,
    json: jsonOption,
  },
  ({ host, json, path, requestId, resource }) => {
    void json;
    return runQuery(
      ResourceAccessFailureEvidenceLookupQuery.create({
        requestId,
        resourceId: optionalValue(resource),
        hostname: optionalValue(host),
        path: optionalValue(path),
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.resourceAccessFailure));

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
).pipe(EffectCommand.withDescription(cliCommandDescriptions.resourceHealth));

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
).pipe(EffectCommand.withDescription(cliCommandDescriptions.resourceConfigureHealth));

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
).pipe(EffectCommand.withDescription(cliCommandDescriptions.resourceConfigureNetwork));

const configureAccessCommand = EffectCommand.make(
  "configure-access",
  {
    resourceId: resourceIdArg,
    generatedAccess: generatedAccessOption,
    pathPrefix: accessPathPrefixOption,
    json: jsonOption,
  },
  ({ generatedAccess, json, pathPrefix, resourceId }) => {
    void json;
    const pathPrefixValue = optionalValue(pathPrefix);

    return runCommand(
      ConfigureResourceAccessCommand.create({
        resourceId,
        accessProfile: {
          generatedAccessMode: generatedAccess,
          ...(pathPrefixValue ? { pathPrefix: pathPrefixValue } : {}),
        },
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.resourceConfigureAccess));

const attachStorageCommand = EffectCommand.make(
  "attach",
  {
    resourceId: resourceIdArg,
    storageVolumeId: storageVolumeIdArg,
    destinationPath: storageDestinationPathOption,
    mountMode: storageMountModeOption,
  },
  ({ destinationPath, mountMode, resourceId, storageVolumeId }) =>
    runCommand(
      AttachResourceStorageCommand.create({
        resourceId,
        storageVolumeId,
        destinationPath,
        mountMode,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.resourceAttachStorage));

const detachStorageCommand = EffectCommand.make(
  "detach",
  {
    resourceId: resourceIdArg,
    attachmentId: resourceStorageAttachmentIdArg,
  },
  ({ attachmentId, resourceId }) =>
    runCommand(
      DetachResourceStorageCommand.create({
        resourceId,
        attachmentId,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.resourceDetachStorage));

const storageCommand = EffectCommand.make("storage").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.resourceStorage),
  EffectCommand.withSubcommands([attachStorageCommand, detachStorageCommand]),
);

const configureRuntimeCommand = EffectCommand.make(
  "configure-runtime",
  {
    resourceId: resourceIdArg,
    strategy: runtimeStrategyOption,
    installCommand: runtimeInstallCommandOption,
    buildCommand: runtimeBuildCommandOption,
    startCommand: runtimeStartCommandOption,
    runtimeName: runtimeNameOption,
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
    runtimeName,
    startCommand,
    strategy,
  }) => {
    void json;
    const installCommandValue = optionalValue(installCommand);
    const buildCommandValue = optionalValue(buildCommand);
    const startCommandValue = optionalValue(startCommand);
    const runtimeNameValue = optionalValue(runtimeName);
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
          ...(runtimeNameValue ? { runtimeName: runtimeNameValue } : {}),
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
).pipe(EffectCommand.withDescription(cliCommandDescriptions.resourceConfigureRuntime));

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
).pipe(EffectCommand.withDescription(cliCommandDescriptions.resourceConfigureSource));

export const resourceCommand = EffectCommand.make("resource").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.resource),
  EffectCommand.withSubcommands([
    createCommand,
    listCommand,
    showCommand,
    effectiveConfigCommand,
    archiveCommand,
    deleteCommand,
    setVariableCommand,
    importVariablesCommand,
    unsetVariableCommand,
    terminalCommand,
    logsCommand,
    accessFailureCommand,
    healthCommand,
    configureSourceCommand,
    configureRuntimeCommand,
    configureHealthCommand,
    configureNetworkCommand,
    configureAccessCommand,
    storageCommand,
    dependencyCommand,
    proxyConfigCommand,
    diagnoseCommand,
  ]),
);
