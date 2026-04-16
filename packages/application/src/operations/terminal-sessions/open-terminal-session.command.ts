import { type Result } from "@yundu/core";

import { Command } from "../../cqrs";
import { type TerminalSessionDescriptor } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type OpenTerminalSessionCommandInput,
  type OpenTerminalSessionScopeInput,
  openTerminalSessionCommandInputSchema,
} from "./open-terminal-session.schema";

export {
  type OpenTerminalSessionCommandInput,
  openTerminalSessionCommandInputSchema,
} from "./open-terminal-session.schema";

export class OpenTerminalSessionCommand extends Command<TerminalSessionDescriptor> {
  constructor(
    public readonly scope: OpenTerminalSessionScopeInput,
    public readonly initialRows: number,
    public readonly initialCols: number,
    public readonly relativeDirectory?: string,
  ) {
    super();
  }

  static create(input: OpenTerminalSessionCommandInput): Result<OpenTerminalSessionCommand> {
    return parseOperationInput(openTerminalSessionCommandInputSchema, input).map(
      (parsed) =>
        new OpenTerminalSessionCommand(
          parsed.scope,
          parsed.initialRows,
          parsed.initialCols,
          trimToUndefined(parsed.relativeDirectory),
        ),
    );
  }
}
