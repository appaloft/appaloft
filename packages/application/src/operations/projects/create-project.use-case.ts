import {
  CreatedAt,
  DescriptionText,
  domainError,
  err,
  ok,
  Project,
  ProjectBySlugSpec,
  ProjectId,
  ProjectName,
  type Result,
  safeTry,
  UpsertProjectSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type EventBus,
  type IdGenerator,
  type ProjectRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type CreateProjectCommandInput } from "./create-project.command";

@injectable()
export class CreateProjectUseCase {
  constructor(
    @inject(tokens.projectRepository)
    private readonly projectRepository: ProjectRepository,
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
    input: CreateProjectCommandInput,
  ): Promise<Result<{ id: string }>> {
    const { clock, eventBus, idGenerator, logger, projectRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const projectId = yield* ProjectId.create(idGenerator.next("prj"));
      const createdAt = yield* CreatedAt.create(clock.now());
      const projectName = yield* ProjectName.create(input.name);
      const description = DescriptionText.fromOptional(input.description);

      const project = yield* Project.create({
        id: projectId,
        name: projectName,
        createdAt,
        ...(description ? { description } : {}),
      });

      const existing = await projectRepository.findOne(
        repositoryContext,
        ProjectBySlugSpec.create(project.toState().slug),
      );

      if (existing) {
        return err(domainError.conflict("Project slug already exists"));
      }

      await projectRepository.upsert(
        repositoryContext,
        project,
        UpsertProjectSpec.fromProject(project),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, project, undefined);

      return ok({ id: project.toState().id.value });
    });
  }
}
