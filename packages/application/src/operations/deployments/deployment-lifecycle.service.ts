import { type Deployment, ok, type Result, StartedAt, safeTry } from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { type Clock } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class DeploymentLifecycleService {
  constructor(
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  prepareForExecution(deployment: Deployment): Result<void> {
    const { clock } = this;

    return safeTry(function* () {
      const planningAt = yield* StartedAt.create(clock.now());
      const markPlanningResult = deployment.markPlanning(planningAt);
      yield* markPlanningResult;

      const plannedAt = yield* StartedAt.create(clock.now());
      const markPlannedResult = deployment.markPlanned(plannedAt);
      yield* markPlannedResult;

      return ok(undefined);
    });
  }

  startExecution(deployment: Deployment): Result<void> {
    const { clock } = this;

    return safeTry(function* () {
      const startedAt = yield* StartedAt.create(clock.now());
      const startResult = deployment.start(startedAt);
      yield* startResult;
      return ok(undefined);
    });
  }
}
