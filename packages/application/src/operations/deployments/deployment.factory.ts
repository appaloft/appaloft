import {
  CreatedAt,
  Deployment,
  type Deployment as DeploymentAggregate,
  DeploymentId,
  type Destination,
  type EnvironmentProfile,
  type EnvironmentSnapshot,
  type Project,
  type Resource,
  type Result,
  type RuntimePlan,
  type Server,
  safeTry,
} from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { type Clock, type IdGenerator } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class DeploymentFactory {
  constructor(
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
  ) {}

  create(input: {
    project: Project;
    server: Server;
    destination: Destination;
    environment: EnvironmentProfile;
    resource: Resource;
    runtimePlan: RuntimePlan;
    environmentSnapshot: EnvironmentSnapshot;
  }): Result<DeploymentAggregate> {
    const { clock, idGenerator } = this;

    return safeTry(function* () {
      const deploymentId = yield* DeploymentId.create(idGenerator.next("dep"));
      const createdAt = yield* CreatedAt.create(clock.now());

      return Deployment.create({
        id: deploymentId,
        projectId: input.project.toState().id,
        serverId: input.server.toState().id,
        destinationId: input.destination.toState().id,
        environmentId: input.environment.toState().id,
        resourceId: input.resource.toState().id,
        runtimePlan: input.runtimePlan,
        environmentSnapshot: input.environmentSnapshot,
        createdAt,
      });
    });
  }

  createRollback(input: {
    deployment: DeploymentAggregate;
    rollbackOfDeploymentId: DeploymentId;
  }): Result<DeploymentAggregate> {
    const { clock, idGenerator } = this;
    const state = input.deployment.toState();

    return safeTry(function* () {
      const deploymentId = yield* DeploymentId.create(idGenerator.next("dep"));
      const createdAt = yield* CreatedAt.create(clock.now());

      return Deployment.create({
        id: deploymentId,
        projectId: state.projectId,
        serverId: state.serverId,
        destinationId: state.destinationId,
        environmentId: state.environmentId,
        resourceId: state.resourceId,
        runtimePlan: state.runtimePlan,
        environmentSnapshot: state.environmentSnapshot,
        createdAt,
        rollbackOfDeploymentId: input.rollbackOfDeploymentId,
      });
    });
  }
}
