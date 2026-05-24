import {
  type CreateDependencyResourceProvisioningPlanInput,
  type DependencyResourceProvisioningPlan,
} from "./dependency-resource-provisioning.schema";

export interface DependencyResourceProvisioningPlanRecord {
  plan: DependencyResourceProvisioningPlan;
  request: CreateDependencyResourceProvisioningPlanInput;
}

export interface DependencyResourceProvisioningPlanStore {
  save(record: DependencyResourceProvisioningPlanRecord): Promise<void>;
  find(planId: string): Promise<DependencyResourceProvisioningPlanRecord | undefined>;
}

export class InMemoryDependencyResourceProvisioningPlanStore
  implements DependencyResourceProvisioningPlanStore
{
  private readonly records = new Map<string, DependencyResourceProvisioningPlanRecord>();

  async save(record: DependencyResourceProvisioningPlanRecord): Promise<void> {
    this.records.set(record.plan.id, structuredClone(record));
  }

  async find(planId: string): Promise<DependencyResourceProvisioningPlanRecord | undefined> {
    const record = this.records.get(planId);
    return record ? structuredClone(record) : undefined;
  }
}
