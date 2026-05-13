import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type TerminalSessionDetail } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ShowTerminalSessionQueryInput,
  showTerminalSessionQueryInputSchema,
} from "./terminal-session-lifecycle.schema";

export {
  type ShowTerminalSessionQueryInput,
  showTerminalSessionQueryInputSchema,
} from "./terminal-session-lifecycle.schema";

export class ShowTerminalSessionQuery extends Query<TerminalSessionDetail> {
  constructor(public readonly sessionId: string) {
    super();
  }

  static create(input: ShowTerminalSessionQueryInput): Result<ShowTerminalSessionQuery> {
    return parseOperationInput(showTerminalSessionQueryInputSchema, input).map(
      (parsed) => new ShowTerminalSessionQuery(parsed.sessionId),
    );
  }
}
