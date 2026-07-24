import { type Result } from "@appaloft/core";
import { z } from "zod";
import { Command, Query } from "./cqrs";
import { parseOperationInput } from "./operations/shared-schema";

const id = z.string().trim().min(1).max(160);
const role = z.enum(["owner", "editor", "reviewer", "viewer"]);
const purpose = z.enum(["builder", "reviewer", "tester", "custom"]);
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

export const createWorkspaceCollaborationInputSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    workspaceId: id,
    lanePurpose: purpose,
    laneLabel: z.string().trim().min(1).max(160),
    branch: gitRef.optional(),
  })
  .strict();
export const listWorkspaceCollaborationsInputSchema = z.object({}).strict();
export const showWorkspaceCollaborationInputSchema = z.object({ collaborationId: id }).strict();
export const addWorkspaceCollaborationParticipantInputSchema = showWorkspaceCollaborationInputSchema
  .extend({
    subject: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("user"), subjectId: id }).strict(),
      z
        .object({
          kind: z.literal("agent-runtime"),
          runtimeId: id,
          workspaceId: id,
        })
        .strict(),
    ]),
    role,
  })
  .strict();
export const changeWorkspaceCollaborationParticipantRoleInputSchema =
  showWorkspaceCollaborationInputSchema.extend({ participantId: id, role }).strict();
export const removeWorkspaceCollaborationParticipantInputSchema =
  showWorkspaceCollaborationInputSchema.extend({ participantId: id }).strict();
export const addWorkspaceCollaborationLaneInputSchema = showWorkspaceCollaborationInputSchema
  .extend({
    workspaceId: id,
    purpose,
    label: z.string().trim().min(1).max(160),
    branch: gitRef.optional(),
  })
  .strict();
export const archiveWorkspaceCollaborationLaneInputSchema = showWorkspaceCollaborationInputSchema
  .extend({ laneId: id })
  .strict();
export const acquireWorkspaceWriterLeaseInputSchema = showWorkspaceCollaborationInputSchema
  .extend({ laneId: id, expiresAt: z.iso.datetime() })
  .strict();
export const renewWorkspaceWriterLeaseInputSchema = acquireWorkspaceWriterLeaseInputSchema
  .extend({ expectedGeneration: z.number().int().nonnegative() })
  .strict();
export const releaseWorkspaceWriterLeaseInputSchema = showWorkspaceCollaborationInputSchema
  .extend({
    laneId: id,
    expectedGeneration: z.number().int().nonnegative(),
  })
  .strict();
export const transferWorkspaceWriterLeaseInputSchema = releaseWorkspaceWriterLeaseInputSchema
  .extend({
    toParticipantId: id,
    expiresAt: z.iso.datetime(),
  })
  .strict();
export const offerWorkspaceCollaborationHandoffInputSchema = showWorkspaceCollaborationInputSchema
  .extend({
    sourceLaneId: id,
    targetLaneId: id,
    artifactId: id,
    expectedDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  })
  .strict();
export const resolveWorkspaceCollaborationHandoffInputSchema = showWorkspaceCollaborationInputSchema
  .extend({
    handoffId: id,
    decision: z.enum(["accept", "reject"]),
  })
  .strict();
export const closeWorkspaceCollaborationInputSchema = showWorkspaceCollaborationInputSchema;
const workspaceCollaborationLaneAccessInputSchema = showWorkspaceCollaborationInputSchema
  .extend({
    laneId: id,
    access: z.enum(["observe", "write"]),
    expectedGeneration: z.number().int().nonnegative().optional(),
  })
  .strict();

function requireWriterGeneration(
  value: z.infer<typeof workspaceCollaborationLaneAccessInputSchema>,
  context: z.RefinementCtx,
): void {
  if (value.access === "write" && value.expectedGeneration === undefined) {
    context.addIssue({
      code: "custom",
      path: ["expectedGeneration"],
      message: "Write access requires expectedGeneration",
    });
  }
}

export const authorizeWorkspaceCollaborationLaneAccessInputSchema =
  workspaceCollaborationLaneAccessInputSchema.superRefine(requireWriterGeneration);
export const issueWorkspaceCollaborationTerminalAccessInputSchema =
  workspaceCollaborationLaneAccessInputSchema
    .extend({ sessionId: id })
    .strict()
    .superRefine(requireWriterGeneration);
export const issueWorkspaceCollaborationNativeAttachInputSchema =
  showWorkspaceCollaborationInputSchema
    .extend({
      laneId: id,
      runtimeId: id,
      expiresAt: z.iso.datetime(),
      expectedGeneration: z.number().int().positive(),
    })
    .strict();

type Input = Record<string, unknown>;

abstract class CollaborationCommand extends Command<unknown> {
  constructor(readonly input: Input) {
    super();
  }
}

