import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import {
  type CloseTerminalSessionResponse,
  type ExpireTerminalSessionsResponse,
  type TerminalSessionDetail,
  type TerminalSessionGateway,
  type TerminalSessionList,
} from "../../ports";
import { tokens } from "../../tokens";
import { type CloseTerminalSessionCommand } from "./close-terminal-session.command";
import { type ExpireTerminalSessionsCommand } from "./expire-terminal-sessions.command";
import { type ListTerminalSessionsQuery } from "./list-terminal-sessions.query";
import { type ShowTerminalSessionQuery } from "./show-terminal-session.query";

@injectable()
export class TerminalSessionLifecycleService {
  constructor(
    @inject(tokens.terminalSessionGateway)
    private readonly terminalSessionGateway: TerminalSessionGateway,
  ) {}

  list(query: ListTerminalSessionsQuery): TerminalSessionList {
    return {
      schemaVersion: "terminal-sessions.list/v1",
      items: this.terminalSessionGateway.list({
        ...(query.scope ? { scope: query.scope } : {}),
        ...(query.serverId ? { serverId: query.serverId } : {}),
        ...(query.resourceId ? { resourceId: query.resourceId } : {}),
        ...(query.deploymentId ? { deploymentId: query.deploymentId } : {}),
        ...(query.sandboxId ? { sandboxId: query.sandboxId } : {}),
        ...(query.limit ? { limit: query.limit } : {}),
      }),
    };
  }

  show(query: ShowTerminalSessionQuery): Result<TerminalSessionDetail> {
    return this.terminalSessionGateway.show(query.sessionId).map((item) => ({
      schemaVersion: "terminal-sessions.show/v1",
      item,
    }));
  }

  close(command: CloseTerminalSessionCommand): Promise<Result<CloseTerminalSessionResponse>> {
    return this.terminalSessionGateway.close(command.sessionId);
  }

  expire(command: ExpireTerminalSessionsCommand): Promise<Result<ExpireTerminalSessionsResponse>> {
    return this.terminalSessionGateway.expire({
      ...(command.olderThan ? { olderThan: command.olderThan } : {}),
      ...(command.limit ? { limit: command.limit } : {}),
    });
  }
}
