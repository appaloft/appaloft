import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type CloseTerminalSessionResponse } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type CloseTerminalSessionCommandInput,
  closeTerminalSessionCommandInputSchema,
} from "./terminal-session-lifecycle.schema";

export {
  type CloseTerminalSessionCommandInput,
  closeTerminalSessionCommandInputSchema,
} from "./terminal-session-lifecycle.schema";

export class CloseTerminalSessionCommand extends Command<CloseTerminalSessionResponse> {
  constructor(public readonly sessionId: string) {
    super();
  }

  static create(input: CloseTerminalSessionCommandInput): Result<CloseTerminalSessionCommand> {
    return parseOperationInput(closeTerminalSessionCommandInputSchema, input).map(
      (parsed) => new CloseTerminalSessionCommand(parsed.sessionId),
    );
  }
}
