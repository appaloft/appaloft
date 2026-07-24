import { type Result } from "@appaloft/core";
import { z } from "zod";
import { Command, Query } from "./cqrs";
import { parseOperationInput } from "./operations/shared-schema";

const id = z.string().trim().min(1).max(160);
const argv = z.array(z.string().max(16_384)).min(1).max(256);
const gitRef = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      !value.startsWith("-") &&
      !value.includes("\0") &&
      !/[\s~^:?*[\\]/u.test(value) &&
      !value.includes("..") &&
      !value.endsWith(".") &&
      !value.endsWith("/"),
    "Git ref is invalid",
  );

export const createAgentTaskRunInputSchema = z
  .object({
    workspaceId: id,
    runtimeId: id,
    task: z.string().trim().min(1).max(16_384),
    runContext: z
      .discriminatedUnion("mode", [
        z.object({ mode: z.literal("fresh") }).strict(),
        z.object({ mode: z.literal("continue"), parentRunId: id }).strict(),
      ])
      .default({ mode: "fresh" }),
    idempotencyKey: z.string().trim().min(1).max(256),
    checks: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(160),
            argv,
            required: z.boolean().default(true),
          })
          .strict(),
      )
      .max(32)
      .default([]),
    preview: z
      .object({
        startArgv: argv,
        port: z.number().int().min(1).max(65_535),
        visibility: z.enum(["private", "organization", "public"]).default("private"),
        expiresAt: z.iso.datetime().optional(),
      })
      .strict()
      .optional(),
    immutableReview: z.boolean().default(false),
    sourceRoot: z.string().trim().min(1).max(1_024).default("."),
  })
  .strict();

export const showAgentTaskRunInputSchema = z.object({ workspaceId: id, taskRunId: id }).strict();
export const listAgentTaskRunsInputSchema = z.object({ workspaceId: id, runtimeId: id }).strict();
export const resumeAgentTaskRunInputSchema = showAgentTaskRunInputSchema;
export const cancelAgentTaskRunInputSchema = showAgentTaskRunInputSchema;
export const approveAgentTaskRunInputSchema = showAgentTaskRunInputSchema;
export const deliverAgentTaskRunInputSchema = showAgentTaskRunInputSchema
  .extend({
    branch: gitRef,
    commitMessage: z.string().trim().min(1).max(512),
    remote: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9._-]{1,120}$/u)
      .default("origin"),
    pullRequest: z
      .object({
        provider: z.literal("github"),
        title: z.string().trim().min(1).max(256),
        body: z.string().max(16_384).optional(),
        base: gitRef.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

type Input = Record<string, unknown>;

abstract class AgentTaskCommand extends Command<unknown> {
  constructor(readonly input: Input) {
    super();
  }
}

abstract class AgentTaskQuery extends Query<unknown> {
  constructor(readonly input: Input) {
    super();
  }
}

function command<T extends AgentTaskCommand>(
  schema: z.ZodType,
  input: unknown,
  create: (value: Input) => T,
): Result<T> {
  return parseOperationInput(schema, input).map((value) => create(value as Input));
}

function query<T extends AgentTaskQuery>(
  schema: z.ZodType,
  input: unknown,
  create: (value: Input) => T,
): Result<T> {
  return parseOperationInput(schema, input).map((value) => create(value as Input));
}

export class CreateAgentTaskRunCommand extends AgentTaskCommand {
  static create(input: unknown) {
    return command(createAgentTaskRunInputSchema, input, (value) => new this(value));
  }
}

export class ResumeAgentTaskRunCommand extends AgentTaskCommand {
  static create(input: unknown) {
    return command(resumeAgentTaskRunInputSchema, input, (value) => new this(value));
  }
}

export class CancelAgentTaskRunCommand extends AgentTaskCommand {
  static create(input: unknown) {
    return command(cancelAgentTaskRunInputSchema, input, (value) => new this(value));
  }
}

export class ApproveAgentTaskRunCommand extends AgentTaskCommand {
  static create(input: unknown) {
    return command(approveAgentTaskRunInputSchema, input, (value) => new this(value));
  }
}

export class DeliverAgentTaskRunCommand extends AgentTaskCommand {
  static create(input: unknown) {
    return command(deliverAgentTaskRunInputSchema, input, (value) => new this(value));
  }
}

export class ShowAgentTaskRunQuery extends AgentTaskQuery {
  static create(input: unknown) {
    return query(showAgentTaskRunInputSchema, input, (value) => new this(value));
  }
}

export class ListAgentTaskRunsQuery extends AgentTaskQuery {
  static create(input: unknown) {
    return query(listAgentTaskRunsInputSchema, input, (value) => new this(value));
  }
}
