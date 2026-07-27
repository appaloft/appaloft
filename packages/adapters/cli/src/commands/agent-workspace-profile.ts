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
const credentialReferenceOption = Options.text("credential-reference").pipe(Options.repeated);

function readManifest(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function credentialReferences(values: readonly string[]) {
  return values.map((value) => {
    const separator = value.indexOf("=");
    if (separator <= 0 || separator === value.length - 1) {
      throw new TypeError("Credential reference must use requirement-id=secret://reference");
    }
    return {
      requirementId: value.slice(0, separator),
      secretRef: value.slice(separator + 1),
    };
  });
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
  {
    installationId: installationIdArg,
    credentialReference: credentialReferenceOption,
  },
  ({ credentialReference, installationId }) =>
    runQuery(
      CompileAgentWorkspaceProfileQuery.create({
        installationId,
        ...(credentialReference.length
          ? { credentialReferences: credentialReferences(credentialReference) }
          : {}),
      }),
    ),
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
