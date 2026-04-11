import { type Result } from "@yundu/core";
import { type z } from "zod";

import { Command } from "../../cqrs";
import { type environmentKindSchema, parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type CreateEnvironmentCommandInput,
  createEnvironmentCommandInputSchema,
} from "./create-environment.schema";

export {
  type CreateEnvironmentCommandInput,
  createEnvironmentCommandInputSchema,
} from "./create-environment.schema";

export class CreateEnvironmentCommand extends Command<{ id: string }> {
  constructor(
    public readonly projectId: string,
    public readonly name: string,
    public readonly kind: z.output<typeof environmentKindSchema>,
    public readonly parentEnvironmentId?: string,
  ) {
    super();
  }

  static create(input: CreateEnvironmentCommandInput): Result<CreateEnvironmentCommand> {
    return parseOperationInput(createEnvironmentCommandInputSchema, input).map(
      (parsed) =>
        new CreateEnvironmentCommand(
          parsed.projectId,
          parsed.name,
          parsed.kind,
          trimToUndefined(parsed.parentEnvironmentId),
        ),
    );
  }
}
