import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type DomainEventStreamPruneResult } from "../../ports";
import { tokens } from "../../tokens";
import { PruneDomainEventsCommand } from "./prune-domain-events.command";
import { type PruneDomainEventsUseCase } from "./prune-domain-events.use-case";

@CommandHandler(PruneDomainEventsCommand)
@injectable()
export class PruneDomainEventsCommandHandler
  implements CommandHandlerContract<PruneDomainEventsCommand, DomainEventStreamPruneResult>
{
  constructor(
    @inject(tokens.pruneDomainEventsUseCase)
    private readonly useCase: PruneDomainEventsUseCase,
  ) {}

  handle(context: ExecutionContext, command: PruneDomainEventsCommand) {
    return this.useCase.execute(context, command);
  }
}
