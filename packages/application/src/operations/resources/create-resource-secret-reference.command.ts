import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type CreateResourceSecretReferenceCommandInput,
  createResourceSecretReferenceCommandInputSchema,
} from "./resource-secret-reference.schema";

export {
  type CreateResourceSecretReferenceCommandInput,
  createResourceSecretReferenceCommandInputSchema,
};

export interface ResourceSecretReferenceMutationResult {
  resourceId: string;
  key: string;
  exposure: "build-time" | "runtime";
}

export class CreateResourceSecretReferenceCommand extends Command<ResourceSecretReferenceMutationResult> {
  constructor(
    public readonly resourceId: string,
    public readonly key: string,
    public readonly value: string,
    public readonly exposure: "build-time" | "runtime",
  ) {
    super();
  }

  static create(
    input: CreateResourceSecretReferenceCommandInput,
  ): Result<CreateResourceSecretReferenceCommand> {
    return parseOperationInput(createResourceSecretReferenceCommandInputSchema, input).map(
      (parsed) =>
        new CreateResourceSecretReferenceCommand(
          parsed.resourceId,
          parsed.key,
          parsed.value,
          parsed.exposure,
        ),
    );
  }
}
