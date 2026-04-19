import {
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  DestinationByIdSpec,
  DestinationId,
  type DomainError,
  domainError,
  EnvironmentByIdSpec,
  EnvironmentId,
  err,
  ok,
  ProjectByIdSpec,
  ProjectId,
  ResourceByIdSpec,
  ResourceId,
  type Result,
  safeTry,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type DestinationRepository,
  type EnvironmentRepository,
  type ProjectRepository,
  type ResourceRepository,
  type ServerRepository,
  type SourceLinkStore,
} from "../../ports";
import { tokens } from "../../tokens";
import { type RelinkSourceLinkCommandInput } from "./relink-source-link.command";

export interface RelinkSourceLinkResult {
  sourceFingerprint: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId?: string;
  destinationId?: string;
}

function sourceLinkContextMismatch(message: string, details: Record<string, string>): DomainError {
  return {
    code: "source_link_context_mismatch",
    category: "user",
    message,
    retryable: false,
    details: {
      phase: "source-link-admission",
      ...details,
    },
  };
}

@injectable()
export class RelinkSourceLinkUseCase {
  constructor(
    @inject(tokens.sourceLinkStore)
    private readonly sourceLinkStore: SourceLinkStore,
    @inject(tokens.projectRepository)
    private readonly projectRepository: ProjectRepository,
    @inject(tokens.environmentRepository)
    private readonly environmentRepository: EnvironmentRepository,
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
    @inject(tokens.serverRepository)
    private readonly serverRepository: ServerRepository,
    @inject(tokens.destinationRepository)
    private readonly destinationRepository: DestinationRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    input: RelinkSourceLinkCommandInput,
  ): Promise<Result<RelinkSourceLinkResult>> {
    const {
      clock,
      destinationRepository,
      environmentRepository,
      projectRepository,
      resourceRepository,
      serverRepository,
      sourceLinkStore,
    } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const projectId = yield* ProjectId.create(input.projectId);
      const environmentId = yield* EnvironmentId.create(input.environmentId);
      const resourceId = yield* ResourceId.create(input.resourceId);
      const serverId = input.serverId ? yield* DeploymentTargetId.create(input.serverId) : null;
      const destinationId = input.destinationId
        ? yield* DestinationId.create(input.destinationId)
        : null;

      if (destinationId && !serverId) {
        return err(
          sourceLinkContextMismatch("Destination relink requires server context", {
            destinationId: destinationId.value,
          }),
        );
      }

      const project = await projectRepository.findOne(
        repositoryContext,
        ProjectByIdSpec.create(projectId),
      );
      if (!project) {
        return err(domainError.notFound("Project", projectId.value));
      }

      const environment = await environmentRepository.findOne(
        repositoryContext,
        EnvironmentByIdSpec.create(environmentId),
      );
      if (!environment) {
        return err(domainError.notFound("Environment", environmentId.value));
      }
      if (!environment.toState().projectId.equals(projectId)) {
        return err(
          sourceLinkContextMismatch("Environment does not belong to project", {
            projectId: projectId.value,
            environmentId: environmentId.value,
          }),
        );
      }

      const resource = await resourceRepository.findOne(
        repositoryContext,
        ResourceByIdSpec.create(resourceId),
      );
      if (!resource) {
        return err(domainError.notFound("Resource", resourceId.value));
      }
      const resourceState = resource.toState();
      if (!resourceState.projectId.equals(projectId)) {
        return err(
          sourceLinkContextMismatch("Resource does not belong to project", {
            projectId: projectId.value,
            resourceId: resourceId.value,
          }),
        );
      }
      if (!resourceState.environmentId.equals(environmentId)) {
        return err(
          sourceLinkContextMismatch("Resource does not belong to environment", {
            environmentId: environmentId.value,
            resourceId: resourceId.value,
          }),
        );
      }

      if (serverId) {
        const server = await serverRepository.findOne(
          repositoryContext,
          DeploymentTargetByIdSpec.create(serverId),
        );
        if (!server) {
          return err(domainError.notFound("Server", serverId.value));
        }
      }

      if (destinationId) {
        const destination = await destinationRepository.findOne(
          repositoryContext,
          DestinationByIdSpec.create(destinationId),
        );
        if (!destination) {
          return err(domainError.notFound("Destination", destinationId.value));
        }
        if (serverId && !destination.toState().serverId.equals(serverId)) {
          return err(
            sourceLinkContextMismatch("Destination does not belong to server", {
              serverId: serverId.value,
              destinationId: destinationId.value,
            }),
          );
        }
        if (resourceState.destinationId && !resourceState.destinationId.equals(destinationId)) {
          return err(
            sourceLinkContextMismatch("Resource does not deploy to destination", {
              resourceId: resourceId.value,
              destinationId: destinationId.value,
              resourceDestinationId: resourceState.destinationId.value,
            }),
          );
        }
      } else if (serverId && resourceState.destinationId) {
        const resourceDestination = await destinationRepository.findOne(
          repositoryContext,
          DestinationByIdSpec.create(resourceState.destinationId),
        );
        if (resourceDestination && !resourceDestination.toState().serverId.equals(serverId)) {
          return err(
            sourceLinkContextMismatch("Resource destination does not belong to server", {
              serverId: serverId.value,
              resourceId: resourceId.value,
              resourceDestinationId: resourceState.destinationId.value,
            }),
          );
        }
      }

      const record = yield* await sourceLinkStore.relink({
        sourceFingerprint: input.sourceFingerprint,
        target: {
          projectId: input.projectId,
          environmentId: input.environmentId,
          resourceId: input.resourceId,
          ...(input.serverId ? { serverId: input.serverId } : {}),
          ...(input.destinationId ? { destinationId: input.destinationId } : {}),
        },
        updatedAt: clock.now(),
        ...(input.expectedCurrentProjectId
          ? { expectedCurrentProjectId: input.expectedCurrentProjectId }
          : {}),
        ...(input.expectedCurrentEnvironmentId
          ? { expectedCurrentEnvironmentId: input.expectedCurrentEnvironmentId }
          : {}),
        ...(input.expectedCurrentResourceId
          ? { expectedCurrentResourceId: input.expectedCurrentResourceId }
          : {}),
        ...(input.reason ? { reason: input.reason } : {}),
      });

      return ok({
        sourceFingerprint: record.sourceFingerprint,
        projectId: record.projectId,
        environmentId: record.environmentId,
        resourceId: record.resourceId,
        ...(record.serverId ? { serverId: record.serverId } : {}),
        ...(record.destinationId ? { destinationId: record.destinationId } : {}),
      });
    });
  }
}
