import {
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetByProviderAndHostSpec,
  DeploymentTargetId,
  DeploymentTargetName,
  DescriptionText,
  domainError,
  EnvironmentByProjectAndNameSpec,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  EnvironmentProfile,
  err,
  HostAddress,
  ok,
  PortNumber,
  Project,
  ProjectByIdSpec,
  ProjectBySlugSpec,
  ProjectId,
  ProjectName,
  ProjectSlug,
  ProviderKey,
  type Result,
  safeTry,
  UpsertDeploymentTargetSpec,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
} from "@yundu/core";
import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type DeploymentConfigReader,
  type DeploymentConfigSnapshot,
  type DeploymentConfiguredEnvironment,
  type DeploymentConfiguredProject,
  type DeploymentConfiguredTarget,
  type DeploymentContextDefaultsDecision,
  type DeploymentContextDefaultsFactoryPort,
  type DeploymentContextDefaultsPolicy,
  type EnvironmentRepository,
  type EventBus,
  type IdGenerator,
  type ProjectRepository,
  type ProviderRegistry,
  type ServerRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type CreateDeploymentCommandInput } from "./create-deployment.command";

function normalizeProviderKey(providerKey: string): string {
  switch (providerKey.trim()) {
    case "local":
      return "local-shell";
    case "ssh":
      return "generic-ssh";
    case "tencent":
      return "tencent-cloud";
    default:
      return providerKey.trim();
  }
}

function defaultTargetName(target: DeploymentConfiguredTarget): string {
  if (target.name?.trim()) {
    return target.name;
  }

  if (target.key?.trim()) {
    return target.key;
  }

  return `${normalizeProviderKey(target.providerKey)} target`;
}

function defaultTargetHost(target: DeploymentConfiguredTarget): string | undefined {
  if (target.host?.trim()) {
    return target.host;
  }

  return normalizeProviderKey(target.providerKey) === "local-shell" ? "127.0.0.1" : undefined;
}

function selectDeploymentTarget(
  targets: DeploymentConfiguredTarget[],
  targetKey?: string,
): DeploymentConfiguredTarget | undefined {
  if (!targetKey) {
    return targets[0];
  }

  return (
    targets.find(
      (target) =>
        target.key === targetKey ||
        target.name === targetKey ||
        normalizeProviderKey(target.providerKey) === normalizeProviderKey(targetKey),
    ) ?? targets[0]
  );
}

function mergeConfigIntoCommand(
  input: CreateDeploymentCommandInput,
  config: DeploymentConfigSnapshot | null,
): CreateDeploymentCommandInput {
  const deployment = config?.deployment;

  return {
    ...input,
    deploymentMethod: input.deploymentMethod ?? deployment?.method,
    installCommand: input.installCommand ?? deployment?.installCommand,
    buildCommand: input.buildCommand ?? deployment?.buildCommand,
    startCommand: input.startCommand ?? deployment?.startCommand,
    port: input.port ?? deployment?.port,
    healthCheckPath: input.healthCheckPath ?? deployment?.healthCheckPath,
  };
}

