import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type ExpireTerminalSessionsResponse } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ExpireTerminalSessionsCommandInput,
  expireTerminalSessionsCommandInputSchema,
} from "./terminal-session-lifecycle.schema";

export {
  type ExpireTerminalSessionsCommandInput,
  expireTerminalSessionsCommandInputSchema,
} from "./terminal-session-lifecycle.schema";

export class ExpireTerminalSessionsCommand extends Command<ExpireTerminalSessionsResponse> {
  constructor(
    public readonly olderThan?: string,
    public readonly limit?: number,
  ) {
    super();
  }

  static create(input?: ExpireTerminalSessionsCommandInput): Result<ExpireTerminalSessionsCommand> {
    return parseOperationInput(expireTerminalSessionsCommandInputSchema, input ?? {}).map(
      (parsed) => new ExpireTerminalSessionsCommand(parsed.olderThan, parsed.limit),
    );
  }
}
