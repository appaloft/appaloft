import {
  ArchivedAt,
  ArchiveReason,
  defaultSelfHostedOrganizationId,
  domainError,
  err,
  ok,
  ProjectByIdSpec,
  ProjectId,
  type Result,
  safeTry,
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
import { type ArchiveProjectCommandInput } from "./archive-project.command";

const archiveProjectOperation = findOperationCatalogEntryByKey("projects.archive");
const defaultOperationGuardPort = new AllowAllOperationGuardPort();

@injectable()
export class ArchiveProjectUseCase {
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
    input: ArchiveProjectCommandInput,
  ): Promise<Result<{ id: string }>> {
    const { clock, eventBus, logger, operationGuardPort, projectRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const projectId = yield* ProjectId.create(input.projectId);
      const project = await projectRepository.findOne(
        repositoryContext,
        ProjectByIdSpec.create(projectId),
      );

      if (!project) {
        return err(domainError.notFound("project", input.projectId));
      }

      const organizationId =
        project.toState().organizationId?.value ?? defaultSelfHostedOrganizationId;
      if (archiveProjectOperation) {
        const checked = await checkOperationGuards({
          context,
          entry: archiveProjectOperation,
          message: input,
          operationGuardPort: operationGuardPort ?? defaultOperationGuardPort,
          organizationId,
          resourceRefs: {
            projectId: input.projectId,
          },
        });
        if (checked.isErr()) {
          return err(checked.error);
        }
      }

      const archivedAt = yield* ArchivedAt.create(clock.now());
      const reason = yield* ArchiveReason.fromOptional(input.reason);
      const archiveResult = yield* project.archive({
        archivedAt,
        ...(reason ? { reason } : {}),
      });

      if (!archiveResult.changed) {
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
