import { inject, injectable } from "tsyringe";

import {
  CommandHandler,
  type CommandHandlerContract,
  QueryHandler,
  type QueryHandlerContract,
} from "./cqrs";
import { type ExecutionContext } from "./execution-context";
import { type PlatformMigrationCoordinator } from "./platform-migration-coordinator";
import {
  ApplyPlatformMigrationCommand,
  CleanupPlatformMigrationCommand,
  PlanPlatformMigrationQuery,
  StatusPlatformMigrationQuery,
  VerifyPlatformMigrationQuery,
} from "./platform-migration-messages";
import { tokens } from "./tokens";

@QueryHandler(PlanPlatformMigrationQuery)
@injectable()
export class PlanPlatformMigrationQueryHandler
  implements QueryHandlerContract<PlanPlatformMigrationQuery>
{
  constructor(
    @inject(tokens.platformMigrationCoordinator)
    private readonly coordinator: PlatformMigrationCoordinator,
  ) {}

  handle(_context: ExecutionContext, query: PlanPlatformMigrationQuery) {
    return Promise.resolve(this.coordinator.plan(query.bundle));
  }
}

@CommandHandler(ApplyPlatformMigrationCommand)
@injectable()
export class ApplyPlatformMigrationCommandHandler
  implements CommandHandlerContract<ApplyPlatformMigrationCommand>
{
  constructor(
    @inject(tokens.platformMigrationCoordinator)
    private readonly coordinator: PlatformMigrationCoordinator,
  ) {}

  handle(context: ExecutionContext, command: ApplyPlatformMigrationCommand) {
    return this.coordinator.apply(context, {
      plan: command.plan,
      confirmedPlanDigest: command.confirmedPlanDigest,
      priorReceipts: command.priorReceipts,
    });
  }
}

@QueryHandler(StatusPlatformMigrationQuery)
@injectable()
export class StatusPlatformMigrationQueryHandler
  implements QueryHandlerContract<StatusPlatformMigrationQuery>
{
  constructor(
    @inject(tokens.platformMigrationCoordinator)
    private readonly coordinator: PlatformMigrationCoordinator,
  ) {}

  handle(context: ExecutionContext, query: StatusPlatformMigrationQuery) {
    return this.coordinator.status(context, { plan: query.plan, receipts: query.receipts });
  }
}

@QueryHandler(VerifyPlatformMigrationQuery)
@injectable()
export class VerifyPlatformMigrationQueryHandler
  implements QueryHandlerContract<VerifyPlatformMigrationQuery>
{
  constructor(
    @inject(tokens.platformMigrationCoordinator)
    private readonly coordinator: PlatformMigrationCoordinator,
  ) {}

  handle(context: ExecutionContext, query: VerifyPlatformMigrationQuery) {
    return this.coordinator.verify(context, { plan: query.plan, receipts: query.receipts });
  }
}

@CommandHandler(CleanupPlatformMigrationCommand)
@injectable()
export class CleanupPlatformMigrationCommandHandler
  implements CommandHandlerContract<CleanupPlatformMigrationCommand>
{
  constructor(
    @inject(tokens.platformMigrationCoordinator)
    private readonly coordinator: PlatformMigrationCoordinator,
  ) {}

  handle(context: ExecutionContext, command: CleanupPlatformMigrationCommand) {
    return this.coordinator.cleanup(context, {
      plan: command.plan,
      confirmedPlanDigest: command.confirmedPlanDigest,
      receipts: command.receipts,
    });
  }
}
