import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type DependencyResourceProvisioningPlanResponse,
  type ShowDependencyResourceProvisioningPlanInput,
  showDependencyResourceProvisioningPlanInputSchema,
} from "./dependency-resource-provisioning.schema";

export {
  type ShowDependencyResourceProvisioningPlanInput,
  showDependencyResourceProvisioningPlanInputSchema,
};

export class ShowDependencyResourceProvisioningPlanQuery extends Query<DependencyResourceProvisioningPlanResponse> {
  constructor(public readonly planId: string) {
    super();
  }

  static create(
    input: ShowDependencyResourceProvisioningPlanInput,
  ): Result<ShowDependencyResourceProvisioningPlanQuery> {
    return parseOperationInput(showDependencyResourceProvisioningPlanInputSchema, input).map(
      (parsed) => new ShowDependencyResourceProvisioningPlanQuery(parsed.planId),
    );
  }
}
