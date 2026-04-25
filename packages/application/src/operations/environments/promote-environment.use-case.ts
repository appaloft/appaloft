import {
  CreatedAt,
  domainError,
  EnvironmentByIdSpec,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  err,
  ok,
  type Result,
  safeTry,
  UpsertEnvironmentSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type EnvironmentRepository,
  type EventBus,
  type IdGenerator,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type PromoteEnvironmentCommandInput } from "./promote-environment.command";

@injectable()
export class PromoteEnvironmentUseCase {
  constructor(
    @inject(tokens.environmentRepository)
    private readonly environmentRepository: EnvironmentRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: PromoteEnvironmentCommandInput,
  ): Promise<Result<{ id: string }>> {
    const { clock, environmentRepository, eventBus, idGenerator, logger } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const sourceEnvironmentId = yield* EnvironmentId.create(input.environmentId);
      const source = await environmentRepository.findOne(
        repositoryContext,
        EnvironmentByIdSpec.create(sourceEnvironmentId),
      );

      if (!source) {
        return err(domainError.notFound("environment", input.environmentId));
      }

      const targetEnvironmentId = yield* EnvironmentId.create(idGenerator.next("env"));
      const targetName = yield* EnvironmentName.create(input.targetName);
      const targetKind = yield* EnvironmentKindValue.create(input.targetKind);
      const createdAt = yield* CreatedAt.create(clock.now());

      const promoted = yield* source.promoteTo({
        targetEnvironmentId,
        targetName,
        targetKind,
        createdAt,
      });

      await environmentRepository.upsert(
        repositoryContext,
        promoted,
        UpsertEnvironmentSpec.fromEnvironment(promoted),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, promoted, undefined);

      return ok({ id: promoted.toState().id.value });
    });
  }
}
