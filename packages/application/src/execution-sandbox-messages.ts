import { type Result } from "@appaloft/core";
import { z } from "zod";
import { Command, Query } from "./cqrs";
import { parseOperationInput } from "./operations/shared-schema";

const sandboxIdSchema = z.string().trim().min(1).max(160);
const snapshotIdSchema = z.string().trim().min(1).max(160);
const pathSchema = z.string().trim().min(1).max(1024);
const paginationSchema = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional(),
  })
  .strict();

export const createSandboxCommandInputSchema = z
  .object({
    source: z
      .object({ kind: z.literal("image"), image: z.string().trim().min(1).max(512) })
      .strict(),
    requestedIsolation: z.enum(["container-trusted", "gvisor", "kata", "microvm"]),
    limits: z
      .object({
        cpuMillis: z.number().int().positive(),
        memoryBytes: z.number().int().positive(),
        diskBytes: z.number().int().positive(),
        maxProcesses: z.number().int().positive(),
      })
      .strict(),
    networkPolicy: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("deny"), rules: z.array(z.never()).max(0).default([]) }).strict(),
      z
        .object({
          mode: z.literal("allowlist"),
          rules: z
            .array(
              z
                .object({
                  kind: z.enum(["domain", "cidr"]),
                  value: z.string().trim().min(1).max(253),
                  ports: z.array(z.number().int().min(1).max(65535)).min(1).max(64),
                })
                .strict(),
            )
            .min(1)
            .max(128),
        })
        .strict(),
    ]),
    expiresAt: z.iso.datetime().optional(),
    providerKey: z.string().trim().min(1).max(120).optional(),
  })
  .strict();
export const listSandboxesQueryInputSchema = paginationSchema;
export const showSandboxQueryInputSchema = z.object({ sandboxId: sandboxIdSchema }).strict();
export const sandboxLifecycleCommandInputSchema = showSandboxQueryInputSchema;
export const executeSandboxCommandInputSchema = z
  .object({
    sandboxId: sandboxIdSchema,
    argv: z.array(z.string().max(16_384)).min(1).max(256),
    cwd: pathSchema.optional(),
    background: z.boolean().optional(),
    timeoutMs: z.number().int().min(1).max(3_600_000).optional(),
  })
  .strict();
export const sandboxFilePathInputSchema = z
  .object({ sandboxId: sandboxIdSchema, path: pathSchema })
  .strict();
export const writeSandboxFileCommandInputSchema = sandboxFilePathInputSchema
  .extend({ contentBase64: z.string().max(16 * 1024 * 1024) })
  .strict();
export const removeSandboxFileCommandInputSchema = sandboxFilePathInputSchema
  .extend({ recursive: z.boolean().optional() })
  .strict();
export const listSandboxProcessesQueryInputSchema = showSandboxQueryInputSchema;
export const terminateSandboxProcessCommandInputSchema = z
  .object({ sandboxId: sandboxIdSchema, processId: z.string().trim().min(1).max(160) })
  .strict();
export const exposeSandboxPortCommandInputSchema = z
  .object({
    sandboxId: sandboxIdSchema,
    port: z.number().int().min(1).max(65535),
    visibility: z.enum(["private", "organization", "public"]).default("private"),
    expiresAt: z.iso.datetime().optional(),
  })
  .strict();
export const listSandboxPortsQueryInputSchema = showSandboxQueryInputSchema;
export const revokeSandboxPortCommandInputSchema = z
  .object({ sandboxId: sandboxIdSchema, exposureId: z.string().trim().min(1).max(160) })
  .strict();
export const createSandboxSnapshotCommandInputSchema = z
  .object({
    sandboxId: sandboxIdSchema,
    capability: z.enum(["filesystem", "filesystem-memory"]),
    expiresAt: z.iso.datetime().optional(),
  })
  .strict();
export const listSandboxSnapshotsQueryInputSchema = paginationSchema;
export const showSandboxSnapshotQueryInputSchema = z
  .object({ snapshotId: snapshotIdSchema })
  .strict();

abstract class SandboxCommandMessage extends Command<unknown> {
  constructor(readonly input: Record<string, unknown>) {
    super();
  }
}
abstract class SandboxQueryMessage extends Query<unknown> {
  constructor(readonly input: Record<string, unknown>) {
    super();
  }
}

function commandCreate<T extends SandboxCommandMessage>(
  schema: z.ZodType,
  input: unknown,
  create: (value: Record<string, unknown>) => T,
): Result<T> {
  return parseOperationInput(schema, input).map((value) =>
    create(value as Record<string, unknown>),
  );
}
function queryCreate<T extends SandboxQueryMessage>(
  schema: z.ZodType,
  input: unknown,
  create: (value: Record<string, unknown>) => T,
): Result<T> {
  return parseOperationInput(schema, input).map((value) =>
    create(value as Record<string, unknown>),
  );
}

