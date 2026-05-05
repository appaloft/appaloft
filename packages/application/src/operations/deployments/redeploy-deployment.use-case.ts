import {
  DeploymentByIdSpec,
  DeploymentId,
  DeploymentTriggerKindValue,
  domainError,
  err,
  ok,
  type Result,
  safeTry,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type DeploymentRepository } from "../../ports";
import { tokens } from "../../tokens";
import { type CreateDeploymentUseCase } from "./create-deployment.use-case";
import { type RedeployDeploymentCommandInput } from "./redeploy-deployment.command";

function stateTimestamp(input: {
  createdAt: { value: string };
  startedAt?: { value: string };
  finishedAt?: { value: string };
}): string {
  return input.finishedAt?.value ?? input.startedAt?.value ?? input.createdAt.value;
}

@injectable()
export class RedeployDeploymentUseCase {
  constructor(
    @inject(tokens.deploymentRepository)
    private readonly deploymentRepository: DeploymentRepository,
    @inject(tokens.createDeploymentUseCase)
    private readonly createDeploymentUseCase: CreateDeploymentUseCase,
  ) {}

  async execute(
    context: ExecutionContext,
    input: RedeployDeploymentCommandInput,
  ): Promise<Result<{ id: string }>> {
    const repositoryContext = toRepositoryContext(context);
    const { createDeploymentUseCase, deploymentRepository } = this;

    return safeTry(async function* () {
      const sourceDeployment = input.sourceDeploymentId
        ? await deploymentRepository.findOne(
            repositoryContext,
            DeploymentByIdSpec.create(DeploymentId.rehydrate(input.sourceDeploymentId)),
          )
        : null;

      if (input.sourceDeploymentId && !sourceDeployment) {
        return err(domainError.notFound("deployment", input.sourceDeploymentId));
      }

      const sourceState = sourceDeployment?.toState();
      if (sourceState && sourceState.resourceId.value !== input.resourceId) {
        return err(
          domainError.resourceContextMismatch(
            "Source deployment does not belong to the requested resource",
            {
              commandName: "deployments.redeploy",
              phase: "deployment-resource-context",
              deploymentId: sourceState.id.value,
              expectedResourceId: input.resourceId,
              actualResourceId: sourceState.resourceId.value,
            },
          ),
        );
      }

      if (
        sourceState &&
        input.readinessGeneratedAt &&
        input.readinessGeneratedAt < stateTimestamp(sourceState)
      ) {
        return err(
          domainError.deploymentRecoveryStateStale("Deployment recovery readiness is stale", {
            commandName: "deployments.redeploy",
            phase: "redeploy-admission",
            deploymentId: sourceState.id.value,
            resourceId: sourceState.resourceId.value,
            readinessGeneratedAt: input.readinessGeneratedAt,
            currentStateTimestamp: stateTimestamp(sourceState),
          }),
        );
      }

      if (!sourceState && (!input.projectId || !input.environmentId || !input.serverId)) {
        return err(
          domainError.deploymentNotRedeployable(
            "Redeploy requires project, environment, and server context or a source deployment",
            {
              commandName: "deployments.redeploy",
              phase: "redeploy-admission",
              resourceId: input.resourceId,
              causeCode: "deployment_context_missing",
            },
          ),
        );
      }

      const result = yield* await createDeploymentUseCase.execute(
        context,
        {
          projectId: input.projectId ?? sourceState?.projectId.value ?? "",
          environmentId: input.environmentId ?? sourceState?.environmentId.value ?? "",
          serverId: input.serverId ?? sourceState?.serverId.value ?? "",
          resourceId: input.resourceId,
          ...(input.destinationId || sourceState?.destinationId
            ? { destinationId: input.destinationId ?? sourceState?.destinationId.value }
            : {}),
        },
        {
          triggerKind: DeploymentTriggerKindValue.redeploy(),
          ...(sourceState ? { sourceDeploymentId: sourceState.id.value } : {}),
          ownerLabel: "deployments.redeploy",
        },
      );

      return ok(result);
    });
  }
}
