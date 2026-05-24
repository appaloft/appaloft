import { err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { type Clock } from "../../ports";
import { tokens } from "../../tokens";
import {
  dependencyResourceProvisioningPlanResponse,
  missingDependencyResourceProvisioningPlan,
} from "./create-dependency-resource-provisioning-plan.use-case";
import { type DependencyResourceProvisioningPlanResponse } from "./dependency-resource-provisioning.schema";
import { type DependencyResourceProvisioningPlanStore } from "./dependency-resource-provisioning-plan.store";
import { type ShowDependencyResourceProvisioningPlanQuery } from "./show-dependency-resource-provisioning-plan.query";

@injectable()
export class ShowDependencyResourceProvisioningPlanQueryService {
  constructor(
    @inject(tokens.dependencyResourceProvisioningPlanStore)
    private readonly planStore: DependencyResourceProvisioningPlanStore,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    _context: ExecutionContext,
    query: ShowDependencyResourceProvisioningPlanQuery,
  ): Promise<Result<DependencyResourceProvisioningPlanResponse>> {
    const record = await this.planStore.find(query.planId);
    if (!record) {
      return err(missingDependencyResourceProvisioningPlan(query.planId));
    }

    return ok(dependencyResourceProvisioningPlanResponse(record.plan, this.clock.now()));
  }
}
