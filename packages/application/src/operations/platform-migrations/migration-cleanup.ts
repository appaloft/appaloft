import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";
import { z } from "zod";

import { type Command, type Query } from "../../cqrs";
import { DeleteDependencyResourceCommand } from "../dependency-resources/delete-dependency-resource.command";
import { ArchiveDeploymentCommand } from "../deployments/archive-deployment.command";
import { CleanupDeploymentRuntimeCommand } from "../deployments/cleanup-deployment-runtime.command";
import { DeleteDomainBindingCommand } from "../domain-bindings/delete-domain-binding.command";
import { ArchiveEnvironmentCommand } from "../environments/archive-environment.command";
import { UnsetEnvironmentVariableCommand } from "../environments/unset-environment-variable.command";
import { ArchiveProjectCommand } from "../projects/archive-project.command";
import { ArchiveResourceCommand } from "../resources/archive-resource.command";
import { DeleteResourceCommand } from "../resources/delete-resource.command";
import { DetachResourceStorageCommand } from "../resources/detach-resource-storage.command";
import { ShowResourceQuery } from "../resources/show-resource.query";
import { UnbindResourceDependencyCommand } from "../resources/unbind-resource-dependency.command";
import { UnsetResourceVariableCommand } from "../resources/unset-resource-variable.command";
import { CleanupStorageVolumeRuntimeCommand } from "../storage-volumes/cleanup-storage-volume-runtime.command";
import { DeleteStorageVolumeCommand } from "../storage-volumes/delete-storage-volume.command";
import {
  calculateMigrationPlanDigest,
  type MigrationCommandDispatcher,
  type MigrationStepReceipt,
  validateMigrationReceipts,
} from "./migration-apply";
import { type MigrationPlan, type MigrationPlanStep } from "./migration-plan";

export interface MigrationQueryDispatcher {
  execute(query: Query<unknown>): Promise<Result<unknown>>;
}

export interface MigrationCleanupActionReceipt {
  readonly stepId: string;
  readonly operationKey: string;
  readonly commandName: string;
  readonly state: "completed";
}

export interface MigrationCleanupFailure {
  readonly stepId: string;
  readonly operationKey: string;
  readonly code: string;
  readonly category: DomainError["category"];
  readonly message: string;
  readonly retryable: boolean;
}

export interface MigrationCleanupResult {
  readonly protocol: "platform-migration/v1";
  readonly planDigest: string;
  readonly state: "completed" | "partial" | "failed";
  readonly actions: readonly MigrationCleanupActionReceipt[];
  readonly skippedStepIds: readonly string[];
  readonly remainingStepIds: readonly string[];
  readonly failure?: MigrationCleanupFailure | undefined;
}

export const migrationCleanupResultSchema = z
  .object({
    protocol: z.literal("platform-migration/v1"),
    planDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    state: z.enum(["completed", "partial", "failed"]),
    actions: z
      .array(
        z
          .object({
            stepId: z.string().trim().min(1),
            operationKey: z.string().trim().min(1),
            commandName: z.string().trim().min(1),
            state: z.literal("completed"),
          })
          .strict(),
      )
      .readonly(),
    skippedStepIds: z.array(z.string().trim().min(1)).readonly(),
    remainingStepIds: z.array(z.string().trim().min(1)).readonly(),
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
  })
  .strict();

