import { createHash } from "node:crypto";

import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";
import { z } from "zod";

import { type Command } from "../../cqrs";
import { ImportDependencyResourceCommand } from "../dependency-resources/import-dependency-resource.command";
import { ProvisionDependencyResourceCommand } from "../dependency-resources/provision-dependency-resource.command";
import { CreateDeploymentCommand } from "../deployments/create-deployment.command";
import { CreateDomainBindingCommand } from "../domain-bindings/create-domain-binding.command";
import { CreateEnvironmentCommand } from "../environments/create-environment.command";
import { SetEnvironmentVariableCommand } from "../environments/set-environment-variable.command";
import { CreateProjectCommand } from "../projects/create-project.command";
import { AttachResourceStorageCommand } from "../resources/attach-resource-storage.command";
import { BindResourceDependencyCommand } from "../resources/bind-resource-dependency.command";
import { CreateResourceCommand } from "../resources/create-resource.command";
import { SetResourceVariableCommand } from "../resources/set-resource-variable.command";
import { CreateStorageVolumeCommand } from "../storage-volumes/create-storage-volume.command";
import { type MigrationPlan, type MigrationPlanStep, migrationPlanSchema } from "./migration-plan";

export interface MigrationCommandDispatcher {
  execute(command: Command<unknown>): Promise<Result<unknown>>;
}

export interface MigrationSecretResolver {
  resolve(secretRef: string): Promise<Result<string>>;
}

export interface MigrationStepReceipt {
  readonly stepId: string;
  readonly operationKey: string;
  readonly state: "completed";
  readonly output: Readonly<Record<string, string | number | boolean>>;
  readonly ownership: "created" | "reused";
}

export interface MigrationApplyFailure {
  readonly stepId: string;
  readonly operationKey: string;
  readonly code: string;
  readonly category: DomainError["category"];
  readonly message: string;
  readonly retryable: boolean;
}

export interface MigrationApplyResult {
  readonly protocol: "platform-migration/v1";
  readonly planDigest: string;
  readonly state: "completed" | "partial" | "failed";
  readonly receipts: readonly MigrationStepReceipt[];
  readonly failure?: MigrationApplyFailure | undefined;
  readonly resume: {
    readonly remainingStepIds: readonly string[];
    readonly cleanupStepIds: readonly string[];
  };
}

export interface ApplyMigrationPlanInput {
  readonly plan: MigrationPlan;
  readonly confirmedPlanDigest: string;
  readonly dispatcher: MigrationCommandDispatcher;
  readonly secretResolver?: MigrationSecretResolver;
  readonly priorReceipts?: readonly MigrationStepReceipt[];
}

export const migrationStepReceiptSchema = z
  .object({
    stepId: z.string().trim().min(1),
    operationKey: z.string().trim().min(1),
    state: z.literal("completed"),
    output: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    ownership: z.enum(["created", "reused"]),
  })
  .strict();

export const migrationApplyResultSchema = z
  .object({
    protocol: z.literal("platform-migration/v1"),
    planDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    state: z.enum(["completed", "partial", "failed"]),
    receipts: z.array(migrationStepReceiptSchema).readonly(),
    failure: z
      .object({
        stepId: z.string().trim().min(1),
        operationKey: z.string().trim().min(1),
        code: z.string().trim().min(1),
        category: z.string().trim().min(1),
        message: z.string(),
        retryable: z.boolean(),
      })
      .strict()
      .optional(),
    resume: z
      .object({
        remainingStepIds: z.array(z.string().trim().min(1)).readonly(),
        cleanupStepIds: z.array(z.string().trim().min(1)).readonly(),
      })
      .strict(),
  })
  .strict();

export const applyPlatformMigrationCommandInputSchema = z
  .object({
    plan: migrationPlanSchema,
    confirmedPlanDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    priorReceipts: z.array(migrationStepReceiptSchema).readonly().default([]),
  })
  .strict();

export interface ApplyPlatformMigrationCommandInput {
  readonly plan: MigrationPlan;
  readonly confirmedPlanDigest: string;
  readonly priorReceipts?: readonly MigrationStepReceipt[];
}

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

