import {
  DeploymentByIdSpec,
  DeploymentId,
  DeploymentLogEntry,
  DeploymentLogSourceValue,
  DeploymentPhaseValue,
  domainError,
  err,
  FinishedAt,
  LogLevelValue,
  MessageText,
  OccurredAt,
  ok,
  type Result,
  safeTry,
  UpsertDeploymentSpec,
} from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type DeploymentRepository,
  type EventBus,
  type ExecutionBackend,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";

function cancellationLog(timestamp: string, reason?: string): DeploymentLogEntry {
  return DeploymentLogEntry.rehydrate({
    timestamp: OccurredAt.rehydrate(timestamp),
    source: DeploymentLogSourceValue.rehydrate("yundu"),
    phase: DeploymentPhaseValue.rehydrate("deploy"),
    level: LogLevelValue.rehydrate("warn"),
    message: MessageText.rehydrate(
      reason ? `Deployment canceled: ${reason}` : "Deployment canceled",
    ),
  });
}

@injectable()
export class CancelDeploymentUseCase {
  constructor(
    @inject(tokens.deploymentRepository)
    private readonly deploymentRepository: DeploymentRepository,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.executionBackend)
    private readonly executionBackend: ExecutionBackend,
  ) {}

  async execute(
    context: ExecutionContext,
    input: {
      deploymentId: string;
      reason?: string;
    },
  ): Promise<Result<{ id: string; status: "canceled" }>> {
    const { clock, deploymentRepository, eventBus, executionBackend, logger } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const deploymentId = yield* DeploymentId.create(input.deploymentId);
      const deployment = await deploymentRepository.findOne(
        repositoryContext,
        DeploymentByIdSpec.create(deploymentId),
      );

      if (!deployment) {
        return err(domainError.notFound("deployment", input.deploymentId));
      }

      const status = deployment.toState().status.value;
      if (status === "canceled") {
        return ok({ id: input.deploymentId, status: "canceled" as const });
      }

      const canceledAtValue = clock.now();
      const canceledAt = yield* FinishedAt.create(canceledAtValue);
      const backendCancellationResult = await executionBackend.cancel(context, deployment);
      const backendCancellation = yield* backendCancellationResult;
      const cancelResult = deployment.cancel(canceledAt, [
        ...backendCancellation.logs,
        cancellationLog(canceledAtValue, input.reason),
      ]);
      yield* cancelResult;

      await deploymentRepository.upsert(
        repositoryContext,
        deployment,
        UpsertDeploymentSpec.fromDeployment(deployment),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, deployment, undefined);

      return ok({ id: input.deploymentId, status: "canceled" as const });
    });
  }
}
