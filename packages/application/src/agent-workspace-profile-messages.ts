import { type Result } from "@appaloft/core";
import { z } from "zod";
import { Command, Query } from "./cqrs";
import { parseOperationInput } from "./operations/shared-schema";

const installationIdSchema = z
  .string()
  .trim()
  .regex(/^awpi_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
const digestSchema = z
  .string()
  .trim()
  .regex(/^sha256:[a-f0-9]{64}$/);
const idSchema = z.string().trim().min(1).max(160);
const commandSchema = z.array(z.string().min(1).max(16_384)).min(1).max(256);
export const agentWorkspaceCredentialReferenceSchema = z
  .object({
    requirementId: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9-]{0,62}$/),
    connectionReference: z
      .string()
      .trim()
      .regex(/^[A-Za-z][A-Za-z0-9_.:-]{0,159}$/),
  })
  .strict();
const credentialRequirementSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9-]{0,62}$/),
    kind: z.enum(["model-api", "forge", "custom"]),
    required: z.boolean(),
    purpose: z.string().trim().min(1).max(1_000),
    delivery: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("process-environment"),
          variable: z
            .string()
            .trim()
            .regex(/^[A-Z_][A-Z0-9_]{0,127}$/),
        })
        .strict(),
      z.object({ kind: z.literal("stdin") }).strict(),
    ]),
  })
  .strict();
const credentialBindingSchema = credentialRequirementSchema
  .omit({ id: true, required: true })
  .extend({
    requirementId: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9-]{0,62}$/),
    connectionReference: agentWorkspaceCredentialReferenceSchema.shape.connectionReference,
  })
  .strict();
const healthcheckSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("process") }).strict(),
  z
    .object({
      kind: z.literal("http"),
      port: z.number().int().min(1).max(65_535),
      path: z.string().trim().min(1).max(512),
    })
    .strict(),
]);

export const validateAgentWorkspaceProfileInputSchema = z
  .object({ manifest: z.unknown() })
  .strict();
export const installAgentWorkspaceProfileInputSchema = validateAgentWorkspaceProfileInputSchema;
export const listAgentWorkspaceProfilesInputSchema = z
  .object({ limit: z.coerce.number().int().min(1).max(200).default(100) })
  .strict()
  .default({ limit: 100 });
export const showAgentWorkspaceProfileInputSchema = z
  .object({ installationId: installationIdSchema })
  .strict();
export const disableAgentWorkspaceProfileInputSchema = showAgentWorkspaceProfileInputSchema;
export const uninstallAgentWorkspaceProfileInputSchema = showAgentWorkspaceProfileInputSchema;
export const compileAgentWorkspaceProfileInputSchema = showAgentWorkspaceProfileInputSchema
  .extend({})
  .strict();
export const configureAgentWorkspaceProfileCredentialConnectionsInputSchema =
  showAgentWorkspaceProfileInputSchema
    .extend({
      connections: z.array(agentWorkspaceCredentialReferenceSchema).max(32),
    })
    .strict();

export const agentWorkspaceProfileInstallationSchema = z
  .object({
    installationId: installationIdSchema,
    definitionDigest: digestSchema,
    profileId: idSchema,
    profileVersion: z.string().trim().min(1).max(128),
    displayName: z.string().trim().min(1).max(120),
    adapterDefinitionDigest: digestSchema,
    status: z.enum(["disabled", "enabled"]),
    installedAt: z.string().datetime(),
    updatedAt: z.string().datetime().optional(),
    credentialConnections: z.array(agentWorkspaceCredentialReferenceSchema),
  })
  .strict();

export const validateAgentWorkspaceProfileResponseSchema = z
  .object({
    manifest: z.unknown(),
    definitionDigest: digestSchema,
  })
  .strict();
export const installAgentWorkspaceProfileResponseSchema = agentWorkspaceProfileInstallationSchema;
export const listAgentWorkspaceProfilesResponseSchema = z.array(
  agentWorkspaceProfileInstallationSchema,
);
export const showAgentWorkspaceProfileResponseSchema = agentWorkspaceProfileInstallationSchema;
export const disableAgentWorkspaceProfileResponseSchema = agentWorkspaceProfileInstallationSchema;
export const configureAgentWorkspaceProfileCredentialConnectionsResponseSchema =
  agentWorkspaceProfileInstallationSchema;
