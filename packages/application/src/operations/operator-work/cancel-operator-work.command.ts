import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type CancelOperatorWorkCommandInput,
  type CancelOperatorWorkCommandPayload,
  cancelOperatorWorkCommandInputSchema,
} from "./cancel-operator-work.schema";

export {
  type CancelOperatorWorkCommandInput,
  cancelOperatorWorkCommandInputSchema,
} from "./cancel-operator-work.schema";

export class CancelOperatorWorkCommand extends Command<{
  workId: string;
  status: "canceled";
  canceledAt: string;
}> {
  constructor(
    public readonly workId: string,
    public readonly reason: string,
  ) {
    super();
  }

  static create(input: CancelOperatorWorkCommandInput): Result<CancelOperatorWorkCommand> {
    return parseOperationInput(cancelOperatorWorkCommandInputSchema, input).map(
      (parsed: CancelOperatorWorkCommandPayload) =>
        new CancelOperatorWorkCommand(parsed.workId, parsed.reason),
    );
  }
}
