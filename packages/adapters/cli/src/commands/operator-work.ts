import {
  CancelOperatorWorkCommand,
  DeadLetterOperatorWorkCommand,
  ListOperatorWorkQuery,
  MarkOperatorWorkRecoveredCommand,
  operatorWorkKinds,
  operatorWorkStatuses,
  PruneOperatorWorkCommand,
  prunableProcessAttemptStatuses,
  RetryOperatorWorkCommand,
  ShowOperatorWorkQuery,
  StreamOperatorWorkEventsQuery,
} from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import {
  optionalValue,
  runCommand,
  runOperatorWorkEventStreamQuery,
  runQuery,
} from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const workIdArg = Args.text({ name: "workId" });
const kindOption = Options.choice("kind", operatorWorkKinds).pipe(Options.optional);
const statusOption = Options.choice("status", operatorWorkStatuses).pipe(Options.optional);
const resourceIdOption = Options.text("resource-id").pipe(Options.optional);
const serverIdOption = Options.text("server-id").pipe(Options.optional);
const deploymentIdOption = Options.text("deployment-id").pipe(Options.optional);
const limitOption = Options.text("limit").pipe(Options.optional);
const reasonOption = Options.text("reason").pipe(Options.optional);
const workEventsCursorOption = Options.text("cursor").pipe(Options.optional);
const workEventsHistoryLimitOption = Options.text("history-limit").pipe(Options.withDefault("100"));
const workEventsFollowOption = Options.boolean("follow").pipe(Options.withDefault(false));
const workEventsJsonOption = Options.boolean("json").pipe(Options.withDefault(false));
const workEventsIncludeHistoryOption = Options.choice("include-history", ["true", "false"]).pipe(
  Options.withDefault("true"),
);
const workEventsUntilTerminalOption = Options.choice("until-terminal", ["true", "false"]).pipe(
  Options.withDefault("true"),
);
const workEventsPollIntervalOption = Options.text("poll-interval-ms").pipe(
  Options.withDefault("1000"),
);
const beforeOption = Options.text("before");
const pruneStatusOption = Options.choice("status", prunableProcessAttemptStatuses).pipe(
  Options.repeated,
);
const dryRunOption = Options.boolean("dry-run").pipe(Options.withDefault(true));

