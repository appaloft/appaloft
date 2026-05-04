import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type environmentVariableExposureSchema, parseOperationInput } from "../shared-schema";
import {
  type ImportResourceVariablesCommandInput,
  type ImportResourceVariablesResponse,
  importResourceVariablesCommandInputSchema,
} from "./import-resource-variables.schema";

export {
  type ImportedResourceVariableEntry,
  type ImportResourceVariablesCommandInput,
  type ImportResourceVariablesResponse,
  importResourceVariablesCommandInputSchema,
  type ResourceVariableDuplicateOverride,
  type ResourceVariableExistingOverride,
} from "./import-resource-variables.schema";

export class ImportResourceVariablesCommand extends Command<ImportResourceVariablesResponse> {
  constructor(
    public readonly resourceId: string,
    public readonly content: string,
    public readonly exposure: (typeof environmentVariableExposureSchema)["_output"],
    public readonly secretKeys: string[],
    public readonly plainKeys: string[],
  ) {
    super();
  }

  static create(
    input: ImportResourceVariablesCommandInput,
  ): Result<ImportResourceVariablesCommand> {
    return parseOperationInput(importResourceVariablesCommandInputSchema, input).map(
      (parsed) =>
        new ImportResourceVariablesCommand(
          parsed.resourceId,
          parsed.content,
          parsed.exposure,
          parsed.secretKeys,
          parsed.plainKeys,
        ),
    );
  }
}
