import { type Result } from "@appaloft/core";
import { z } from "zod";
import { Command, Query } from "./cqrs";
import { parseOperationInput } from "./operations/shared-schema";

const id = z.string().trim().min(1).max(160);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const idempotencyKey = z.string().trim().min(1).max(256);

export const createSandboxAgentRuntimeInputSchema = z
  .object({
    sandboxId: id,
    harnessKey: z.string().trim().min(1).max(120),
    harnessTemplateId: id,
    idempotencyKey,
  })
  .strict();
export const listSandboxAgentRuntimesInputSchema = z.object({ sandboxId: id }).strict();
export const showSandboxAgentRuntimeInputSchema = z
  .object({ sandboxId: id, runtimeId: id })
  .strict();
export const terminateSandboxAgentRuntimeInputSchema = showSandboxAgentRuntimeInputSchema;
export const createSandboxAgentRunInputSchema = z
  .object({
    sandboxId: id,
    runtimeId: id,
    task: z.string().trim().min(1).max(256),
    context: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("fresh") }).strict(),
      z.object({ mode: z.literal("continue"), parentRunId: id }).strict(),
    ]),
    idempotencyKey,
  })
  .strict();
export const listSandboxAgentRunsInputSchema = z.object({ runtimeId: id }).strict();
export const showSandboxAgentRunInputSchema = z.object({ runtimeId: id, runId: id }).strict();
export const cancelSandboxAgentRunInputSchema = showSandboxAgentRunInputSchema;
export const listSandboxAgentRunEventsInputSchema = z
  .object({
    runId: id,
    afterSequence: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  })
  .strict();
export const listSandboxAgentApprovalsInputSchema = z.object({ runId: id }).strict();
export const showSandboxAgentApprovalInputSchema = z.object({ approvalId: id }).strict();
export const resolveSandboxAgentApprovalInputSchema = z
  .object({
    approvalId: id,
    decision: z.enum(["approve", "reject"]),
  })
  .strict();
export const createSandboxSourceArtifactInputSchema = z
  .object({
    sandboxId: id,
    sourceRoot: z.string().trim().min(1).max(1024),
  })
  .strict();
export const listSandboxSourceArtifactsInputSchema = z.object({ sandboxId: id }).strict();
export const showSandboxSourceArtifactInputSchema = z.object({ artifactId: id }).strict();
export const deleteSandboxSourceArtifactInputSchema = showSandboxSourceArtifactInputSchema;
export const createSandboxCandidatePreviewInputSchema = z.object({ artifactId: id }).strict();
export const showSandboxCandidatePreviewInputSchema = z.object({ previewId: id }).strict();
export const deleteSandboxCandidatePreviewInputSchema = showSandboxCandidatePreviewInputSchema;
export const planSandboxPromotionInputSchema = z
  .object({
    sandboxId: id,
    artifactId: id,
    expectedArtifactDigest: digest,
    candidatePreviewId: id,
    target: z
      .object({
        projectId: id,
        environmentId: id,
        destinationId: id.optional(),
        resourceName: z.string().trim().min(1).max(160),
      })
      .strict(),
  })
  .strict();
export const listSandboxPromotionsInputSchema = z.object({ sandboxId: id }).strict();
export const showSandboxPromotionInputSchema = z.object({ promotionId: id }).strict();
export const acceptSandboxPromotionInputSchema = z
  .object({
    promotionId: id,
    expectedArtifactDigest: digest,
    idempotencyKey,
  })
  .strict();
export const retrySandboxPromotionInputSchema = z
  .object({ promotionId: id, idempotencyKey })
  .strict();

type Input = Record<string, unknown>;
abstract class AgentCommand extends Command<unknown> {
  constructor(readonly input: Input) {
    super();
  }
}
abstract class AgentQuery extends Query<unknown> {
  constructor(readonly input: Input) {
    super();
  }
}

function command<T extends AgentCommand>(
  schema: z.ZodType,
  input: unknown,
  create: (value: Input) => T,
): Result<T> {
  return parseOperationInput(schema, input).map((value) => create(value as Input));
}
function query<T extends AgentQuery>(
  schema: z.ZodType,
  input: unknown,
  create: (value: Input) => T,
): Result<T> {
  return parseOperationInput(schema, input).map((value) => create(value as Input));
}

