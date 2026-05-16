import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ResetResourceHealthCommandInput,
  resetResourceHealthCommandInputSchema,
} from "./reset-resource-health.schema";

export { type ResetResourceHealthCommandInput, resetResourceHealthCommandInputSchema };

export class ResetResourceHealthCommand extends Command<{ id: string }> {
  constructor(public readonly resourceId: string) {
    super();
  }

  static create(input: ResetResourceHealthCommandInput): Result<ResetResourceHealthCommand> {
    return parseOperationInput(resetResourceHealthCommandInputSchema, input).map(
      (parsed) => new ResetResourceHealthCommand(parsed.resourceId),
    );
  }
}
