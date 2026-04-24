import {
  type EnvironmentProfile,
  type EnvironmentSnapshot,
  EnvironmentSnapshotId,
  GeneratedAt,
  ok,
  type Resource,
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

  create(environment: EnvironmentProfile, resource?: Resource): Result<EnvironmentSnapshot> {
    const { clock, idGenerator } = this;

    return safeTry(function* () {
      const snapshotId = yield* EnvironmentSnapshotId.create(idGenerator.next("snap"));
      const generatedAt = yield* GeneratedAt.create(clock.now());
      const inherited = environment.materializeSnapshot({
        snapshotId,
        createdAt: generatedAt,
      });

      return ok(
        resource
          ? resource.materializeEffectiveEnvironmentSnapshot({
              environmentId: environment.toState().id,
              snapshotId,
              createdAt: generatedAt,
              inherited: inherited.toState().variables,
            })
          : inherited,
      );
    });
  }
}
