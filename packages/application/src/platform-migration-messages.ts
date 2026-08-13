import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Command, Query } from "./cqrs";
import {
  type ApplyPlatformMigrationCommandInput,
  applyPlatformMigrationCommandInputSchema,
  type MigrationApplyResult,
  type MigrationStepReceipt,
  migrationStepReceiptSchema,
} from "./operations/platform-migrations/migration-apply";
import {
  type MigrationBundle,
  migrationBundleSchema,
} from "./operations/platform-migrations/migration-bundle";
import { type MigrationCleanupResult } from "./operations/platform-migrations/migration-cleanup";
import {
  type MigrationPlan,
  migrationPlanSchema,
} from "./operations/platform-migrations/migration-plan";
import {
  type MigrationStatusResult,
  type MigrationVerificationResult,
} from "./operations/platform-migrations/migration-readback";
import { parseOperationInput } from "./operations/shared-schema";

export const planPlatformMigrationQueryInputSchema = z
  .object({ bundle: migrationBundleSchema })
  .strict();

export interface PlanPlatformMigrationQueryInput {
  readonly bundle: unknown;
}

export class PlanPlatformMigrationQuery extends Query<MigrationPlan> {
  constructor(public readonly bundle: MigrationBundle) {
    super();
  }

  static create(input: PlanPlatformMigrationQueryInput): Result<PlanPlatformMigrationQuery> {
    return parseOperationInput(planPlatformMigrationQueryInputSchema, input, {
      validationPhase: "query-validation",
    }).map((parsed) => new PlanPlatformMigrationQuery(parsed.bundle));
  }
}

export class ApplyPlatformMigrationCommand extends Command<MigrationApplyResult> {
  constructor(
    public readonly plan: MigrationPlan,
    public readonly confirmedPlanDigest: string,
    public readonly priorReceipts: readonly MigrationStepReceipt[],
  ) {
    super();
  }

  static create(input: ApplyPlatformMigrationCommandInput): Result<ApplyPlatformMigrationCommand> {
    return parseOperationInput(applyPlatformMigrationCommandInputSchema, input, {
      validationPhase: "command-validation",
    }).map(
      (parsed) =>
        new ApplyPlatformMigrationCommand(
          parsed.plan as MigrationPlan,
          parsed.confirmedPlanDigest,
          parsed.priorReceipts as MigrationStepReceipt[],
        ),
    );
  }
}

export const migrationReadbackQueryInputSchema = z
  .object({
    plan: migrationPlanSchema,
    receipts: z.array(migrationStepReceiptSchema).readonly(),
  })
  .strict();

export const cleanupPlatformMigrationCommandInputSchema = migrationReadbackQueryInputSchema
  .extend({
    confirmedPlanDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();

export type MigrationReadbackQueryInput = z.input<typeof migrationReadbackQueryInputSchema>;
export type CleanupPlatformMigrationCommandInput = z.input<
  typeof cleanupPlatformMigrationCommandInputSchema
>;

export class StatusPlatformMigrationQuery extends Query<MigrationStatusResult> {
  constructor(
    public readonly plan: MigrationPlan,
    public readonly receipts: readonly MigrationStepReceipt[],
  ) {
    super();
  }

  static create(input: MigrationReadbackQueryInput): Result<StatusPlatformMigrationQuery> {
    return parseOperationInput(migrationReadbackQueryInputSchema, input, {
      validationPhase: "query-validation",
    }).map(
      (parsed) =>
        new StatusPlatformMigrationQuery(
          parsed.plan as MigrationPlan,
          parsed.receipts as readonly MigrationStepReceipt[],
        ),
    );
  }
}

export class VerifyPlatformMigrationQuery extends Query<MigrationVerificationResult> {
  constructor(
    public readonly plan: MigrationPlan,
    public readonly receipts: readonly MigrationStepReceipt[],
  ) {
    super();
  }

  static create(input: MigrationReadbackQueryInput): Result<VerifyPlatformMigrationQuery> {
    return parseOperationInput(migrationReadbackQueryInputSchema, input, {
      validationPhase: "query-validation",
    }).map(
      (parsed) =>
        new VerifyPlatformMigrationQuery(
          parsed.plan as MigrationPlan,
          parsed.receipts as readonly MigrationStepReceipt[],
        ),
    );
  }
}

export class CleanupPlatformMigrationCommand extends Command<MigrationCleanupResult> {
  constructor(
    public readonly plan: MigrationPlan,
    public readonly confirmedPlanDigest: string,
    public readonly receipts: readonly MigrationStepReceipt[],
  ) {
    super();
  }

  static create(
    input: CleanupPlatformMigrationCommandInput,
  ): Result<CleanupPlatformMigrationCommand> {
    return parseOperationInput(cleanupPlatformMigrationCommandInputSchema, input, {
      validationPhase: "command-validation",
    }).map(
      (parsed) =>
        new CleanupPlatformMigrationCommand(
          parsed.plan as MigrationPlan,
          parsed.confirmedPlanDigest,
          parsed.receipts as readonly MigrationStepReceipt[],
        ),
    );
  }
}

export { type ApplyPlatformMigrationCommandInput, applyPlatformMigrationCommandInputSchema };
