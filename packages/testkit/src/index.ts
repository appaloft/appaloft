import {
  type AppLogger,
  type Clock,
  type DeploymentLogSummary,
  type DeploymentReadModel,
  type DeploymentRepository,
  type DeploymentSummary,
  type EnvironmentReadModel,
  type EnvironmentRepository,
  type EnvironmentSummary,
  type EventBus,
  type ExecutionContext,
  type IdGenerator,
  type ProjectReadModel,
  type ProjectRepository,
  type RepositoryContext,
  type ServerReadModel,
  type ServerRepository,
} from "@yundu/application";
import {
  Deployment,
  DeploymentByIdSpec,
  type DeploymentMutationSpec,
  type DeploymentSelectionSpec,
  DeploymentTarget,
  DeploymentTargetByIdSpec,
  DeploymentTargetByProviderAndHostSpec,
  type DeploymentTargetMutationSpec,
  type DeploymentTargetSelectionSpec,
  Environment,
  EnvironmentByIdSpec,
  EnvironmentByProjectAndNameSpec,
  type EnvironmentMutationSpec,
  type EnvironmentSelectionSpec,
  Project,
  ProjectByIdSpec,
  ProjectBySlugSpec,
  type ProjectMutationSpec,
  type ProjectSelectionSpec,
} from "@yundu/core";

export class FixedClock implements Clock {
  constructor(private value = "2026-01-01T00:00:00.000Z") {}

  now(): string {
    return this.value;
  }

  set(value: string): void {
    this.value = value;
  }
}

export class SequenceIdGenerator implements IdGenerator {
  private sequence = 0;

  next(prefix: string): string {
    this.sequence += 1;
    return `${prefix}_${String(this.sequence).padStart(4, "0")}`;
  }
}

export class CapturedEventBus implements EventBus {
  readonly events: unknown[] = [];

  async publish(context: ExecutionContext, events: unknown[]): Promise<void> {
    void context;
    this.events.push(...events);
  }
}

export class NoopLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

export class MemoryProjectRepository implements ProjectRepository {
  readonly items = new Map<string, Project>();

  async upsert(
    context: RepositoryContext,
    project: Project,
    spec: ProjectMutationSpec,
  ): Promise<void> {
    void context;
    void spec;
    this.items.set(project.toState().id.value, Project.rehydrate(project.toState()));
  }

  async findOne(context: RepositoryContext, spec: ProjectSelectionSpec): Promise<Project | null> {
    void context;
    if (spec instanceof ProjectByIdSpec) {
      return this.items.get(spec.id.value) ?? null;
    }

    if (spec instanceof ProjectBySlugSpec) {
      for (const project of this.items.values()) {
        if (project.toState().slug.equals(spec.slug)) {
          return project;
        }
      }
    }

    return null;
  }
}

export class MemoryProjectReadModel implements ProjectReadModel {
  constructor(private readonly repository: MemoryProjectRepository) {}

  async list(context: RepositoryContext) {
    void context;
    return [...this.repository.items.values()].map((project) => {
      const state = project.toState();
      return {
        id: state.id.value,
        name: state.name.value,
        slug: state.slug.value,
        ...(state.description ? { description: state.description.value } : {}),
        createdAt: state.createdAt.value,
      };
    });
  }
}

export class MemoryServerRepository implements ServerRepository {
  readonly items = new Map<string, DeploymentTarget>();

  async upsert(
    context: RepositoryContext,
    server: DeploymentTarget,
    spec: DeploymentTargetMutationSpec,
  ): Promise<void> {
    void context;
    void spec;
    this.items.set(server.toState().id.value, DeploymentTarget.rehydrate(server.toState()));
  }

  async findOne(
    context: RepositoryContext,
    spec: DeploymentTargetSelectionSpec,
  ): Promise<DeploymentTarget | null> {
    void context;
    if (spec instanceof DeploymentTargetByIdSpec) {
      return this.items.get(spec.id.value) ?? null;
    }

    if (spec instanceof DeploymentTargetByProviderAndHostSpec) {
      for (const server of this.items.values()) {
        const state = server.toState();
        if (state.providerKey.equals(spec.providerKey) && state.host.equals(spec.host)) {
          return server;
        }
      }
    }

    return null;
  }
}

export class MemoryServerReadModel implements ServerReadModel {
  constructor(private readonly repository: MemoryServerRepository) {}

