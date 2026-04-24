import {
  domainError,
  err,
  ok,
  ProjectByIdSpec,
  ProjectBySlugSpec,
  ProjectId,
  ProjectName,
  ProjectSlug,
  type Result,
  safeTry,
  UpdatedAt,
  UpsertProjectSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type AppLogger, type Clock, type EventBus, type ProjectRepository } from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type RenameProjectCommandInput } from "./rename-project.command";

@injectable()
export class RenameProjectUseCase {
  constructor(
    @inject(tokens.projectRepository)
    private readonly projectRepository: ProjectRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: RenameProjectCommandInput,
  ): Promise<Result<{ id: string }>> {
    const { clock, eventBus, logger, projectRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const projectId = yield* ProjectId.create(input.projectId);
      const projectName = yield* ProjectName.create(input.name);
      const nextSlug = yield* ProjectSlug.fromName(projectName);

      const project = await projectRepository.findOne(
        repositoryContext,
        ProjectByIdSpec.create(projectId),
      );

      if (!project) {
        return err(domainError.notFound("project", input.projectId));
      }

      const existing = await projectRepository.findOne(
        repositoryContext,
        ProjectBySlugSpec.create(nextSlug),
      );

      if (existing && !existing.toState().id.equals(projectId)) {
        return err(
          domainError.projectSlugConflict("Project slug already exists", {
            phase: "project-admission",
            projectId: projectId.value,
            projectSlug: nextSlug.value,
          }),
        );
      }

      const renamedAt = yield* UpdatedAt.create(clock.now());
      const renameResult = yield* project.rename({
        name: projectName,
        renamedAt,
      });

      if (!renameResult.changed) {
        return ok({ id: projectId.value });
      }

      await projectRepository.upsert(
        repositoryContext,
        project,
        UpsertProjectSpec.fromProject(project),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, project, undefined);

      return ok({ id: projectId.value });
    });
  }
}
