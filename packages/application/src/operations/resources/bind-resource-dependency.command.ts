import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type BindResourceDependencyCommandInput,
  bindResourceDependencyCommandInputSchema,
} from "./bind-resource-dependency.schema";

export { type BindResourceDependencyCommandInput, bindResourceDependencyCommandInputSchema };

export class BindResourceDependencyCommand extends Command<{ id: string }> {
  constructor(
    public readonly resourceId: string,
    public readonly dependencyResourceId: string,
    public readonly targetName: string,
    public readonly scope: BindResourceDependencyCommandInput["scope"],
    public readonly injectionMode: BindResourceDependencyCommandInput["injectionMode"],
  ) {
    super();
  }

  static create(input: BindResourceDependencyCommandInput): Result<BindResourceDependencyCommand> {
    return parseOperationInput(bindResourceDependencyCommandInputSchema, input).map(
      (parsed) =>
        new BindResourceDependencyCommand(
          parsed.resourceId,
          parsed.dependencyResourceId,
          parsed.targetName,
          parsed.scope,
          parsed.injectionMode,
        ),
    );
  }
}
