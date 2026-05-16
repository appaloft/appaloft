import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import { type ResourceSecretReferenceMutationResult } from "./create-resource-secret-reference.command";
import {
  type RotateResourceSecretReferenceCommandInput,
  rotateResourceSecretReferenceCommandInputSchema,
} from "./resource-secret-reference.schema";

export {
  type RotateResourceSecretReferenceCommandInput,
  rotateResourceSecretReferenceCommandInputSchema,
};

export class RotateResourceSecretReferenceCommand extends Command<ResourceSecretReferenceMutationResult> {
  constructor(
    public readonly resourceId: string,
    public readonly key: string,
    public readonly value: string,
    public readonly exposure: "build-time" | "runtime",
  ) {
    super();
  }

  static create(
    input: RotateResourceSecretReferenceCommandInput,
  ): Result<RotateResourceSecretReferenceCommand> {
    return parseOperationInput(rotateResourceSecretReferenceCommandInputSchema, input).map(
      (parsed) =>
        new RotateResourceSecretReferenceCommand(
          parsed.resourceId,
          parsed.key,
          parsed.value,
          parsed.exposure,
        ),
    );
  }
}
