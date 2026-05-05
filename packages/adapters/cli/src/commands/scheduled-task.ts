import {
  ConfigureScheduledTaskCommand,
  CreateScheduledTaskCommand,
  DeleteScheduledTaskCommand,
  ListScheduledTaskRunsQuery,
  ListScheduledTasksQuery,
  RunScheduledTaskNowCommand,
  ScheduledTaskRunLogsQuery,
  ShowScheduledTaskQuery,
  ShowScheduledTaskRunQuery,
} from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalNumber, optionalValue, runCommand, runQuery } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const scheduledTaskDefinitionStatuses = ["enabled", "disabled"] as const;
const scheduledTaskRunStatuses = ["accepted", "running", "succeeded", "failed", "skipped"] as const;
const scheduledTaskRunTriggerKinds = ["manual", "scheduled"] as const;

const taskIdArg = Args.text({ name: "taskId" });
const runIdArg = Args.text({ name: "runId" });
const resourceIdArg = Args.text({ name: "resourceId" });
const resourceIdOption = Options.text("resource-id").pipe(Options.optional);
const requiredResourceIdOption = Options.text("resource-id");
const projectIdOption = Options.text("project-id").pipe(Options.optional);
const environmentIdOption = Options.text("environment-id").pipe(Options.optional);
const scheduleOption = Options.text("schedule").pipe(Options.optional);
const requiredScheduleOption = Options.text("schedule");
const timezoneOption = Options.text("timezone").pipe(Options.optional);
const requiredTimezoneOption = Options.text("timezone");
const commandIntentOption = Options.text("command").pipe(Options.optional);
const requiredCommandIntentOption = Options.text("command");
const timeoutSecondsOption = Options.text("timeout-seconds").pipe(Options.optional);
const requiredTimeoutSecondsOption = Options.text("timeout-seconds");
const retryLimitOption = Options.text("retry-limit").pipe(Options.optional);
const requiredRetryLimitOption = Options.text("retry-limit");
const statusOption = Options.choice("status", scheduledTaskDefinitionStatuses).pipe(
  Options.optional,
);
const runStatusOption = Options.choice("status", scheduledTaskRunStatuses).pipe(Options.optional);
const triggerKindOption = Options.choice("trigger-kind", scheduledTaskRunTriggerKinds).pipe(
  Options.optional,
);
const idempotencyKeyOption = Options.text("idempotency-key").pipe(Options.optional);
const cursorOption = Options.text("cursor").pipe(Options.optional);
const limitOption = Options.text("limit").pipe(Options.optional);

