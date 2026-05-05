import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type UnbindResourceDependencyCommandInput,
  unbindResourceDependencyCommandInputSchema,
} from "./unbind-resource-dependency.schema";

export { type UnbindResourceDependencyCommandInput, unbindResourceDependencyCommandInputSchema };

export class UnbindResourceDependencyCommand extends Command<{ id: string }> {
  constructor(
    public readonly resourceId: string,
    public readonly bindingId: string,
  ) {
    super();
  }

  static create(
    input: UnbindResourceDependencyCommandInput,
  ): Result<UnbindResourceDependencyCommand> {
    return parseOperationInput(unbindResourceDependencyCommandInputSchema, input).map(
      (parsed) => new UnbindResourceDependencyCommand(parsed.resourceId, parsed.bindingId),
    );
  }
}
