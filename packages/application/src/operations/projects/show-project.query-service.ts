import {
  type DomainError,
  domainError,
  err,
  ok,
  ProjectByIdSpec,
  ProjectId,
  type Result,
  safeTry,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { findOperationCatalogEntryByKey } from "../../operation-catalog";
import { checkOperationGuards } from "../../operation-guard";
import {
  AllowAllOperationGuardPort,
  type OperationGuardPort,
  type ProjectReadModel,
  type ProjectSummary,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ShowProjectQuery } from "./show-project.query";

const showProjectOperation = findOperationCatalogEntryByKey("projects.show");
const defaultOperationGuardPort = new AllowAllOperationGuardPort();

function withShowProjectDetails(
  error: DomainError,
  details: Record<string, string | number | boolean | null>,
): DomainError {
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      queryName: "projects.show",
      ...details,
    },
  };
}

@injectable()
export class ShowProjectQueryService {
  constructor(
    @inject(tokens.projectReadModel) private readonly readModel: ProjectReadModel,
    @inject(tokens.operationGuardPort)
    private readonly operationGuardPort?: OperationGuardPort,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ShowProjectQuery,
  ): Promise<Result<ProjectSummary>> {
    const { operationGuardPort, readModel } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const projectId = yield* ProjectId.create(query.projectId);
      const project = await readModel.findOne(repositoryContext, ProjectByIdSpec.create(projectId));

      if (!project) {
        return err(
          withShowProjectDetails(domainError.notFound("project", query.projectId), {
            phase: "project-read",
            projectId: query.projectId,
          }),
        );
      }

      if (showProjectOperation) {
        const checked = await checkOperationGuards({
          context,
          entry: showProjectOperation,
          message: query,
          operationGuardPort: operationGuardPort ?? defaultOperationGuardPort,
          ...(project.organizationId ? { organizationId: project.organizationId } : {}),
          resourceRefs: {
            projectId: query.projectId,
          },
        });
        if (checked.isErr()) {
          return err(checked.error);
        }
      }

      return ok(project);
    });
  }
}
