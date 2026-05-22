import {
  type AppLogger,
  type EnvironmentReadModel,
  type EnvironmentSummary,
  type ExecutionContextFactory,
  type ProjectReadModel,
  type ProjectSummary,
  type ResourceReadModel,
  type ResourceSummary,
  type RuntimeMonitoringCollectorService,
  type RuntimeMonitoringScope,
  type ServerReadModel,
  type ServerSummary,
  toRepositoryContext,
} from "@appaloft/application";

export interface RuntimeMonitoringCollectorRunner {
  start(): void;
  stop(): void;
}

export interface RuntimeMonitoringCollectorRunnerConfig {
  enabled: boolean;
  intervalSeconds: number;
  batchSize: number;
  rawRetentionHours: number;
}

export interface RuntimeMonitoringCollectorRunnerInput {
  config: RuntimeMonitoringCollectorRunnerConfig;
  serverReadModel: Pick<ServerReadModel, "list">;
  projectReadModel: Pick<ProjectReadModel, "list">;
  environmentReadModel: Pick<EnvironmentReadModel, "list">;
  resourceReadModel: Pick<ResourceReadModel, "list">;
  service: Pick<RuntimeMonitoringCollectorService, "run">;
  executionContextFactory: ExecutionContextFactory;
  logger: AppLogger;
}

interface RuntimeMonitoringCollectorTarget {
  scope: RuntimeMonitoringScope;
  providerKey?: string;
}

function scopeId(scope: RuntimeMonitoringScope): string {
  switch (scope.kind) {
    case "server":
      return scope.serverId;
    case "project":
      return scope.projectId;
    case "environment":
      return scope.environmentId;
    case "resource":
      return scope.resourceId;
    case "deployment":
      return scope.deploymentId;
  }
}

function isRuntimeOwningResource(resource: ResourceSummary): boolean {
  return (
    Boolean(resource.lastDeploymentId) &&
    (resource.lastDeploymentStatus === "succeeded" ||
      resource.lastDeploymentStatus === "rolled-back")
  );
}

function serverTargets(servers: ServerSummary[]): RuntimeMonitoringCollectorTarget[] {
  return servers
    .filter((server) => server.lifecycleStatus === "active")
    .map((server) => ({
      scope: { kind: "server", serverId: server.id },
      providerKey: server.providerKey,
    }));
}

function resourceTargets(input: {
  resources: ResourceSummary[];
  activeProjectIds: Set<string>;
  collectableEnvironmentIds: Set<string>;
}): RuntimeMonitoringCollectorTarget[] {
  return input.resources
    .filter(
      (resource) =>
        isRuntimeOwningResource(resource) &&
        input.activeProjectIds.has(resource.projectId) &&
        input.collectableEnvironmentIds.has(resource.environmentId),
    )
    .map((resource) => ({
      scope: { kind: "resource", resourceId: resource.id },
    }));
}

function projectTargets(input: {
  projects: ProjectSummary[];
  resources: ResourceSummary[];
}): RuntimeMonitoringCollectorTarget[] {
  const projectIdsWithRuntimeResources = new Set(
    input.resources.map((resource) => resource.projectId),
  );
  return input.projects
    .filter(
      (project) =>
        project.lifecycleStatus === "active" && projectIdsWithRuntimeResources.has(project.id),
    )
    .map((project) => ({
      scope: { kind: "project", projectId: project.id },
    }));
}

function environmentTargets(input: {
  environments: EnvironmentSummary[];
  resources: ResourceSummary[];
}): RuntimeMonitoringCollectorTarget[] {
  const environmentIdsWithRuntimeResources = new Set(
    input.resources.map((resource) => resource.environmentId),
  );
  return input.environments
    .filter(
      (environment) =>
        environment.lifecycleStatus !== "archived" &&
        environmentIdsWithRuntimeResources.has(environment.id),
    )
    .map((environment) => ({
      scope: { kind: "environment", environmentId: environment.id },
    }));
}

function deploymentTargets(resources: ResourceSummary[]): RuntimeMonitoringCollectorTarget[] {
  const deploymentIds = new Set(
    resources
      .map((resource) => resource.lastDeploymentId)
      .filter((deploymentId): deploymentId is string => Boolean(deploymentId)),
  );

  return [...deploymentIds].map((deploymentId) => ({
    scope: { kind: "deployment", deploymentId },
  }));
}

