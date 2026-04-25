import {
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetByIdSpec,
  DeploymentTargetByProviderAndHostSpec,
  DeploymentTargetId,
  DeploymentTargetName,
  DescriptionText,
  Destination,
  DestinationByIdSpec,
  DestinationByServerAndNameSpec,
  DestinationId,
  DestinationKindValue,
  DestinationName,
  domainError,
  EdgeProxyKindValue,
  EnvironmentByIdSpec,
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
  Resource,
  ResourceByEnvironmentAndSlugSpec,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  ResourceServiceKindValue,
  ResourceServiceName,
  type ResourceServiceState,
  ResourceSlug,
  type Result,
  safeTry,
  UpsertDeploymentTargetSpec,
  UpsertDestinationSpec,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  UpsertResourceSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type DeploymentConfigReader,
  type DeploymentConfigSnapshot,
  type DeploymentConfiguredEnvironment,
  type DeploymentConfiguredProject,
  type DeploymentConfiguredResource,
  type DeploymentConfiguredTarget,
  type DeploymentContextDefaultsDecision,
  type DeploymentContextDefaultsFactoryPort,
  type DeploymentContextDefaultsPolicy,
  type DestinationRepository,
  type EnvironmentRepository,
  type EventBus,
  type IdGenerator,
  type ProjectRepository,
  type ProviderRegistry,
  type RequestedDeploymentConfig,
  type ResourceRepository,
  type ServerRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type CreateDeploymentCommandInput } from "./create-deployment.command";

type LegacyDeploymentBootstrapInput = CreateDeploymentCommandInput & {
  configFilePath?: string | undefined;
  sourceLocator?: string | undefined;
  deploymentMethod?: RequestedDeploymentConfig["method"] | undefined;
  installCommand?: string | undefined;
  buildCommand?: string | undefined;
  startCommand?: string | undefined;
  port?: number | undefined;
  healthCheckPath?: string | undefined;
  proxyKind?: RequestedDeploymentConfig["proxyKind"] | undefined;
  domains?: string[] | undefined;
  pathPrefix?: string | undefined;
  tlsMode?: RequestedDeploymentConfig["tlsMode"] | undefined;
  resource?: DeploymentConfiguredResource | undefined;
};

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