  async list(context: RepositoryContext) {
    void context;
    return [...this.repository.items.values()].map((server) => {
      const state = server.toState();
      return {
        id: state.id.value,
        name: state.name.value,
        host: state.host.value,
        port: state.port.value,
        providerKey: state.providerKey.value,
        createdAt: state.createdAt.value,
      };
    });
  }
}

export class MemoryEnvironmentRepository implements EnvironmentRepository {
  readonly items = new Map<string, Environment>();

  async upsert(
    context: RepositoryContext,
    environment: Environment,
    spec: EnvironmentMutationSpec,
  ): Promise<void> {
    void context;
    void spec;
    this.items.set(environment.toState().id.value, Environment.rehydrate(environment.toState()));
  }

  async findOne(
    context: RepositoryContext,
    spec: EnvironmentSelectionSpec,
  ): Promise<Environment | null> {
    void context;
    if (spec instanceof EnvironmentByIdSpec) {
      return this.items.get(spec.id.value) ?? null;
    }

    if (spec instanceof EnvironmentByProjectAndNameSpec) {
      for (const environment of this.items.values()) {
        const state = environment.toState();
        if (state.projectId.equals(spec.projectId) && state.name.equals(spec.name)) {
          return environment;
        }
      }
    }

    return null;
  }
}

export class MemoryEnvironmentReadModel implements EnvironmentReadModel {
  constructor(
    private readonly repository: MemoryEnvironmentRepository,
    private readonly secretMask = "****",
  ) {}

  async list(context: RepositoryContext, projectId?: string) {
    void context;
    return [...this.repository.items.values()]
      .map((environment) => environment.toState())
      .filter((environment) => (projectId ? environment.projectId.value === projectId : true))
      .map(
        (environment): EnvironmentSummary => ({
          id: environment.id.value,
          projectId: environment.projectId.value,
          name: environment.name.value,
          kind: environment.kind.value,
          createdAt: environment.createdAt.value,
          ...(environment.parentEnvironmentId
            ? { parentEnvironmentId: environment.parentEnvironmentId.value }
            : {}),
          maskedVariables: environment.variables.map((variable) => ({
            key: variable.key,
            value: variable.isSecret ? this.secretMask : variable.value,
            scope: variable.scope as EnvironmentSummary["maskedVariables"][number]["scope"],
            exposure:
              variable.exposure as EnvironmentSummary["maskedVariables"][number]["exposure"],
            isSecret: variable.isSecret,
            kind: variable.kind as EnvironmentSummary["maskedVariables"][number]["kind"],
          })),
        }),
      );
  }

  async findById(context: RepositoryContext, id: string) {
    const environments = await this.list(context);
    return environments.find((environment) => environment.id === id) ?? null;
  }
}

export class MemoryDeploymentRepository implements DeploymentRepository {
  readonly items = new Map<string, Deployment>();

  async upsert(
    context: RepositoryContext,
    deployment: Deployment,
    spec: DeploymentMutationSpec,
  ): Promise<void> {
    void context;
    void spec;
    this.items.set(deployment.toState().id.value, Deployment.rehydrate(deployment.toState()));
  }

  async findOne(
    context: RepositoryContext,
    spec: DeploymentSelectionSpec,
  ): Promise<Deployment | null> {
    void context;
    if (spec instanceof DeploymentByIdSpec) {
      return this.items.get(spec.id.value) ?? null;
    }

    return null;
  }
}

export class MemoryDeploymentReadModel implements DeploymentReadModel {
  constructor(private readonly repository: MemoryDeploymentRepository) {}

