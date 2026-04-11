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
  UpsertDeploymentTargetSpec,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
} from "@yundu/core";
import { inject, injectable } from "tsyringe";
import {
  type ExecutionContext,
  type RepositoryContext,
  toRepositoryContext,
} from "../../execution-context";

import {
  type AppLogger,
  type DeploymentContextDefaultsDecision,
  type DeploymentContextDefaultsFactoryPort,
  type DeploymentContextDefaultsPolicy,
  type EnvironmentRepository,
  type EventBus,
  type ProjectRepository,
  type ServerRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
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
    @inject(tokens.deploymentContextDefaultsPolicy)
    private readonly defaultsPolicy: DeploymentContextDefaultsPolicy,
    @inject(tokens.deploymentContextDefaultsFactory)
    private readonly defaultsFactory: DeploymentContextDefaultsFactoryPort,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async resolve(
    context: ExecutionContext,
    input: CreateDeploymentCommandInput,
  ): Promise<Result<ResolvedDeploymentContext>> {
    const { defaultsFactory, defaultsPolicy } = this;
    const self = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const defaultsDecision = defaultsPolicy.decide({
        sourceLocator: input.sourceLocator,
        requestedDeploymentMethod: input.deploymentMethod ?? "auto",
      });
      const defaults = yield* defaultsDecision;

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
        } else {
          const defaultProjectResult = await self.resolveProject(
            context,
            repositoryContext,
            defaults,
            defaultsFactory,
          );
          project = yield* defaultProjectResult;
        }
      }

      if (!project) {
        return err(domainError.validation("Unable to resolve project for deployment context"));
      }

      let environment = explicitEnvironment;
      if (!environment) {
        const defaultEnvironmentResult = await self.resolveEnvironment(
          context,
          repositoryContext,
          project,
          defaults,
          defaultsFactory,
        );
        environment = yield* defaultEnvironmentResult;
      }

      if (!environment.toState().projectId.equals(project.toState().id)) {
        return err(
          domainError.validation("Environment does not belong to the selected project", {
            environmentId: environment.toState().id.value,
            projectId: project.toState().id.value,
          }),
        );
      }

      let server = explicitServer;
      if (!server) {
        const defaultServerResult = await self.resolveServer(
          context,
          repositoryContext,
          defaults,
          defaultsFactory,
        );
        server = yield* defaultServerResult;
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

  private async resolveProject(
    executionContext: ExecutionContext,
    repositoryContext: RepositoryContext,
    defaults: DeploymentContextDefaultsDecision,
    defaultsFactory: DeploymentContextDefaultsFactoryPort,
  ): Promise<Result<Project>> {
    const projectDefaults = defaults.project;

    if (projectDefaults.mode === "required") {
      return err(domainError.validation("projectId is required for this deployment context"));
    }

    const self = this;

    return safeTry(async function* () {
      const selectionResult =
        projectDefaults.preset === "local-project"
          ? defaultsFactory.localProjectSelection()
          : err(domainError.validation("Unsupported project defaults preset"));
      const selection = yield* selectionResult;
      const existing = await self.projectRepository.findOne(repositoryContext, selection);

      if (existing) {
        return ok(existing);
      }

      const projectResult = defaultsFactory.createLocalProject();
      const project = yield* projectResult;

      await self.projectRepository.upsert(
        repositoryContext,
        project,
        UpsertProjectSpec.fromProject(project),
      );
      await publishDomainEventsAndReturn(
        executionContext,
        self.eventBus,
        self.logger,
        project,
        undefined,
      );

      return ok(project);
    });
  }

  private async resolveEnvironment(
    executionContext: ExecutionContext,
    repositoryContext: RepositoryContext,
    project: Project,
    defaults: DeploymentContextDefaultsDecision,
    defaultsFactory: DeploymentContextDefaultsFactoryPort,
  ): Promise<Result<EnvironmentProfile>> {
    const environmentDefaults = defaults.environment;

    if (environmentDefaults.mode === "required") {
      return err(domainError.validation("environmentId is required for this deployment context"));
    }

    const self = this;

    return safeTry(async function* () {
      const selectionResult =
        environmentDefaults.preset === "local-environment"
          ? defaultsFactory.localEnvironmentSelection(project)
          : err(domainError.validation("Unsupported environment defaults preset"));
      const selection = yield* selectionResult;
      const existing = await self.environmentRepository.findOne(repositoryContext, selection);

      if (existing) {
        return ok(existing);
      }

      const environmentResult = defaultsFactory.createLocalEnvironment(project);
      const environment = yield* environmentResult;

      await self.environmentRepository.upsert(
        repositoryContext,
        environment,
        UpsertEnvironmentSpec.fromEnvironment(environment),
      );
      await publishDomainEventsAndReturn(
        executionContext,
        self.eventBus,
        self.logger,
        environment,
        undefined,
      );

      return ok(environment);
    });
  }

  private async resolveServer(
    executionContext: ExecutionContext,
    repositoryContext: RepositoryContext,
    defaults: DeploymentContextDefaultsDecision,
    defaultsFactory: DeploymentContextDefaultsFactoryPort,
  ): Promise<Result<DeploymentTarget>> {
    const serverDefaults = defaults.server;

    if (serverDefaults.mode === "required") {
      return err(domainError.validation("serverId is required for this deployment context"));
    }

    const self = this;

    return safeTry(async function* () {
      const selectionResult =
        serverDefaults.preset === "local-server"
          ? defaultsFactory.localServerSelection()
          : err(domainError.validation("Unsupported server defaults preset"));
      const selection = yield* selectionResult;
      const existing = await self.serverRepository.findOne(repositoryContext, selection);

      if (existing) {
        return ok(existing);
      }

      const serverResult = defaultsFactory.createLocalServer();
      const server = yield* serverResult;

      await self.serverRepository.upsert(
        repositoryContext,
        server,
        UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
      );
      await publishDomainEventsAndReturn(
        executionContext,
        self.eventBus,
        self.logger,
        server,
        undefined,
      );

      return ok(server);
    });
  }
}
