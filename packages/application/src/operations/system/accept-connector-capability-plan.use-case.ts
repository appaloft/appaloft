import {
  AcceptedConnectionCapabilityPlan,
  type AcceptedConnectionCapabilityPlanSnapshot,
  domainError,
  err,
  OccurredAt,
  type Result,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { type AcceptedConnectionCapabilityPlanStore } from "../../ports";
import { tokens } from "../../tokens";
import { type AcceptConnectorCapabilityPlanCommandInput } from "./accept-connector-capability-plan.command";

@injectable()
export class AcceptConnectorCapabilityPlanUseCase {
  constructor(
    @inject(tokens.acceptedConnectionCapabilityPlanStore)
    private readonly acceptedPlanStore: AcceptedConnectionCapabilityPlanStore,
  ) {}

  async execute(
    context: ExecutionContext,
    input: AcceptConnectorCapabilityPlanCommandInput,
  ): Promise<Result<AcceptedConnectionCapabilityPlanSnapshot>> {
    const acceptedAt = OccurredAt.create(new Date());
    if (acceptedAt.isErr()) return err(acceptedAt.error);
    const effects = input.effects.map((effect) => ({
      kind: effect.kind,
      title: effect.title,
      ...(effect.description ? { description: effect.description } : {}),
    }));
    const cleanup = input.cleanup
      ? {
          supported: input.cleanup.supported,
          ...(input.cleanup.description ? { description: input.cleanup.description } : {}),
        }
      : undefined;

    const accepted = AcceptedConnectionCapabilityPlan.accept({
      planId: input.planId,
      connectorKey: input.connectorKey,
      capabilityKey: input.capabilityKey,
      ...(input.ownerRef ? { ownerRef: input.ownerRef } : {}),
      acceptedBy: input.acceptedBy ?? actorLabel(context),
      acceptedAt: acceptedAt.value,
      riskLevel: input.riskLevel,
      summary: input.summary,
      effects,
      ...(cleanup ? { cleanup } : {}),
    });
    if (accepted.isErr()) return err(accepted.error);

    const snapshot = accepted.value.toJSON();
    if (this.acceptedPlanStore.findById(snapshot.acceptedPlanId)) {
      return err(
        domainError.conflict(`Accepted connector plan ${snapshot.acceptedPlanId} already exists`, {
          acceptedPlanId: snapshot.acceptedPlanId,
        }),
      );
    }

    this.acceptedPlanStore.save(snapshot);
    return accepted.map((plan) => plan.toJSON());
  }
}

function actorLabel(context: ExecutionContext): string {
  return context.actor?.id ?? context.principal?.actorId ?? "system";
}
