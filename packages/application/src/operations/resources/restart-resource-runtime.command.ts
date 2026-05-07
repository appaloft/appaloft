import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type ResourceRuntimeControlCommandResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type RestartResourceRuntimeCommandInput,
  restartResourceRuntimeCommandInputSchema,
} from "./resource-runtime-control.schema";

export {
  type RestartResourceRuntimeCommandInput,
  restartResourceRuntimeCommandInputSchema,
} from "./resource-runtime-control.schema";

export class RestartResourceRuntimeCommand extends Command<ResourceRuntimeControlCommandResult> {
  constructor(
    public readonly resourceId: string,
    public readonly deploymentId?: string,
    public readonly acknowledgeRetainedRuntimeMetadata?: boolean,
    public readonly reason?: string,
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(input: RestartResourceRuntimeCommandInput): Result<RestartResourceRuntimeCommand> {
    return parseOperationInput(restartResourceRuntimeCommandInputSchema, input).map(
      (parsed) =>
        new RestartResourceRuntimeCommand(
          parsed.resourceId,
          trimToUndefined(parsed.deploymentId),
          parsed.acknowledgeRetainedRuntimeMetadata,
          trimToUndefined(parsed.reason),
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