async function collectTargets(
  input: RuntimeMonitoringCollectorRunnerInput,
  context: ReturnType<RuntimeMonitoringCollectorRunnerInput["executionContextFactory"]["create"]>,
): Promise<RuntimeMonitoringCollectorTarget[]> {
  const repositoryContext = toRepositoryContext(context);
  const [servers, projects, resources] = await Promise.all([
    input.serverReadModel.list(repositoryContext),
    input.projectReadModel.list(repositoryContext),
    input.resourceReadModel.list(repositoryContext),
  ]);
  const activeProjects = projects.filter((project) => project.lifecycleStatus === "active");
  const activeProjectIds = new Set(activeProjects.map((project) => project.id));
  const environments = (
    await Promise.all(
      activeProjects.map((project) =>
        input.environmentReadModel.list(repositoryContext, { projectId: project.id }),
      ),
    )
  ).flat();
  const collectableEnvironmentIds = new Set(
    environments
      .filter((environment) => environment.lifecycleStatus !== "archived")
      .map((environment) => environment.id),
  );
  const collectableResources = resources.filter(
    (resource) =>
      isRuntimeOwningResource(resource) &&
      activeProjectIds.has(resource.projectId) &&
      collectableEnvironmentIds.has(resource.environmentId),
  );

  return [
    ...serverTargets(servers),
    ...resourceTargets({ resources, activeProjectIds, collectableEnvironmentIds }),
    ...deploymentTargets(collectableResources),
    ...projectTargets({ projects, resources: collectableResources }),
    ...environmentTargets({ environments, resources: collectableResources }),
  ];
}

export function createRuntimeMonitoringCollectorRunner(
  input: RuntimeMonitoringCollectorRunnerInput,
): RuntimeMonitoringCollectorRunner {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;

  async function tick(): Promise<void> {
    if (running) {
      return;
    }

    running = true;
    try {
      const context = input.executionContextFactory.create({
        entrypoint: "system",
        actor: {
          kind: "system",
          id: "runtime-monitoring-collector-runner",
          label: "Runtime monitoring collector runner",
        },
      });
      const candidates = await collectTargets(input, context);
      const targets = candidates.slice(0, input.config.batchSize);
      let completed = 0;
      let failed = 0;

      for (const target of targets) {
        const result = await input.service.run(context, {
          scope: target.scope,
          rawRetentionHours: input.config.rawRetentionHours,
          collectionProfile: "full",
        });

        if (result.isOk()) {
          completed += 1;
          continue;
        }

        failed += 1;
        input.logger.error("runtime_monitoring_collector_runner.collect_failed", {
          scopeKind: target.scope.kind,
          scopeId: scopeId(target.scope),
          ...(target.scope.kind === "server" ? { serverId: target.scope.serverId } : {}),
          ...(target.providerKey ? { providerKey: target.providerKey } : {}),
          errorCode: result.error.code,
          message: result.error.message,
        });
      }

      if (candidates.length > 0 || completed > 0 || failed > 0) {
        input.logger.info("runtime_monitoring_collector_runner.tick_completed", {
          scanned: candidates.length,
          targeted: targets.length,
          completed,
          failed,
        });
      }
    } catch (error) {
      input.logger.error("runtime_monitoring_collector_runner.tick_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  }

  return {
    start(): void {
      if (!input.config.enabled || timer) {
        return;
      }

      void tick();
      timer = setInterval(() => {
        void tick();
      }, input.config.intervalSeconds * 1000);
      input.logger.info("runtime_monitoring_collector_runner.started", {
        intervalSeconds: input.config.intervalSeconds,
        batchSize: input.config.batchSize,
        rawRetentionHours: input.config.rawRetentionHours,
      });
    },
    stop(): void {
      if (!timer) {
        return;
      }

      clearInterval(timer);
      timer = undefined;
      input.logger.info("runtime_monitoring_collector_runner.stopped");
    },
  };
}

export function createDisabledRuntimeMonitoringCollectorRunner(): RuntimeMonitoringCollectorRunner {
  return {
    start(): void {},
    stop(): void {},
  };
}
