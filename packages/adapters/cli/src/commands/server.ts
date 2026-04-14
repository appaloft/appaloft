import { Args, Command as EffectCommand, Options } from "@effect/cli";
import {
  ConfigureServerCredentialCommand,
  CreateSshCredentialCommand,
  ListServersQuery,
  ListSshCredentialsQuery,
  RegisterServerCommand,
  TestServerConnectivityCommand,
} from "@yundu/application";
import { deploymentTargetCredentialKinds, edgeProxyKinds } from "@yundu/core";
import { Effect } from "effect";

import { optionalValue, runCommand, runQuery } from "../runtime.js";

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
const serverIdArg = Args.text({ name: "serverId" });

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
).pipe(EffectCommand.withDescription("Register a server"));

const listCommand = EffectCommand.make("list", {}, () => runQuery(ListServersQuery.create())).pipe(
  EffectCommand.withDescription("List servers"),
);

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
).pipe(EffectCommand.withDescription("Configure server SSH credential"));

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
).pipe(EffectCommand.withDescription("Create a reusable SSH credential from a private key file"));

const credentialListCommand = EffectCommand.make("credential-list", {}, () =>
  runQuery(ListSshCredentialsQuery.create()),
).pipe(EffectCommand.withDescription("List reusable SSH credentials"));

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
).pipe(EffectCommand.withDescription("Test server connectivity"));

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
).pipe(EffectCommand.withDescription("Diagnose server SSH and Docker readiness"));

export const serverCommand = EffectCommand.make("server").pipe(
  EffectCommand.withDescription("Server operations"),
  EffectCommand.withSubcommands([
    registerCommand,
    listCommand,
    credentialCommand,
    credentialCreateCommand,
    credentialListCommand,
    testCommand,
    doctorCommand,
  ]),
);
