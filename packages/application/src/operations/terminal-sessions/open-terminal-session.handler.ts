import { type Result } from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type TerminalSessionDescriptor } from "../../ports";
import { tokens } from "../../tokens";
import { OpenTerminalSessionCommand } from "./open-terminal-session.command";
import { type OpenTerminalSessionUseCase } from "./open-terminal-session.use-case";

@CommandHandler(OpenTerminalSessionCommand)
@injectable()
export class OpenTerminalSessionCommandHandler
  implements CommandHandlerContract<OpenTerminalSessionCommand, TerminalSessionDescriptor>
{
  constructor(
    @inject(tokens.openTerminalSessionUseCase)
    private readonly useCase: OpenTerminalSessionUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: OpenTerminalSessionCommand,
  ): Promise<Result<TerminalSessionDescriptor>> {
    return this.useCase.execute(context, command);
  }
}