export class CreateSandboxAgentRuntimeCommand extends AgentCommand {
  static create(input: unknown) {
    return command(createSandboxAgentRuntimeInputSchema, input, (value) => new this(value));
  }
}
export class TerminateSandboxAgentRuntimeCommand extends AgentCommand {
  static create(input: unknown) {
    return command(terminateSandboxAgentRuntimeInputSchema, input, (value) => new this(value));
  }
}
export class CreateSandboxAgentRunCommand extends AgentCommand {
  static create(input: unknown) {
    return command(createSandboxAgentRunInputSchema, input, (value) => new this(value));
  }
}
export class CancelSandboxAgentRunCommand extends AgentCommand {
  static create(input: unknown) {
    return command(cancelSandboxAgentRunInputSchema, input, (value) => new this(value));
  }
}
export class ResolveSandboxAgentApprovalCommand extends AgentCommand {
  static create(input: unknown) {
    return command(resolveSandboxAgentApprovalInputSchema, input, (value) => new this(value));
  }
}
export class CreateSandboxSourceArtifactCommand extends AgentCommand {
  static create(input: unknown) {
    return command(createSandboxSourceArtifactInputSchema, input, (value) => new this(value));
  }
}
export class DeleteSandboxSourceArtifactCommand extends AgentCommand {
  static create(input: unknown) {
    return command(deleteSandboxSourceArtifactInputSchema, input, (value) => new this(value));
  }
}
export class CreateSandboxCandidatePreviewCommand extends AgentCommand {
  static create(input: unknown) {
    return command(createSandboxCandidatePreviewInputSchema, input, (value) => new this(value));
  }
}
export class DeleteSandboxCandidatePreviewCommand extends AgentCommand {
  static create(input: unknown) {
    return command(deleteSandboxCandidatePreviewInputSchema, input, (value) => new this(value));
  }
}
export class PlanSandboxPromotionCommand extends AgentCommand {
  static create(input: unknown) {
    return command(planSandboxPromotionInputSchema, input, (value) => new this(value));
  }
}
export class AcceptSandboxPromotionCommand extends AgentCommand {
  static create(input: unknown) {
    return command(acceptSandboxPromotionInputSchema, input, (value) => new this(value));
  }
}
export class RetrySandboxPromotionCommand extends AgentCommand {
  static create(input: unknown) {
    return command(retrySandboxPromotionInputSchema, input, (value) => new this(value));
  }
}

export class ListSandboxAgentRuntimesQuery extends AgentQuery {
  static create(input: unknown) {
    return query(listSandboxAgentRuntimesInputSchema, input, (value) => new this(value));
  }
}
export class ShowSandboxAgentRuntimeQuery extends AgentQuery {
  static create(input: unknown) {
    return query(showSandboxAgentRuntimeInputSchema, input, (value) => new this(value));
  }
}
export class ListSandboxAgentRunsQuery extends AgentQuery {
  static create(input: unknown) {
    return query(listSandboxAgentRunsInputSchema, input, (value) => new this(value));
  }
}
export class ShowSandboxAgentRunQuery extends AgentQuery {
  static create(input: unknown) {
    return query(showSandboxAgentRunInputSchema, input, (value) => new this(value));
  }
}
export class ListSandboxAgentRunEventsQuery extends AgentQuery {
  static create(input: unknown) {
    return query(listSandboxAgentRunEventsInputSchema, input, (value) => new this(value));
  }
}
export class ListSandboxAgentApprovalsQuery extends AgentQuery {
  static create(input: unknown) {
    return query(listSandboxAgentApprovalsInputSchema, input, (value) => new this(value));
  }
}
export class ShowSandboxAgentApprovalQuery extends AgentQuery {
  static create(input: unknown) {
    return query(showSandboxAgentApprovalInputSchema, input, (value) => new this(value));
  }
}
export class ListSandboxSourceArtifactsQuery extends AgentQuery {
  static create(input: unknown) {
    return query(listSandboxSourceArtifactsInputSchema, input, (value) => new this(value));
  }
}
export class ShowSandboxSourceArtifactQuery extends AgentQuery {
  static create(input: unknown) {
    return query(showSandboxSourceArtifactInputSchema, input, (value) => new this(value));
  }
}
export class ShowSandboxCandidatePreviewQuery extends AgentQuery {
  static create(input: unknown) {
    return query(showSandboxCandidatePreviewInputSchema, input, (value) => new this(value));
  }
}
export class ListSandboxPromotionsQuery extends AgentQuery {
  static create(input: unknown) {
    return query(listSandboxPromotionsInputSchema, input, (value) => new this(value));
  }
}
export class ShowSandboxPromotionQuery extends AgentQuery {
  static create(input: unknown) {
    return query(showSandboxPromotionInputSchema, input, (value) => new this(value));
  }
}
