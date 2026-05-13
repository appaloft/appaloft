import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type CloseTerminalSessionResponse } from "../../ports";
import { tokens } from "../../tokens";
import { CloseTerminalSessionCommand } from "./close-terminal-session.command";
import { type TerminalSessionLifecycleService } from "./terminal-session-lifecycle.service";

@CommandHandler(CloseTerminalSessionCommand)
@injectable()
export class CloseTerminalSessionCommandHandler
  implements CommandHandlerContract<CloseTerminalSessionCommand, CloseTerminalSessionResponse>
{
  constructor(
    @inject(tokens.terminalSessionLifecycleService)
    private readonly lifecycleService: TerminalSessionLifecycleService,
  ) {}

  async handle(
    _context: ExecutionContext,
    command: CloseTerminalSessionCommand,
  ): Promise<Result<CloseTerminalSessionResponse>> {
    return this.lifecycleService.close(command);
  }
}
