import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type IngestSourceEventResult } from "../../ports";
import { tokens } from "../../tokens";
import { IngestSourceEventCommand } from "./ingest-source-event.command";
import { type IngestSourceEventUseCase } from "./ingest-source-event.use-case";

@CommandHandler(IngestSourceEventCommand)
@injectable()
export class IngestSourceEventCommandHandler
  implements CommandHandlerContract<IngestSourceEventCommand, IngestSourceEventResult>
{
  constructor(
    @inject(tokens.ingestSourceEventUseCase)
    private readonly useCase: IngestSourceEventUseCase,
  ) {}

  handle(context: ExecutionContext, command: IngestSourceEventCommand) {
    return this.useCase.execute(context, {
      sourceKind: command.sourceKind,
      eventKind: command.eventKind,
      ...(command.scopeResourceId ? { scopeResourceId: command.scopeResourceId } : {}),
      sourceIdentity: command.sourceIdentity,
      ref: command.ref,
      revision: command.revision,
      verification: command.verification,
      ...(command.deliveryId ? { deliveryId: command.deliveryId } : {}),
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
      ...(command.receivedAt ? { receivedAt: command.receivedAt } : {}),
    });
  }
}
