import { err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { type Clock } from "../../ports";
import { tokens } from "../../tokens";
import {
  dependencyResourceProvisioningPlanResponse,
  missingDependencyResourceProvisioningPlan,
} from "./create-dependency-resource-provisioning-plan.use-case";
import {
  type AcceptDependencyResourceProvisioningPlanInput,
  type DependencyResourceProvisioningPlanResponse,
} from "./dependency-resource-provisioning.schema";
import { type DependencyResourceProvisioningPlanStore } from "./dependency-resource-provisioning-plan.store";
import { type ImportDependencyResourceUseCase } from "./import-dependency-resource.use-case";
import { type ProvisionDependencyResourceUseCase } from "./provision-dependency-resource.use-case";

@injectable()
export class AcceptDependencyResourceProvisioningPlanUseCase {
  constructor(
    @inject(tokens.dependencyResourceProvisioningPlanStore)
    private readonly planStore: DependencyResourceProvisioningPlanStore,
    @inject(tokens.provisionDependencyResourceUseCase)
    private readonly provisionDependencyResource: ProvisionDependencyResourceUseCase,
    @inject(tokens.importDependencyResourceUseCase)
    private readonly importDependencyResource: ImportDependencyResourceUseCase,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    input: AcceptDependencyResourceProvisioningPlanInput,
  ): Promise<Result<DependencyResourceProvisioningPlanResponse>> {
    const record = await this.planStore.find(input.planId);
    if (!record) {
      return err(missingDependencyResourceProvisioningPlan(input.planId));
    }
    if (record.plan.status !== "planned") {
      return ok(dependencyResourceProvisioningPlanResponse(record.plan, this.clock.now()));
    }

    const acceptedAt = this.clock.now();
    record.plan = {
      ...record.plan,
      status: "accepted",
      acceptedAt,
    };
    await this.planStore.save(record);

    const realization =
      record.request.mode === "create"
        ? await this.provisionDependencyResource.execute(context, record.request.create)
        : await this.importDependencyResource.execute(context, record.request.reuse);

    if (realization.isErr()) {
      const completedAt = this.clock.now();
      record.plan = {
        ...record.plan,
        status: "failed",
        completedAt,
        failureCode: realization.error.code,
        failureMessage: realization.error.message,
      };
      await this.planStore.save(record);
      return err(realization.error);
    }

    const completedAt = this.clock.now();
    record.plan = {
      ...record.plan,
      status: "realized",
      completedAt,
      dependencyResourceId: realization.value.id,
    };
    await this.planStore.save(record);

    return ok(dependencyResourceProvisioningPlanResponse(record.plan, this.clock.now()));
  }
}
