import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ConnectionRevokeResult } from "../../ports";
import { tokens } from "../../tokens";
import { RevokeConnectionCommand } from "./revoke-connection.command";
import { type RevokeConnectionUseCase } from "./revoke-connection.use-case";

@CommandHandler(RevokeConnectionCommand)
@injectable()
export class RevokeConnectionCommandHandler
  implements CommandHandlerContract<RevokeConnectionCommand, ConnectionRevokeResult>
{
  constructor(
    @inject(tokens.revokeConnectionUseCase)
    private readonly useCase: RevokeConnectionUseCase,
  ) {}

  handle(context: ExecutionContext, command: RevokeConnectionCommand) {
    void context;
    return this.useCase.execute({ connectionId: command.connectionId });
  }
}
