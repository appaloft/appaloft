import {
  CloseTerminalSessionCommand,
  ExpireTerminalSessionsCommand,
  ListTerminalSessionsQuery,
  ShowTerminalSessionQuery,
} from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runCommand, runQuery } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const sessionIdArg = Args.text({ name: "sessionId" });
const scopeOption = Options.choice("scope", ["server", "resource"] as const).pipe(Options.optional);
const serverIdOption = Options.text("server-id").pipe(Options.optional);
const resourceIdOption = Options.text("resource-id").pipe(Options.optional);
const deploymentIdOption = Options.text("deployment-id").pipe(Options.optional);
const limitOption = Options.text("limit").pipe(Options.optional);
const olderThanOption = Options.text("older-than").pipe(Options.optional);

function optionalLimit(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

const listCommand = EffectCommand.make(
  "list",
  {
    scope: scopeOption,
    serverId: serverIdOption,
    resourceId: resourceIdOption,
    deploymentId: deploymentIdOption,
    limit: limitOption,
  },
  ({ deploymentId, limit, resourceId, scope, serverId }) =>
    runQuery(
      ListTerminalSessionsQuery.create({
        ...(optionalValue(scope) ? { scope: optionalValue(scope) } : {}),
        ...(optionalValue(serverId) ? { serverId: optionalValue(serverId) } : {}),
        ...(optionalValue(resourceId) ? { resourceId: optionalValue(resourceId) } : {}),
        ...(optionalValue(deploymentId) ? { deploymentId: optionalValue(deploymentId) } : {}),
        ...(optionalLimit(optionalValue(limit))
          ? { limit: optionalLimit(optionalValue(limit)) }
          : {}),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.terminalSessionList));

const showCommand = EffectCommand.make(
  "show",
  {
    sessionId: sessionIdArg,
  },
  ({ sessionId }) =>
    runQuery(
      ShowTerminalSessionQuery.create({
        sessionId,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.terminalSessionShow));

const closeCommand = EffectCommand.make(
  "close",
  {
    sessionId: sessionIdArg,
  },
  ({ sessionId }) =>
    runCommand(
      CloseTerminalSessionCommand.create({
        sessionId,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.terminalSessionClose));

const expireCommand = EffectCommand.make(
  "expire",
  {
    olderThan: olderThanOption,
    limit: limitOption,
  },
  ({ limit, olderThan }) =>
    runCommand(
      ExpireTerminalSessionsCommand.create({
        ...(optionalValue(olderThan) ? { olderThan: optionalValue(olderThan) } : {}),
        ...(optionalLimit(optionalValue(limit))
          ? { limit: optionalLimit(optionalValue(limit)) }
          : {}),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.terminalSessionExpire));

export const terminalSessionCommand = EffectCommand.make("terminal-session").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.terminalSession),
  EffectCommand.withSubcommands([listCommand, showCommand, closeCommand, expireCommand]),
);
