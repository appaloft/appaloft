import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ExpireTerminalSessionsResponse } from "../../ports";
import { tokens } from "../../tokens";
import { ExpireTerminalSessionsCommand } from "./expire-terminal-sessions.command";
import { type TerminalSessionLifecycleService } from "./terminal-session-lifecycle.service";

@CommandHandler(ExpireTerminalSessionsCommand)
@injectable()
export class ExpireTerminalSessionsCommandHandler
  implements CommandHandlerContract<ExpireTerminalSessionsCommand, ExpireTerminalSessionsResponse>
{
  constructor(
    @inject(tokens.terminalSessionLifecycleService)
    private readonly lifecycleService: TerminalSessionLifecycleService,
  ) {}

  async handle(
    _context: ExecutionContext,
    command: ExpireTerminalSessionsCommand,
  ): Promise<Result<ExpireTerminalSessionsResponse>> {
    return this.lifecycleService.expire(command);
  }
}
