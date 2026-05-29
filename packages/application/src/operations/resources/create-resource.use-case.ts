import {
  CreatedAt,
  DescriptionText,
  DestinationByIdSpec,
  DestinationId,
  domainError,
  EnvironmentByIdSpec,
  EnvironmentId,
  err,
  ok,
  ProjectByIdSpec,
  ProjectId,
  Resource,
  ResourceByEnvironmentAndSlugSpec,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  type ResourceRuntimeProfileState,
  ResourceServiceKindValue,
  ResourceServiceName,
  type ResourceServiceState,
  ResourceSlug,
  type ResourceSourceBindingState,
  type Result,
  safeTry,
  UpsertResourceSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { findOperationCatalogEntryByKey } from "../../operation-catalog";
import { checkOperationGuards } from "../../operation-guard";
import {
  AllowAllOperationGuardPort,
  type AppLogger,
  type Clock,
  type DestinationRepository,
  type EnvironmentRepository,
  type EventBus,
  type IdGenerator,
  type OperationGuardPort,
  type ProjectRepository,
  type ResourceReadModel,
  type ResourceRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type CreateResourceCommandInput } from "./create-resource.command";
import { resourceNetworkProfileFromInput } from "./resource-network-profile.mapper";
import { resourceRuntimeProfileFromInput } from "./resource-runtime-profile.mapper";
import { resourceSourceBindingFromInput } from "./resource-source-binding.mapper";

const createResourceOperation = findOperationCatalogEntryByKey("resources.create");
const defaultOperationGuardPort = new AllowAllOperationGuardPort();

@injectable()
export class CreateResourceUseCase {
  constructor(
    @inject(tokens.projectRepository)
    private readonly projectRepository: ProjectRepository,
    @inject(tokens.environmentRepository)
    private readonly environmentRepository: EnvironmentRepository,
    @inject(tokens.destinationRepository)
    private readonly destinationRepository: DestinationRepository,
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
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
    @inject(tokens.resourceReadModel, { isOptional: true })
    private readonly resourceReadModel?: ResourceReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    input: CreateResourceCommandInput,
  ): Promise<Result<{ id: string }>> {
    const {
      clock,
      destinationRepository,
      environmentRepository,
      eventBus,
      idGenerator,
      logger,
      operationGuardPort,
      projectRepository,
      resourceReadModel,
      resourceRepository,
    } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const projectId = yield* ProjectId.create(input.projectId);
      const environmentId = yield* EnvironmentId.create(input.environmentId);
      const name = yield* ResourceName.create(input.name);
      const slug = yield* ResourceSlug.fromName(name);
      const kind = yield* ResourceKindValue.create(input.kind ?? "application");

      const project = await projectRepository.findOne(
        repositoryContext,
        ProjectByIdSpec.create(projectId),
      );

      if (!project) {
        return err(domainError.notFound("project", input.projectId));
      }
      const projectState = project.toState();

      if (createResourceOperation) {
        const checked = await checkOperationGuards({
          context,
          entry: createResourceOperation,
          message: input,
          operationGuardPort: operationGuardPort ?? defaultOperationGuardPort,
          ...(projectState.organizationId
            ? { organizationId: projectState.organizationId.value }
            : {}),
          resourceRefs: {
            projectId: projectId.value,
            environmentId: environmentId.value,
            ...(input.destinationId ? { destinationId: input.destinationId } : {}),
          },
          contextAttributes: {
            ...(resourceReadModel
              ? {
                  currentEnvironmentResourceCount: await resourceReadModel.count(
                    repositoryContext,
                    {
                      environmentId: environmentId.value,
                      projectId: projectId.value,
                    },
                  ),
                  currentProjectResourceCount: await resourceReadModel.count(repositoryContext, {
                    projectId: projectId.value,
                  }),
                }
              : {}),
          },
        });
        if (checked.isErr()) {
          return err(checked.error);
        }
      }

      yield* project.ensureCanAcceptMutation("resources.create");

      const environment = await environmentRepository.findOne(
        repositoryContext,
        EnvironmentByIdSpec.create(environmentId),
      );

      if (!environment) {
        return err(domainError.notFound("environment", input.environmentId));
      }

      const environmentState = environment.toState();
      if (!environmentState.projectId.equals(projectId)) {
        return err(
          domainError.resourceContextMismatch(
            "Environment does not belong to the supplied project",
            {
              phase: "context-resolution",
              projectId: projectId.value,
              environmentId: environmentId.value,
              environmentProjectId: environmentState.projectId.value,
            },
          ),
        );
      }
      yield* environment.ensureCanCreateResource();

      const destinationId = input.destinationId
        ? yield* DestinationId.create(input.destinationId)
        : undefined;

      if (destinationId) {
        const destination = await destinationRepository.findOne(
          repositoryContext,
          DestinationByIdSpec.create(destinationId),
        );

        if (!destination) {
          return err(domainError.notFound("destination", input.destinationId ?? ""));
        }
      }

      const existing = await resourceRepository.findOne(
        repositoryContext,
        ResourceByEnvironmentAndSlugSpec.create(projectId, environmentId, slug),
      );

      if (existing) {
        const existingState = existing.toState();
        return err(
          domainError.resourceSlugConflict(
            "Resource name already exists for this project environment",
            {
              phase: "resource-admission",
              projectId: projectId.value,
              environmentId: environmentId.value,
              resourceId: existingState.id.value,
              resourceSlug: slug.value,
            },
          ),
        );
      }

      const services: ResourceServiceState[] = [];
      for (const service of input.services ?? []) {
        services.push({
          name: yield* ResourceServiceName.create(service.name),
          kind: yield* ResourceServiceKindValue.create(service.kind),
        });
      }

      let sourceBinding: ResourceSourceBindingState | undefined;
      if (input.source) {
        sourceBinding = yield* resourceSourceBindingFromInput(input.source);
      }

      let runtimeProfile: ResourceRuntimeProfileState | undefined;
      if (input.runtimeProfile) {
        runtimeProfile = yield* resourceRuntimeProfileFromInput(input.runtimeProfile, {
          allowHealthPolicy: true,
        });
      }

      const networkProfile = input.networkProfile
        ? yield* resourceNetworkProfileFromInput(input.networkProfile)
        : undefined;

      const resourceId = yield* ResourceId.create(idGenerator.next("res"));
      const createdAt = yield* CreatedAt.create(clock.now());
      const description = DescriptionText.fromOptional(input.description);
      const resource = yield* Resource.create({
        id: resourceId,
        projectId,
        environmentId,
        ...(destinationId ? { destinationId } : {}),
        name,
        kind,
        services,
        ...(sourceBinding ? { sourceBinding } : {}),
        ...(runtimeProfile ? { runtimeProfile } : {}),
        ...(networkProfile ? { networkProfile } : {}),
        createdAt,
        ...(description ? { description } : {}),
      });

      await resourceRepository.upsert(
        repositoryContext,
        resource,
        UpsertResourceSpec.fromResource(resource),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, resource, undefined);

      return ok({ id: resource.toState().id.value });
    });
  }
}