export function calculateMigrationPlanDigest(plan: MigrationPlan): string {
  const { planDigest: _planDigest, ...planWithoutDigest } = plan;
  return sha256(planWithoutDigest);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function resolvePlanValue(
  value: unknown,
  outputs: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
  secretResolver: MigrationSecretResolver | undefined,
): Promise<Result<unknown>> {
  if (Array.isArray(value)) {
    const resolved: unknown[] = [];
    for (const item of value) {
      const itemResult = await resolvePlanValue(item, outputs, secretResolver);
      if (itemResult.isErr()) return itemResult;
      resolved.push(itemResult.value);
    }
    return ok(resolved);
  }
  if (!isRecord(value)) return ok(value);

  if (typeof value.$ref === "string") {
    const matched = /^steps\.(.+)\.output\.([^.]+)$/.exec(value.$ref);
    if (!matched) {
      return err(
        domainError.validation("Migration plan contains an invalid output reference", {
          phase: "migration-apply-reference",
        }),
      );
    }
    const stepId = matched[1];
    const outputName = matched[2];
    if (!stepId || !outputName) {
      return err(
        domainError.validation("Migration plan contains an invalid output reference", {
          phase: "migration-apply-reference",
        }),
      );
    }
    const output = outputs.get(stepId)?.[outputName];
    if (output === undefined) {
      return err(
        domainError.validation("Migration plan output reference is unavailable", {
          phase: "migration-apply-reference",
          stepId,
          outputName,
        }),
      );
    }
    return ok(output);
  }

  if (typeof value.$secretRef === "string") {
    if (!secretResolver) {
      return err(
        domainError.validation("Migration secret resolver is not composed", {
          phase: "migration-secret-resolution",
        }),
      );
    }
    return secretResolver.resolve(value.$secretRef);
  }

  const resolved: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (nested === undefined) continue;
    const nestedResult = await resolvePlanValue(nested, outputs, secretResolver);
    if (nestedResult.isErr()) return nestedResult;
    resolved[key] = nestedResult.value;
  }
  return ok(resolved);
}

function asCommand<TCommand extends Command<unknown>>(
  result: Result<TCommand>,
): Result<Command<unknown>> {
  return result.map((command) => command as Command<unknown>);
}

function createMigrationStepCommand(
  step: MigrationPlanStep,
  input: Readonly<Record<string, unknown>>,
): Result<Command<unknown>> {
  switch (step.operationKey) {
    case "projects.create":
      return asCommand(CreateProjectCommand.create(input as never));
    case "environments.create":
      return asCommand(CreateEnvironmentCommand.create(input as never));
    case "environments.set-variable":
      return asCommand(SetEnvironmentVariableCommand.create(input as never));
    case "dependency-resources.provision":
      return asCommand(ProvisionDependencyResourceCommand.create(input as never));
    case "dependency-resources.import":
      return asCommand(ImportDependencyResourceCommand.create(input as never));
    case "storage-volumes.create":
      return asCommand(CreateStorageVolumeCommand.create(input as never));
    case "resources.create":
      return asCommand(CreateResourceCommand.create(input as never));
    case "resources.set-variable":
      return asCommand(SetResourceVariableCommand.create(input as never));
    case "resources.bind-dependency":
      return asCommand(BindResourceDependencyCommand.create(input as never));
    case "resources.attach-storage":
      return asCommand(AttachResourceStorageCommand.create(input as never));
    case "domain-bindings.create":
      return asCommand(CreateDomainBindingCommand.create(input as never));
    case "deployments.create":
      return asCommand(CreateDeploymentCommand.create(input as never));
    default:
      return err(
        domainError.validation("Migration plan contains an unsupported operation", {
          phase: "migration-command-factory",
          operationKey: step.operationKey,
        }),
      );
  }
}

function projectSafeOutput(
  step: MigrationPlanStep,
  result: unknown,
): Readonly<Record<string, string | number | boolean>> {
  if (!step.produces || !isRecord(result)) return {};
  const output: Record<string, string | number | boolean> = {};
  for (const [receiptName, resultName] of Object.entries(step.produces)) {
    const value = result[resultName];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      output[receiptName] = value;
    }
  }
  return output;
}

function projectSafeOwnership(result: unknown): MigrationStepReceipt["ownership"] {
  return isRecord(result) && result.reused === true ? "reused" : "created";
}

