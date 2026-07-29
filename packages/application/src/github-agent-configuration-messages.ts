import { type Result } from "@appaloft/core";
import { z } from "zod";
import { Command, Query } from "./cqrs";
import { parseOperationInput } from "./operations/shared-schema";

const id = z.string().trim().min(1).max(512);
const optionalProject = z.object({ projectId: id.optional() }).strict().default({});

export const repositoryBindingSchema = z
  .object({
    id,
    tenantId: id,
    projectId: id,
    provider: z.literal("github"),
    installationConnectionId: id,
    providerRepositoryId: z.string().regex(/^[1-9]\d*$/u),
    repositoryFullNameSnapshot: z.string().trim().min(3).max(512),
    defaultBranchSnapshot: z.string().trim().min(1).max(512).optional(),
    privateSnapshot: z.boolean().optional(),
    status: z.enum(["active", "revoked"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime().optional(),
    revokedAt: z.iso.datetime().optional(),
  })
  .strict();
export const bindRepositoryInputSchema = repositoryBindingSchema
  .pick({
    projectId: true,
    installationConnectionId: true,
    providerRepositoryId: true,
    repositoryFullNameSnapshot: true,
    defaultBranchSnapshot: true,
    privateSnapshot: true,
  })
  .strict();
export const listRepositoryBindingsInputSchema = optionalProject;
export const bindRepositoryResponseSchema = repositoryBindingSchema;
export const listRepositoryBindingsResponseSchema = z.array(repositoryBindingSchema);

export const automationRuleSchema = z
  .object({
    id,
    tenantId: id,
    projectId: id,
    repositoryBindingId: id,
    name: z.string().trim().min(1).max(160),
    trigger: z
      .object({
        event: z.enum(["issue_comment", "pull_request_review_comment", "issues", "pull_request"]),
        action: z.enum(["created", "labeled", "ready_for_review", "synchronize", "closed"]),
        label: z.string().trim().min(1).max(160).optional(),
      })
      .strict(),
    taskAction: z.enum(["fix", "review", "preview"]),
    actorPolicy: z.enum(["manual-linked-member", "project-automation-identity"]),
    automationIdentityRef: id.optional(),
    agentProfileId: id,
    workspaceProfileInstallationId: id,
    sandboxTemplateId: id,
    serverPoolId: id,
    mode: z.enum(["review-only", "write"]),
    maximumRuntimeSeconds: z.number().int().min(60).max(86_400),
    maximumRetries: z.number().int().min(0).max(10),
    previewPolicy: z.enum(["disabled", "private"]),
    pullRequestDeliveryPolicy: z.enum([
      "none",
      "manual-approval",
      "create-or-update",
      "review-only",
    ]),
    rerunReviewOnSynchronize: z.boolean(),
    status: z.enum(["enabled", "disabled"]),
    revision: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime().optional(),
  })
  .strict();
export const createAutomationRuleInputSchema = automationRuleSchema
  .omit({
    id: true,
    tenantId: true,
    status: true,
    revision: true,
    createdAt: true,
    updatedAt: true,
  })
  .strict();
export const listAutomationRulesInputSchema = optionalProject;
export const disableAutomationRuleInputSchema = z.object({ ruleId: id }).strict();
export const createAutomationRuleResponseSchema = automationRuleSchema;
export const listAutomationRulesResponseSchema = z.array(automationRuleSchema);
export const disableAutomationRuleResponseSchema = automationRuleSchema;

export const agentProfileSchema = z
  .object({
    id,
    tenantId: id,
    name: z.string().trim().min(1).max(160),
    adapter: z.enum(["codex", "opencode", "pi"]),
    adapterInstallationId: id,
    adapterVersion: z.string().trim().min(1).max(160),
    capabilities: z.array(id).min(1).max(64),
    defaultModel: z.string().trim().min(1).max(256),
    credentialConnectionId: id,
    workspaceProfileInstallationId: id,
    sandboxTemplateId: id,
    maximumRuntimeSeconds: z.number().int().min(60).max(86_400),
    maximumRetries: z.number().int().min(0).max(10),
    maximumOutputBytes: z.number().int().min(1_024).max(1_048_576),
    status: z.enum(["enabled", "disabled"]),
    revision: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime().optional(),
  })
  .strict();
export const createAgentProfileInputSchema = agentProfileSchema
  .omit({
    id: true,
    tenantId: true,
    status: true,
    revision: true,
    createdAt: true,
    updatedAt: true,
  })
  .strict();
export const listAgentProfilesInputSchema = z.object({}).strict().default({});
export const disableAgentProfileInputSchema = z.object({ profileId: id }).strict();
export const createAgentProfileResponseSchema = agentProfileSchema;
export const listAgentProfilesResponseSchema = z.array(agentProfileSchema);
export const disableAgentProfileResponseSchema = agentProfileSchema;

function command<TInput, TCommand>(
  schema: z.ZodType<TInput>,
  input: unknown,
  create: (parsed: TInput) => TCommand,
): Result<TCommand> {
  return parseOperationInput(schema, input).map(create);
}

function query<TInput, TCommand>(
  schema: z.ZodType<TInput>,
  input: unknown,
  create: (parsed: TInput) => TCommand,
): Result<TCommand> {
  return parseOperationInput(schema, input).map(create);
}

export class BindRepositoryCommand extends Command<z.output<typeof bindRepositoryResponseSchema>> {
  constructor(public readonly input: z.output<typeof bindRepositoryInputSchema>) {
    super();
  }
  static create(input: unknown) {
    return command(bindRepositoryInputSchema, input, (value) => new this(value));
  }
}

export class ListRepositoryBindingsQuery extends Query<
  z.output<typeof listRepositoryBindingsResponseSchema>
> {
  constructor(public readonly input: z.output<typeof listRepositoryBindingsInputSchema>) {
    super();
  }
  static create(input: unknown = {}) {
    return query(listRepositoryBindingsInputSchema, input, (value) => new this(value));
  }
}

export class CreateAutomationRuleCommand extends Command<
  z.output<typeof createAutomationRuleResponseSchema>
> {
  constructor(public readonly input: z.output<typeof createAutomationRuleInputSchema>) {
    super();
  }
  static create(input: unknown) {
    return command(createAutomationRuleInputSchema, input, (value) => new this(value));
  }
}

export class ListAutomationRulesQuery extends Query<
  z.output<typeof listAutomationRulesResponseSchema>
> {
  constructor(public readonly input: z.output<typeof listAutomationRulesInputSchema>) {
    super();
  }
  static create(input: unknown = {}) {
    return query(listAutomationRulesInputSchema, input, (value) => new this(value));
  }
}

export class DisableAutomationRuleCommand extends Command<
  z.output<typeof disableAutomationRuleResponseSchema>
> {
  constructor(public readonly input: z.output<typeof disableAutomationRuleInputSchema>) {
    super();
  }
  static create(input: unknown) {
    return command(disableAutomationRuleInputSchema, input, (value) => new this(value));
  }
}

export class CreateAgentProfileCommand extends Command<
  z.output<typeof createAgentProfileResponseSchema>
> {
  constructor(public readonly input: z.output<typeof createAgentProfileInputSchema>) {
    super();
  }
  static create(input: unknown) {
    return command(createAgentProfileInputSchema, input, (value) => new this(value));
  }
}

export class ListAgentProfilesQuery extends Query<
  z.output<typeof listAgentProfilesResponseSchema>
> {
  constructor(public readonly input: z.output<typeof listAgentProfilesInputSchema>) {
    super();
  }
  static create(input: unknown = {}) {
    return query(listAgentProfilesInputSchema, input, (value) => new this(value));
  }
}

export class DisableAgentProfileCommand extends Command<
  z.output<typeof disableAgentProfileResponseSchema>
> {
  constructor(public readonly input: z.output<typeof disableAgentProfileInputSchema>) {
    super();
  }
  static create(input: unknown) {
    return command(disableAgentProfileInputSchema, input, (value) => new this(value));
  }
}
