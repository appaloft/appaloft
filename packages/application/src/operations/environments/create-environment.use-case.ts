import {
  CreatedAt,
  domainError,
  EnvironmentByProjectAndNameSpec,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  EnvironmentProfile,
  err,
  ok,
  ProjectByIdSpec,
  ProjectId,
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
import { type CreateEnvironmentCommandInput } from "./create-environment.command";

@injectable()
export class CreateEnvironmentUseCase {
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
    input: CreateEnvironmentCommandInput,
  ): Promise<Result<{ id: string }>> {
    const { clock, environmentRepository, eventBus, idGenerator, logger, projectRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const projectId = yield* ProjectId.create(input.projectId);
      const environmentName = yield* EnvironmentName.create(input.name);
      const environmentKind = yield* EnvironmentKindValue.create(input.kind);

      const project = await projectRepository.findOne(
        repositoryContext,
        ProjectByIdSpec.create(projectId),
      );

      if (!project) {
        return err(domainError.notFound("project", input.projectId));
      }

      yield* project.ensureCanAcceptMutation("environments.create");

      const existing = await environmentRepository.findOne(
        repositoryContext,
        EnvironmentByProjectAndNameSpec.create(projectId, environmentName),
      );

      if (existing) {
        return err(domainError.conflict("Environment name already exists for this project"));
      }

      const environmentId = yield* EnvironmentId.create(idGenerator.next("env"));
      const createdAt = yield* CreatedAt.create(clock.now());

      let parentEnvironmentId: EnvironmentId | undefined;
      if (input.parentEnvironmentId) {
        parentEnvironmentId = yield* EnvironmentId.create(input.parentEnvironmentId);
      }

      const environment = yield* EnvironmentProfile.create({
        id: environmentId,
        projectId,
        name: environmentName,
        kind: environmentKind,
        createdAt,
        ...(parentEnvironmentId ? { parentEnvironmentId } : {}),
      });

      await environmentRepository.upsert(
        repositoryContext,
        environment,
        UpsertEnvironmentSpec.fromEnvironment(environment),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, environment, undefined);
      return ok({ id: environment.toState().id.value });
    });
  }
}
