import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type DeleteResourceCommandInput,
  type DeleteResourceCommandPayload,
  deleteResourceCommandInputSchema,
} from "./delete-resource.schema";

export {
  type DeleteResourceCommandInput,
  deleteResourceCommandInputSchema,
} from "./delete-resource.schema";

export class DeleteResourceCommand extends Command<{ id: string }> {
  constructor(
    public readonly resourceId: string,
    public readonly confirmation: DeleteResourceCommandPayload["confirmation"],
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(input: DeleteResourceCommandInput): Result<DeleteResourceCommand> {
    return parseOperationInput(deleteResourceCommandInputSchema, input).map(
      (parsed) =>
        new DeleteResourceCommand(
          parsed.resourceId,
          parsed.confirmation,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
