import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { type ListDependencyResourceBackupPoliciesResult } from "./dependency-resource-backup-policy.types";
import { ListDependencyResourceBackupPoliciesQuery } from "./list-dependency-resource-backup-policies.query";
import { type ListDependencyResourceBackupPoliciesQueryService } from "./list-dependency-resource-backup-policies.query-service";

@QueryHandler(ListDependencyResourceBackupPoliciesQuery)
@injectable()
export class ListDependencyResourceBackupPoliciesQueryHandler
  implements
    QueryHandlerContract<
      ListDependencyResourceBackupPoliciesQuery,
      ListDependencyResourceBackupPoliciesResult
    >
{
  constructor(
    @inject(tokens.listDependencyResourceBackupPoliciesQueryService)
    private readonly queryService: ListDependencyResourceBackupPoliciesQueryService,
  ) {}

  handle(context: ExecutionContext, query: ListDependencyResourceBackupPoliciesQuery) {
    return this.queryService.execute(context, {
      ...(query.dependencyResourceId ? { dependencyResourceId: query.dependencyResourceId } : {}),
      enabledOnly: query.enabledOnly,
      ...(query.dueAt ? { dueAt: query.dueAt } : {}),
    });
  }
}
