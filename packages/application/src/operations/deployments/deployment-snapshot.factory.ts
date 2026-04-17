import {
  type EnvironmentProfile,
  type EnvironmentSnapshot,
  EnvironmentSnapshotId,
  GeneratedAt,
  ok,
  type Result,
  safeTry,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type Clock, type IdGenerator } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class DeploymentSnapshotFactory {
  constructor(
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
  ) {}

  create(environment: EnvironmentProfile): Result<EnvironmentSnapshot> {
    const { clock, idGenerator } = this;

    return safeTry(function* () {
      const snapshotId = yield* EnvironmentSnapshotId.create(idGenerator.next("snap"));
      const generatedAt = yield* GeneratedAt.create(clock.now());

      return ok(
        environment.materializeSnapshot({
          snapshotId,
          createdAt: generatedAt,
        }),
      );
    });
  }
}
