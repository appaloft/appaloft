import { type Deployment, GeneratedAt, type Result, RollbackPlanId, safeTry } from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { type Clock, type IdGenerator } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class RollbackPlanFactory {
  constructor(
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
  ) {}

  create(
    deployment: Deployment,
  ): Result<ReturnType<Deployment["createRollbackPlan"]> extends Result<infer T> ? T : never> {
    const { clock, idGenerator } = this;

    return safeTry(function* () {
      const rollbackPlanId = yield* RollbackPlanId.create(idGenerator.next("rbk"));
      const generatedAt = yield* GeneratedAt.create(clock.now());

      return deployment.createRollbackPlan({
        id: rollbackPlanId,
        generatedAt,
      });
    });
  }
}
