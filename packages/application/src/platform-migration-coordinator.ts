import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type CommandBus, type QueryBus } from "./cqrs";
import { type ExecutionContext } from "./execution-context";
import {
  applyMigrationPlan,
  type MigrationApplyResult,
  type MigrationSecretResolver,
  type MigrationStepReceipt,
} from "./operations/platform-migrations/migration-apply";
import { type MigrationBundle } from "./operations/platform-migrations/migration-bundle";
import {
  cleanupMigrationPlan,
  type MigrationCleanupResult,
} from "./operations/platform-migrations/migration-cleanup";
import {
  createMigrationPlan,
  type MigrationPlan,
} from "./operations/platform-migrations/migration-plan";
import {
  type MigrationStatusResult,
  type MigrationVerificationResult,
  readMigrationStatus,
  verifyMigrationOutcome,
} from "./operations/platform-migrations/migration-readback";
import { tokens } from "./tokens";

@injectable()
export class PlatformMigrationCoordinator {
  constructor(
    @inject(tokens.commandBus) private readonly commandBus: CommandBus,
    @inject(tokens.queryBus) private readonly queryBus: QueryBus,
    @inject(tokens.migrationSecretResolver, { isOptional: true })
    private readonly secretResolver?: MigrationSecretResolver,
  ) {}

  plan(bundle: MigrationBundle): Result<MigrationPlan> {
    return createMigrationPlan(bundle);
  }

  apply(
    context: ExecutionContext,
    input: {
      plan: MigrationPlan;
      confirmedPlanDigest: string;
      priorReceipts: readonly MigrationStepReceipt[];
    },
  ): Promise<Result<MigrationApplyResult>> {
    return applyMigrationPlan({
      ...input,
      dispatcher: {
        execute: (command) => this.commandBus.execute(context, command),
      },
      ...(this.secretResolver ? { secretResolver: this.secretResolver } : {}),
    });
  }

  status(
    context: ExecutionContext,
    input: { plan: MigrationPlan; receipts: readonly MigrationStepReceipt[] },
  ): Promise<Result<MigrationStatusResult>> {
    return readMigrationStatus({
      ...input,
      queryDispatcher: {
        execute: (query) => this.queryBus.execute(context, query),
      },
    });
  }

  verify(
    context: ExecutionContext,
    input: { plan: MigrationPlan; receipts: readonly MigrationStepReceipt[] },
  ): Promise<Result<MigrationVerificationResult>> {
    return verifyMigrationOutcome({
      ...input,
      queryDispatcher: {
        execute: (query) => this.queryBus.execute(context, query),
      },
    });
  }

  cleanup(
    context: ExecutionContext,
    input: {
      plan: MigrationPlan;
      confirmedPlanDigest: string;
      receipts: readonly MigrationStepReceipt[];
    },
  ): Promise<Result<MigrationCleanupResult>> {
    return cleanupMigrationPlan({
      ...input,
      commandDispatcher: {
        execute: (command) => this.commandBus.execute(context, command),
      },
      queryDispatcher: {
        execute: (query) => this.queryBus.execute(context, query),
      },
    });
  }
}
