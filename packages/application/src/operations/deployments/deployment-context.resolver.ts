import {
  type DeploymentTarget,
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  domainError,
  EnvironmentByIdSpec,
  EnvironmentId,
  type EnvironmentProfile,
  err,
  ok,
  type Project,
  ProjectByIdSpec,
  ProjectId,
  type Result,
  safeTry,
} from "@yundu/core";
import { inject, injectable } from "tsyringe";
import {
  type ExecutionContext,
  type RepositoryContext,
  toRepositoryContext,
} from "../../execution-context";

import {
  type EnvironmentRepository,
  type ProjectRepository,
  type ServerRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { type CreateDeploymentCommandInput } from "./create-deployment.command";

export interface ResolvedDeploymentContext {
  project: Project;
  server: DeploymentTarget;
  environment: EnvironmentProfile;
}

@injectable()
export class DeploymentContextResolver {
  constructor(
    @inject(tokens.projectRepository)
    private readonly projectRepository: ProjectRepository,
    @inject(tokens.serverRepository)
    private readonly serverRepository: ServerRepository,
    @inject(tokens.environmentRepository)
    private readonly environmentRepository: EnvironmentRepository,
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

      const server = explicitServer;
      if (!server) {
        return err(domainError.validation("serverId is required for this deployment context"));
      }

      return ok({
        project,
        server,
        environment,
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
}
