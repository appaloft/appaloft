import {
  ConfigKey,
  ConfigScopeValue,
  domainError,
  EnvironmentByIdSpec,
  EnvironmentId,
  err,
  ok,
  type Result,
  safeTry,
  UpdatedAt,
  UpsertEnvironmentSpec,
  VariableExposureValue,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type AppLogger, type Clock, type EnvironmentRepository, type EventBus } from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type UnsetEnvironmentVariableCommandInput } from "./unset-environment-variable.command";

@injectable()
export class UnsetEnvironmentVariableUseCase {
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
    input: UnsetEnvironmentVariableCommandInput,
  ): Promise<Result<void>> {
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

      const key = yield* ConfigKey.create(input.key);
      const exposure = yield* VariableExposureValue.create(input.exposure);

      let scope: ConfigScopeValue | undefined;
      if (input.scope) {
        scope = yield* ConfigScopeValue.create(input.scope);
      }

      const updatedAt = yield* UpdatedAt.create(clock.now());
      yield* environment.unsetVariable({
        key,
        exposure,
        ...(scope ? { scope } : {}),
        updatedAt,
      });

      await environmentRepository.upsert(
        repositoryContext,
        environment,
        UpsertEnvironmentSpec.fromEnvironment(environment),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, environment, undefined);
      return ok(undefined);
    });
  }
}
