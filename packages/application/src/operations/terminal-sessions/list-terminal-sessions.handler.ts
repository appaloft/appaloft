import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type TerminalSessionList } from "../../ports";
import { tokens } from "../../tokens";
import { ListTerminalSessionsQuery } from "./list-terminal-sessions.query";
import { type TerminalSessionLifecycleService } from "./terminal-session-lifecycle.service";

@QueryHandler(ListTerminalSessionsQuery)
@injectable()
export class ListTerminalSessionsQueryHandler
  implements QueryHandlerContract<ListTerminalSessionsQuery, TerminalSessionList>
{
  constructor(
    @inject(tokens.terminalSessionLifecycleService)
    private readonly lifecycleService: TerminalSessionLifecycleService,
  ) {}

  async handle(
    _context: ExecutionContext,
    query: ListTerminalSessionsQuery,
  ): Promise<Result<TerminalSessionList>> {
    return ok(this.lifecycleService.list(query));
  }
}
