import { type Result } from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ResourceDiagnosticSummary } from "../../ports";
import { tokens } from "../../tokens";
import { ResourceDiagnosticSummaryQuery } from "./resource-diagnostic-summary.query";
import { type ResourceDiagnosticSummaryQueryService } from "./resource-diagnostic-summary.query-service";

@QueryHandler(ResourceDiagnosticSummaryQuery)
@injectable()
export class ResourceDiagnosticSummaryQueryHandler
  implements QueryHandlerContract<ResourceDiagnosticSummaryQuery, ResourceDiagnosticSummary>
{
  constructor(
    @inject(tokens.resourceDiagnosticSummaryQueryService)
    private readonly queryService: ResourceDiagnosticSummaryQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ResourceDiagnosticSummaryQuery,
  ): Promise<Result<ResourceDiagnosticSummary>> {
    return this.queryService.execute(context, query);
  }
}
