import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type SshCredentialDetail } from "../../ports";
import { tokens } from "../../tokens";
import { ShowSshCredentialQuery } from "./show-ssh-credential.query";
import { type ShowSshCredentialQueryService } from "./show-ssh-credential.query-service";

@QueryHandler(ShowSshCredentialQuery)
@injectable()
export class ShowSshCredentialQueryHandler
  implements QueryHandlerContract<ShowSshCredentialQuery, SshCredentialDetail>
{
  constructor(
    @inject(tokens.showSshCredentialQueryService)
    private readonly queryService: ShowSshCredentialQueryService,
  ) {}

  handle(context: ExecutionContext, query: ShowSshCredentialQuery) {
    return this.queryService.execute(context, query);
  }
}
