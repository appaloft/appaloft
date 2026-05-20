import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type DeploymentOverlayDecisionResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type EvaluateDeploymentOverlayInput,
  evaluateDeploymentOverlayInputSchema,
} from "./deployment-overlay.schema";

export class EvaluateDeploymentOverlayCommand extends Command<EvaluateDeploymentOverlayResponse> {
  constructor(readonly input: EvaluateDeploymentOverlayInput) {
    super();
  }

  static create(input: EvaluateDeploymentOverlayInput): Result<EvaluateDeploymentOverlayCommand> {
    return parseOperationInput(evaluateDeploymentOverlayInputSchema, input).map(
      (parsed) => new EvaluateDeploymentOverlayCommand(parsed),
    );
  }
}

export type EvaluateDeploymentOverlayResponse = {
  result: DeploymentOverlayDecisionResult;
};

export {
  type EvaluateDeploymentOverlayInput,
  evaluateDeploymentOverlayInputSchema,
} from "./deployment-overlay.schema";
