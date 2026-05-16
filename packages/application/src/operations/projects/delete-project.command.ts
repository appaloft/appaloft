import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type DeleteProjectCommandInput,
  type DeleteProjectCommandPayload,
  deleteProjectCommandInputSchema,
} from "./delete-project.schema";

export {
  type DeleteProjectCommandInput,
  deleteProjectCommandInputSchema,
} from "./delete-project.schema";

export class DeleteProjectCommand extends Command<{ id: string }> {
  constructor(
    public readonly projectId: string,
    public readonly confirmation: DeleteProjectCommandPayload["confirmation"],
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(input: DeleteProjectCommandInput): Result<DeleteProjectCommand> {
    return parseOperationInput(deleteProjectCommandInputSchema, input).map(
      (parsed) =>
        new DeleteProjectCommand(
          parsed.projectId,
          parsed.confirmation,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