function normalizeDeploymentResourceInput(
  resource: NonNullable<LegacyDeploymentBootstrapInput["resource"]>,
): DeploymentConfiguredResource {
  return {
    name: resource.name,
    ...(resource.kind ? { kind: resource.kind } : {}),
    ...(resource.description ? { description: resource.description } : {}),
    ...(resource.services ? { services: resource.services } : {}),
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
    @inject(tokens.destinationRepository)
    private readonly destinationRepository: DestinationRepository,
    @inject(tokens.environmentRepository)
    private readonly environmentRepository: EnvironmentRepository,
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
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
      if (input.destinationId) {
        return ok(input);
      }

      const destinationId = yield* await self.resolveDefaultDestination(
        context,
        {
          project: { mode: "required" },
          server: { mode: "required" },
          destination: { mode: "reuse-or-create", preset: "local-destination" },
          environment: { mode: "required" },
          resource: { mode: "required" },
        },
        input.serverId,
      );

      return ok({
        ...input,
        destinationId,
      });
    });
  }

  private async applyConfigStrategy(
    context: ExecutionContext,
    input: LegacyDeploymentBootstrapInput,
    config: DeploymentConfigSnapshot | null,
  ): Promise<Result<LegacyDeploymentBootstrapInput>> {
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
      let selectedDestinationId = input.destinationId;
      if (!selectedServerId && config?.targets && config.targets.length > 0) {
        const targetIds = new Map<DeploymentConfiguredTarget, string>();
        const destinationIds = new Map<DeploymentConfiguredTarget, string>();

        for (const target of config.targets) {
          const targetId = yield* await self.resolveConfiguredTarget(context, target);
          targetIds.set(target, targetId);
          const destinationId = yield* await self.resolveConfiguredDestination(
            context,
            targetId,
            target.destination,
          );
          destinationIds.set(target, destinationId);
        }

        const selectedTarget = selectDeploymentTarget(config.targets, config.deployment?.targetKey);
        selectedServerId =
          selectedServerId ?? (selectedTarget ? targetIds.get(selectedTarget) : undefined);
        selectedDestinationId =
          selectedDestinationId ??
          (selectedTarget ? destinationIds.get(selectedTarget) : undefined);
      }
      const resourceConfig = input.resource
        ? normalizeDeploymentResourceInput(input.resource)
        : config?.resource;
      const resourceId =
        input.resourceId ??
        (projectId && environmentId && resourceConfig
          ? yield* await self.resolveConfiguredResource(
              context,
              projectId,
              environmentId,
              resourceConfig,
              selectedDestinationId,
            )
          : undefined);

      return ok({
        ...input,
        ...(projectId ? { projectId } : {}),
        ...(environmentId ? { environmentId } : {}),
        ...(resourceId ? { resourceId } : {}),
        ...(selectedServerId ? { serverId: selectedServerId } : {}),
        ...(selectedDestinationId ? { destinationId: selectedDestinationId } : {}),
      });
    });
  }

  private async applyDefaultStrategy(
    context: ExecutionContext,
    input: LegacyDeploymentBootstrapInput,
  ): Promise<Result<LegacyDeploymentBootstrapInput>> {
    const defaultsResult = this.defaultsPolicy.decide({
      sourceLocator: input.sourceLocator ?? ".",
      requestedDeploymentMethod: input.deploymentMethod ?? "auto",
    });
    const self = this;

    return safeTry(async function* () {
      const defaults = yield* defaultsResult;
      const projectId =
        input.projectId ??
        (input.environmentId
          ? yield* await self.resolveProjectIdForEnvironment(context, input.environmentId)
          : yield* await self.resolveDefaultProject(context, defaults));
      const environmentId =
        input.environmentId ??
        (projectId
          ? yield* await self.resolveDefaultEnvironment(context, defaults, projectId)
          : undefined);
      const serverId =
        input.serverId ?? (yield* await self.resolveDefaultServer(context, defaults));
      const destinationId =
        input.destinationId ??
        (serverId
          ? yield* await self.resolveDefaultDestination(context, defaults, serverId)
          : undefined);
      const resourceId =
        input.resourceId ??
        (projectId && environmentId && destinationId
          ? input.resource
            ? yield* await self.resolveConfiguredResource(
                context,
                projectId,
                environmentId,
                normalizeDeploymentResourceInput(input.resource),
                destinationId,
              )
            : yield* await self.resolveDefaultResource(
                context,
                defaults,
                projectId,
                environmentId,
                destinationId,
              )
          : undefined);

      return ok({
        ...input,
        ...(projectId ? { projectId } : {}),
        ...(environmentId ? { environmentId } : {}),
        ...(resourceId ? { resourceId } : {}),
        ...(serverId ? { serverId } : {}),
        ...(destinationId ? { destinationId } : {}),
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
        yield* existing.ensureCanCreateDeployment();
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
      const provider = providerRegistry.findByKey(providerKeyValue);

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
        edgeProxyKind: EdgeProxyKindValue.rehydrate("traefik"),
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

  private async resolveConfiguredDestination(
    context: ExecutionContext,
    serverIdValue: string,
    destinationConfig?: DeploymentConfiguredTarget["destination"],
  ): Promise<Result<string>> {
    const { clock, destinationRepository, eventBus, idGenerator, logger } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const serverId = yield* DeploymentTargetId.create(serverIdValue);
      const name = yield* DestinationName.create(destinationConfig?.name ?? "default");
      const existing = await destinationRepository.findOne(
        repositoryContext,
        DestinationByServerAndNameSpec.create(serverId, name),
      );

      if (existing) {
        return ok(existing.toState().id.value);
      }

      const destinationId = yield* DestinationId.create(idGenerator.next("dst"));
      const kind = yield* DestinationKindValue.create(destinationConfig?.kind ?? "generic");
      const createdAt = yield* CreatedAt.create(clock.now());
      const destination = yield* Destination.register({
        id: destinationId,
        serverId,
        name,
        kind,
        createdAt,
      });

      await destinationRepository.upsert(
        repositoryContext,
        destination,
        UpsertDestinationSpec.fromDestination(destination),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, destination, undefined);

      return ok(destination.toState().id.value);
    });
  }

  private async resolveConfiguredResource(
    context: ExecutionContext,
    projectIdValue: string,
    environmentIdValue: string,
    resourceConfig: DeploymentConfiguredResource,
    destinationIdValue?: string,
  ): Promise<Result<string>> {
    const { clock, environmentRepository, eventBus, idGenerator, logger, resourceRepository } =
      this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const projectId = yield* ProjectId.create(projectIdValue);
      const environmentId = yield* EnvironmentId.create(environmentIdValue);
      const destinationId = destinationIdValue
        ? yield* DestinationId.create(destinationIdValue)
        : undefined;
      const name = yield* ResourceName.create(resourceConfig.name);
      const slug = yield* ResourceSlug.fromName(name);
      const environment = await environmentRepository.findOne(
        repositoryContext,
        EnvironmentByIdSpec.create(environmentId),
      );

      if (!environment) {
        return err(domainError.notFound("environment", environmentIdValue));
      }

      yield* environment.ensureCanCreateDeployment();

      const existing = await resourceRepository.findOne(
        repositoryContext,
        ResourceByEnvironmentAndSlugSpec.create(projectId, environmentId, slug),
      );

      if (existing) {
        return ok(existing.toState().id.value);
      }

      const services: ResourceServiceState[] = [];
      for (const service of resourceConfig.services ?? []) {
        services.push({
          name: yield* ResourceServiceName.create(service.name),
          kind: yield* ResourceServiceKindValue.create(service.kind),
        });
      }

      const resourceId = yield* ResourceId.create(idGenerator.next("res"));
      const kind = yield* ResourceKindValue.create(resourceConfig.kind ?? "application");
      const createdAt = yield* CreatedAt.create(clock.now());
      const description = DescriptionText.fromOptional(resourceConfig.description);
      const resource = yield* Resource.create({
        id: resourceId,
        projectId,
        environmentId,
        ...(destinationId ? { destinationId } : {}),
        name,
        kind,
        services,
        createdAt,
        ...(description ? { description } : {}),
      });

      await resourceRepository.upsert(
        repositoryContext,
        resource,
        UpsertResourceSpec.fromResource(resource),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, resource, undefined);

      return ok(resource.toState().id.value);
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

  private async resolveProjectIdForEnvironment(
    context: ExecutionContext,
    environmentIdValue: string,
  ): Promise<Result<string>> {
    const { environmentRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const environmentId = yield* EnvironmentId.create(environmentIdValue);
      const environment = await environmentRepository.findOne(
        repositoryContext,
        EnvironmentByIdSpec.create(environmentId),
      );

      if (!environment) {
        return err(domainError.notFound("environment", environmentIdValue));
      }

      return ok(environment.toState().projectId.value);
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
        yield* existing.ensureCanCreateDeployment();
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

  private async resolveDefaultResource(
    context: ExecutionContext,
    defaults: DeploymentContextDefaultsDecision,
    projectIdValue: string,
    environmentIdValue: string,
    destinationIdValue: string,
  ): Promise<Result<string>> {
    const resourceDefaults = defaults.resource;
    const {
      defaultsFactory,
      environmentRepository,
      eventBus,
      logger,
      projectRepository,
      resourceRepository,
      destinationRepository,
    } = this;
    const repositoryContext = toRepositoryContext(context);

    if (resourceDefaults.mode === "required") {
      return err(domainError.validation("resourceId is required for this deployment context"));
    }

    return safeTry(async function* () {
      const projectId = yield* ProjectId.create(projectIdValue);
      const environmentId = yield* EnvironmentId.create(environmentIdValue);
      const destinationId = yield* DestinationId.create(destinationIdValue);
      const project = await projectRepository.findOne(
        repositoryContext,
        ProjectByIdSpec.create(projectId),
      );

      if (!project) {
        return err(domainError.notFound("project", projectIdValue));
      }

      const environment = await environmentRepository.findOne(
        repositoryContext,
        EnvironmentByIdSpec.create(environmentId),
      );

      if (!environment) {
        return err(domainError.notFound("environment", environmentIdValue));
      }
      yield* environment.ensureCanCreateDeployment();

      const destination = await destinationRepository.findOne(
        repositoryContext,
        DestinationByIdSpec.create(destinationId),
      );

      if (!destination) {
        return err(domainError.notFound("destination", destinationIdValue));
      }

      const selectionResult =
        resourceDefaults.preset === "local-resource"
          ? defaultsFactory.localResourceSelection(project, environment)
          : err(domainError.validation("Unsupported resource defaults preset"));
      const selection = yield* selectionResult;
      const existing = await resourceRepository.findOne(repositoryContext, selection);

      if (existing) {
        return ok(existing.toState().id.value);
      }

      const resource = yield* defaultsFactory.createLocalResource(
        project,
        environment,
        destination,
      );

      await resourceRepository.upsert(
        repositoryContext,
        resource,
        UpsertResourceSpec.fromResource(resource),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, resource, undefined);

      return ok(resource.toState().id.value);
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

  private async resolveDefaultDestination(
    context: ExecutionContext,
    defaults: DeploymentContextDefaultsDecision,
    serverIdValue: string,
  ): Promise<Result<string>> {
    const destinationDefaults = defaults.destination;
    const { defaultsFactory, destinationRepository, eventBus, logger, serverRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    if (destinationDefaults.mode === "required") {
      return err(domainError.validation("destinationId is required for this deployment context"));
    }

    return safeTry(async function* () {
      const serverId = yield* DeploymentTargetId.create(serverIdValue);
      const server = await serverRepository.findOne(
        repositoryContext,
        DeploymentTargetByIdSpec.create(serverId),
      );

      if (!server) {
        return err(domainError.notFound("server", serverIdValue));
      }

      const selectionResult =
        destinationDefaults.preset === "local-destination"
          ? defaultsFactory.localDestinationSelection(server)
          : err(domainError.validation("Unsupported destination defaults preset"));
      const selection = yield* selectionResult;
      const existing = await destinationRepository.findOne(repositoryContext, selection);

      if (existing) {
        return ok(existing.toState().id.value);
      }

      const destinationResult = defaultsFactory.createLocalDestination(server);
      const destination = yield* destinationResult;

      await destinationRepository.upsert(
        repositoryContext,
        destination,
        UpsertDestinationSpec.fromDestination(destination),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, destination, undefined);

      return ok(destination.toState().id.value);
    });
  }
}
