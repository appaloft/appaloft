import {
  BootstrapServerProxyCommand,
  CheckServerDeleteSafetyQuery,
  ConfigureServerCredentialCommand,
  CreateSshCredentialCommand,
  DeactivateServerCommand,
  DeleteServerCommand,
  ListServersQuery,
  ListSshCredentialsQuery,
  OpenTerminalSessionCommand,
  RegisterServerCommand,
  ShowServerQuery,
  TestServerConnectivityCommand,
} from "@appaloft/application";
import { deploymentTargetCredentialKinds, edgeProxyKinds } from "@appaloft/core";
import { Args, Command as EffectCommand, Options } from "@effect/cli";
import { Effect } from "effect";

import { optionalValue, runCommand, runQuery } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const nameOption = Options.text("name");
const hostOption = Options.text("host");
const portOption = Options.text("port").pipe(Options.withDefault("22"));
const providerOption = Options.text("provider").pipe(Options.withDefault("generic-ssh"));
const proxyKindOption = Options.choice("proxy-kind", edgeProxyKinds).pipe(
  Options.withDefault("traefik"),
);
const credentialKindOption = Options.choice("kind", deploymentTargetCredentialKinds).pipe(
  Options.withDefault("local-ssh-agent"),
);
const usernameOption = Options.text("username").pipe(Options.optional);
const publicKeyOption = Options.text("public-key").pipe(Options.optional);
const privateKeyFileOption = Options.text("private-key-file").pipe(Options.optional);
const requiredPrivateKeyFileOption = Options.text("private-key-file");
const credentialIdOption = Options.text("credential-id").pipe(Options.optional);
const reasonOption = Options.text("reason").pipe(Options.optional);
const confirmServerIdOption = Options.text("confirm");
const serverIdArg = Args.text({ name: "serverId" });
const rowsOption = Options.text("rows").pipe(Options.withDefault("24"));
const colsOption = Options.text("cols").pipe(Options.withDefault("80"));

