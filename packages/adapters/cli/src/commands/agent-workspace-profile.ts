import { readFileSync } from "node:fs";
import {
  CompileAgentWorkspaceProfileQuery,
  ConfigureAgentWorkspaceProfileCredentialConnectionsCommand,
  ConfigureAgentWorkspaceProfileMcpConnectionsCommand,
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
const credentialConnectionOption = Options.text("connection").pipe(Options.repeated);
const mcpConnectionOption = Options.text("connection").pipe(Options.repeated);

function readManifest(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function credentialConnections(values: readonly string[]) {
  return values.map((value) => {
    const separator = value.indexOf("=");
    if (separator <= 0 || separator === value.length - 1) {
      throw new TypeError("Credential Connection must use requirement-id=connection-reference");
    }
    return {
      requirementId: value.slice(0, separator),
      connectionReference: value.slice(separator + 1),
    };
  });
}

const mcpConnections = credentialConnections;

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

const credentialConnectionSetCommand = EffectCommand.make(
  "set",
  {
    installationId: installationIdArg,
    connection: credentialConnectionOption,
  },
  ({ connection, installationId }) =>
    runCommand(
      ConfigureAgentWorkspaceProfileCredentialConnectionsCommand.create({
        installationId,
        connections: credentialConnections(connection),
      }),
    ),
).pipe(
  EffectCommand.withDescription(
    "Map Profile credential requirements to named Credential Connections",
  ),
);

const credentialConnectionCommand = EffectCommand.make("credential-connection").pipe(
  EffectCommand.withDescription(
    "Configure tenant-scoped named Credential Connections without secret values",
  ),
  EffectCommand.withSubcommands([credentialConnectionSetCommand]),
);

const mcpConnectionSetCommand = EffectCommand.make(
  "set",
  { installationId: installationIdArg, connection: mcpConnectionOption },
  ({ connection, installationId }) =>
    runCommand(
      ConfigureAgentWorkspaceProfileMcpConnectionsCommand.create({
        installationId,
        connections: mcpConnections(connection),
      }),
    ),
).pipe(
  EffectCommand.withDescription("Map Profile MCP requirements to named remote MCP Connections"),
);

const mcpConnectionCommand = EffectCommand.make("mcp-connection").pipe(
  EffectCommand.withDescription("Configure opaque remote MCP Connection references"),
  EffectCommand.withSubcommands([mcpConnectionSetCommand]),
);

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
    credentialConnectionCommand,
    mcpConnectionCommand,
    disableCommand,
    uninstallCommand,
  ]),
);
