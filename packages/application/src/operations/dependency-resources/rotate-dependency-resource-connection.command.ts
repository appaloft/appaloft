import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type RotateDependencyResourceConnectionCommandInput,
  rotateDependencyResourceConnectionCommandInputSchema,
} from "./rotate-dependency-resource-connection.schema";

export {
  type RotateDependencyResourceConnectionCommandInput,
  rotateDependencyResourceConnectionCommandInputSchema,
};

export class RotateDependencyResourceConnectionCommand extends Command<{ id: string }> {
  constructor(
    public readonly dependencyResourceId: string,
    public readonly connectionUrl: string,
  ) {
    super();
  }

  static create(
    input: RotateDependencyResourceConnectionCommandInput,
  ): Result<RotateDependencyResourceConnectionCommand> {
    return parseOperationInput(rotateDependencyResourceConnectionCommandInputSchema, input).map(
      (parsed) =>
        new RotateDependencyResourceConnectionCommand(
          parsed.dependencyResourceId,
          parsed.connectionUrl,
        ),
    );
  }
}
