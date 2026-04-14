import { ok, type Result } from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type SshCredentialSummary } from "../../ports";
import { tokens } from "../../tokens";
import { ListSshCredentialsQuery } from "./list-ssh-credentials.query";
import { type ListSshCredentialsQueryService } from "./list-ssh-credentials.query-service";

@QueryHandler(ListSshCredentialsQuery)
@injectable()
export class ListSshCredentialsQueryHandler
  implements QueryHandlerContract<ListSshCredentialsQuery, { items: SshCredentialSummary[] }>
{
  constructor(
    @inject(tokens.listSshCredentialsQueryService)
    private readonly queryService: ListSshCredentialsQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ListSshCredentialsQuery,
  ): Promise<Result<{ items: SshCredentialSummary[] }>> {
    void query;
    return ok(await this.queryService.execute(context));
  }
}
