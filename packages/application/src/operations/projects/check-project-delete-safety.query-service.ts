import {
  type DomainError,
  domainError,
  err,
  ok,
  ProjectByIdSpec,
  ProjectId,
  type Result,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type ProjectDeleteSafety,
  type ProjectDeletionBlockerReader,
  type ProjectReadModel,
} from "../../ports";
import { tokens } from "../../tokens";
import { type CheckProjectDeleteSafetyQuery } from "./check-project-delete-safety.query";
import { buildProjectDeleteBlockers } from "./project-delete-safety";

function withDeleteCheckDetails(error: DomainError, details: Record<string, string>): DomainError {
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      queryName: "projects.delete-check",
      ...details,
    },
  };
}

function projectReadNotFound(projectId: string): DomainError {
  return withDeleteCheckDetails(domainError.notFound("project", projectId), {
    phase: "project-read",
    projectId,
  });
}

function deleteCheckInfraError(projectId: string, error: unknown): DomainError {
  return domainError.infra("Project delete safety could not be assembled", {
    queryName: "projects.delete-check",
    phase: "project-delete-check-read",
    projectId,
    reason: error instanceof Error ? error.message : "unknown",
  });
}

@injectable()
export class CheckProjectDeleteSafetyQueryService {
  constructor(
    @inject(tokens.projectReadModel)
    private readonly projectReadModel: ProjectReadModel,
    @inject(tokens.projectDeletionBlockerReader)
    private readonly blockerReader: ProjectDeletionBlockerReader,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: CheckProjectDeleteSafetyQuery,
  ): Promise<Result<ProjectDeleteSafety>> {
    const projectIdResult = ProjectId.create(query.projectId);
    if (projectIdResult.isErr()) {
      return err(
        withDeleteCheckDetails(projectIdResult.error, {
          phase: "query-validation",
          projectId: query.projectId,
        }),
      );
    }

    const repositoryContext = toRepositoryContext(context);

    try {
      const project = await this.projectReadModel.findOne(
        repositoryContext,
        ProjectByIdSpec.create(projectIdResult.value),
      );
      if (!project) {
        return err(projectReadNotFound(query.projectId));
      }

      const blockerResult = await this.blockerReader.findBlockers(repositoryContext, {
        projectId: projectIdResult.value.value,
      });
      if (blockerResult.isErr()) {
        return err(blockerResult.error);
      }

      const blockers = buildProjectDeleteBlockers({
        projectId: project.id,
        lifecycleStatus: project.lifecycleStatus,
        retainedBlockers: blockerResult.value,
      });

      return ok({
        schemaVersion: "projects.delete-check/v1",
        projectId: project.id,
        lifecycleStatus: project.lifecycleStatus,
        eligible: project.lifecycleStatus === "archived" && blockers.length === 0,
        blockers,
        checkedAt: this.clock.now(),
      });
    } catch (error) {
      return err(deleteCheckInfraError(query.projectId, error));
    }
  }
}