@injectable()
export class DeploymentContextBootstrapService {
  constructor(
    @inject(tokens.deploymentConfigReader)
    private readonly deploymentConfigReader: DeploymentConfigReader,
    @inject(tokens.projectRepository)
    private readonly projectRepository: ProjectRepository,
    @inject(tokens.serverRepository)
    private readonly serverRepository: ServerRepository,
    @inject(tokens.environmentRepository)
    private readonly environmentRepository: EnvironmentRepository,
    @inject(tokens.providerRegistry)
    private readonly providerRegistry: ProviderRegistry,
    @inject(tokens.deploymentContextDefaultsPolicy)
    private readonly defaultsPolicy: DeploymentContextDefaultsPolicy,
    @inject(tokens.deploymentContextDefaultsFactory)
    private readonly defaultsFactory: DeploymentContextDefaultsFactoryPort,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async bootstrap(
    context: ExecutionContext,
    input: CreateDeploymentCommandInput,
  ): Promise<Result<CreateDeploymentCommandInput>> {
    const self = this;

    return safeTry(async function* () {
      const configResult = await self.deploymentConfigReader.read(context, {
        sourceLocator: input.sourceLocator,
        ...(input.configFilePath ? { configFilePath: input.configFilePath } : {}),
      });
      const config = yield* configResult;
      const merged = mergeConfigIntoCommand(input, config);
      const withConfig = yield* await self.applyConfigStrategy(context, merged, config);
      const withDefaults = yield* await self.applyDefaultStrategy(context, withConfig);

      return ok(withDefaults);
    });
  }

  private async applyConfigStrategy(
    context: ExecutionContext,
    input: CreateDeploymentCommandInput,
    config: DeploymentConfigSnapshot | null,
  ): Promise<Result<CreateDeploymentCommandInput>> {
    const self = this;

    return safeTry(async function* () {
      const projectId =
        input.projectId ??
        (config?.project
          ? yield* await self.resolveConfiguredProject(context, config.project)
          : undefined);

      const environmentId =
        input.environmentId ??
        (projectId && config?.environment
          ? yield* await self.resolveConfiguredEnvironment(context, projectId, config.environment)
          : undefined);

      let selectedServerId = input.serverId;
      if (!selectedServerId && config?.targets && config.targets.length > 0) {
        const targetIds = new Map<DeploymentConfiguredTarget, string>();

        for (const target of config.targets) {
          const targetId = yield* await self.resolveConfiguredTarget(context, target);
          targetIds.set(target, targetId);
        }

        const selectedTarget = selectDeploymentTarget(config.targets, config.deployment?.targetKey);
        selectedServerId =
          selectedServerId ?? (selectedTarget ? targetIds.get(selectedTarget) : undefined);
      }

      return ok({
        ...input,
        ...(projectId ? { projectId } : {}),
        ...(environmentId ? { environmentId } : {}),
        ...(selectedServerId ? { serverId: selectedServerId } : {}),
      });
    });
  }

  private async applyDefaultStrategy(
    context: ExecutionContext,
    input: CreateDeploymentCommandInput,
  ): Promise<Result<CreateDeploymentCommandInput>> {
    const defaultsResult = this.defaultsPolicy.decide({
      sourceLocator: input.sourceLocator,
      requestedDeploymentMethod: input.deploymentMethod ?? "auto",
    });
    const self = this;

    return safeTry(async function* () {
      const defaults = yield* defaultsResult;
      const projectId =
        input.projectId ??
        (input.environmentId
          ? undefined
          : yield* await self.resolveDefaultProject(context, defaults));
      const environmentId =
        input.environmentId ??
        (projectId
          ? yield* await self.resolveDefaultEnvironment(context, defaults, projectId)
          : undefined);
      const serverId =
        input.serverId ?? (yield* await self.resolveDefaultServer(context, defaults));

      return ok({
        ...input,
        ...(projectId ? { projectId } : {}),
        ...(environmentId ? { environmentId } : {}),
        ...(serverId ? { serverId } : {}),
      });
    });
  }

  private async resolveConfiguredProject(
    context: ExecutionContext,
    projectConfig: DeploymentConfiguredProject,
  ): Promise<Result<string>> {
    const { clock, eventBus, idGenerator, logger, projectRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const projectName = yield* ProjectName.create(projectConfig.name);
      const slug = yield* ProjectSlug.fromName(projectName);
      const existing = await projectRepository.findOne(
        repositoryContext,
        ProjectBySlugSpec.create(slug),
      );

      if (existing) {
        return ok(existing.toState().id.value);
      }

      const projectId = yield* ProjectId.create(idGenerator.next("prj"));
      const createdAt = yield* CreatedAt.create(clock.now());
      const description = DescriptionText.fromOptional(projectConfig.description);
      const project = yield* Project.create({
        id: projectId,
        name: projectName,
        createdAt,
        ...(description ? { description } : {}),
      });

      await projectRepository.upsert(
        repositoryContext,
        project,
        UpsertProjectSpec.fromProject(project),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, project, undefined);

      return ok(project.toState().id.value);
    });
  }

