import { readFileSync } from "node:fs";
import {
  DisableAgentAdapterCommand,
  InstallAgentAdapterCommand,
  ListAgentAdaptersQuery,
  ShowAgentAdapterQuery,
  UninstallAgentAdapterCommand,
  ValidateAgentAdapterQuery,
} from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runCommand, runQuery } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const manifestPathArg = Args.text({ name: "manifest" });
const installationIdArg = Args.text({ name: "installation-id" });
const limitOption = Options.integer("limit").pipe(Options.optional);

function readManifest(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

const validateCommand = EffectCommand.make(
  "validate",
  { manifest: manifestPathArg },
  ({ manifest }) =>
    runQuery(ValidateAgentAdapterQuery.create({ manifest: readManifest(manifest) })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.agentAdapterValidate));

const installCommand = EffectCommand.make(
  "install",
  { manifest: manifestPathArg },
  ({ manifest }) =>
    runCommand(InstallAgentAdapterCommand.create({ manifest: readManifest(manifest) })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.agentAdapterInstall));

const listCommand = EffectCommand.make("list", { limit: limitOption }, ({ limit }) =>
  runQuery(
    ListAgentAdaptersQuery.create({
      ...(optionalValue(limit) === undefined ? {} : { limit: optionalValue(limit) }),
    }),
  ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.agentAdapterList));

const showCommand = EffectCommand.make(
  "show",
  { installationId: installationIdArg },
  ({ installationId }) => runQuery(ShowAgentAdapterQuery.create({ installationId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.agentAdapterShow));

const disableCommand = EffectCommand.make(
  "disable",
  { installationId: installationIdArg },
  ({ installationId }) => runCommand(DisableAgentAdapterCommand.create({ installationId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.agentAdapterDisable));

const uninstallCommand = EffectCommand.make(
  "uninstall",
  { installationId: installationIdArg },
  ({ installationId }) => runCommand(UninstallAgentAdapterCommand.create({ installationId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.agentAdapterUninstall));

export const agentAdapterCommand = EffectCommand.make("agent-adapter").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.agentAdapter),
  EffectCommand.withSubcommands([
    validateCommand,
    installCommand,
    listCommand,
    showCommand,
    disableCommand,
    uninstallCommand,
  ]),
);
