import {
  defaultSelfHostedOrganizationId,
  domainError,
  err,
  ok,
  ProjectByIdSpec,
  ProjectDisplayOrder,
  ProjectId,
  type Result,
  safeTry,
  UpdatedAt,
  UpsertProjectSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { findOperationCatalogEntryByKey } from "../../operation-catalog";
import { checkOperationGuards } from "../../operation-guard";
import {
  AllowAllOperationGuardPort,
  type AppLogger,
  type Clock,
  type EventBus,
  type OperationGuardPort,
  type ProjectRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type ReorderProjectsCommandInput } from "./reorder-projects.command";

const reorderProjectsOperation = findOperationCatalogEntryByKey("projects.reorder");
const defaultOperationGuardPort = new AllowAllOperationGuardPort();

@injectable()
export class ReorderProjectsUseCase {
  constructor(
    @inject(tokens.projectRepository)
    private readonly projectRepository: ProjectRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
    @inject(tokens.operationGuardPort)
    private readonly operationGuardPort?: OperationGuardPort,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ReorderProjectsCommandInput,
  ): Promise<Result<{ reorderedProjectIds: string[] }>> {
    const { clock, eventBus, logger, operationGuardPort, projectRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const projectIds = input.projectIds;
      const startOffset = input.startOffset ?? 0;
      if (new Set(projectIds).size !== projectIds.length) {
        return err(
          domainError.validation("Project ids must be unique", {
            phase: "command-validation",
            field: "projectIds",
          }),
        );
      }

      const projects = [];
      for (const rawProjectId of projectIds) {
        const projectId = yield* ProjectId.create(rawProjectId);
        const project = await projectRepository.findOne(
          repositoryContext,
          ProjectByIdSpec.create(projectId),
        );

        if (!project) {
          return err(domainError.notFound("project", rawProjectId));
        }

        projects.push(project);
      }

      const organizationIds = new Set(
        projects.map(
          (project) => project.toState().organizationId?.value ?? defaultSelfHostedOrganizationId,
        ),
      );
      if (organizationIds.size !== 1) {
        return err(
          domainError.validation("Projects must belong to the same organization", {
            phase: "project-admission",
            field: "projectIds",
          }),
        );
      }

      const organizationId = [...organizationIds][0] ?? defaultSelfHostedOrganizationId;
      const firstProjectId = projectIds[0];
      if (!firstProjectId) {
        return err(domainError.validation("Project ids are required"));
      }
      if (reorderProjectsOperation) {
        const checked = await checkOperationGuards({
          context,
          entry: reorderProjectsOperation,
          message: input,
          operationGuardPort: operationGuardPort ?? defaultOperationGuardPort,
          organizationId,
          resourceRefs: {
            projectId: firstProjectId,
          },
        });
        if (checked.isErr()) {
          return err(checked.error);
        }
      }

      const reorderedAt = yield* UpdatedAt.create(clock.now());
      const normalizedStartOffset =
        typeof startOffset === "number" && Number.isFinite(startOffset) ? startOffset : 0;
      const changedProjects = [];
      for (const [index, project] of projects.entries()) {
        const displayOrder = yield* ProjectDisplayOrder.create(normalizedStartOffset + index);
        const reorderResult = yield* project.reorder({
          displayOrder,
          reorderedAt,
        });

        if (reorderResult.changed) {
          changedProjects.push(project);
        }
      }

      for (const project of changedProjects) {
        await projectRepository.upsert(
          repositoryContext,
          project,
          UpsertProjectSpec.fromProject(project),
        );
        await publishDomainEventsAndReturn(context, eventBus, logger, project, undefined);
      }

      return ok({ reorderedProjectIds: projectIds });
    });
  }
}