export interface CleanupMigrationPlanInput {
  readonly plan: MigrationPlan;
  readonly confirmedPlanDigest: string;
  readonly receipts: readonly MigrationStepReceipt[];
  readonly commandDispatcher: MigrationCommandDispatcher;
  readonly queryDispatcher: MigrationQueryDispatcher;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asCommand<TCommand extends Command<unknown>>(
  result: Result<TCommand>,
): Result<Command<unknown>> {
  return result.map((command) => command as Command<unknown>);
}

function resolveIdentity(
  value: unknown,
  outputs: ReadonlyMap<string, Readonly<Record<string, string | number | boolean>>>,
  label: string,
): Result<string> {
  if (typeof value === "string" && value.length > 0) return ok(value);
  if (isRecord(value) && typeof value.$ref === "string") {
    const matched = /^steps\.(.+)\.output\.([^.]+)$/.exec(value.$ref);
    const resolved = matched?.[1] && matched[2] ? outputs.get(matched[1])?.[matched[2]] : undefined;
    if (typeof resolved === "string" && resolved.length > 0) return ok(resolved);
  }
  return err(
    domainError.validation("Migration cleanup identity is unavailable", {
      phase: "migration-cleanup-identity",
      label,
    }),
  );
}

function outputIdentity(receipt: MigrationStepReceipt, key: string): Result<string> {
  const value = receipt.output[key];
  return typeof value === "string" && value.length > 0
    ? ok(value)
    : err(
        domainError.validation("Migration cleanup receipt identity is unavailable", {
          phase: "migration-cleanup-receipt",
          stepId: receipt.stepId,
          outputName: key,
        }),
      );
}

function resourceSlugFromShowResult(value: unknown): string | undefined {
  if (!isRecord(value) || value.schemaVersion !== "resources.show/v1") return undefined;
  const resource = value.resource;
  return isRecord(resource) && typeof resource.slug === "string" && resource.slug.length > 0
    ? resource.slug
    : undefined;
}

function blockedStorageRuntimeCleanup(value: unknown):
  | {
      readonly blockedCount: number;
      readonly skippedCount: number;
    }
  | undefined {
  if (!isRecord(value) || !isRecord(value.summary)) return undefined;
  const blockedCount = value.summary.blockedCount;
  const skippedCount = value.summary.skippedCount;
  if (typeof blockedCount !== "number" || typeof skippedCount !== "number") return undefined;
  return blockedCount > 0 || skippedCount > 0 ? { blockedCount, skippedCount } : undefined;
}

function failedCleanup(
  input: CleanupMigrationPlanInput,
  actions: readonly MigrationCleanupActionReceipt[],
  remainingStepIds: readonly string[],
  step: MigrationPlanStep,
  error: DomainError,
): MigrationCleanupResult {
  return {
    protocol: "platform-migration/v1",
    planDigest: input.plan.planDigest,
    state: actions.length === 0 ? "failed" : "partial",
    actions,
    skippedStepIds: input.receipts
      .filter((receipt) => receipt.ownership === "reused")
      .map((receipt) => receipt.stepId),
    remainingStepIds,
    failure: {
      stepId: step.id,
      operationKey: step.cleanup?.operationKey ?? step.operationKey,
      code: error.code,
      category: error.category,
      message: error.message,
      retryable: error.retryable,
    },
  };
}

async function commandsForReceipt(
  step: MigrationPlanStep,
  receipt: MigrationStepReceipt,
  outputs: ReadonlyMap<string, Readonly<Record<string, string | number | boolean>>>,
  queryDispatcher: MigrationQueryDispatcher,
): Promise<Result<readonly Command<unknown>[]>> {
  const inputString = (key: string) => resolveIdentity(step.input[key], outputs, key);
  switch (step.operationKey) {
    case "deployments.create": {
      const deploymentId = outputIdentity(receipt, "deploymentId");
      const resourceId = inputString("resourceId");
      if (deploymentId.isErr()) return err(deploymentId.error);
      if (resourceId.isErr()) return err(resourceId.error);
      const runtimeCleaned = asCommand(
        CleanupDeploymentRuntimeCommand.create({
          deploymentId: deploymentId.value,
          confirm: deploymentId.value,
          resourceId: resourceId.value,
        }),
      );
      if (runtimeCleaned.isErr()) return err(runtimeCleaned.error);
      return asCommand(
        ArchiveDeploymentCommand.create({
          deploymentId: deploymentId.value,
          confirm: deploymentId.value,
          resourceId: resourceId.value,
        }),
      ).map((command) => [runtimeCleaned.value, command]);
    }
    case "domain-bindings.create": {
      const id = outputIdentity(receipt, "domainBindingId");
      if (id.isErr()) return err(id.error);
      return asCommand(
        DeleteDomainBindingCommand.create({
          domainBindingId: id.value,
          confirmation: { domainBindingId: id.value },
          idempotencyKey: `migration-cleanup:${step.id}`,
        }),
      ).map((command) => [command]);
    }
    case "resources.attach-storage": {
      const resourceId = inputString("resourceId");
      const attachmentId = outputIdentity(receipt, "attachmentId");
      if (resourceId.isErr()) return err(resourceId.error);
      if (attachmentId.isErr()) return err(attachmentId.error);
      return asCommand(
        DetachResourceStorageCommand.create({
          resourceId: resourceId.value,
          attachmentId: attachmentId.value,
        }),
      ).map((command) => [command]);
    }
    case "resources.bind-dependency": {
      const resourceId = inputString("resourceId");
      const bindingId = outputIdentity(receipt, "bindingId");
      if (resourceId.isErr()) return err(resourceId.error);
      if (bindingId.isErr()) return err(bindingId.error);
      return asCommand(
        UnbindResourceDependencyCommand.create({
          resourceId: resourceId.value,
          bindingId: bindingId.value,
        }),
      ).map((command) => [command]);
    }
    case "resources.set-variable": {
      const resourceId = inputString("resourceId");
      const key = inputString("key");
      const exposure = inputString("exposure");
      if (resourceId.isErr()) return err(resourceId.error);
      if (key.isErr()) return err(key.error);
      if (exposure.isErr()) return err(exposure.error);
      return asCommand(
        UnsetResourceVariableCommand.create({
          resourceId: resourceId.value,
          key: key.value,
          exposure: exposure.value as "build-time" | "runtime",
        }),
      ).map((command) => [command]);
    }
    case "resources.create": {
      const resourceId = outputIdentity(receipt, "resourceId");
      if (resourceId.isErr()) return err(resourceId.error);
      const show = ShowResourceQuery.create({ resourceId: resourceId.value });
      if (show.isErr()) return err(show.error);
      const shown = await queryDispatcher.execute(show.value);
      if (shown.isErr()) return err(shown.error);
      const slug = resourceSlugFromShowResult(shown.value);
      if (typeof slug !== "string" || slug.length === 0) {
        return err(
          domainError.validation("Migration cleanup could not read the resource slug", {
            phase: "migration-cleanup-readback",
            resourceId: resourceId.value,
          }),
        );
      }
      const archived = asCommand(
        ArchiveResourceCommand.create({
          resourceId: resourceId.value,
          reason: "Platform migration exact cleanup",
          idempotencyKey: `migration-cleanup:archive:${step.id}`,
        }),
      );
      if (archived.isErr()) return err(archived.error);
      const deleted = asCommand(
        DeleteResourceCommand.create({
          resourceId: resourceId.value,
          confirmation: { resourceSlug: slug },
          idempotencyKey: `migration-cleanup:delete:${step.id}`,
        }),
      );
      return deleted.map((command) => [archived.value, command]);
    }
    case "storage-volumes.create": {
      const id = outputIdentity(receipt, "storageVolumeId");
      if (id.isErr()) return err(id.error);
      const serverId = step.cleanup?.input?.serverId;
      if (typeof serverId !== "string" || serverId.length === 0) {
        return err(
          domainError.validation("Migration cleanup is missing the storage runtime target", {
            phase: "migration-cleanup-plan",
            stepId: step.id,
          }),
        );
      }
      const runtimeCleaned = asCommand(
        CleanupStorageVolumeRuntimeCommand.create({
          storageVolumeId: id.value,
          serverId,
          before: "9999-12-31T23:59:59.999Z",
          dryRun: false,
        }),
      );
      if (runtimeCleaned.isErr()) return err(runtimeCleaned.error);
      return asCommand(DeleteStorageVolumeCommand.create({ storageVolumeId: id.value })).map(
        (command) => [runtimeCleaned.value, command],
      );
    }
    case "dependency-resources.provision":
    case "dependency-resources.import": {
      const id = outputIdentity(receipt, "dependencyResourceId");
      if (id.isErr()) return err(id.error);
      return asCommand(
        DeleteDependencyResourceCommand.create({
          dependencyResourceId: id.value,
          confirmBackupRetentionRelease: true,
        }),
      ).map((command) => [command]);
    }
    case "environments.set-variable": {
      const environmentId = inputString("environmentId");
      const key = inputString("key");
      const exposure = inputString("exposure");
      const scope = inputString("scope");
      if (environmentId.isErr()) return err(environmentId.error);
      if (key.isErr()) return err(key.error);
      if (exposure.isErr()) return err(exposure.error);
      if (scope.isErr()) return err(scope.error);
      return asCommand(
        UnsetEnvironmentVariableCommand.create({
          environmentId: environmentId.value,
          key: key.value,
          exposure: exposure.value as "build-time" | "runtime",
          scope: scope.value as "environment",
        }),
      ).map((command) => [command]);
    }
    case "environments.create": {
      const id = outputIdentity(receipt, "environmentId");
      if (id.isErr()) return err(id.error);
      return asCommand(
        ArchiveEnvironmentCommand.create({
          environmentId: id.value,
          reason: "Platform migration exact cleanup",
        }),
      ).map((command) => [command]);
    }
    case "projects.create": {
      const id = outputIdentity(receipt, "projectId");
      if (id.isErr()) return err(id.error);
      return asCommand(
        ArchiveProjectCommand.create({
          projectId: id.value,
          reason: "Platform migration exact cleanup",
        }),
      ).map((command) => [command]);
    }
    default:
      return ok([]);
  }
}

export async function cleanupMigrationPlan(
  input: CleanupMigrationPlanInput,
): Promise<Result<MigrationCleanupResult>> {
  if (
    input.confirmedPlanDigest !== input.plan.planDigest ||
    calculateMigrationPlanDigest(input.plan) !== input.plan.planDigest
  ) {
    return err(
      domainError.validation("Migration cleanup digest confirmation does not match", {
        phase: "migration-cleanup-confirmation",
      }),
    );
  }
  const validReceipts = validateMigrationReceipts(input.plan, input.receipts);
  if (validReceipts.isErr()) return err(validReceipts.error);

  const outputs = new Map(input.receipts.map((receipt) => [receipt.stepId, receipt.output]));
  const owned = [...input.receipts]
    .reverse()
    .filter((receipt) => receipt.ownership === "created")
    .map((receipt) => ({
      receipt,
      step: input.plan.steps.find((step) => step.id === receipt.stepId),
    }))
    .filter(
      (candidate): candidate is { receipt: MigrationStepReceipt; step: MigrationPlanStep } =>
        candidate.step !== undefined && candidate.step.cleanup !== undefined,
    );
  const actions: MigrationCleanupActionReceipt[] = [];

  for (const [index, candidate] of owned.entries()) {
    const commands = await commandsForReceipt(
      candidate.step,
      candidate.receipt,
      outputs,
      input.queryDispatcher,
    );
    if (commands.isErr()) {
      return ok(
        failedCleanup(
          input,
          actions,
          owned.slice(index).map((item) => item.step.id),
          candidate.step,
          commands.error,
        ),
      );
    }
    for (const command of commands.value) {
      const executed = await input.commandDispatcher.execute(command);
      if (executed.isErr()) {
        return ok(
          failedCleanup(
            input,
            actions,
            owned.slice(index).map((item) => item.step.id),
            candidate.step,
            executed.error,
          ),
        );
      }
      if (command instanceof CleanupStorageVolumeRuntimeCommand) {
        const blocked = blockedStorageRuntimeCleanup(executed.value);
        if (blocked) {
          return ok(
            failedCleanup(
              input,
              actions,
              owned.slice(index).map((item) => item.step.id),
              candidate.step,
              domainError.conflict("Migration storage runtime cleanup is blocked", {
                phase: "migration-cleanup-storage-runtime",
                storageVolumeId: command.input.storageVolumeId,
                blockedCount: blocked.blockedCount,
                skippedCount: blocked.skippedCount,
              }),
            ),
          );
        }
      }
      actions.push({
        stepId: candidate.step.id,
        operationKey: candidate.step.cleanup?.operationKey ?? candidate.step.operationKey,
        commandName: command.constructor.name,
        state: "completed",
      });
    }
  }

  return ok({
    protocol: "platform-migration/v1",
    planDigest: input.plan.planDigest,
    state: "completed",
    actions,
    skippedStepIds: input.receipts
      .filter((receipt) => receipt.ownership === "reused")
      .map((receipt) => receipt.stepId),
    remainingStepIds: [],
  });
}
