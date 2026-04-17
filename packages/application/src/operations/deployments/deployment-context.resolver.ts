import {
  type DeploymentTarget,
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  type Destination,
  DestinationByIdSpec,
  DestinationId,
  domainError,
  EnvironmentByIdSpec,
  EnvironmentId,
  type EnvironmentProfile,
  err,
  ok,
  type Project,
  ProjectByIdSpec,
  ProjectId,
  type Resource,
  ResourceByIdSpec,
  ResourceId,
  type Result,
  safeTry,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import {
  type ExecutionContext,
  type RepositoryContext,
  toRepositoryContext,
} from "../../execution-context";

import {
  type DestinationRepository,
  type EnvironmentRepository,
  type ProjectRepository,
  type ResourceRepository,
  type ServerRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { type CreateDeploymentCommandInput } from "./create-deployment.command";

export interface ResolvedDeploymentContext {
  project: Project;
  server: DeploymentTarget;
  destination: Destination;
  environment: EnvironmentProfile;
  resource: Resource;
}

@injectable()
export class DeploymentContextResolver {
  constructor(
    @inject(tokens.projectRepository)
    private readonly projectRepository: ProjectRepository,
    @inject(tokens.serverRepository)
    private readonly serverRepository: ServerRepository,
    @inject(tokens.destinationRepository)
    private readonly destinationRepository: DestinationRepository,
    @inject(tokens.environmentRepository)
    private readonly environmentRepository: EnvironmentRepository,
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
  ) {}

  async resolve(
    context: ExecutionContext,
    input: CreateDeploymentCommandInput,
  ): Promise<Result<ResolvedDeploymentContext>> {
    const self = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const explicitProjectResult = await self.loadProject(repositoryContext, input.projectId);
      const explicitProject = yield* explicitProjectResult;
      const explicitEnvironmentResult = await self.loadEnvironment(
        repositoryContext,
        input.environmentId,
      );
      const explicitEnvironment = yield* explicitEnvironmentResult;
      const explicitServerResult = await self.loadServer(repositoryContext, input.serverId);
      const explicitServer = yield* explicitServerResult;
      const explicitDestinationResult = await self.loadDestination(
        repositoryContext,
        input.destinationId,
      );
      const explicitDestination = yield* explicitDestinationResult;
      const explicitResourceResult = await self.loadResource(repositoryContext, input.resourceId);
      const explicitResource = yield* explicitResourceResult;

      let project = explicitProject;
      if (!project) {
        if (explicitEnvironment) {
          const implicitProjectResult = await self.loadProject(
            repositoryContext,
            explicitEnvironment.toState().projectId.value,
          );
          project = yield* implicitProjectResult;
        }
      }

      if (!project) {
        return err(domainError.validation("Unable to resolve project for deployment context"));
      }

      const environment = explicitEnvironment;
      if (!environment) {
        return err(domainError.validation("environmentId is required for this deployment context"));
      }

      if (!environment.toState().projectId.equals(project.toState().id)) {
        return err(
          domainError.validation("Environment does not belong to the selected project", {
            environmentId: environment.toState().id.value,
            projectId: project.toState().id.value,
          }),
        );
      }

      const resource = explicitResource;
      if (!resource) {
        return err(domainError.validation("resourceId is required for this deployment context"));
      }

      if (!resource.toState().projectId.equals(project.toState().id)) {
        return err(
          domainError.validation("Resource does not belong to the selected project", {
            resourceId: resource.toState().id.value,
            projectId: project.toState().id.value,
          }),
        );
      }

      if (!resource.toState().environmentId.equals(environment.toState().id)) {
        return err(
          domainError.validation("Resource does not belong to the selected environment", {
            resourceId: resource.toState().id.value,
            environmentId: environment.toState().id.value,
          }),
        );
      }

      const server = explicitServer;
      if (!server) {
        return err(domainError.validation("serverId is required for this deployment context"));
      }

      const destination = explicitDestination;
      if (!destination) {
        return err(domainError.validation("destinationId is required for this deployment context"));
      }

      if (!destination.toState().serverId.equals(server.toState().id)) {
        return err(
          domainError.validation("Destination does not belong to the selected server", {
            destinationId: destination.toState().id.value,
            serverId: server.toState().id.value,
          }),
        );
      }

      const resourceDestinationId = resource.toState().destinationId;
      if (resourceDestinationId && !resourceDestinationId.equals(destination.toState().id)) {
        return err(
          domainError.validation("Resource does not deploy to the selected destination", {
            resourceId: resource.toState().id.value,
            destinationId: destination.toState().id.value,
          }),
        );
      }

      return ok({
        project,
        server,
        destination,
        environment,
        resource,
      });
    });
  }

  private async loadProject(
    context: RepositoryContext,
    projectId?: string,
  ): Promise<Result<Project | null>> {
    if (!projectId) {
      return ok(null);
    }

    const self = this;

    return safeTry(async function* () {
      const id = yield* ProjectId.create(projectId);
      const project = await self.projectRepository.findOne(context, ProjectByIdSpec.create(id));
      return project ? ok(project) : err(domainError.notFound("project", projectId));
    });
  }

  private async loadEnvironment(
    context: RepositoryContext,
    environmentId?: string,
  ): Promise<Result<EnvironmentProfile | null>> {
    if (!environmentId) {
      return ok(null);
    }

    const self = this;

    return safeTry(async function* () {
      const id = yield* EnvironmentId.create(environmentId);
      const environment = await self.environmentRepository.findOne(
        context,
        EnvironmentByIdSpec.create(id),
      );
      return environment
        ? ok(environment)
        : err(domainError.notFound("environment", environmentId));
    });
  }

  private async loadServer(
    context: RepositoryContext,
    serverId?: string,
  ): Promise<Result<DeploymentTarget | null>> {
    if (!serverId) {
      return ok(null);
    }

    const self = this;

    return safeTry(async function* () {
      const id = yield* DeploymentTargetId.create(serverId);
      const server = await self.serverRepository.findOne(
        context,
        DeploymentTargetByIdSpec.create(id),
      );
      return server ? ok(server) : err(domainError.notFound("server", serverId));
    });
  }

  private async loadResource(
    context: RepositoryContext,
    resourceId?: string,
  ): Promise<Result<Resource | null>> {
    if (!resourceId) {
      return ok(null);
    }

    const self = this;

    return safeTry(async function* () {
      const id = yield* ResourceId.create(resourceId);
      const resource = await self.resourceRepository.findOne(context, ResourceByIdSpec.create(id));
      return resource ? ok(resource) : err(domainError.notFound("resource", resourceId));
    });
  }

  private async loadDestination(
    context: RepositoryContext,
    destinationId?: string,
  ): Promise<Result<Destination | null>> {
    if (!destinationId) {
      return ok(null);
    }

    const self = this;

    return safeTry(async function* () {
      const id = yield* DestinationId.create(destinationId);
      const destination = await self.destinationRepository.findOne(
        context,
        DestinationByIdSpec.create(id),
      );
      return destination
        ? ok(destination)
        : err(domainError.notFound("destination", destinationId));
    });
  }
}
