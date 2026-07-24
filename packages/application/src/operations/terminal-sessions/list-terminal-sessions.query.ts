import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type TerminalSessionList } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ListTerminalSessionsQueryInput,
  listTerminalSessionsQueryInputSchema,
} from "./terminal-session-lifecycle.schema";

export {
  type ListTerminalSessionsQueryInput,
  listTerminalSessionsQueryInputSchema,
} from "./terminal-session-lifecycle.schema";

export class ListTerminalSessionsQuery extends Query<TerminalSessionList> {
  constructor(
    public readonly scope?: "server" | "resource" | "sandbox",
    public readonly serverId?: string,
    public readonly resourceId?: string,
    public readonly deploymentId?: string,
    public readonly sandboxId?: string,
    public readonly limit?: number,
  ) {
    super();
  }

  static create(input?: ListTerminalSessionsQueryInput): Result<ListTerminalSessionsQuery> {
    return parseOperationInput(listTerminalSessionsQueryInputSchema, input ?? {}).map(
      (parsed) =>
        new ListTerminalSessionsQuery(
          parsed.scope,
          trimToUndefined(parsed.serverId),
          trimToUndefined(parsed.resourceId),
          trimToUndefined(parsed.deploymentId),
          trimToUndefined(parsed.sandboxId),
          parsed.limit,
        ),
    );
  }
}
