import {
  DeploymentByIdSpec,
  DeploymentId,
  domainError,
  err,
  ok,
  type Result,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { createCoordinationOwner, mutationCoordinationPolicies } from "../../mutation-coordination";
import {
  type DeploymentRepository,
  type ExecutionBackend,
  type MutationCoordinator,
} from "../../ports";
import { tokens } from "../../tokens";
import {
  type CleanupDeploymentRuntimeCommandInput,
  type CleanupDeploymentRuntimeResponse,
} from "./cleanup-deployment-runtime.command";
import { deploymentResourceRuntimeScopeForIds } from "./deployment-mutation-scopes";
import { requireServerBackedDeploymentState } from "./deployment-target-guards";

@injectable()
export class CleanupDeploymentRuntimeUseCase {
  constructor(
    @inject(tokens.deploymentRepository)
    private readonly deploymentRepository: DeploymentRepository,
    @inject(tokens.executionBackend)
    private readonly executionBackend: ExecutionBackend,
    @inject(tokens.mutationCoordinator)
    private readonly mutationCoordinator: MutationCoordinator,
  ) {}

  async execute(
    context: ExecutionContext,
    input: CleanupDeploymentRuntimeCommandInput,
  ): Promise<Result<CleanupDeploymentRuntimeResponse>> {
    if (input.confirm.trim() !== input.deploymentId.trim()) {
      return err(
        domainError.validation(
          "Deployment runtime cleanup confirmation must match the deployment id",
          {
            commandName: "deployments.cleanup-runtime",
            phase: "command-validation",
            deploymentId: input.deploymentId,
          },
        ),
      );
    }

    const deploymentId = DeploymentId.create(input.deploymentId);
    if (deploymentId.isErr()) return err(deploymentId.error);
    const repositoryContext = toRepositoryContext(context);
    const deployment = await this.deploymentRepository.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(deploymentId.value),
    );
    if (!deployment) return err(domainError.notFound("deployment", input.deploymentId));
    const state = deployment.toState();
    if (input.resourceId && input.resourceId !== state.resourceId.value) {
      return err(
        domainError.resourceContextMismatch(
          "Deployment does not belong to the requested resource",
          {
            commandName: "deployments.cleanup-runtime",
            deploymentId: state.id.value,
            expectedResourceId: input.resourceId,
            actualResourceId: state.resourceId.value,
          },
        ),
      );
    }
    const serverBacked = requireServerBackedDeploymentState(
      deployment,
      "deployments.cleanup-runtime",
    );
    if (serverBacked.isErr()) return err(serverBacked.error);

    return this.mutationCoordinator.runExclusive({
      context,
      policy: mutationCoordinationPolicies.cancelDeployment,
      scope: deploymentResourceRuntimeScopeForIds({
        resourceId: state.resourceId.value,
        serverId: serverBacked.value.serverId.value,
        destinationId: serverBacked.value.destinationId.value,
      }),
      owner: createCoordinationOwner(context, "deployments.cleanup-runtime"),
      work: async () => {
        const cleaned = await this.executionBackend.cancel(context, deployment);
        return cleaned.isErr()
          ? err(cleaned.error)
          : ok({ id: state.id.value, runtimeCleaned: true as const });
      },
    });
  }
}
