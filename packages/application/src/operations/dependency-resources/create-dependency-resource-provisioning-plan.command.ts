import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type CreateDependencyResourceProvisioningPlanInput,
  createDependencyResourceProvisioningPlanInputSchema,
  type DependencyResourceProvisioningPlanResponse,
} from "./dependency-resource-provisioning.schema";

export {
  type CreateDependencyResourceProvisioningPlanInput,
  createDependencyResourceProvisioningPlanInputSchema,
};

export class CreateDependencyResourceProvisioningPlanCommand extends Command<DependencyResourceProvisioningPlanResponse> {
  constructor(public readonly input: CreateDependencyResourceProvisioningPlanInput) {
    super();
  }

  static create(
    input: CreateDependencyResourceProvisioningPlanInput,
  ): Result<CreateDependencyResourceProvisioningPlanCommand> {
    return parseOperationInput(createDependencyResourceProvisioningPlanInputSchema, input).map(
      (parsed) => new CreateDependencyResourceProvisioningPlanCommand(parsed),
    );
  }
}
