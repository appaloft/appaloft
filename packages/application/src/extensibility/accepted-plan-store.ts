import { type AcceptedConnectionCapabilityPlanSnapshot } from "@appaloft/core";

import { type AcceptedConnectionCapabilityPlanStore } from "../ports";

export class InMemoryAcceptedConnectionCapabilityPlanStore
  implements AcceptedConnectionCapabilityPlanStore
{
  private readonly byId = new Map<string, AcceptedConnectionCapabilityPlanSnapshot>();

  constructor(seed: readonly AcceptedConnectionCapabilityPlanSnapshot[] = []) {
    for (const plan of seed) {
      this.save(plan);
    }
  }

  save(plan: AcceptedConnectionCapabilityPlanSnapshot): void {
    this.byId.set(plan.acceptedPlanId, cloneAcceptedPlan(plan));
  }

  findById(acceptedPlanId: string): AcceptedConnectionCapabilityPlanSnapshot | null {
    const plan = this.byId.get(acceptedPlanId);
    return plan ? cloneAcceptedPlan(plan) : null;
  }
}

function cloneAcceptedPlan(
  plan: AcceptedConnectionCapabilityPlanSnapshot,
): AcceptedConnectionCapabilityPlanSnapshot {
  return {
    ...plan,
    ...(plan.ownerRef ? { ownerRef: { ...plan.ownerRef } } : {}),
    effects: plan.effects.map((effect) => ({ ...effect })),
    ...(plan.cleanup ? { cleanup: { ...plan.cleanup } } : {}),
  };
}
