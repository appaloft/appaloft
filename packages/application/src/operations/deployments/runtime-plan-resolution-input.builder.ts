import {
  type EnvironmentSnapshot,
  GeneratedAt,
  ok,
  type Result,
  RuntimePlanId,
  type Server,
  type SourceDescriptor,
  safeTry,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import {
  type Clock,
  type IdGenerator,
  type RequestedDeploymentConfig,
  type RuntimePlanResolver,
} from "../../ports";
import { tokens } from "../../tokens";

type RuntimePlanResolutionInput = Parameters<RuntimePlanResolver["resolve"]>[1];

@injectable()
export class RuntimePlanResolutionInputBuilder {
  constructor(
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
  ) {}

  build(input: {
    source: SourceDescriptor;
    server: Server;
    environmentSnapshot: EnvironmentSnapshot;
    detectedReasoning: string[];
    requestedDeployment: RequestedDeploymentConfig;
  }): Result<RuntimePlanResolutionInput> {
    const { clock, idGenerator } = this;

    return safeTry(function* () {
      const runtimePlanId = yield* RuntimePlanId.create(idGenerator.next("plan"));
      const generatedAt = yield* GeneratedAt.create(clock.now());

      return ok({
        id: runtimePlanId.value,
        source: input.source,
        server: input.server.toState(),
        environmentSnapshot: input.environmentSnapshot,
        detectedReasoning: input.detectedReasoning,
        requestedDeployment: input.requestedDeployment,
        generatedAt: generatedAt.value,
      });
    });
  }
}
