import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type TerminalSessionDetail } from "../../ports";
import { tokens } from "../../tokens";
import { ShowTerminalSessionQuery } from "./show-terminal-session.query";
import { type TerminalSessionLifecycleService } from "./terminal-session-lifecycle.service";

@QueryHandler(ShowTerminalSessionQuery)
@injectable()
export class ShowTerminalSessionQueryHandler
  implements QueryHandlerContract<ShowTerminalSessionQuery, TerminalSessionDetail>
{
  constructor(
    @inject(tokens.terminalSessionLifecycleService)
    private readonly lifecycleService: TerminalSessionLifecycleService,
  ) {}

  async handle(
    _context: ExecutionContext,
    query: ShowTerminalSessionQuery,
  ): Promise<Result<TerminalSessionDetail>> {
    return this.lifecycleService.show(query);
  }
}
