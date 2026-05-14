import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type InstanceUpgradeCheckResult } from "../../ports";
import { tokens } from "../../tokens";
import { CheckInstanceUpgradeQuery } from "./check-instance-upgrade.query";
import { type CheckInstanceUpgradeQueryService } from "./check-instance-upgrade.query-service";

@QueryHandler(CheckInstanceUpgradeQuery)
@injectable()
export class CheckInstanceUpgradeQueryHandler
  implements QueryHandlerContract<CheckInstanceUpgradeQuery, InstanceUpgradeCheckResult>
{
  constructor(
    @inject(tokens.checkInstanceUpgradeQueryService)
    private readonly queryService: CheckInstanceUpgradeQueryService,
  ) {}

  handle(
    context: ExecutionContext,
    query: CheckInstanceUpgradeQuery,
  ): Promise<Result<InstanceUpgradeCheckResult>> {
    return this.queryService.execute(context, query);
  }
}
