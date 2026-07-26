import { type Result } from "@appaloft/core";
import { z } from "zod";
import { Command, Query } from "./cqrs";
import { parseOperationInput } from "./operations/shared-schema";

const installationIdSchema = z
  .string()
  .trim()
  .regex(/^aai_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);

export const validateAgentAdapterInputSchema = z
  .object({
    manifest: z.unknown(),
  })
  .strict();
export const installAgentAdapterInputSchema = validateAgentAdapterInputSchema;
export const listAgentAdaptersInputSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(100),
  })
  .strict()
  .default({ limit: 100 });
export const showAgentAdapterInputSchema = z
  .object({
    installationId: installationIdSchema,
  })
  .strict();
export const disableAgentAdapterInputSchema = showAgentAdapterInputSchema;
export const uninstallAgentAdapterInputSchema = showAgentAdapterInputSchema;

export const agentAdapterCompatibilitySchema = z
  .object({
    status: z.enum(["compatible", "unchecked"]),
    unavailableOptionalCapabilities: z.array(z.string().trim().min(1)),
  })
  .strict();
export const agentAdapterInstallationSchema = z
  .object({
    installationId: installationIdSchema,
    definitionDigest: z
      .string()
      .trim()
      .regex(/^sha256:[a-f0-9]{64}$/),
    adapterId: z.string().trim().min(1),
    adapterVersion: z.string().trim().min(1),
    displayName: z.string().trim().min(1),
    status: z.enum(["disabled", "enabled"]),
    compatibility: agentAdapterCompatibilitySchema,
    installedAt: z.string().datetime(),
    updatedAt: z.string().datetime().optional(),
  })
  .strict();
export const validateAgentAdapterResponseSchema = z
  .object({
    manifest: z.unknown(),
    definitionDigest: z
      .string()
      .trim()
      .regex(/^sha256:[a-f0-9]{64}$/),
    compatibility: agentAdapterCompatibilitySchema,
  })
  .strict();
export const installAgentAdapterResponseSchema = agentAdapterInstallationSchema;
export const listAgentAdaptersResponseSchema = z.array(agentAdapterInstallationSchema);
export const showAgentAdapterResponseSchema = agentAdapterInstallationSchema;
export const disableAgentAdapterResponseSchema = agentAdapterInstallationSchema;
export const uninstallAgentAdapterResponseSchema = z
  .object({
    installationId: installationIdSchema,
    uninstalled: z.boolean(),
  })
  .strict();
export type ValidateAgentAdapterResponse = z.output<typeof validateAgentAdapterResponseSchema>;
export type AgentAdapterInstallationResponse = z.output<typeof agentAdapterInstallationSchema>;
export type UninstallAgentAdapterResponse = z.output<typeof uninstallAgentAdapterResponseSchema>;

export type ValidateAgentAdapterInput = z.input<typeof validateAgentAdapterInputSchema>;
export type InstallAgentAdapterInput = z.input<typeof installAgentAdapterInputSchema>;
export type ListAgentAdaptersInput = z.input<typeof listAgentAdaptersInputSchema>;
export type ShowAgentAdapterInput = z.input<typeof showAgentAdapterInputSchema>;
export type DisableAgentAdapterInput = z.input<typeof disableAgentAdapterInputSchema>;
export type UninstallAgentAdapterInput = z.input<typeof uninstallAgentAdapterInputSchema>;

function command<TInput, TCommand>(
  schema: z.ZodType<TInput>,
  input: unknown,
  create: (parsed: TInput) => TCommand,
): Result<TCommand> {
  return parseOperationInput(schema, input).map(create);
}

function query<TInput, TQuery>(
  schema: z.ZodType<TInput>,
  input: unknown,
  create: (parsed: TInput) => TQuery,
): Result<TQuery> {
  return parseOperationInput(schema, input).map(create);
}

export class ValidateAgentAdapterQuery extends Query<
  z.output<typeof validateAgentAdapterResponseSchema>
> {
  constructor(public readonly input: z.output<typeof validateAgentAdapterInputSchema>) {
    super();
  }

  static create(input: unknown): Result<ValidateAgentAdapterQuery> {
    return query(validateAgentAdapterInputSchema, input, (parsed) => new this(parsed));
  }
}

export class InstallAgentAdapterCommand extends Command<
  z.output<typeof installAgentAdapterResponseSchema>
> {
  constructor(public readonly input: z.output<typeof installAgentAdapterInputSchema>) {
    super();
  }

  static create(input: unknown): Result<InstallAgentAdapterCommand> {
    return command(installAgentAdapterInputSchema, input, (parsed) => new this(parsed));
  }
}

export class ListAgentAdaptersQuery extends Query<
  z.output<typeof listAgentAdaptersResponseSchema>
> {
  constructor(public readonly input: z.output<typeof listAgentAdaptersInputSchema>) {
    super();
  }

  static create(input: unknown = {}): Result<ListAgentAdaptersQuery> {
    return query(listAgentAdaptersInputSchema, input, (parsed) => new this(parsed));
  }
}

export class ShowAgentAdapterQuery extends Query<z.output<typeof showAgentAdapterResponseSchema>> {
  constructor(public readonly input: z.output<typeof showAgentAdapterInputSchema>) {
    super();
  }

  static create(input: unknown): Result<ShowAgentAdapterQuery> {
    return query(showAgentAdapterInputSchema, input, (parsed) => new this(parsed));
  }
}

export class DisableAgentAdapterCommand extends Command<
  z.output<typeof disableAgentAdapterResponseSchema>
> {
  constructor(public readonly input: z.output<typeof disableAgentAdapterInputSchema>) {
    super();
  }

  static create(input: unknown): Result<DisableAgentAdapterCommand> {
    return command(disableAgentAdapterInputSchema, input, (parsed) => new this(parsed));
  }
}

export class UninstallAgentAdapterCommand extends Command<
  z.output<typeof uninstallAgentAdapterResponseSchema>
> {
  constructor(public readonly input: z.output<typeof uninstallAgentAdapterInputSchema>) {
    super();
  }

  static create(input: unknown): Result<UninstallAgentAdapterCommand> {
    return command(uninstallAgentAdapterInputSchema, input, (parsed) => new this(parsed));
  }
}