export class CreateSandboxCommand extends SandboxCommandMessage {
  static create(input: unknown) {
    return commandCreate(
      createSandboxCommandInputSchema,
      input,
      (value) => new CreateSandboxCommand(value),
    );
  }
}
export class PauseSandboxCommand extends SandboxCommandMessage {
  static create(input: unknown) {
    return commandCreate(
      sandboxLifecycleCommandInputSchema,
      input,
      (value) => new PauseSandboxCommand(value),
    );
  }
}
export class ResumeSandboxCommand extends SandboxCommandMessage {
  static create(input: unknown) {
    return commandCreate(
      sandboxLifecycleCommandInputSchema,
      input,
      (value) => new ResumeSandboxCommand(value),
    );
  }
}
export class TerminateSandboxCommand extends SandboxCommandMessage {
  static create(input: unknown) {
    return commandCreate(
      sandboxLifecycleCommandInputSchema,
      input,
      (value) => new TerminateSandboxCommand(value),
    );
  }
}
export class ExecuteSandboxCommand extends SandboxCommandMessage {
  static create(input: unknown) {
    return commandCreate(
      executeSandboxCommandInputSchema,
      input,
      (value) => new ExecuteSandboxCommand(value),
    );
  }
}
export class WriteSandboxFileCommand extends SandboxCommandMessage {
  static create(input: unknown) {
    return commandCreate(
      writeSandboxFileCommandInputSchema,
      input,
      (value) => new WriteSandboxFileCommand(value),
    );
  }
}
export class RemoveSandboxFileCommand extends SandboxCommandMessage {
  static create(input: unknown) {
    return commandCreate(
      removeSandboxFileCommandInputSchema,
      input,
      (value) => new RemoveSandboxFileCommand(value),
    );
  }
}
export class TerminateSandboxProcessCommand extends SandboxCommandMessage {
  static create(input: unknown) {
    return commandCreate(
      terminateSandboxProcessCommandInputSchema,
      input,
      (value) => new TerminateSandboxProcessCommand(value),
    );
  }
}
export class ExposeSandboxPortCommand extends SandboxCommandMessage {
  static create(input: unknown) {
    return commandCreate(
      exposeSandboxPortCommandInputSchema,
      input,
      (value) => new ExposeSandboxPortCommand(value),
    );
  }
}
export class RevokeSandboxPortCommand extends SandboxCommandMessage {
  static create(input: unknown) {
    return commandCreate(
      revokeSandboxPortCommandInputSchema,
      input,
      (value) => new RevokeSandboxPortCommand(value),
    );
  }
}
export class CreateSandboxSnapshotCommand extends SandboxCommandMessage {
  static create(input: unknown) {
    return commandCreate(
      createSandboxSnapshotCommandInputSchema,
      input,
      (value) => new CreateSandboxSnapshotCommand(value),
    );
  }
}

export class ListSandboxesQuery extends SandboxQueryMessage {
  static create(input: unknown = {}) {
    return queryCreate(
      listSandboxesQueryInputSchema,
      input,
      (value) => new ListSandboxesQuery(value),
    );
  }
}
export class ShowSandboxQuery extends SandboxQueryMessage {
  static create(input: unknown) {
    return queryCreate(showSandboxQueryInputSchema, input, (value) => new ShowSandboxQuery(value));
  }
}
export class ListSandboxFilesQuery extends SandboxQueryMessage {
  static create(input: unknown) {
    return queryCreate(
      sandboxFilePathInputSchema,
      input,
      (value) => new ListSandboxFilesQuery(value),
    );
  }
}
export class ReadSandboxFileQuery extends SandboxQueryMessage {
  static create(input: unknown) {
    return queryCreate(
      sandboxFilePathInputSchema,
      input,
      (value) => new ReadSandboxFileQuery(value),
    );
  }
}
export class ListSandboxProcessesQuery extends SandboxQueryMessage {
  static create(input: unknown) {
    return queryCreate(
      listSandboxProcessesQueryInputSchema,
      input,
      (value) => new ListSandboxProcessesQuery(value),
    );
  }
}
export class ListSandboxPortsQuery extends SandboxQueryMessage {
  static create(input: unknown) {
    return queryCreate(
      listSandboxPortsQueryInputSchema,
      input,
      (value) => new ListSandboxPortsQuery(value),
    );
  }
}
export class ListSandboxSnapshotsQuery extends SandboxQueryMessage {
  static create(input: unknown = {}) {
    return queryCreate(
      listSandboxSnapshotsQueryInputSchema,
      input,
      (value) => new ListSandboxSnapshotsQuery(value),
    );
  }
}
export class ShowSandboxSnapshotQuery extends SandboxQueryMessage {
  static create(input: unknown) {
    return queryCreate(
      showSandboxSnapshotQueryInputSchema,
      input,
      (value) => new ShowSandboxSnapshotQuery(value),
    );
  }
}
