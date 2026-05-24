import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type AcceptDependencyResourceProvisioningPlanInput,
  acceptDependencyResourceProvisioningPlanInputSchema,
  type DependencyResourceProvisioningPlanResponse,
} from "./dependency-resource-provisioning.schema";

export {
  type AcceptDependencyResourceProvisioningPlanInput,
  acceptDependencyResourceProvisioningPlanInputSchema,
};

export class AcceptDependencyResourceProvisioningPlanCommand extends Command<DependencyResourceProvisioningPlanResponse> {
  constructor(
    public readonly planId: string,
    public readonly acknowledgeMutation: true,
  ) {
    super();
  }

  static create(
    input: AcceptDependencyResourceProvisioningPlanInput,
  ): Result<AcceptDependencyResourceProvisioningPlanCommand> {
    return parseOperationInput(acceptDependencyResourceProvisioningPlanInputSchema, input).map(
      (parsed) =>
        new AcceptDependencyResourceProvisioningPlanCommand(
          parsed.planId,
          parsed.acknowledgeMutation,
        ),
    );
  }
}
