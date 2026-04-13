import { Args, Command as EffectCommand, Options } from "@effect/cli";
import {
  ConfigureServerCredentialCommand,
  ListServersQuery,
  RegisterServerCommand,
  TestServerConnectivityCommand,
} from "@yundu/application";
import { deploymentTargetCredentialKinds } from "@yundu/core";
import { Effect } from "effect";

import { optionalValue, runCommand, runQuery } from "../runtime.js";

const nameOption = Options.text("name");
const hostOption = Options.text("host");
const portOption = Options.text("port").pipe(Options.withDefault("22"));
const providerOption = Options.text("provider").pipe(Options.withDefault("generic-ssh"));
const credentialKindOption = Options.choice("kind", deploymentTargetCredentialKinds).pipe(
  Options.withDefault("local-ssh-agent"),
);
const usernameOption = Options.text("username").pipe(Options.optional);
const publicKeyOption = Options.text("public-key").pipe(Options.optional);
const privateKeyFileOption = Options.text("private-key-file").pipe(Options.optional);
const serverIdArg = Args.text({ name: "serverId" });

const registerCommand = EffectCommand.make(
  "register",
  {
    name: nameOption,
    host: hostOption,
    port: portOption,
    provider: providerOption,
  },
  ({ host, name, port, provider }) =>
    runCommand(
      RegisterServerCommand.create({
        name,
        host,
        port: Number(port),
        providerKey: provider,
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
  },
  ({ kind, privateKeyFile, publicKey, serverId, username }) =>
    Effect.gen(function* () {
      const usernameValue = optionalValue(username);
      const privateKeyPath = optionalValue(privateKeyFile);
      const privateKey = privateKeyPath
        ? yield* Effect.promise(() => Bun.file(privateKeyPath).text())
        : "";

      yield* runCommand(
        ConfigureServerCredentialCommand.create({
          serverId,
          credential:
            kind === "ssh-private-key"
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

export const serverCommand = EffectCommand.make("server").pipe(
  EffectCommand.withDescription("Server operations"),
  EffectCommand.withSubcommands([registerCommand, listCommand, credentialCommand, testCommand]),
);
