import {
  domainError,
  EnvironmentByIdSpec,
  EnvironmentByProjectAndNameSpec,
  EnvironmentId,
  EnvironmentName,
  err,
  ok,
  type Result,
  safeTry,
  UpdatedAt,
  UpsertEnvironmentSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type AppLogger, type Clock, type EnvironmentRepository, type EventBus } from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type RenameEnvironmentCommandInput } from "./rename-environment.command";

@injectable()
export class RenameEnvironmentUseCase {
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
    input: RenameEnvironmentCommandInput,
  ): Promise<Result<{ id: string }>> {
    const { clock, environmentRepository, eventBus, logger } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const environmentId = yield* EnvironmentId.create(input.environmentId);
      const name = yield* EnvironmentName.create(input.name);
      const environment = await environmentRepository.findOne(
        repositoryContext,
        EnvironmentByIdSpec.create(environmentId),
      );

      if (!environment) {
        return err(domainError.notFound("environment", input.environmentId));
      }

      const state = environment.toState();
      yield* environment.ensureCanRename();

      const existing = await environmentRepository.findOne(
        repositoryContext,
        EnvironmentByProjectAndNameSpec.create(state.projectId, name),
      );

      if (existing && !existing.toState().id.equals(environmentId)) {
        return err(
          domainError.conflict("Environment name already exists for this project", {
            phase: "environment-admission",
            environmentId: environmentId.value,
            projectId: state.projectId.value,
            environmentName: name.value,
          }),
        );
      }

      const renamedAt = yield* UpdatedAt.create(clock.now());
      const renameResult = yield* environment.rename({
        name,
        renamedAt,
      });

      if (!renameResult.changed) {
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
