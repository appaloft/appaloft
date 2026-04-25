import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type EnvironmentEffectivePrecedenceView } from "../../ports";
import { tokens } from "../../tokens";
import { EnvironmentEffectivePrecedenceQuery } from "./environment-effective-precedence.query";
import { type EnvironmentEffectivePrecedenceQueryService } from "./environment-effective-precedence.query-service";

@QueryHandler(EnvironmentEffectivePrecedenceQuery)
@injectable()
export class EnvironmentEffectivePrecedenceQueryHandler
  implements
    QueryHandlerContract<EnvironmentEffectivePrecedenceQuery, EnvironmentEffectivePrecedenceView>
{
  constructor(
    @inject(tokens.environmentEffectivePrecedenceQueryService)
    private readonly queryService: EnvironmentEffectivePrecedenceQueryService,
  ) {}

  handle(
    context: ExecutionContext,
    query: EnvironmentEffectivePrecedenceQuery,
  ): Promise<Result<EnvironmentEffectivePrecedenceView>> {
    return this.queryService.execute(context, {
      environmentId: query.environmentId,
    });
  }
}
