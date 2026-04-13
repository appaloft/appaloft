import {
  type EnvironmentSnapshot,
  GeneratedAt,
  ok,
  type Result,
  RuntimePlanId,
  type Server,
  type SourceDescriptor,
  safeTry,
} from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { type Clock, type IdGenerator, type RuntimePlanResolver } from "../../ports";
import { tokens } from "../../tokens";
import { type CreateDeploymentCommandInput } from "./create-deployment.command";

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
    command: CreateDeploymentCommandInput;
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
        requestedDeployment: {
          method: input.command.deploymentMethod ?? "auto",
          ...(input.command.installCommand ? { installCommand: input.command.installCommand } : {}),
          ...(input.command.buildCommand ? { buildCommand: input.command.buildCommand } : {}),
          ...(input.command.startCommand ? { startCommand: input.command.startCommand } : {}),
          ...(input.command.port ? { port: input.command.port } : {}),
          ...(input.command.healthCheckPath
            ? { healthCheckPath: input.command.healthCheckPath }
            : {}),
          ...(input.command.proxyKind ? { proxyKind: input.command.proxyKind } : {}),
          ...(input.command.domains ? { domains: input.command.domains } : {}),
          ...(input.command.pathPrefix ? { pathPrefix: input.command.pathPrefix } : {}),
          ...(input.command.tlsMode ? { tlsMode: input.command.tlsMode } : {}),
        },
        generatedAt: generatedAt.value,
      });
    });
  }
}