  private async resolveConfiguredEnvironment(
    context: ExecutionContext,
    projectIdValue: string,
    environmentConfig: DeploymentConfiguredEnvironment,
  ): Promise<Result<string>> {
    const { clock, environmentRepository, eventBus, idGenerator, logger } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const projectId = yield* ProjectId.create(projectIdValue);
      const name = yield* EnvironmentName.create(environmentConfig.name);
      const existing = await environmentRepository.findOne(
        repositoryContext,
        EnvironmentByProjectAndNameSpec.create(projectId, name),
      );

      if (existing) {
        return ok(existing.toState().id.value);
      }

      const environmentId = yield* EnvironmentId.create(idGenerator.next("env"));
      const kind = yield* EnvironmentKindValue.create(environmentConfig.kind ?? "custom");
      const createdAt = yield* CreatedAt.create(clock.now());
      const environment = yield* EnvironmentProfile.create({
        id: environmentId,
        projectId,
        name,
        kind,
        createdAt,
      });

      await environmentRepository.upsert(
        repositoryContext,
        environment,
        UpsertEnvironmentSpec.fromEnvironment(environment),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, environment, undefined);

      return ok(environment.toState().id.value);
    });
  }

  private async resolveConfiguredTarget(
    context: ExecutionContext,
    targetConfig: DeploymentConfiguredTarget,
  ): Promise<Result<string>> {
    const { clock, eventBus, idGenerator, logger, providerRegistry, serverRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const providerKeyValue = normalizeProviderKey(targetConfig.providerKey);
      const provider = providerRegistry.list().find((item) => item.key === providerKeyValue);

      if (!provider) {
        return err(
          domainError.validation("Deployment target provider is not registered", {
            providerKey: providerKeyValue,
          }),
        );
      }

      const hostValue = defaultTargetHost(targetConfig);
      if (!hostValue) {
        return err(
          domainError.validation("Deployment target host is required", {
            providerKey: providerKeyValue,
          }),
        );
      }

      const providerKey = yield* ProviderKey.create(providerKeyValue);
      const host = yield* HostAddress.create(hostValue);
      const existing = await serverRepository.findOne(
        repositoryContext,
        DeploymentTargetByProviderAndHostSpec.create(providerKey, host),
      );

      if (existing) {
        return ok(existing.toState().id.value);
      }

      const serverId = yield* DeploymentTargetId.create(idGenerator.next("srv"));
      const name = yield* DeploymentTargetName.create(defaultTargetName(targetConfig));
      const port = yield* PortNumber.create(targetConfig.port ?? 22);
      const createdAt = yield* CreatedAt.create(clock.now());
      const server = yield* DeploymentTarget.register({
        id: serverId,
        name,
        host,
        port,
        providerKey,
        createdAt,
      });

      await serverRepository.upsert(
        repositoryContext,
        server,
        UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, server, undefined);

      return ok(server.toState().id.value);
    });
  }

  private async resolveDefaultProject(
    context: ExecutionContext,
    defaults: DeploymentContextDefaultsDecision,
  ): Promise<Result<string>> {
    const projectDefaults = defaults.project;
    const { defaultsFactory, eventBus, logger, projectRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    if (projectDefaults.mode === "required") {
      return err(domainError.validation("projectId is required for this deployment context"));
    }

    return safeTry(async function* () {
      const selectionResult =
        projectDefaults.preset === "local-project"
          ? defaultsFactory.localProjectSelection()
          : err(domainError.validation("Unsupported project defaults preset"));
      const selection = yield* selectionResult;
      const existing = await projectRepository.findOne(repositoryContext, selection);

      if (existing) {
        return ok(existing.toState().id.value);
      }

      const projectResult = defaultsFactory.createLocalProject();
      const project = yield* projectResult;

      await projectRepository.upsert(
        repositoryContext,
        project,
        UpsertProjectSpec.fromProject(project),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, project, undefined);

      return ok(project.toState().id.value);
    });
  }

  private async resolveDefaultEnvironment(
    context: ExecutionContext,
    defaults: DeploymentContextDefaultsDecision,
    projectIdValue: string,
  ): Promise<Result<string>> {
    const environmentDefaults = defaults.environment;
    const { defaultsFactory, environmentRepository, eventBus, logger, projectRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    if (environmentDefaults.mode === "required") {
      return err(domainError.validation("environmentId is required for this deployment context"));
    }

    return safeTry(async function* () {
      const projectId = yield* ProjectId.create(projectIdValue);
      const project = await projectRepository.findOne(
        repositoryContext,
        ProjectByIdSpec.create(projectId),
      );

      if (!project) {
        return err(domainError.notFound("project", projectIdValue));
      }

      const selectionResult =
        environmentDefaults.preset === "local-environment"
          ? defaultsFactory.localEnvironmentSelection(project)
          : err(domainError.validation("Unsupported environment defaults preset"));
      const selection = yield* selectionResult;
      const existing = await environmentRepository.findOne(repositoryContext, selection);

      if (existing) {
        return ok(existing.toState().id.value);
      }

      const environmentResult = defaultsFactory.createLocalEnvironment(project);
      const environment = yield* environmentResult;

      await environmentRepository.upsert(
        repositoryContext,
        environment,
        UpsertEnvironmentSpec.fromEnvironment(environment),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, environment, undefined);

      return ok(environment.toState().id.value);
    });
  }

  private async resolveDefaultServer(
    context: ExecutionContext,
    defaults: DeploymentContextDefaultsDecision,
  ): Promise<Result<string>> {
    const serverDefaults = defaults.server;
    const { defaultsFactory, eventBus, logger, serverRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    if (serverDefaults.mode === "required") {
      return err(domainError.validation("serverId is required for this deployment context"));
    }

    return safeTry(async function* () {
      const selectionResult =
        serverDefaults.preset === "local-server"
          ? defaultsFactory.localServerSelection()
          : err(domainError.validation("Unsupported server defaults preset"));
      const selection = yield* selectionResult;
      const existing = await serverRepository.findOne(repositoryContext, selection);

      if (existing) {
        return ok(existing.toState().id.value);
      }

      const serverResult = defaultsFactory.createLocalServer();
      const server = yield* serverResult;

      await serverRepository.upsert(
        repositoryContext,
        server,
        UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, server, undefined);

      return ok(server.toState().id.value);
    });
  }
}