abstract class CollaborationQuery extends Query<unknown> {
  constructor(readonly input: Input) {
    super();
  }
}

function command<T extends CollaborationCommand>(
  schema: z.ZodType,
  input: unknown,
  create: (value: Input) => T,
): Result<T> {
  return parseOperationInput(schema, input).map((value) => create(value as Input));
}

function query<T extends CollaborationQuery>(
  schema: z.ZodType,
  input: unknown,
  create: (value: Input) => T,
): Result<T> {
  return parseOperationInput(schema, input).map((value) => create(value as Input));
}

export class CreateWorkspaceCollaborationCommand extends CollaborationCommand {
  static create(input: unknown) {
    return command(createWorkspaceCollaborationInputSchema, input, (value) => new this(value));
  }
}
export class AddWorkspaceCollaborationParticipantCommand extends CollaborationCommand {
  static create(input: unknown) {
    return command(
      addWorkspaceCollaborationParticipantInputSchema,
      input,
      (value) => new this(value),
    );
  }
}
export class ChangeWorkspaceCollaborationParticipantRoleCommand extends CollaborationCommand {
  static create(input: unknown) {
    return command(
      changeWorkspaceCollaborationParticipantRoleInputSchema,
      input,
      (value) => new this(value),
    );
  }
}
export class RemoveWorkspaceCollaborationParticipantCommand extends CollaborationCommand {
  static create(input: unknown) {
    return command(
      removeWorkspaceCollaborationParticipantInputSchema,
      input,
      (value) => new this(value),
    );
  }
}
export class AddWorkspaceCollaborationLaneCommand extends CollaborationCommand {
  static create(input: unknown) {
    return command(addWorkspaceCollaborationLaneInputSchema, input, (value) => new this(value));
  }
}
export class ArchiveWorkspaceCollaborationLaneCommand extends CollaborationCommand {
  static create(input: unknown) {
    return command(archiveWorkspaceCollaborationLaneInputSchema, input, (value) => new this(value));
  }
}
export class AcquireWorkspaceWriterLeaseCommand extends CollaborationCommand {
  static create(input: unknown) {
    return command(acquireWorkspaceWriterLeaseInputSchema, input, (value) => new this(value));
  }
}
export class RenewWorkspaceWriterLeaseCommand extends CollaborationCommand {
  static create(input: unknown) {
    return command(renewWorkspaceWriterLeaseInputSchema, input, (value) => new this(value));
  }
}
export class ReleaseWorkspaceWriterLeaseCommand extends CollaborationCommand {
  static create(input: unknown) {
    return command(releaseWorkspaceWriterLeaseInputSchema, input, (value) => new this(value));
  }
}
export class TransferWorkspaceWriterLeaseCommand extends CollaborationCommand {
  static create(input: unknown) {
    return command(transferWorkspaceWriterLeaseInputSchema, input, (value) => new this(value));
  }
}
export class OfferWorkspaceCollaborationHandoffCommand extends CollaborationCommand {
  static create(input: unknown) {
    return command(
      offerWorkspaceCollaborationHandoffInputSchema,
      input,
      (value) => new this(value),
    );
  }
}
export class ResolveWorkspaceCollaborationHandoffCommand extends CollaborationCommand {
  static create(input: unknown) {
    return command(
      resolveWorkspaceCollaborationHandoffInputSchema,
      input,
      (value) => new this(value),
    );
  }
}
export class CloseWorkspaceCollaborationCommand extends CollaborationCommand {
  static create(input: unknown) {
    return command(closeWorkspaceCollaborationInputSchema, input, (value) => new this(value));
  }
}
export class IssueWorkspaceCollaborationTerminalAccessCommand extends CollaborationCommand {
  static create(input: unknown) {
    return command(
      issueWorkspaceCollaborationTerminalAccessInputSchema,
      input,
      (value) => new this(value),
    );
  }
}
export class IssueWorkspaceCollaborationNativeAttachCommand extends CollaborationCommand {
  static create(input: unknown) {
    return command(
      issueWorkspaceCollaborationNativeAttachInputSchema,
      input,
      (value) => new this(value),
    );
  }
}
export class ListWorkspaceCollaborationsQuery extends CollaborationQuery {
  static create(input: unknown = {}) {
    return query(listWorkspaceCollaborationsInputSchema, input, (value) => new this(value));
  }
}
export class ShowWorkspaceCollaborationQuery extends CollaborationQuery {
  static create(input: unknown) {
    return query(showWorkspaceCollaborationInputSchema, input, (value) => new this(value));
  }
}
export class AuthorizeWorkspaceCollaborationLaneAccessQuery extends CollaborationQuery {
  static create(input: unknown) {
    return query(
      authorizeWorkspaceCollaborationLaneAccessInputSchema,
      input,
      (value) => new this(value),
    );
  }
}
