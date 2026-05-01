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
import { createCoordinationOwner, mutationCoordinationPolicies } from "../../mutation-coordination";
import {
  type Clock,
  type DestinationRepository,
  type EnvironmentRepository,
  type MutationCoordinator,
  type ProjectRepository,
  type ResourceRepository,
  type ServerRepository,
  SourceLinkBySourceFingerprintSpec,
  type SourceLinkRecord,
  type SourceLinkRepository,
  UpsertSourceLinkSpec,
} from "../../ports";
import { tokens } from "../../tokens";
import { sourceLinkScope } from "../deployments/deployment-mutation-scopes";
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
    @inject(tokens.sourceLinkRepository)
    private readonly sourceLinkRepository: SourceLinkRepository,
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
    @inject(tokens.mutationCoordinator)
    private readonly mutationCoordinator: MutationCoordinator,
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
      sourceLinkRepository,
      mutationCoordinator,
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
      if (!environment.belongsToProject(projectId)) {
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
      if (!resource.belongsToProject(projectId)) {
        return err(
          sourceLinkContextMismatch("Resource does not belong to project", {
            projectId: projectId.value,
            resourceId: resourceId.value,
          }),
        );
      }
      if (!resource.belongsToEnvironment(environmentId)) {
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
        if (serverId && !destination.belongsToServer(serverId)) {
          return err(
            sourceLinkContextMismatch("Destination does not belong to server", {
              serverId: serverId.value,
              destinationId: destinationId.value,
            }),
          );
        }
        const resourceDestinationId = resource.defaultDestinationId;
        if (resourceDestinationId && !resource.canDeployToDestination(destinationId)) {
          return err(
            sourceLinkContextMismatch("Resource does not deploy to destination", {
              resourceId: resourceId.value,
              destinationId: destinationId.value,
              resourceDestinationId: resourceDestinationId.value,
            }),
          );
        }
      } else if (serverId && resource.defaultDestinationId) {
        const resourceDestination = await destinationRepository.findOne(
          repositoryContext,
          DestinationByIdSpec.create(resource.defaultDestinationId),
        );
        if (resourceDestination && !resourceDestination.belongsToServer(serverId)) {
          return err(
            sourceLinkContextMismatch("Resource destination does not belong to server", {
              serverId: serverId.value,
              resourceId: resourceId.value,
              resourceDestinationId: resource.defaultDestinationId.value,
            }),
          );
        }
      }

      const record = yield* await mutationCoordinator.runExclusive({
        context,
        policy: mutationCoordinationPolicies.relinkSourceLink,
        scope: sourceLinkScope(input.sourceFingerprint),
        owner: createCoordinationOwner(context, "source-links.relink"),
        work: async () => {
          const existing = await sourceLinkRepository.findOne(
            SourceLinkBySourceFingerprintSpec.create(input.sourceFingerprint),
          );
          if (existing.isErr()) {
            return err(existing.error);
          }
          if (!existing.value) {
            return err(domainError.notFound("Source link", input.sourceFingerprint));
          }
          if (
            input.expectedCurrentProjectId &&
            existing.value.projectId !== input.expectedCurrentProjectId
          ) {
            return err(
              sourceLinkContextMismatch("Source link project did not match expectation", {
                expectedCurrentProjectId: input.expectedCurrentProjectId,
                actualProjectId: existing.value.projectId,
              }),
            );
          }
          if (
            input.expectedCurrentEnvironmentId &&
            existing.value.environmentId !== input.expectedCurrentEnvironmentId
          ) {
            return err(
              sourceLinkContextMismatch("Source link environment did not match expectation", {
                expectedCurrentEnvironmentId: input.expectedCurrentEnvironmentId,
                actualEnvironmentId: existing.value.environmentId,
              }),
            );
          }
          if (
            input.expectedCurrentResourceId &&
            existing.value.resourceId !== input.expectedCurrentResourceId
          ) {
            return err(
              sourceLinkContextMismatch("Source link resource did not match expectation", {
                expectedCurrentResourceId: input.expectedCurrentResourceId,
                actualResourceId: existing.value.resourceId,
              }),
            );
          }

          const recordInput = {
            sourceFingerprint: input.sourceFingerprint,
            projectId: input.projectId,
            environmentId: input.environmentId,
            resourceId: input.resourceId,
            updatedAt: clock.now(),
            ...(input.serverId ? { serverId: input.serverId } : {}),
            ...(input.destinationId ? { destinationId: input.destinationId } : {}),
            ...(input.reason ? { reason: input.reason } : {}),
          } satisfies SourceLinkRecord;

          return await sourceLinkRepository.upsert(
            recordInput,
            UpsertSourceLinkSpec.fromRecord(recordInput),
          );
        },
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
