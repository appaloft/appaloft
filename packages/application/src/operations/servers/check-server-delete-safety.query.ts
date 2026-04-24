import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ServerDeleteSafety } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type CheckServerDeleteSafetyQueryInput,
  checkServerDeleteSafetyQueryInputSchema,
} from "./check-server-delete-safety.schema";

export {
  type CheckServerDeleteSafetyQueryInput,
  checkServerDeleteSafetyQueryInputSchema,
} from "./check-server-delete-safety.schema";

export class CheckServerDeleteSafetyQuery extends Query<ServerDeleteSafety> {
  constructor(public readonly serverId: string) {
    super();
  }

  static create(input: CheckServerDeleteSafetyQueryInput): Result<CheckServerDeleteSafetyQuery> {
    return parseOperationInput(checkServerDeleteSafetyQueryInputSchema, input).map(
      (parsed) => new CheckServerDeleteSafetyQuery(parsed.serverId),
    );
  }
}
