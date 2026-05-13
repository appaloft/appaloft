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
} from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runCommand, runQuery } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const workIdArg = Args.text({ name: "workId" });
const kindOption = Options.choice("kind", operatorWorkKinds).pipe(Options.optional);
const statusOption = Options.choice("status", operatorWorkStatuses).pipe(Options.optional);
const resourceIdOption = Options.text("resource-id").pipe(Options.optional);
const serverIdOption = Options.text("server-id").pipe(Options.optional);
const deploymentIdOption = Options.text("deployment-id").pipe(Options.optional);
const limitOption = Options.text("limit").pipe(Options.optional);
const reasonOption = Options.text("reason").pipe(Options.optional);
const beforeOption = Options.text("before");
const pruneStatusOption = Options.choice("status", prunableProcessAttemptStatuses).pipe(
  Options.repeated,
);
const dryRunOption = Options.boolean("dry-run").pipe(Options.withDefault(true));

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
    markRecoveredCommand,
    deadLetterCommand,
    cancelCommand,
    retryCommand,
    pruneCommand,
  ]),
);
