import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const scheduledTaskConcurrencyPolicySchema = z.enum(["forbid"]);
export const scheduledTaskDefinitionStatusSchema = z.enum(["enabled", "disabled"]);
export const scheduledTaskRunStatusSchema = z.enum([
  "accepted",
  "running",
  "succeeded",
  "failed",
  "skipped",
]);
export const scheduledTaskRunTriggerKindSchema = z.enum(["manual", "scheduled"]);

const scheduledTaskTimeoutSecondsSchema = z.number().int().min(1).max(86_400);
const scheduledTaskRetryLimitSchema = z.number().int().min(0).max(10);
const pageLimitSchema = z.number().int().min(1).max(100).optional();

export const createScheduledTaskCommandInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("Resource id"),
  schedule: nonEmptyTrimmedString("Schedule"),
  timezone: nonEmptyTrimmedString("Timezone"),
  commandIntent: nonEmptyTrimmedString("Command intent"),
  timeoutSeconds: scheduledTaskTimeoutSecondsSchema,
  retryLimit: scheduledTaskRetryLimitSchema,
  concurrencyPolicy: scheduledTaskConcurrencyPolicySchema.default("forbid"),
  status: scheduledTaskDefinitionStatusSchema.default("enabled"),
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
});

export const configureScheduledTaskCommandInputSchema = z.object({
  taskId: nonEmptyTrimmedString("Scheduled task id"),
  resourceId: nonEmptyTrimmedString("Resource id"),
  schedule: nonEmptyTrimmedString("Schedule").optional(),
  timezone: nonEmptyTrimmedString("Timezone").optional(),
  commandIntent: nonEmptyTrimmedString("Command intent").optional(),
  timeoutSeconds: scheduledTaskTimeoutSecondsSchema.optional(),
  retryLimit: scheduledTaskRetryLimitSchema.optional(),
  concurrencyPolicy: scheduledTaskConcurrencyPolicySchema.optional(),
  status: scheduledTaskDefinitionStatusSchema.optional(),
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
});

export const deleteScheduledTaskCommandInputSchema = z.object({
  taskId: nonEmptyTrimmedString("Scheduled task id"),
  resourceId: nonEmptyTrimmedString("Resource id"),
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
});

export const runScheduledTaskNowCommandInputSchema = z.object({
  taskId: nonEmptyTrimmedString("Scheduled task id"),
  resourceId: nonEmptyTrimmedString("Resource id"),
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
  requestedAt: nonEmptyTrimmedString("Requested timestamp").optional(),
});

export const listScheduledTasksQueryInputSchema = z.object({
  projectId: nonEmptyTrimmedString("Project id").optional(),
  environmentId: nonEmptyTrimmedString("Environment id").optional(),
  resourceId: nonEmptyTrimmedString("Resource id").optional(),
  status: scheduledTaskDefinitionStatusSchema.optional(),
  limit: pageLimitSchema,
  cursor: nonEmptyTrimmedString("Cursor").optional(),
});

export const showScheduledTaskQueryInputSchema = z.object({
  taskId: nonEmptyTrimmedString("Scheduled task id"),
  resourceId: nonEmptyTrimmedString("Resource id").optional(),
});

export const listScheduledTaskRunsQueryInputSchema = z.object({
  taskId: nonEmptyTrimmedString("Scheduled task id").optional(),
  resourceId: nonEmptyTrimmedString("Resource id").optional(),
  status: scheduledTaskRunStatusSchema.optional(),
  triggerKind: scheduledTaskRunTriggerKindSchema.optional(),
  limit: pageLimitSchema,
  cursor: nonEmptyTrimmedString("Cursor").optional(),
});

export const showScheduledTaskRunQueryInputSchema = z.object({
  runId: nonEmptyTrimmedString("Scheduled task run id"),
  taskId: nonEmptyTrimmedString("Scheduled task id").optional(),
  resourceId: nonEmptyTrimmedString("Resource id").optional(),
});

export const scheduledTaskRunLogsQueryInputSchema = z.object({
  runId: nonEmptyTrimmedString("Scheduled task run id"),
  taskId: nonEmptyTrimmedString("Scheduled task id").optional(),
  resourceId: nonEmptyTrimmedString("Resource id").optional(),
  cursor: nonEmptyTrimmedString("Cursor").optional(),
  limit: pageLimitSchema,
});

export type CreateScheduledTaskCommandInput = z.input<typeof createScheduledTaskCommandInputSchema>;
export type CreateScheduledTaskCommandPayload = z.output<
  typeof createScheduledTaskCommandInputSchema
>;
export type ConfigureScheduledTaskCommandInput = z.input<
  typeof configureScheduledTaskCommandInputSchema
>;
export type ConfigureScheduledTaskCommandPayload = z.output<
  typeof configureScheduledTaskCommandInputSchema
>;
export type DeleteScheduledTaskCommandInput = z.input<typeof deleteScheduledTaskCommandInputSchema>;
export type DeleteScheduledTaskCommandPayload = z.output<
  typeof deleteScheduledTaskCommandInputSchema
>;
export type RunScheduledTaskNowCommandInput = z.input<typeof runScheduledTaskNowCommandInputSchema>;
export type RunScheduledTaskNowCommandPayload = z.output<
  typeof runScheduledTaskNowCommandInputSchema
>;
export type ListScheduledTasksQueryInput = z.input<typeof listScheduledTasksQueryInputSchema>;
export type ListScheduledTasksQueryPayload = z.output<typeof listScheduledTasksQueryInputSchema>;
export type ShowScheduledTaskQueryInput = z.input<typeof showScheduledTaskQueryInputSchema>;
export type ShowScheduledTaskQueryPayload = z.output<typeof showScheduledTaskQueryInputSchema>;
export type ListScheduledTaskRunsQueryInput = z.input<typeof listScheduledTaskRunsQueryInputSchema>;
export type ListScheduledTaskRunsQueryPayload = z.output<
  typeof listScheduledTaskRunsQueryInputSchema
>;
export type ShowScheduledTaskRunQueryInput = z.input<typeof showScheduledTaskRunQueryInputSchema>;
export type ShowScheduledTaskRunQueryPayload = z.output<
  typeof showScheduledTaskRunQueryInputSchema
>;
export type ScheduledTaskRunLogsQueryInput = z.input<typeof scheduledTaskRunLogsQueryInputSchema>;
export type ScheduledTaskRunLogsQueryPayload = z.output<
  typeof scheduledTaskRunLogsQueryInputSchema
>;
