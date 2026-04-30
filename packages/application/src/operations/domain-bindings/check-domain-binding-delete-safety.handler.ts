import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type DomainBindingDeleteSafety } from "../../ports";
import { tokens } from "../../tokens";
import { CheckDomainBindingDeleteSafetyQuery } from "./check-domain-binding-delete-safety.query";
import { type CheckDomainBindingDeleteSafetyQueryService } from "./check-domain-binding-delete-safety.query-service";

@QueryHandler(CheckDomainBindingDeleteSafetyQuery)
@injectable()
export class CheckDomainBindingDeleteSafetyQueryHandler
  implements QueryHandlerContract<CheckDomainBindingDeleteSafetyQuery, DomainBindingDeleteSafety>
{
  constructor(
    @inject(tokens.checkDomainBindingDeleteSafetyQueryService)
    private readonly queryService: CheckDomainBindingDeleteSafetyQueryService,
  ) {}

  handle(
    context: ExecutionContext,
    query: CheckDomainBindingDeleteSafetyQuery,
  ): Promise<Result<DomainBindingDeleteSafety>> {
    return this.queryService.execute(context, query);
  }
}
