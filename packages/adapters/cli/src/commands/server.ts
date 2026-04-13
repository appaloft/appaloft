import { Args, Command as EffectCommand, Options } from "@effect/cli";
import {
  ListServersQuery,
  RegisterServerCommand,
  TestServerConnectivityCommand,
} from "@yundu/application";

import { runCommand, runQuery } from "../runtime.js";

const nameOption = Options.text("name");
const hostOption = Options.text("host");
const portOption = Options.text("port").pipe(Options.withDefault("22"));
const providerOption = Options.text("provider").pipe(Options.withDefault("generic-ssh"));
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
  EffectCommand.withSubcommands([registerCommand, listCommand, testCommand]),
);
