import {
  CreatedAt,
  DescriptionText,
  defaultSelfHostedOrganizationId,
  domainError,
  err,
  OrganizationId,
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
import { findOperationCatalogEntryByKey } from "../../operation-catalog";
import { checkOperationGuards } from "../../operation-guard";
import {
  AllowAllOperationGuardPort,
  type AppLogger,
  type AuditEventRecorder,
  type Clock,
  type EventBus,
  type IdGenerator,
  type OperationGuardPort,
  type ProjectReadModel,
  type ProjectRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type CreateProjectCommandInput } from "./create-project.command";

const createProjectOperation = findOperationCatalogEntryByKey("projects.create");
const defaultOperationGuardPort = new AllowAllOperationGuardPort();

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
    @inject(tokens.operationGuardPort)
    private readonly operationGuardPort?: OperationGuardPort,
    @inject(tokens.projectReadModel, { isOptional: true })
    private readonly projectReadModel?: ProjectReadModel,
    @inject(tokens.auditEventRecorder, { isOptional: true })
    private readonly auditEventRecorder?: AuditEventRecorder,
  ) {}

  async execute(
    context: ExecutionContext,
    input: CreateProjectCommandInput,
  ): Promise<Result<{ id: string }>> {
    const {
      clock,
      auditEventRecorder,
      eventBus,
      idGenerator,
      logger,
      operationGuardPort,
      projectReadModel,
      projectRepository,
    } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const projectId = yield* ProjectId.create(idGenerator.next("prj"));
      const createdAt = yield* CreatedAt.create(clock.now());
      const projectName = yield* ProjectName.create(input.name);
      const description = DescriptionText.fromOptional(input.description);
      const organizationId =
        input.organizationId ??
        context.principal?.activeOrganization?.organizationId ??
        defaultSelfHostedOrganizationId;
      const projectOrganizationId = yield* OrganizationId.create(organizationId);

      if (createProjectOperation) {
        const checked = await checkOperationGuards({
          context,
          entry: createProjectOperation,
          message: { ...input, organizationId },
          operationGuardPort: operationGuardPort ?? defaultOperationGuardPort,
          organizationId,
          contextAttributes: {
            ...(projectReadModel
              ? {
                  currentOrganizationProjectCount: await projectReadModel.count(repositoryContext, {
                    organizationId,
                  }),
                }
              : {}),
          },
        });
        if (checked.isErr()) {
          return err(checked.error);
        }
      }

      const project = yield* Project.create({
        id: projectId,
        organizationId: projectOrganizationId,
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
      const createdProjectId = project.toState().id.value;
      try {
        const auditResult = await auditEventRecorder?.record(repositoryContext, {
          id: idGenerator.next("aud"),
          aggregateId: createdProjectId,
          eventType: "projects.create",
          payload: {
            operationKey: "projects.create",
            actorId: context.principal?.userId ?? null,
            organizationId,
            projectId: createdProjectId,
            result: "success",
          },
          createdAt: clock.now(),
        });
        if (auditResult?.isErr()) {
          logger.warn("Project creation audit event could not be recorded", {
            operationKey: "projects.create",
            projectId: createdProjectId,
          });
        }
      } catch {
        logger.warn("Project creation audit event could not be recorded", {
          operationKey: "projects.create",
          projectId: createdProjectId,
        });
      }

      return ok({ id: createdProjectId });
    });
  }
}
