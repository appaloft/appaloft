import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import { type ResourceSecretReferenceMutationResult } from "./create-resource-secret-reference.command";
import {
  type DeleteResourceSecretReferenceCommandInput,
  deleteResourceSecretReferenceCommandInputSchema,
} from "./resource-secret-reference.schema";

export {
  type DeleteResourceSecretReferenceCommandInput,
  deleteResourceSecretReferenceCommandInputSchema,
};

export class DeleteResourceSecretReferenceCommand extends Command<ResourceSecretReferenceMutationResult> {
  constructor(
    public readonly resourceId: string,
    public readonly key: string,
    public readonly exposure: "build-time" | "runtime",
  ) {
    super();
  }

  static create(
    input: DeleteResourceSecretReferenceCommandInput,
  ): Result<DeleteResourceSecretReferenceCommand> {
    return parseOperationInput(deleteResourceSecretReferenceCommandInputSchema, input).map(
      (parsed) =>
        new DeleteResourceSecretReferenceCommand(parsed.resourceId, parsed.key, parsed.exposure),
    );
  }
}
