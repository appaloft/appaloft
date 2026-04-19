import { RelinkSourceLinkCommand } from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runCommand } from "../runtime.js";
import { type DeploymentStateBackendKind } from "./deployment-state.js";

const sourceFingerprintArg = Args.text({ name: "sourceFingerprint" });
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
).pipe(EffectCommand.withDescription("Relink a source fingerprint to an explicit resource"));

export const sourceLinksCommand = EffectCommand.make("source-links").pipe(
  EffectCommand.withDescription("Source fingerprint link operations"),
  EffectCommand.withSubcommands([relinkCommand]),
);
