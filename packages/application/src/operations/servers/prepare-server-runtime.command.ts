import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ParsedPrepareServerRuntimeCommandInput,
  type PrepareServerRuntimeCommandInput,
  type PrepareServerRuntimeMode,
  type PrepareServerRuntimeResult,
  prepareServerRuntimeCommandInputSchema,
  prepareServerRuntimeModeSchema,
  prepareServerRuntimeResultSchema,
} from "./prepare-server-runtime.schema";

export {
  type ParsedPrepareServerRuntimeCommandInput,
  type PrepareServerRuntimeCommandInput,
  type PrepareServerRuntimeMode,
  type PrepareServerRuntimeResult,
  prepareServerRuntimeCommandInputSchema,
  prepareServerRuntimeModeSchema,
  prepareServerRuntimeResultSchema,
  type ServerRuntimePreparePhase,
  type ServerRuntimePrepareStep,
  type ServerRuntimePrepareStepStatus,
  serverRuntimePreparePhaseSchema,
  serverRuntimePrepareStepSchema,
  serverRuntimePrepareStepStatusSchema,
} from "./prepare-server-runtime.schema";

export class PrepareServerRuntimeCommand extends Command<PrepareServerRuntimeResult> {
  constructor(public readonly input: ParsedPrepareServerRuntimeCommandInput) {
    super();
  }

  static create(input: PrepareServerRuntimeCommandInput): Result<PrepareServerRuntimeCommand> {
    return parseOperationInput(prepareServerRuntimeCommandInputSchema, input).map(
      (parsed) => new PrepareServerRuntimeCommand(parsed),
    );
  }
}
