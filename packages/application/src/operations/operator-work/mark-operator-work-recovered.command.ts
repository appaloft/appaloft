import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type MarkOperatorWorkRecoveredCommandInput,
  type MarkOperatorWorkRecoveredCommandPayload,
  markOperatorWorkRecoveredCommandInputSchema,
} from "./mark-operator-work-recovered.schema";

export {
  type MarkOperatorWorkRecoveredCommandInput,
  markOperatorWorkRecoveredCommandInputSchema,
} from "./mark-operator-work-recovered.schema";

export class MarkOperatorWorkRecoveredCommand extends Command<{
  workId: string;
  status: "succeeded";
  recoveredAt: string;
}> {
  constructor(
    public readonly workId: string,
    public readonly reason?: string,
  ) {
    super();
  }

  static create(
    input: MarkOperatorWorkRecoveredCommandInput,
  ): Result<MarkOperatorWorkRecoveredCommand> {
    return parseOperationInput(markOperatorWorkRecoveredCommandInputSchema, input).map(
      (parsed: MarkOperatorWorkRecoveredCommandPayload) =>
        new MarkOperatorWorkRecoveredCommand(parsed.workId, trimToUndefined(parsed.reason)),
    );
  }
}
