import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type ResourceRuntimeControlCommandResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type StopResourceRuntimeCommandInput,
  stopResourceRuntimeCommandInputSchema,
} from "./resource-runtime-control.schema";

export {
  type StopResourceRuntimeCommandInput,
  stopResourceRuntimeCommandInputSchema,
} from "./resource-runtime-control.schema";

export class StopResourceRuntimeCommand extends Command<ResourceRuntimeControlCommandResult> {
  constructor(
    public readonly resourceId: string,
    public readonly deploymentId?: string,
    public readonly reason?: string,
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(input: StopResourceRuntimeCommandInput): Result<StopResourceRuntimeCommand> {
    return parseOperationInput(stopResourceRuntimeCommandInputSchema, input).map(
      (parsed) =>
        new StopResourceRuntimeCommand(
          parsed.resourceId,
          trimToUndefined(parsed.deploymentId),
          trimToUndefined(parsed.reason),
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