export const uninstallAgentWorkspaceProfileResponseSchema = z
  .object({
    installationId: installationIdSchema,
    uninstalled: z.boolean(),
  })
  .strict();

const capabilitySnapshotSchema = z
  .object({
    taskMode: z.boolean(),
    interactive: z.boolean(),
    backgroundRuns: z.boolean(),
    nativeSession: z.boolean(),
    persistentPaths: z.array(z.string()),
    healthcheck: healthcheckSchema.optional(),
  })
  .strict();

export const compileAgentWorkspaceProfileResponseSchema = z
  .object({
    sandbox: z
      .object({
        source: z.object({ kind: z.literal("template"), templateId: idSchema }).strict(),
        requestedIsolation: z.enum(["container-trusted", "gvisor", "kata", "microvm"]),
        limits: z
          .object({
            cpuMillis: z.number().int(),
            memoryBytes: z.number().int(),
            diskBytes: z.number().int(),
            maxProcesses: z.number().int(),
          })
          .strict(),
        networkPolicy: z.union([
          z.object({ mode: z.literal("deny") }).strict(),
          z
            .object({
              mode: z.literal("allowlist"),
              rules: z.array(
                z
                  .object({
                    kind: z.literal("domain"),
                    value: z.string(),
                    ports: z.array(z.number().int()),
                  })
                  .strict(),
              ),
            })
            .strict(),
        ]),
      })
      .strict(),
    initialization: z.array(
      z
        .object({
          id: idSchema,
          argv: commandSchema,
          cwd: z.string().optional(),
        })
        .strict(),
    ),
    runtime: z
      .object({
        harnessKey: idSchema,
        harnessTemplateId: idSchema,
        declarativeHarness: z.record(z.string(), z.unknown()),
      })
      .strict(),
    defaultPorts: z.array(
      z
        .object({
          name: idSchema,
          port: z.number().int().min(1).max(65_535),
          visibility: z.enum(["private", "organization", "public"]),
          ttlSeconds: z.number().int().min(60),
        })
        .strict(),
    ),
    preview: z
      .object({
        startArgv: commandSchema,
        cwd: z.string().optional(),
        port: z.number().int().min(1).max(65_535),
        visibility: z.enum(["private", "organization", "public"]),
        ttlSeconds: z.number().int().min(60),
      })
      .strict()
      .optional(),
    suggestedChecks: z.array(
      z
        .object({
          name: z.string(),
          argv: commandSchema,
          cwd: z.string().optional(),
        })
        .strict(),
    ),
    credentialRequirements: z.array(credentialRequirementSchema),
    credentialBindings: z.array(credentialBindingSchema).optional(),
    pin: z
      .object({
        profileInstallationId: installationIdSchema,
        profileDefinitionDigest: digestSchema,
        profileId: idSchema,
        profileVersion: z.string(),
        adapterInstallationId: z.string().regex(/^aai_/),
        adapterDefinitionDigest: digestSchema,
        adapterId: idSchema,
        adapterVersion: z.string(),
        harnessKey: idSchema,
        harnessTemplateId: idSchema,
        sandboxTemplateId: idSchema,
        sandboxTemplateVersion: z.string(),
        sandboxTemplateDigest: digestSchema,
        capabilities: capabilitySnapshotSchema,
      })
      .strict(),
  })
  .strict();

export type ValidateAgentWorkspaceProfileResponse = z.output<
  typeof validateAgentWorkspaceProfileResponseSchema
>;
export type AgentWorkspaceProfileInstallationResponse = z.output<
  typeof agentWorkspaceProfileInstallationSchema
>;
export type CompileAgentWorkspaceProfileResponse = z.output<
  typeof compileAgentWorkspaceProfileResponseSchema
>;
export type ConfigureAgentWorkspaceProfileCredentialConnectionsResponse = z.output<
  typeof configureAgentWorkspaceProfileCredentialConnectionsResponseSchema
