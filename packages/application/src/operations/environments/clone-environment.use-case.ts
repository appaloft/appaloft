import {
  CreatedAt,
  domainError,
  EnvironmentByIdSpec,
  EnvironmentByProjectAndNameSpec,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  err,
  ok,
  ProjectByIdSpec,
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
  type ProjectRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type CloneEnvironmentCommandInput } from "./clone-environment.command";

@injectable()
export class CloneEnvironmentUseCase {
  constructor(
    @inject(tokens.projectRepository)
    private readonly projectRepository: ProjectRepository,
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
    input: CloneEnvironmentCommandInput,
  ): Promise<Result<{ id: string }>> {
    const { clock, environmentRepository, eventBus, idGenerator, logger, projectRepository } = this;
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

      const sourceState = source.toState();
      const sourceProject = await projectRepository.findOne(
        repositoryContext,
        ProjectByIdSpec.create(sourceState.projectId),
      );

      if (!sourceProject) {
        return err(domainError.notFound("project", sourceState.projectId.value));
      }

      yield* sourceProject.ensureCanAcceptMutation("environments.clone");
      yield* source.ensureCanClone();

      const targetName = yield* EnvironmentName.create(input.targetName);
      const existing = await environmentRepository.findOne(
        repositoryContext,
        EnvironmentByProjectAndNameSpec.create(sourceState.projectId, targetName),
      );

      if (existing) {
        return err(domainError.conflict("Environment name already exists for this project"));
      }

      const targetEnvironmentId = yield* EnvironmentId.create(idGenerator.next("env"));
      const targetKind = input.targetKind
        ? yield* EnvironmentKindValue.create(input.targetKind)
        : undefined;
      const createdAt = yield* CreatedAt.create(clock.now());

      const cloned = yield* source.cloneTo({
        targetEnvironmentId,
        targetName,
        ...(targetKind ? { targetKind } : {}),
        createdAt,
      });

      await environmentRepository.upsert(
        repositoryContext,
        cloned,
        UpsertEnvironmentSpec.fromEnvironment(cloned),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, cloned, undefined);

      return ok({ id: cloned.toState().id.value });
    });
  }
}
