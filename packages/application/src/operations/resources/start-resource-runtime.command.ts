import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type ResourceRuntimeControlCommandResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type StartResourceRuntimeCommandInput,
  startResourceRuntimeCommandInputSchema,
} from "./resource-runtime-control.schema";

export {
  type StartResourceRuntimeCommandInput,
  startResourceRuntimeCommandInputSchema,
} from "./resource-runtime-control.schema";

export class StartResourceRuntimeCommand extends Command<ResourceRuntimeControlCommandResult> {
  constructor(
    public readonly resourceId: string,
    public readonly deploymentId?: string,
    public readonly acknowledgeRetainedRuntimeMetadata?: boolean,
    public readonly reason?: string,
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(input: StartResourceRuntimeCommandInput): Result<StartResourceRuntimeCommand> {
    return parseOperationInput(startResourceRuntimeCommandInputSchema, input).map(
      (parsed) =>
        new StartResourceRuntimeCommand(
          parsed.resourceId,
          trimToUndefined(parsed.deploymentId),
          parsed.acknowledgeRetainedRuntimeMetadata,
          trimToUndefined(parsed.reason),
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