>;
export type UninstallAgentWorkspaceProfileResponse = z.output<
  typeof uninstallAgentWorkspaceProfileResponseSchema
>;

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

export class ValidateAgentWorkspaceProfileQuery extends Query<
  z.output<typeof validateAgentWorkspaceProfileResponseSchema>
> {
  constructor(public readonly input: z.output<typeof validateAgentWorkspaceProfileInputSchema>) {
    super();
  }

  static create(input: unknown): Result<ValidateAgentWorkspaceProfileQuery> {
    return query(validateAgentWorkspaceProfileInputSchema, input, (parsed) => new this(parsed));
  }
}

export class InstallAgentWorkspaceProfileCommand extends Command<
  z.output<typeof installAgentWorkspaceProfileResponseSchema>
> {
  constructor(public readonly input: z.output<typeof installAgentWorkspaceProfileInputSchema>) {
    super();
  }

  static create(input: unknown): Result<InstallAgentWorkspaceProfileCommand> {
    return command(installAgentWorkspaceProfileInputSchema, input, (parsed) => new this(parsed));
  }
}

export class ListAgentWorkspaceProfilesQuery extends Query<
  z.output<typeof listAgentWorkspaceProfilesResponseSchema>
> {
  constructor(public readonly input: z.output<typeof listAgentWorkspaceProfilesInputSchema>) {
    super();
  }

  static create(input: unknown = {}): Result<ListAgentWorkspaceProfilesQuery> {
    return query(listAgentWorkspaceProfilesInputSchema, input, (parsed) => new this(parsed));
  }
}

export class ShowAgentWorkspaceProfileQuery extends Query<
  z.output<typeof showAgentWorkspaceProfileResponseSchema>
> {
  constructor(public readonly input: z.output<typeof showAgentWorkspaceProfileInputSchema>) {
    super();
  }

  static create(input: unknown): Result<ShowAgentWorkspaceProfileQuery> {
    return query(showAgentWorkspaceProfileInputSchema, input, (parsed) => new this(parsed));
  }
}

export class DisableAgentWorkspaceProfileCommand extends Command<
  z.output<typeof disableAgentWorkspaceProfileResponseSchema>
> {
  constructor(public readonly input: z.output<typeof disableAgentWorkspaceProfileInputSchema>) {
    super();
  }

  static create(input: unknown): Result<DisableAgentWorkspaceProfileCommand> {
    return command(disableAgentWorkspaceProfileInputSchema, input, (parsed) => new this(parsed));
  }
}

export class ConfigureAgentWorkspaceProfileCredentialConnectionsCommand extends Command<
  z.output<typeof configureAgentWorkspaceProfileCredentialConnectionsResponseSchema>
> {
  constructor(
    public readonly input: z.output<
      typeof configureAgentWorkspaceProfileCredentialConnectionsInputSchema
    >,
  ) {
    super();
  }

  static create(
    input: unknown,
  ): Result<ConfigureAgentWorkspaceProfileCredentialConnectionsCommand> {
    return command(
      configureAgentWorkspaceProfileCredentialConnectionsInputSchema,
      input,
      (parsed) => new this(parsed),
    );
  }
}

export class UninstallAgentWorkspaceProfileCommand extends Command<
  z.output<typeof uninstallAgentWorkspaceProfileResponseSchema>
> {
  constructor(public readonly input: z.output<typeof uninstallAgentWorkspaceProfileInputSchema>) {
    super();
  }

  static create(input: unknown): Result<UninstallAgentWorkspaceProfileCommand> {
    return command(uninstallAgentWorkspaceProfileInputSchema, input, (parsed) => new this(parsed));
  }
}

export class CompileAgentWorkspaceProfileQuery extends Query<
  z.output<typeof compileAgentWorkspaceProfileResponseSchema>
> {
  constructor(public readonly input: z.output<typeof compileAgentWorkspaceProfileInputSchema>) {
    super();
  }

  static create(input: unknown): Result<CompileAgentWorkspaceProfileQuery> {
    return query(compileAgentWorkspaceProfileInputSchema, input, (parsed) => new this(parsed));
  }
}
