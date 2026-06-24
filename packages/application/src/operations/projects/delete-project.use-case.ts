import {
  ArchivedAt,
  ArchiveReason,
  DeletedAt,
  domainError,
  EnvironmentByIdSpec,
  EnvironmentId,
  err,
  ok,
  ProjectByIdSpec,
  ProjectId,
  type Result,
  safeTry,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type EnvironmentRepository,
  type EventBus,
  type ProjectDeleteBlocker,
  type ProjectDeletionBlockerReader,
  type ProjectRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type DeleteProjectCommandInput } from "./delete-project.command";
import {
  activeProjectDeleteBlocker,
  buildProjectDeleteBlockers,
  uniqueProjectDeleteBlockerKinds,
} from "./project-delete-safety";

function deletionBlockedError(input: {
  projectId: string;
  lifecycleStatus: "active" | "archived";
  blockers: ProjectDeleteBlocker[];
}) {
  return domainError.projectDeleteBlocked("Project deletion is blocked by retained state", {
    phase: "project-lifecycle-guard",
    projectId: input.projectId,
    lifecycleStatus: input.lifecycleStatus,
    deletionBlockers: uniqueProjectDeleteBlockerKinds(input.blockers),
    ...(input.blockers.length === 1 && input.blockers[0]?.relatedEntityId
      ? { relatedEntityId: input.blockers[0].relatedEntityId }
      : {}),
    ...(input.blockers.length === 1 && input.blockers[0]?.relatedEntityType
      ? { relatedEntityType: input.blockers[0].relatedEntityType }
      : {}),
    ...(input.blockers.length === 1 && typeof input.blockers[0]?.count === "number"
      ? { blockerCount: input.blockers[0].count }
      : {}),
  });
}

function confirmationMismatchError(input: { projectId: string; confirmationProjectId: string }) {
  return domainError.validation("Project id confirmation does not match", {
    phase: "project-lifecycle-guard",
    projectId: input.projectId,
    expectedProjectId: input.projectId,
    actualProjectId: input.confirmationProjectId,
  });
}

function projectNotFound(projectId: string) {
  const error = domainError.notFound("project", projectId);
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      phase: "project-admission",
      projectId,
    },
  };
}

@injectable()
export class DeleteProjectUseCase {
  constructor(
    @inject(tokens.projectRepository)
    private readonly projectRepository: ProjectRepository,
    @inject(tokens.projectDeletionBlockerReader)
    private readonly deletionBlockerReader: ProjectDeletionBlockerReader,
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
    input: DeleteProjectCommandInput,
  ): Promise<Result<{ id: string }>> {
    const {
      clock,
      deletionBlockerReader,
      environmentRepository,
      eventBus,
      logger,
      projectRepository,
    } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const projectId = yield* ProjectId.create(input.projectId);
      const project = await projectRepository.findOne(
        repositoryContext,
        ProjectByIdSpec.create(projectId),
      );

      if (!project) {
        return err(projectNotFound(input.projectId));
      }

      const state = project.toState();
      if (state.lifecycleStatus.isDeleted()) {
        return ok({ id: projectId.value });
      }

      if (state.lifecycleStatus.isActive()) {
        return err(
          deletionBlockedError({
            projectId: projectId.value,
            lifecycleStatus: "active",
            blockers: [activeProjectDeleteBlocker(projectId.value)],
          }),
        );
      }

      const confirmationProjectId = yield* ProjectId.create(input.confirmation.projectId);
      if (!confirmationProjectId.equals(projectId)) {
        return err(
          confirmationMismatchError({
            projectId: projectId.value,
            confirmationProjectId: confirmationProjectId.value,
          }),
        );
      }

      const emptyEnvironmentArchiveCandidates =
        yield* await deletionBlockerReader.findEmptyEnvironmentArchiveCandidates(
          repositoryContext,
          {
            projectId: projectId.value,
          },
        );
      const autoArchiveReason = yield* ArchiveReason.create(
        "Auto-archived empty environment during project deletion",
      );
      for (const candidate of emptyEnvironmentArchiveCandidates) {
        const environmentId = yield* EnvironmentId.create(candidate.environmentId);
        const environment = await environmentRepository.findOne(
          repositoryContext,
          EnvironmentByIdSpec.create(environmentId),
        );

        if (!environment) {
          continue;
        }

        const environmentState = environment.toState();
        if (
          !environmentState.projectId.equals(projectId) ||
          environmentState.lifecycleStatus.isArchived() ||
          environmentState.variables.length > 0
        ) {
          continue;
        }

        const archivedAt = yield* ArchivedAt.create(clock.now());
        const archiveResult = yield* environment.archive({
          archivedAt,
          reason: autoArchiveReason,
        });
        if (!archiveResult.changed) {
          continue;
        }

        await environmentRepository.upsert(
          repositoryContext,
          environment,
          UpsertEnvironmentSpec.fromEnvironment(environment),
        );
        await publishDomainEventsAndReturn(context, eventBus, logger, environment, undefined);
      }

      const retainedBlockers = yield* await deletionBlockerReader.findBlockers(repositoryContext, {
        projectId: projectId.value,
      });
      const blockers = buildProjectDeleteBlockers({
        projectId: projectId.value,
        lifecycleStatus: "archived",
        retainedBlockers,
      });
      if (blockers.length > 0) {
        return err(
          deletionBlockedError({
            projectId: projectId.value,
            lifecycleStatus: "archived",
            blockers,
          }),
        );
      }

      const deletedAt = yield* DeletedAt.create(clock.now());
      const deleteResult = yield* project.delete({ deletedAt });
      if (!deleteResult.changed) {
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
