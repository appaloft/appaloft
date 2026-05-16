import {
  DeleteSourceLinkCommand,
  ListSourceLinksQuery,
  RelinkSourceLinkCommand,
  ShowSourceLinkQuery,
} from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalNumber, optionalValue, runCommand, runQuery } from "../runtime.js";
import { type DeploymentStateBackendKind } from "./deployment-state.js";
import { cliCommandDescriptions } from "./docs-help.js";

const sourceFingerprintArg = Args.text({ name: "sourceFingerprint" });
const listProjectOption = Options.text("project").pipe(Options.optional);
const listResourceOption = Options.text("resource").pipe(Options.optional);
const listServerOption = Options.text("server").pipe(Options.optional);
const limitOption = Options.text("limit").pipe(Options.optional);
const projectOption = Options.text("project");
const environmentOption = Options.text("environment");
const resourceOption = Options.text("resource");
const serverOption = Options.text("server").pipe(Options.optional);
const destinationOption = Options.text("destination").pipe(Options.optional);
const expectedCurrentProjectOption = Options.text("expected-current-project").pipe(
  Options.optional,
);
const expectedCurrentEnvironmentOption = Options.text("expected-current-environment").pipe(
  Options.optional,
);
const expectedCurrentResourceOption = Options.text("expected-current-resource").pipe(
  Options.optional,
);
const reasonOption = Options.text("reason").pipe(Options.optional);
const serverHostOption = Options.text("server-host").pipe(Options.optional);
const serverPortOption = Options.text("server-port").pipe(Options.optional);
const serverSshUsernameOption = Options.text("server-ssh-username").pipe(Options.optional);
const serverSshPrivateKeyFileOption = Options.text("server-ssh-private-key-file").pipe(
  Options.optional,
);
const deploymentStateBackendKinds = [
  "ssh-pglite",
  "local-pglite",
  "postgres-control-plane",
] as const satisfies readonly DeploymentStateBackendKind[];
const stateBackendOption = Options.choice("state-backend", deploymentStateBackendKinds).pipe(
  Options.optional,
);

const listCommand = EffectCommand.make(
  "list",
  {
    project: listProjectOption,
    resource: listResourceOption,
    server: listServerOption,
    limit: limitOption,
  },
  ({ limit, project, resource, server }) =>
    runQuery(
      ListSourceLinksQuery.create({
        projectId: optionalValue(project),
        resourceId: optionalValue(resource),
        serverId: optionalValue(server),
        limit: optionalNumber(limit),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.sourceLinkList));

const showCommand = EffectCommand.make(
  "show",
  {
    sourceFingerprint: sourceFingerprintArg,
  },
  ({ sourceFingerprint }) => runQuery(ShowSourceLinkQuery.create({ sourceFingerprint })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.sourceLinkShow));

const relinkCommand = EffectCommand.make(
  "relink",
  {
    sourceFingerprint: sourceFingerprintArg,
    project: projectOption,
    environment: environmentOption,
    resource: resourceOption,
    server: serverOption,
    destination: destinationOption,
    expectedCurrentProject: expectedCurrentProjectOption,
    expectedCurrentEnvironment: expectedCurrentEnvironmentOption,
    expectedCurrentResource: expectedCurrentResourceOption,
    reason: reasonOption,
    serverHost: serverHostOption,
    serverPort: serverPortOption,
    serverSshUsername: serverSshUsernameOption,
    serverSshPrivateKeyFile: serverSshPrivateKeyFileOption,
    stateBackend: stateBackendOption,
  },
  ({
    destination,
    environment,
    expectedCurrentEnvironment,
    expectedCurrentProject,
    expectedCurrentResource,
    project,
    reason,
    resource,
    server,
    serverHost,
    serverPort,
    serverSshPrivateKeyFile,
    serverSshUsername,
    sourceFingerprint,
    stateBackend,
  }) => {
    void serverHost;
    void serverPort;
    void serverSshPrivateKeyFile;
    void serverSshUsername;
    void stateBackend;

    return runCommand(
      RelinkSourceLinkCommand.create({
        sourceFingerprint,
        projectId: project,
        environmentId: environment,
        resourceId: resource,
        serverId: optionalValue(server),
        destinationId: optionalValue(destination),
        expectedCurrentProjectId: optionalValue(expectedCurrentProject),
        expectedCurrentEnvironmentId: optionalValue(expectedCurrentEnvironment),
        expectedCurrentResourceId: optionalValue(expectedCurrentResource),
        reason: optionalValue(reason),
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.sourceLinkRelink));

const deleteCommand = EffectCommand.make(
  "delete",
  {
    sourceFingerprint: sourceFingerprintArg,
    reason: reasonOption,
  },
  ({ reason, sourceFingerprint }) =>
    runCommand(
      DeleteSourceLinkCommand.create({
        sourceFingerprint,
        reason: optionalValue(reason),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.sourceLinkDelete));

export const sourceLinksCommand = EffectCommand.make("source-links").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.sourceLinks),
  EffectCommand.withSubcommands([listCommand, showCommand, relinkCommand, deleteCommand]),
);
