import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type RouteSurfaceDecisionResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type EvaluateRouteSurfaceInput,
  evaluateRouteSurfaceInputSchema,
} from "./route-surface.schema";

export class EvaluateRouteSurfaceCommand extends Command<EvaluateRouteSurfaceResponse> {
  constructor(readonly input: EvaluateRouteSurfaceInput) {
    super();
  }

  static create(input: EvaluateRouteSurfaceInput): Result<EvaluateRouteSurfaceCommand> {
    return parseOperationInput(evaluateRouteSurfaceInputSchema, input).map(
      (parsed) => new EvaluateRouteSurfaceCommand(parsed),
    );
  }
}

export type EvaluateRouteSurfaceResponse = {
  result: RouteSurfaceDecisionResult;
};

export {
  type EvaluateRouteSurfaceInput,
  evaluateRouteSurfaceInputSchema,
} from "./route-surface.schema";
