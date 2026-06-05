import {
  ArchivedAt,
  type Deployment,
  DeploymentByIdSpec,
  DeploymentId,
  domainError,
  err,
  ok,
  type Result,
  UpsertDeploymentSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type AppLogger, type Clock, type DeploymentRepository, type EventBus } from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import {
  type ArchiveDeploymentCommandInput,
  type ArchiveDeploymentResponse,
} from "./archive-deployment.command";

function archiveInfraError(
  message: string,
  input: {
    deploymentId: string;
    phase: string;
    error?: unknown;
  },
) {
  return domainError.infra(message, {
    commandName: "deployments.archive",
    deploymentId: input.deploymentId,
    phase: input.phase,
    ...(input.error instanceof Error && input.error.message
      ? { message: input.error.message }
      : {}),
    ...(!(input.error instanceof Error) && input.error !== undefined
      ? { message: String(input.error) }
      : {}),
  });
}

@injectable()
export class ArchiveDeploymentUseCase {
  constructor(
    @inject(tokens.deploymentRepository)
    private readonly deploymentRepository: DeploymentRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ArchiveDeploymentCommandInput,
  ): Promise<Result<ArchiveDeploymentResponse>> {
    const repositoryContext = toRepositoryContext(context);
    const deploymentId = input.deploymentId.trim();

    if (input.confirm.trim() !== deploymentId) {
      return err(
        domainError.validation("Deployment archive confirmation must match the deployment id", {
          commandName: "deployments.archive",
          phase: "command-validation",
          deploymentId,
        }),
      );
    }

    const idResult = DeploymentId.create(deploymentId);
    if (idResult.isErr()) {
      return err(idResult.error);
    }

    let deployment: Deployment | null;
    try {
      deployment = await this.deploymentRepository.findOne(
        repositoryContext,
        DeploymentByIdSpec.create(idResult.value),
      );
    } catch (error) {
      return err(
        archiveInfraError("Deployment could not be read for archive", {
          deploymentId,
          phase: "deployment-archive-read",
          error,
        }),
      );
    }

    if (!deployment) {
      return err(domainError.notFound("deployment", deploymentId));
    }

    const state = deployment.toState();

    if (input.resourceId && input.resourceId !== state.resourceId.value) {
      return err(
        domainError.resourceContextMismatch(
          "Deployment does not belong to the requested resource",
          {
            commandName: "deployments.archive",
            deploymentId,
            resourceId: input.resourceId,
            actualResourceId: state.resourceId.value,
          },
        ),
      );
    }

    const archivedAtResult = ArchivedAt.create(this.clock.now());
    if (archivedAtResult.isErr()) {
      return err(archivedAtResult.error);
    }

    const archiveResult = deployment.archive(archivedAtResult.value);
    if (archiveResult.isErr()) {
      return err(archiveResult.error);
    }

    let persistResult: Result<void>;
    try {
      persistResult = await this.deploymentRepository.updateOne(
        repositoryContext,
        deployment,
        UpsertDeploymentSpec.fromDeployment(deployment),
      );
    } catch (error) {
      return err(
        archiveInfraError("Deployment archive could not be persisted", {
          deploymentId,
          phase: "deployment-archive-persist",
          error,
        }),
      );
    }
    if (persistResult.isErr()) {
      return err(persistResult.error);
    }

    try {
      return ok(
        await publishDomainEventsAndReturn(context, this.eventBus, this.logger, deployment, {
          id: deploymentId,
          archivedAt: archivedAtResult.value.value,
        }),
      );
    } catch (error) {
      return err(
        archiveInfraError("Deployment archive event publication failed", {
          deploymentId,
          phase: "deployment-archive-events",
          error,
        }),
      );
    }
  }
}