function optionalInputNumber(value: Parameters<typeof optionalNumber>[0]): number | undefined {
  const parsed = optionalNumber(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function requiredNumber(value: string): number {
  return Number(value);
}

const createCommand = EffectCommand.make(
  "create",
  {
    resourceId: resourceIdArg,
    schedule: requiredScheduleOption,
    timezone: requiredTimezoneOption,
    commandIntent: requiredCommandIntentOption,
    timeoutSeconds: requiredTimeoutSecondsOption,
    retryLimit: requiredRetryLimitOption,
    status: statusOption,
    idempotencyKey: idempotencyKeyOption,
  },
  ({
    commandIntent,
    idempotencyKey,
    resourceId,
    retryLimit,
    schedule,
    status,
    timeoutSeconds,
    timezone,
  }) =>
    runCommand(
      CreateScheduledTaskCommand.create({
        resourceId,
        schedule,
        timezone,
        commandIntent,
        timeoutSeconds: requiredNumber(timeoutSeconds),
        retryLimit: requiredNumber(retryLimit),
        ...(optionalValue(status) ? { status: optionalValue(status) } : {}),
        ...(optionalValue(idempotencyKey) ? { idempotencyKey: optionalValue(idempotencyKey) } : {}),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.scheduledTaskCreate));

const configureCommand = EffectCommand.make(
  "configure",
  {
    taskId: taskIdArg,
    resourceId: requiredResourceIdOption,
    schedule: scheduleOption,
    timezone: timezoneOption,
    commandIntent: commandIntentOption,
    timeoutSeconds: timeoutSecondsOption,
    retryLimit: retryLimitOption,
    status: statusOption,
    idempotencyKey: idempotencyKeyOption,
  },
  ({
    commandIntent,
    idempotencyKey,
    resourceId,
    retryLimit,
    schedule,
    status,
    taskId,
    timeoutSeconds,
    timezone,
  }) =>
    runCommand(
      ConfigureScheduledTaskCommand.create({
        taskId,
        resourceId,
        ...(optionalValue(schedule) ? { schedule: optionalValue(schedule) } : {}),
        ...(optionalValue(timezone) ? { timezone: optionalValue(timezone) } : {}),
        ...(optionalValue(commandIntent) ? { commandIntent: optionalValue(commandIntent) } : {}),
        ...(optionalInputNumber(timeoutSeconds) !== undefined
          ? { timeoutSeconds: optionalInputNumber(timeoutSeconds) }
          : {}),
        ...(optionalInputNumber(retryLimit) !== undefined
          ? { retryLimit: optionalInputNumber(retryLimit) }
          : {}),
        ...(optionalValue(status) ? { status: optionalValue(status) } : {}),
        ...(optionalValue(idempotencyKey) ? { idempotencyKey: optionalValue(idempotencyKey) } : {}),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.scheduledTaskConfigure));

const deleteCommand = EffectCommand.make(
  "delete",
  {
    taskId: taskIdArg,
    resourceId: requiredResourceIdOption,
    idempotencyKey: idempotencyKeyOption,
  },
  ({ idempotencyKey, resourceId, taskId }) =>
    runCommand(
      DeleteScheduledTaskCommand.create({
        taskId,
        resourceId,
        ...(optionalValue(idempotencyKey) ? { idempotencyKey: optionalValue(idempotencyKey) } : {}),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.scheduledTaskDelete));

const runNowCommand = EffectCommand.make(
  "run",
  {
    taskId: taskIdArg,
    resourceId: requiredResourceIdOption,
    idempotencyKey: idempotencyKeyOption,
  },
  ({ idempotencyKey, resourceId, taskId }) =>
    runCommand(
      RunScheduledTaskNowCommand.create({
        taskId,
        resourceId,
        ...(optionalValue(idempotencyKey) ? { idempotencyKey: optionalValue(idempotencyKey) } : {}),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.scheduledTaskRun));

const listCommand = EffectCommand.make(
  "list",
  {
    projectId: projectIdOption,
    environmentId: environmentIdOption,
    resourceId: resourceIdOption,
    status: statusOption,
    cursor: cursorOption,
    limit: limitOption,
  },
  ({ cursor, environmentId, limit, projectId, resourceId, status }) =>
    runQuery(
      ListScheduledTasksQuery.create({
        ...(optionalValue(projectId) ? { projectId: optionalValue(projectId) } : {}),
        ...(optionalValue(environmentId) ? { environmentId: optionalValue(environmentId) } : {}),
        ...(optionalValue(resourceId) ? { resourceId: optionalValue(resourceId) } : {}),
        ...(optionalValue(status) ? { status: optionalValue(status) } : {}),
        ...(optionalInputNumber(limit) !== undefined ? { limit: optionalInputNumber(limit) } : {}),
        ...(optionalValue(cursor) ? { cursor: optionalValue(cursor) } : {}),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.scheduledTaskList));

const showCommand = EffectCommand.make(
  "show",
  {
    taskId: taskIdArg,
    resourceId: resourceIdOption,
  },
  ({ resourceId, taskId }) =>
    runQuery(
      ShowScheduledTaskQuery.create({
        taskId,
        ...(optionalValue(resourceId) ? { resourceId: optionalValue(resourceId) } : {}),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.scheduledTaskShow));

const runsListCommand = EffectCommand.make(
  "list",
  {
    taskId: Options.text("task-id").pipe(Options.optional),
    resourceId: resourceIdOption,
    status: runStatusOption,
    triggerKind: triggerKindOption,
    cursor: cursorOption,
    limit: limitOption,
  },
  ({ cursor, limit, resourceId, status, taskId, triggerKind }) =>
    runQuery(
      ListScheduledTaskRunsQuery.create({
        ...(optionalValue(taskId) ? { taskId: optionalValue(taskId) } : {}),
        ...(optionalValue(resourceId) ? { resourceId: optionalValue(resourceId) } : {}),
        ...(optionalValue(status) ? { status: optionalValue(status) } : {}),
        ...(optionalValue(triggerKind) ? { triggerKind: optionalValue(triggerKind) } : {}),
        ...(optionalInputNumber(limit) !== undefined ? { limit: optionalInputNumber(limit) } : {}),
        ...(optionalValue(cursor) ? { cursor: optionalValue(cursor) } : {}),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.scheduledTaskRunsList));

const runsShowCommand = EffectCommand.make(
  "show",
  {
    runId: runIdArg,
    taskId: Options.text("task-id").pipe(Options.optional),
    resourceId: resourceIdOption,
  },
  ({ resourceId, runId, taskId }) =>
    runQuery(
      ShowScheduledTaskRunQuery.create({
        runId,
        ...(optionalValue(taskId) ? { taskId: optionalValue(taskId) } : {}),
        ...(optionalValue(resourceId) ? { resourceId: optionalValue(resourceId) } : {}),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.scheduledTaskRunsShow));

const runsLogsCommand = EffectCommand.make(
  "logs",
  {
    runId: runIdArg,
    taskId: Options.text("task-id").pipe(Options.optional),
    resourceId: resourceIdOption,
    cursor: cursorOption,
    limit: limitOption,
  },
  ({ cursor, limit, resourceId, runId, taskId }) =>
    runQuery(
      ScheduledTaskRunLogsQuery.create({
        runId,
        ...(optionalValue(taskId) ? { taskId: optionalValue(taskId) } : {}),
        ...(optionalValue(resourceId) ? { resourceId: optionalValue(resourceId) } : {}),
        ...(optionalValue(cursor) ? { cursor: optionalValue(cursor) } : {}),
        ...(optionalInputNumber(limit) !== undefined ? { limit: optionalInputNumber(limit) } : {}),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.scheduledTaskRunsLogs));

const runsCommand = EffectCommand.make("runs").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.scheduledTaskRuns),
  EffectCommand.withSubcommands([runsListCommand, runsShowCommand, runsLogsCommand]),
);

export const scheduledTaskCommand = EffectCommand.make("scheduled-task").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.scheduledTask),
  EffectCommand.withSubcommands([
    createCommand,
    listCommand,
    showCommand,
    configureCommand,
    deleteCommand,
    runNowCommand,
    runsCommand,
  ]),
);