function failedApply(
  plan: MigrationPlan,
  receipts: readonly MigrationStepReceipt[],
  step: MigrationPlanStep,
  error: DomainError,
): MigrationApplyResult {
  const completed = new Set(receipts.map((receipt) => receipt.stepId));
  return {
    protocol: "platform-migration/v1",
    planDigest: plan.planDigest,
    state: receipts.length === 0 ? "failed" : "partial",
    receipts,
    failure: {
      stepId: step.id,
      operationKey: step.operationKey,
      code: error.code,
      category: error.category,
      message: error.message,
      retryable: error.retryable,
    },
    resume: {
      remainingStepIds: plan.steps
        .filter((candidate) => !completed.has(candidate.id))
        .map((candidate) => candidate.id),
      cleanupStepIds: [...receipts]
        .reverse()
        .filter((receipt) =>
          plan.steps.some((candidate) => candidate.id === receipt.stepId && candidate.cleanup),
        )
        .map((receipt) => receipt.stepId),
    },
  };
}

export function validateMigrationReceipts(
  plan: MigrationPlan,
  receipts: readonly MigrationStepReceipt[],
): Result<void> {
  if (receipts.length > plan.steps.length) {
    return err(
      domainError.validation("Migration receipts do not match the accepted plan", {
        phase: "migration-receipt-validation",
      }),
    );
  }
  for (const [index, receipt] of receipts.entries()) {
    const step = plan.steps[index];
    if (!step || receipt.stepId !== step.id || receipt.operationKey !== step.operationKey) {
      return err(
        domainError.validation("Migration receipts must be a contiguous accepted-plan prefix", {
          phase: "migration-receipt-validation",
          receiptIndex: index,
        }),
      );
    }
    for (const outputName of Object.keys(step.produces ?? {})) {
      if (receipt.output[outputName] === undefined) {
        return err(
          domainError.validation("Migration receipt is missing a required safe output", {
            phase: "migration-receipt-validation",
            receiptIndex: index,
            outputName,
          }),
        );
      }
    }
  }
  return ok(undefined);
}

export async function applyMigrationPlan(
  input: ApplyMigrationPlanInput,
): Promise<Result<MigrationApplyResult>> {
  const actualDigest = calculateMigrationPlanDigest(input.plan);
  if (
    input.plan.planDigest !== actualDigest ||
    input.confirmedPlanDigest !== input.plan.planDigest
  ) {
    return err(
      domainError.validation("Migration plan digest confirmation does not match", {
        phase: "migration-plan-confirmation",
      }),
    );
  }
  if (input.plan.state === "blocked" || input.plan.blockers.length > 0) {
    return err(
      domainError.validation("Blocked migration plan cannot be applied", {
        phase: "migration-plan-confirmation",
        blockerCount: input.plan.blockers.length,
      }),
    );
  }

  const priorReceipts = input.priorReceipts ?? [];
  const validReceipts = validateMigrationReceipts(input.plan, priorReceipts);
  if (validReceipts.isErr()) return err(validReceipts.error);

  const receipts: MigrationStepReceipt[] = [...priorReceipts];
  const outputs = new Map<string, Readonly<Record<string, unknown>>>();
  for (const receipt of priorReceipts) {
    outputs.set(receipt.stepId, receipt.output);
  }
  for (const step of input.plan.steps.slice(priorReceipts.length)) {
    const resolvedInput = await resolvePlanValue(step.input, outputs, input.secretResolver);
    if (resolvedInput.isErr()) {
      return ok(failedApply(input.plan, receipts, step, resolvedInput.error));
    }
    if (!isRecord(resolvedInput.value)) {
      return ok(
        failedApply(
          input.plan,
          receipts,
          step,
          domainError.validation("Migration operation input must be an object", {
            phase: "migration-command-factory",
          }),
        ),
      );
    }
    const command = createMigrationStepCommand(step, resolvedInput.value);
    if (command.isErr()) {
      return ok(failedApply(input.plan, receipts, step, command.error));
    }
    const executed = await input.dispatcher.execute(command.value);
    if (executed.isErr()) {
      return ok(failedApply(input.plan, receipts, step, executed.error));
    }

    const output = projectSafeOutput(step, executed.value);
    outputs.set(step.id, output);
    receipts.push({
      stepId: step.id,
      operationKey: step.operationKey,
      state: "completed",
      output,
      ownership: projectSafeOwnership(executed.value),
    });
  }

  return ok({
    protocol: "platform-migration/v1",
    planDigest: input.plan.planDigest,
    state: "completed",
    receipts,
    resume: { remainingStepIds: [], cleanupStepIds: [] },
  });
}
