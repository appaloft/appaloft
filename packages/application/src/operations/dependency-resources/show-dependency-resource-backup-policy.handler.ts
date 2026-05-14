import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { type ShowDependencyResourceBackupPolicyResult } from "./dependency-resource-backup-policy.types";
import { ShowDependencyResourceBackupPolicyQuery } from "./show-dependency-resource-backup-policy.query";
import { type ShowDependencyResourceBackupPolicyQueryService } from "./show-dependency-resource-backup-policy.query-service";

@QueryHandler(ShowDependencyResourceBackupPolicyQuery)
@injectable()
export class ShowDependencyResourceBackupPolicyQueryHandler
  implements
    QueryHandlerContract<
      ShowDependencyResourceBackupPolicyQuery,
      ShowDependencyResourceBackupPolicyResult
    >
{
  constructor(
    @inject(tokens.showDependencyResourceBackupPolicyQueryService)
    private readonly queryService: ShowDependencyResourceBackupPolicyQueryService,
  ) {}

  handle(context: ExecutionContext, query: ShowDependencyResourceBackupPolicyQuery) {
    return this.queryService.execute(context, { policyId: query.policyId });
  }
}