const booleanChoiceValue = (value: "true" | "false"): boolean => value === "true";

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
    kind: kindOption,
    status: statusOption,
    resourceId: resourceIdOption,
    serverId: serverIdOption,
    deploymentId: deploymentIdOption,
    limit: limitOption,
  },
  ({ deploymentId, kind, limit, resourceId, serverId, status }) => {
    const parsedLimit = optionalLimit(optionalValue(limit));

    return runQuery(
      ListOperatorWorkQuery.create({
        ...(optionalValue(kind) ? { kind: optionalValue(kind) } : {}),
        ...(optionalValue(status) ? { status: optionalValue(status) } : {}),
        ...(optionalValue(resourceId) ? { resourceId: optionalValue(resourceId) } : {}),
        ...(optionalValue(serverId) ? { serverId: optionalValue(serverId) } : {}),
        ...(optionalValue(deploymentId) ? { deploymentId: optionalValue(deploymentId) } : {}),
        ...(parsedLimit ? { limit: parsedLimit } : {}),
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.operatorWorkList));

const showCommand = EffectCommand.make(
  "show",
  {
    workId: workIdArg,
  },
  ({ workId }) =>
    runQuery(
      ShowOperatorWorkQuery.create({
        workId,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.operatorWorkShow));

const eventsCommand = EffectCommand.make(
  "events",
  {
    workId: workIdArg,
    cursor: workEventsCursorOption,
    follow: workEventsFollowOption,
    historyLimit: workEventsHistoryLimitOption,
    includeHistory: workEventsIncludeHistoryOption,
    json: workEventsJsonOption,
    untilTerminal: workEventsUntilTerminalOption,
    pollIntervalMs: workEventsPollIntervalOption,
  },
  ({
    cursor,
    follow,
    historyLimit,
    includeHistory,
    json,
    pollIntervalMs,
    untilTerminal,
    workId,
  }) => {
    void json;
    return runOperatorWorkEventStreamQuery(
      StreamOperatorWorkEventsQuery.create({
        workId,
        follow,
        includeHistory: booleanChoiceValue(includeHistory),
        historyLimit: Number(historyLimit),
        untilTerminal: booleanChoiceValue(untilTerminal),
        pollIntervalMs: Number(pollIntervalMs),
        ...(optionalValue(cursor) ? { cursor: optionalValue(cursor) } : {}),
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.operatorWorkEvents));

const watchCommand = EffectCommand.make(
  "watch",
  {
    workId: workIdArg,
    cursor: workEventsCursorOption,
    historyLimit: workEventsHistoryLimitOption,
    includeHistory: workEventsIncludeHistoryOption,
    json: workEventsJsonOption,
    untilTerminal: workEventsUntilTerminalOption,
    pollIntervalMs: workEventsPollIntervalOption,
  },
  ({ cursor, historyLimit, includeHistory, json, pollIntervalMs, untilTerminal, workId }) => {
    void json;
    return runOperatorWorkEventStreamQuery(
      StreamOperatorWorkEventsQuery.create({
        workId,
        follow: true,
        includeHistory: booleanChoiceValue(includeHistory),
        historyLimit: Number(historyLimit),
        untilTerminal: booleanChoiceValue(untilTerminal),
        pollIntervalMs: Number(pollIntervalMs),
        ...(optionalValue(cursor) ? { cursor: optionalValue(cursor) } : {}),
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.operatorWorkEvents));

const markRecoveredCommand = EffectCommand.make(
  "mark-recovered",
  {
    workId: workIdArg,
    reason: reasonOption,
  },
  ({ reason, workId }) =>
    runCommand(
      MarkOperatorWorkRecoveredCommand.create({
        workId,
        ...(optionalValue(reason) ? { reason: optionalValue(reason) } : {}),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.operatorWorkMarkRecovered));

const deadLetterCommand = EffectCommand.make(
  "dead-letter",
  {
    workId: workIdArg,
    reason: Options.text("reason"),
  },
  ({ reason, workId }) =>
    runCommand(
      DeadLetterOperatorWorkCommand.create({
        workId,
        reason,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.operatorWorkDeadLetter));

const cancelCommand = EffectCommand.make(
  "cancel",
  {
    workId: workIdArg,
    reason: Options.text("reason"),
  },
  ({ reason, workId }) =>
    runCommand(
      CancelOperatorWorkCommand.create({
        workId,
        reason,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.operatorWorkCancel));

const retryCommand = EffectCommand.make(
  "retry",
  {
    workId: workIdArg,
    reason: reasonOption,
  },
  ({ reason, workId }) =>
    runCommand(
      RetryOperatorWorkCommand.create({
        workId,
        ...(optionalValue(reason) ? { reason: optionalValue(reason) } : {}),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.operatorWorkRetry));

const pruneCommand = EffectCommand.make(
  "prune",
  {
    before: beforeOption,
    status: pruneStatusOption,
    dryRun: dryRunOption,
  },
  ({ before, dryRun, status }) =>
    runCommand(
      PruneOperatorWorkCommand.create({
        before,
        ...(status.length > 0 ? { statuses: status } : {}),
        dryRun,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.operatorWorkPrune));

export const operatorWorkCommand = EffectCommand.make("work").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.operatorWork),
  EffectCommand.withSubcommands([
    listCommand,
    showCommand,
    eventsCommand,
    watchCommand,
    markRecoveredCommand,
    deadLetterCommand,
    cancelCommand,
    retryCommand,
    pruneCommand,
  ]),
);
