import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { RevokeAccountSessionCommand } from "./revoke-account-session.command";
import { type RevokeAccountSessionUseCase } from "./revoke-account-session.use-case";

@CommandHandler(RevokeAccountSessionCommand)
@injectable()
export class RevokeAccountSessionCommandHandler
  implements
    CommandHandlerContract<RevokeAccountSessionCommand, { sessionId: string; revokedAt: string }>
{
  constructor(
    @inject(tokens.revokeAccountSessionUseCase)
    private readonly useCase: RevokeAccountSessionUseCase,
  ) {}

  handle(context: ExecutionContext, command: RevokeAccountSessionCommand) {
    return this.useCase.execute(context, {
      sessionId: command.sessionId,
      ...(command.idempotencyKey ? { idempotencyKey: command.idempotencyKey } : {}),
    });
  }
}