const registerCommand = EffectCommand.make(
  "register",
  {
    name: nameOption,
    host: hostOption,
    port: portOption,
    provider: providerOption,
    proxyKind: proxyKindOption,
  },
  ({ host, name, port, provider, proxyKind }) =>
    runCommand(
      RegisterServerCommand.create({
        name,
        host,
        port: Number(port),
        providerKey: provider,
        proxyKind,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverRegister));

const listCommand = EffectCommand.make("list", {}, () => runQuery(ListServersQuery.create())).pipe(
  EffectCommand.withDescription(cliCommandDescriptions.serverList),
);

const showCommand = EffectCommand.make(
  "show",
  {
    serverId: serverIdArg,
  },
  ({ serverId }) =>
    runQuery(
      ShowServerQuery.create({
        serverId,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverShow));

const deactivateCommand = EffectCommand.make(
  "deactivate",
  {
    serverId: serverIdArg,
    reason: reasonOption,
  },
  ({ reason, serverId }) => {
    const reasonValue = optionalValue(reason);
    return runCommand(
      DeactivateServerCommand.create({
        serverId,
        ...(reasonValue ? { reason: reasonValue } : {}),
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverDeactivate));

const deleteCheckCommand = EffectCommand.make(
  "delete-check",
  {
    serverId: serverIdArg,
  },
  ({ serverId }) =>
    runQuery(
      CheckServerDeleteSafetyQuery.create({
        serverId,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverDeleteCheck));

const deleteCommand = EffectCommand.make(
  "delete",
  {
    serverId: serverIdArg,
    confirm: confirmServerIdOption,
  },
  ({ confirm, serverId }) =>
    runCommand(
      DeleteServerCommand.create({
        serverId,
        confirmation: {
          serverId: confirm,
        },
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverDelete));

const credentialCommand = EffectCommand.make(
  "credential",
  {
    serverId: serverIdArg,
    kind: credentialKindOption,
    username: usernameOption,
    publicKey: publicKeyOption,
    privateKeyFile: privateKeyFileOption,
    credentialId: credentialIdOption,
  },
  ({ credentialId, kind, privateKeyFile, publicKey, serverId, username }) =>
    Effect.gen(function* () {
      const usernameValue = optionalValue(username);
      const credentialIdValue = optionalValue(credentialId);
      const privateKeyPath = optionalValue(privateKeyFile);
      const privateKey = privateKeyPath
        ? yield* Effect.promise(() => Bun.file(privateKeyPath).text())
        : "";

      yield* runCommand(
        ConfigureServerCredentialCommand.create({
          serverId,
          credential: credentialIdValue
            ? {
                kind: "stored-ssh-private-key",
                credentialId: credentialIdValue,
                ...(usernameValue ? { username: usernameValue } : {}),
              }
            : kind === "ssh-private-key"
              ? {
                  kind,
                  ...(usernameValue ? { username: usernameValue } : {}),
                  ...(optionalValue(publicKey) ? { publicKey: optionalValue(publicKey) } : {}),
                  privateKey,
                }
              : {
                  kind,
                  ...(usernameValue ? { username: usernameValue } : {}),
                },
        }),
      );
    }),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverCredential));

const credentialCreateCommand = EffectCommand.make(
  "credential-create",
  {
    name: nameOption,
    username: usernameOption,
    publicKey: publicKeyOption,
    privateKeyFile: requiredPrivateKeyFileOption,
  },
  ({ name, privateKeyFile, publicKey, username }) =>
    Effect.gen(function* () {
      const usernameValue = optionalValue(username);
      const privateKey = yield* Effect.promise(() => Bun.file(privateKeyFile).text());

      yield* runCommand(
        CreateSshCredentialCommand.create({
          name,
          kind: "ssh-private-key",
          ...(usernameValue ? { username: usernameValue } : {}),
          ...(optionalValue(publicKey) ? { publicKey: optionalValue(publicKey) } : {}),
          privateKey,
        }),
      );
    }),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverCredentialCreate));

const credentialListCommand = EffectCommand.make("credential-list", {}, () =>
  runQuery(ListSshCredentialsQuery.create()),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverCredentialList));

const testCommand = EffectCommand.make(
  "test",
  {
    serverId: serverIdArg,
  },
  ({ serverId }) =>
    runCommand(
      TestServerConnectivityCommand.create({
        serverId,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverTest));

const doctorCommand = EffectCommand.make(
  "doctor",
  {
    serverId: serverIdArg,
  },
  ({ serverId }) =>
    runCommand(
      TestServerConnectivityCommand.create({
        serverId,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverDoctor));

const proxyRepairCommand = EffectCommand.make(
  "repair",
  {
    serverId: serverIdArg,
  },
  ({ serverId }) =>
    runCommand(
      BootstrapServerProxyCommand.create({
        serverId,
        reason: "repair",
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverProxyRepair));

const proxyCommand = EffectCommand.make("proxy").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.serverProxy),
  EffectCommand.withSubcommands([proxyRepairCommand]),
);

const terminalCommand = EffectCommand.make(
  "terminal",
  {
    serverId: serverIdArg,
    rows: rowsOption,
    cols: colsOption,
  },
  ({ cols, rows, serverId }) =>
    runCommand(
      OpenTerminalSessionCommand.create({
        scope: {
          kind: "server",
          serverId,
        },
        initialRows: Number(rows),
        initialCols: Number(cols),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverTerminal));

export const serverCommand = EffectCommand.make("server").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.server),
  EffectCommand.withSubcommands([
    registerCommand,
    listCommand,
    showCommand,
    deactivateCommand,
    deleteCheckCommand,
    deleteCommand,
    credentialCommand,
    credentialCreateCommand,
    credentialListCommand,
    testCommand,
    doctorCommand,
    terminalCommand,
    proxyCommand,
  ]),
);
