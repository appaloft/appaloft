import {
  ArchivedAt,
  ArchiveReason,
  domainError,
  EnvironmentByIdSpec,
  EnvironmentId,
  err,
  ok,
  type Result,
  safeTry,
  UpsertEnvironmentSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type AppLogger, type Clock, type EnvironmentRepository, type EventBus } from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type ArchiveEnvironmentCommandInput } from "./archive-environment.command";

@injectable()
export class ArchiveEnvironmentUseCase {
  constructor(
    @inject(tokens.environmentRepository)
    private readonly environmentRepository: EnvironmentRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ArchiveEnvironmentCommandInput,
  ): Promise<Result<{ id: string }>> {
    const { clock, environmentRepository, eventBus, logger } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const environmentId = yield* EnvironmentId.create(input.environmentId);
      const environment = await environmentRepository.findOne(
        repositoryContext,
        EnvironmentByIdSpec.create(environmentId),
      );

      if (!environment) {
        return err(domainError.notFound("environment", input.environmentId));
      }

      const reason = yield* ArchiveReason.fromOptional(input.reason);
      const archivedAt = yield* ArchivedAt.create(clock.now());
      const archiveResult = yield* environment.archive({
        archivedAt,
        ...(reason ? { reason } : {}),
      });

      if (!archiveResult.changed) {
        return ok({ id: environmentId.value });
      }

      await environmentRepository.upsert(
        repositoryContext,
        environment,
        UpsertEnvironmentSpec.fromEnvironment(environment),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, environment, undefined);

      return ok({ id: environmentId.value });
    });
  }
}
