import { readFileSync } from "node:fs";
import {
  CompileAgentWorkspaceProfileQuery,
  DisableAgentWorkspaceProfileCommand,
  InstallAgentWorkspaceProfileCommand,
  ListAgentWorkspaceProfilesQuery,
  ShowAgentWorkspaceProfileQuery,
  UninstallAgentWorkspaceProfileCommand,
  ValidateAgentWorkspaceProfileQuery,
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
    runQuery(ValidateAgentWorkspaceProfileQuery.create({ manifest: readManifest(manifest) })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.agentWorkspaceProfileValidate));

const installCommand = EffectCommand.make(
  "install",
  { manifest: manifestPathArg },
  ({ manifest }) =>
    runCommand(InstallAgentWorkspaceProfileCommand.create({ manifest: readManifest(manifest) })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.agentWorkspaceProfileInstall));

const listCommand = EffectCommand.make("list", { limit: limitOption }, ({ limit }) =>
  runQuery(
    ListAgentWorkspaceProfilesQuery.create({
      ...(optionalValue(limit) === undefined ? {} : { limit: optionalValue(limit) }),
    }),
  ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.agentWorkspaceProfileList));

const showCommand = EffectCommand.make(
  "show",
  { installationId: installationIdArg },
  ({ installationId }) => runQuery(ShowAgentWorkspaceProfileQuery.create({ installationId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.agentWorkspaceProfileShow));

const compileCommand = EffectCommand.make(
  "compile",
  { installationId: installationIdArg },
  ({ installationId }) => runQuery(CompileAgentWorkspaceProfileQuery.create({ installationId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.agentWorkspaceProfileCompile));

const disableCommand = EffectCommand.make(
  "disable",
  { installationId: installationIdArg },
  ({ installationId }) =>
    runCommand(DisableAgentWorkspaceProfileCommand.create({ installationId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.agentWorkspaceProfileDisable));

const uninstallCommand = EffectCommand.make(
  "uninstall",
  { installationId: installationIdArg },
  ({ installationId }) =>
    runCommand(UninstallAgentWorkspaceProfileCommand.create({ installationId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.agentWorkspaceProfileUninstall));

export const agentWorkspaceProfileCommand = EffectCommand.make("agent-workspace-profile").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.agentWorkspaceProfile),
  EffectCommand.withSubcommands([
    validateCommand,
    installCommand,
    listCommand,
    showCommand,
    compileCommand,
    disableCommand,
    uninstallCommand,
  ]),
);
