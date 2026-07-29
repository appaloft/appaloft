import { inject, injectable } from "tsyringe";

import {
  CommandHandler,
  type CommandHandlerContract,
  QueryHandler,
  type QueryHandlerContract,
} from "./cqrs";
import { type ExecutionContext } from "./execution-context";
import {
  type RepositoryBindingReadModel,
  type RepositoryBindingService,
} from "./repository-binding";
import {
  BindProjectRepositoryCommand,
  ShowRepositoryBindingQuery,
  UnbindRepositoryCommand,
} from "./repository-binding-messages";
import { tokens } from "./tokens";

@CommandHandler(BindProjectRepositoryCommand)
@injectable()
export class BindProjectRepositoryCommandHandler
  implements CommandHandlerContract<BindProjectRepositoryCommand, RepositoryBindingReadModel>
{
  constructor(
    @inject(tokens.repositoryBindingService)
    private readonly service: RepositoryBindingService,
  ) {}

  handle(context: ExecutionContext, command: BindProjectRepositoryCommand) {
    return this.service.bind(context, command.input);
  }
}

@QueryHandler(ShowRepositoryBindingQuery)
@injectable()
export class ShowRepositoryBindingQueryHandler
  implements QueryHandlerContract<ShowRepositoryBindingQuery, RepositoryBindingReadModel>
{
  constructor(
    @inject(tokens.repositoryBindingService)
    private readonly service: RepositoryBindingService,
  ) {}

  handle(context: ExecutionContext, query: ShowRepositoryBindingQuery) {
    return this.service.show(context, query.input);
  }
}

@CommandHandler(UnbindRepositoryCommand)
@injectable()
export class UnbindRepositoryCommandHandler
  implements CommandHandlerContract<UnbindRepositoryCommand, RepositoryBindingReadModel>
{
  constructor(
    @inject(tokens.repositoryBindingService)
    private readonly service: RepositoryBindingService,
  ) {}

  handle(context: ExecutionContext, command: UnbindRepositoryCommand) {
    return this.service.unbind(context, command.input);
  }
}
