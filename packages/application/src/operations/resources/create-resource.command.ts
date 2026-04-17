import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type CreateResourceCommandInput,
  type CreateResourceCommandPayload,
  type CreateResourceNetworkProfileInput,
  type CreateResourceRuntimeProfileInput,
  type CreateResourceServiceInput,
  type CreateResourceSourceBindingInput,
  createResourceCommandInputSchema,
} from "./create-resource.schema";

export {
  type CreateResourceCommandInput,
  createResourceCommandInputSchema,
} from "./create-resource.schema";

export class CreateResourceCommand extends Command<{ id: string }> {
  constructor(
    public readonly projectId: string,
    public readonly environmentId: string,
    public readonly name: string,
    public readonly kind: CreateResourceCommandPayload["kind"],
    public readonly destinationId?: string,
    public readonly description?: string,
    public readonly services: CreateResourceServiceInput[] = [],
    public readonly source?: CreateResourceSourceBindingInput,
    public readonly runtimeProfile?: CreateResourceRuntimeProfileInput,
    public readonly networkProfile?: CreateResourceNetworkProfileInput,
  ) {
    super();
  }

  static create(input: CreateResourceCommandInput): Result<CreateResourceCommand> {
    return parseOperationInput(createResourceCommandInputSchema, input).map(
      (parsed) =>
        new CreateResourceCommand(
          parsed.projectId,
          parsed.environmentId,
          parsed.name,
          parsed.kind,
          trimToUndefined(parsed.destinationId),
          trimToUndefined(parsed.description),
          parsed.services ?? [],
          parsed.source,
          parsed.runtimeProfile,
          parsed.networkProfile,
        ),
    );
  }
}