  async list(context: RepositoryContext, projectId?: string) {
    void context;
    return [...this.repository.items.values()]
      .map((deployment) => deployment.toState())
      .filter((deployment) => (projectId ? deployment.projectId.value === projectId : true))
      .map(
        (deployment): DeploymentSummary => ({
          id: deployment.id.value,
          projectId: deployment.projectId.value,
          environmentId: deployment.environmentId.value,
          serverId: deployment.serverId.value,
          status: deployment.status.value,
          runtimePlan: {
            id: deployment.runtimePlan.id,
            source: {
              kind: deployment.runtimePlan.source.kind,
              locator: deployment.runtimePlan.source.locator,
              displayName: deployment.runtimePlan.source.displayName,
              ...(deployment.runtimePlan.source.metadata
                ? { metadata: deployment.runtimePlan.source.metadata }
                : {}),
            },
            buildStrategy: deployment.runtimePlan.buildStrategy,
            packagingMode: deployment.runtimePlan.packagingMode,
            execution: {
              kind: deployment.runtimePlan.execution.kind,
              ...(deployment.runtimePlan.execution.workingDirectory
                ? { workingDirectory: deployment.runtimePlan.execution.workingDirectory }
                : {}),
              ...(deployment.runtimePlan.execution.installCommand
                ? { installCommand: deployment.runtimePlan.execution.installCommand }
                : {}),
              ...(deployment.runtimePlan.execution.buildCommand
                ? { buildCommand: deployment.runtimePlan.execution.buildCommand }
                : {}),
              ...(deployment.runtimePlan.execution.startCommand
                ? { startCommand: deployment.runtimePlan.execution.startCommand }
                : {}),
              ...(deployment.runtimePlan.execution.healthCheckPath
                ? { healthCheckPath: deployment.runtimePlan.execution.healthCheckPath }
                : {}),
              ...(typeof deployment.runtimePlan.execution.port === "number"
                ? { port: deployment.runtimePlan.execution.port }
                : {}),
              ...(deployment.runtimePlan.execution.image
                ? { image: deployment.runtimePlan.execution.image }
                : {}),
              ...(deployment.runtimePlan.execution.dockerfilePath
                ? { dockerfilePath: deployment.runtimePlan.execution.dockerfilePath }
                : {}),
              ...(deployment.runtimePlan.execution.composeFile
                ? { composeFile: deployment.runtimePlan.execution.composeFile }
                : {}),
              ...(deployment.runtimePlan.execution.metadata
                ? { metadata: deployment.runtimePlan.execution.metadata }
                : {}),
            },
            target: {
              kind: deployment.runtimePlan.target.kind,
              providerKey: deployment.runtimePlan.target.providerKey,
              serverIds: [...deployment.runtimePlan.target.serverIds],
              ...(deployment.runtimePlan.target.metadata
                ? { metadata: deployment.runtimePlan.target.metadata }
                : {}),
            },
            detectSummary: deployment.runtimePlan.detectSummary,
            generatedAt: deployment.runtimePlan.generatedAt,
            steps: deployment.runtimePlan.steps,
          },
          environmentSnapshot: {
            id: deployment.environmentSnapshot.id,
            environmentId: deployment.environmentSnapshot.environmentId,
            createdAt: deployment.environmentSnapshot.createdAt,
            precedence: [...deployment.environmentSnapshot.precedence],
            variables: deployment.environmentSnapshot.variables.map((variable) => ({
              key: variable.key,
              value: variable.value,
              kind: variable.kind as DeploymentSummary["environmentSnapshot"]["variables"][number]["kind"],
              exposure:
                variable.exposure as DeploymentSummary["environmentSnapshot"]["variables"][number]["exposure"],
              scope:
                variable.scope as DeploymentSummary["environmentSnapshot"]["variables"][number]["scope"],
              isSecret: variable.isSecret,
            })),
          },
          createdAt: deployment.createdAt.value,
          ...(deployment.startedAt ? { startedAt: deployment.startedAt.value } : {}),
          ...(deployment.finishedAt ? { finishedAt: deployment.finishedAt.value } : {}),
          ...(deployment.rollbackOfDeploymentId
            ? { rollbackOfDeploymentId: deployment.rollbackOfDeploymentId.value }
            : {}),
          logs: deployment.logs.map((log) => ({
            timestamp: log.timestamp,
            source: log.source as DeploymentLogSummary["source"],
            phase: log.phase as DeploymentLogSummary["phase"],
            level: log.level as DeploymentLogSummary["level"],
            message: log.message,
          })),
          logCount: deployment.logs.length,
        }),
      );
  }

  async findLogs(context: RepositoryContext, id: string): Promise<DeploymentLogSummary[]> {
    void context;
    return (this.repository.items.get(id)?.toState().logs ?? []).map((log) => ({
      timestamp: log.timestamp,
      source: log.source as DeploymentLogSummary["source"],
      phase: log.phase as DeploymentLogSummary["phase"],
      level: log.level as DeploymentLogSummary["level"],
      message: log.message,
    }));
  }
}
