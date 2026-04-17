import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  BuildStrategyKindValue,
  ConfigKey,
  ConfigScopeValue,
  ConfigValueText,
  CreatedAt,
  type Deployment,
  DeploymentByIdSpec,
  DeploymentId,
  DeploymentLogEntry,
  DeploymentPhaseValue,
  DeploymentTarget,
  DeploymentTargetDescriptor,
  DeploymentTargetId,
  DeploymentTargetName,
  Destination,
  DestinationId,
  DestinationKindValue,
  DestinationName,
  DetectSummary,
  DisplayNameText,
  Environment,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  ExecutionResult,
  ExecutionStatusValue,
  ExecutionStrategyKindValue,
  ExitCode,
  FinishedAt,
  GeneratedAt,
  HostAddress,
  ImageReference,
  LogLevelValue,
  MessageText,
  OccurredAt,
  ok,
  PackagingModeValue,
  PlanStepText,
  PortNumber,
  Project,
  ProjectId,
  ProjectName,
  ProviderKey,
  Resource,
  ResourceExposureModeValue,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  ResourceNetworkProtocolValue,
  ResourceSlug,
  type Result,
  type RollbackPlan,
  RuntimeExecutionPlan,
  RuntimePlan,
  RuntimePlanId,
  RuntimePlanStrategyValue,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
  TargetKindValue,
  UpdatedAt,
  UpsertDeploymentTargetSpec,
  UpsertDestinationSpec,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  UpsertResourceSpec,
  VariableExposureValue,
  VariableKindValue,
} from "@appaloft/core";
import {
  CapturedEventBus,
  FixedClock,
  MemoryDeploymentRepository,
  MemoryDestinationRepository,
  MemoryEnvironmentRepository,
  MemoryProjectRepository,
  MemoryResourceRepository,
  MemoryServerRepository,
  NoopLogger,
  SequenceIdGenerator,
} from "@appaloft/testkit";
import {
  createExecutionContext,
  type ExecutionContext,
  toRepositoryContext,
} from "../src/execution-context";
import { CreateDeploymentCommand } from "../src/operations/deployments/create-deployment.command";
import {
  type DeploymentConfigReader,
  type DeploymentConfigSnapshot,
  type DeploymentContextDefaultsPolicy,
  type DeploymentProgressReporter,
  type ExecutionBackend,
  type ProviderDescriptor,
  type ProviderRegistry,
  type RuntimePlanResolver,
  type SourceDetector,
} from "../src/ports";
import {
  CreateDeploymentUseCase,
  DeploymentContextBootstrapService,
  DeploymentContextDefaultsFactory,
  DeploymentContextResolver,
  DeploymentFactory,
  DeploymentLifecycleService,
  DeploymentSnapshotFactory,
  RuntimePlanResolutionInputBuilder,
} from "../src/use-cases";

class StaticSourceDetector implements SourceDetector {
  async detect(_context: ExecutionContext, locator: string) {
    const source = SourceDescriptor.rehydrate({
      kind: SourceKindValue.rehydrate("local-folder"),
      locator: SourceLocator.rehydrate(locator),
      displayName: DisplayNameText.rehydrate("workspace"),
    });

    return ok({
      source,
      reasoning: ["detected local folder workspace"],
    });
  }
}

class StaticRuntimePlanResolver implements RuntimePlanResolver {
  async resolve(_context: ExecutionContext, input: Parameters<RuntimePlanResolver["resolve"]>[1]) {
    return RuntimePlan.create({
      id: RuntimePlanId.rehydrate(input.id),
      source: input.source,
      buildStrategy: BuildStrategyKindValue.rehydrate("dockerfile"),
      packagingMode: PackagingModeValue.rehydrate("all-in-one-docker"),
      execution: RuntimeExecutionPlan.rehydrate({
        kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
        image: ImageReference.rehydrate("demo:test"),
        port: PortNumber.rehydrate(3000),
      }),
      target: DeploymentTargetDescriptor.rehydrate({
        kind: TargetKindValue.rehydrate("single-server"),
        providerKey: input.server.providerKey,
        serverIds: [input.server.id],
        metadata: {
          snapshotId: input.environmentSnapshot.toState().id.value,
        },
      }),
      detectSummary: DetectSummary.rehydrate(input.detectedReasoning.join(" | ")),
      steps: [
        PlanStepText.rehydrate("package workspace"),
        PlanStepText.rehydrate("ship image"),
        PlanStepText.rehydrate("verify health"),
      ],
      generatedAt: GeneratedAt.rehydrate(input.generatedAt),
    });
  }
}

class HermeticExecutionBackend implements ExecutionBackend {
  async execute(
    _context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    deployment.applyExecutionResult(
      FinishedAt.rehydrate("2026-01-01T00:03:00.000Z"),
      ExecutionResult.rehydrate({
        exitCode: ExitCode.rehydrate(0),
        status: ExecutionStatusValue.rehydrate("succeeded"),
        retryable: false,
        logs: [
          DeploymentLogEntry.rehydrate({
            timestamp: OccurredAt.rehydrate("2026-01-01T00:02:00.000Z"),
            phase: DeploymentPhaseValue.rehydrate("deploy"),
            level: LogLevelValue.rehydrate("info"),
            message: MessageText.rehydrate("Hermetic execution backend applied runtime plan"),
          }),
        ],
      }),
    );

    return ok({ deployment });
  }

  async rollback(
    _context: ExecutionContext,
    deployment: Deployment,
    _plan: RollbackPlan,
  ): Promise<Result<{ deployment: Deployment }>> {
    deployment.applyExecutionResult(
      FinishedAt.rehydrate("2026-01-01T00:04:00.000Z"),
      ExecutionResult.rehydrate({
        exitCode: ExitCode.rehydrate(0),
        status: ExecutionStatusValue.rehydrate("rolled-back"),
        retryable: false,
        logs: [
          DeploymentLogEntry.rehydrate({
            timestamp: OccurredAt.rehydrate("2026-01-01T00:04:00.000Z"),
            phase: DeploymentPhaseValue.rehydrate("rollback"),
            level: LogLevelValue.rehydrate("info"),
            message: MessageText.rehydrate("Hermetic rollback completed"),
          }),
        ],
      }),
    );

    return ok({ deployment });
  }

  async cancel(): Promise<Result<{ logs: DeploymentLogEntry[] }>> {
    return ok({
      logs: [
        DeploymentLogEntry.rehydrate({
          timestamp: OccurredAt.rehydrate("2026-01-01T00:04:00.000Z"),
          phase: DeploymentPhaseValue.rehydrate("deploy"),
          level: LogLevelValue.rehydrate("warn"),
          message: MessageText.rehydrate("Hermetic cancellation completed"),
        }),
      ],
    });
  }
}

class NoopDeploymentProgressReporter implements DeploymentProgressReporter {
  report(): void {}
}

class NullDeploymentConfigReader implements DeploymentConfigReader {
  async read() {
    return ok(null);
  }
}

class StaticDeploymentConfigReader implements DeploymentConfigReader {
  constructor(private readonly config: DeploymentConfigSnapshot) {}

  async read() {
    return ok(this.config);
  }
}

class StaticProviderRegistry implements ProviderRegistry {
  list(): ProviderDescriptor[] {
    return [
      {
        key: "local-shell",
        title: "Local Shell",
        category: "deploy-target",
        capabilities: ["single-server"],
      },
      {
        key: "generic-ssh",
        title: "Generic SSH",
        category: "deploy-target",
        capabilities: ["single-server"],
      },
      {
        key: "aliyun",
        title: "Alibaba Cloud",
        category: "cloud-provider",
        capabilities: ["ecs"],
      },
      {
        key: "tencent-cloud",
        title: "Tencent Cloud",
        category: "cloud-provider",
        capabilities: ["cvm"],
      },
    ];
  }
}

class ExplicitContextRequiredPolicy implements DeploymentContextDefaultsPolicy {
  decide() {
    return ok({
      project: { mode: "required" as const },
      server: { mode: "required" as const },
      destination: { mode: "required" as const },
      environment: { mode: "required" as const },
      resource: { mode: "required" as const },
    });
  }
}

class LocalEmbeddedDefaultsPolicy implements DeploymentContextDefaultsPolicy {
  decide() {
    return ok({
      project: {
        mode: "reuse-or-create" as const,
        preset: "local-project" as const,
      },
      server: {
        mode: "reuse-or-create" as const,
        preset: "local-server" as const,
      },
      destination: {
        mode: "reuse-or-create" as const,
        preset: "local-destination" as const,
      },
      environment: {
        mode: "reuse-or-create" as const,
        preset: "local-environment" as const,
      },
      resource: {
        mode: "reuse-or-create" as const,
        preset: "local-resource" as const,
      },
    });
  }
}

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    entrypoint: "cli",
    requestId: "req_test",
    tracer: {
      startActiveSpan(_name, _options, callback) {
        return Promise.resolve(
          callback({
            addEvent() {},
            recordError() {},
            setAttribute() {},
            setAttributes() {},
            setStatus() {},
          }),
        );
      },
    },
  });
}

async function createDeploymentFixture(
  defaultsPolicy: DeploymentContextDefaultsPolicy = new LocalEmbeddedDefaultsPolicy(),
) {
  const projects = new MemoryProjectRepository();
  const servers = new MemoryServerRepository();
  const destinations = new MemoryDestinationRepository();
  const environments = new MemoryEnvironmentRepository();
  const resources = new MemoryResourceRepository();
  const deployments = new MemoryDeploymentRepository();
  const clock = new FixedClock("2026-01-01T00:00:00.000Z");
  const idGenerator = new SequenceIdGenerator();
  const eventBus = new CapturedEventBus();
  const logger = new NoopLogger();
  const defaultsFactory = new DeploymentContextDefaultsFactory(clock, idGenerator);
  const context = createTestContext();
  const repositoryContext = toRepositoryContext(context);
  const project = Project.create({
    id: ProjectId.rehydrate("prj_demo"),
    name: ProjectName.rehydrate("Demo"),
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();
  const server = DeploymentTarget.register({
    id: DeploymentTargetId.rehydrate("srv_demo"),
    name: DeploymentTargetName.rehydrate("demo-server"),
    host: HostAddress.rehydrate("127.0.0.1"),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate("generic-ssh"),
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();
  const destination = Destination.register({
    id: DestinationId.rehydrate("dst_demo"),
    serverId: DeploymentTargetId.rehydrate("srv_demo"),
    name: DestinationName.rehydrate("default"),
    kind: DestinationKindValue.rehydrate("generic"),
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();
  const environment = Environment.create({
    id: EnvironmentId.rehydrate("env_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    name: EnvironmentName.rehydrate("production"),
    kind: EnvironmentKindValue.rehydrate("production"),
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();
  const resource = Resource.create({
    id: ResourceId.rehydrate("res_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    destinationId: DestinationId.rehydrate("dst_demo"),
    name: ResourceName.rehydrate("web"),
    kind: ResourceKindValue.rehydrate("application"),
    sourceBinding: {
      kind: SourceKindValue.rehydrate("local-folder"),
      locator: SourceLocator.rehydrate("."),
      displayName: DisplayNameText.rehydrate("workspace"),
    },
    runtimeProfile: {
      strategy: RuntimePlanStrategyValue.rehydrate("auto"),
    },
    networkProfile: {
      internalPort: PortNumber.rehydrate(3000),
      upstreamProtocol: ResourceNetworkProtocolValue.rehydrate("http"),
      exposureMode: ResourceExposureModeValue.rehydrate("reverse-proxy"),
    },
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();

  await projects.upsert(repositoryContext, project, UpsertProjectSpec.fromProject(project));
  await servers.upsert(
    repositoryContext,
    server,
    UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
  );
  await destinations.upsert(
    repositoryContext,
    destination,
    UpsertDestinationSpec.fromDestination(destination),
  );
  await environments.upsert(
    repositoryContext,
    environment,
    UpsertEnvironmentSpec.fromEnvironment(environment),
  );
  await resources.upsert(repositoryContext, resource, UpsertResourceSpec.fromResource(resource));

  const createDeploymentUseCase = new CreateDeploymentUseCase(
    deployments,
    new DeploymentContextResolver(projects, servers, destinations, environments, resources),
    new DeploymentContextBootstrapService(
      new NullDeploymentConfigReader(),
      projects,
      servers,
      destinations,
      environments,
      resources,
      new StaticProviderRegistry(),
      defaultsPolicy,
      defaultsFactory,
      clock,
      idGenerator,
      eventBus,
      logger,
    ),
    new StaticSourceDetector(),
    new StaticRuntimePlanResolver(),
    new HermeticExecutionBackend(),
    eventBus,
    new NoopDeploymentProgressReporter(),
    logger,
    new DeploymentSnapshotFactory(clock, idGenerator),
    new RuntimePlanResolutionInputBuilder(clock, idGenerator),
    new DeploymentFactory(clock, idGenerator),
    new DeploymentLifecycleService(clock),
  );
  return {
    clock,
    context,
    createDeploymentUseCase,
    deployments,
    eventBus,
    logger,
    repositoryContext,
    resources,
    createDeploymentInput: {
      projectId: "prj_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
    },
  };
}

describe("CreateDeploymentUseCase", () => {
  test("rejects legacy deployment source and runtime fields at command schema boundary", () => {
    const command = CreateDeploymentCommand.create({
      projectId: "prj_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      sourceLocator: ".",
      deploymentMethod: "auto",
      installCommand: "bun install",
    } as never);

    expect(command.isErr()).toBe(true);
    expect(command._unsafeUnwrapErr().code).toBe("validation_error");
  });

  test("creates a deployment with an immutable environment snapshot", async () => {
    const projects = new MemoryProjectRepository();
    const servers = new MemoryServerRepository();
    const destinations = new MemoryDestinationRepository();
    const environments = new MemoryEnvironmentRepository();
    const resources = new MemoryResourceRepository();
    const deployments = new MemoryDeploymentRepository();
    const clock = new FixedClock("2026-01-01T00:00:00.000Z");
    const idGenerator = new SequenceIdGenerator();
    const eventBus = new CapturedEventBus();
    const logger = new NoopLogger();
    const defaultsFactory = new DeploymentContextDefaultsFactory(clock, idGenerator);
    const context = createTestContext();
    const repositoryContext = toRepositoryContext(context);

    const project = Project.create({
      id: ProjectId.rehydrate("prj_demo"),
      name: ProjectName.rehydrate("Demo"),
      createdAt: CreatedAt.rehydrate(clock.now()),
    })._unsafeUnwrap();
    const server = DeploymentTarget.register({
      id: DeploymentTargetId.rehydrate("srv_demo"),
      name: DeploymentTargetName.rehydrate("demo-server"),
      host: HostAddress.rehydrate("127.0.0.1"),
      port: PortNumber.rehydrate(22),
      providerKey: ProviderKey.rehydrate("generic-ssh"),
      createdAt: CreatedAt.rehydrate(clock.now()),
    })._unsafeUnwrap();
    const destination = Destination.register({
      id: DestinationId.rehydrate("dst_demo"),
      serverId: DeploymentTargetId.rehydrate("srv_demo"),
      name: DestinationName.rehydrate("default"),
      kind: DestinationKindValue.rehydrate("generic"),
      createdAt: CreatedAt.rehydrate(clock.now()),
    })._unsafeUnwrap();
    const environment = Environment.create({
      id: EnvironmentId.rehydrate("env_demo"),
      projectId: ProjectId.rehydrate("prj_demo"),
      name: EnvironmentName.rehydrate("production"),
      kind: EnvironmentKindValue.rehydrate("production"),
      createdAt: CreatedAt.rehydrate(clock.now()),
    })._unsafeUnwrap();
    const resource = Resource.create({
      id: ResourceId.rehydrate("res_demo"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      destinationId: DestinationId.rehydrate("dst_demo"),
      name: ResourceName.rehydrate("web"),
      kind: ResourceKindValue.rehydrate("application"),
      sourceBinding: {
        kind: SourceKindValue.rehydrate("local-folder"),
        locator: SourceLocator.rehydrate("."),
        displayName: DisplayNameText.rehydrate("workspace"),
      },
      runtimeProfile: {
        strategy: RuntimePlanStrategyValue.rehydrate("auto"),
      },
      networkProfile: {
        internalPort: PortNumber.rehydrate(3000),
        upstreamProtocol: ResourceNetworkProtocolValue.rehydrate("http"),
        exposureMode: ResourceExposureModeValue.rehydrate("reverse-proxy"),
      },
      createdAt: CreatedAt.rehydrate(clock.now()),
    })._unsafeUnwrap();

    environment.setVariable({
      key: ConfigKey.rehydrate("DATABASE_URL"),
      value: ConfigValueText.rehydrate("postgres://db"),
      kind: VariableKindValue.rehydrate("secret"),
      exposure: VariableExposureValue.rehydrate("runtime"),
      scope: ConfigScopeValue.rehydrate("environment"),
      isSecret: true,
      updatedAt: UpdatedAt.rehydrate(clock.now()),
    });

    await projects.upsert(repositoryContext, project, UpsertProjectSpec.fromProject(project));
    await servers.upsert(
      repositoryContext,
      server,
      UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
    );
    await destinations.upsert(
      repositoryContext,
      destination,
      UpsertDestinationSpec.fromDestination(destination),
    );
    await environments.upsert(
      repositoryContext,
      environment,
      UpsertEnvironmentSpec.fromEnvironment(environment),
    );
    await resources.upsert(repositoryContext, resource, UpsertResourceSpec.fromResource(resource));

    const contextResolver = new DeploymentContextResolver(
      projects,
      servers,
      destinations,
      environments,
      resources,
    );
    const useCase = new CreateDeploymentUseCase(
      deployments,
      contextResolver,
      new DeploymentContextBootstrapService(
        new NullDeploymentConfigReader(),
        projects,
        servers,
        destinations,
        environments,
        resources,
        new StaticProviderRegistry(),
        new ExplicitContextRequiredPolicy(),
        defaultsFactory,
        clock,
        idGenerator,
        eventBus,
        logger,
      ),
      new StaticSourceDetector(),
      new StaticRuntimePlanResolver(),
      new HermeticExecutionBackend(),
      eventBus,
      new NoopDeploymentProgressReporter(),
      logger,
      new DeploymentSnapshotFactory(clock, idGenerator),
      new RuntimePlanResolutionInputBuilder(clock, idGenerator),
      new DeploymentFactory(clock, idGenerator),
      new DeploymentLifecycleService(clock),
    );

    const result = await useCase.execute(context, {
      projectId: "prj_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
    });

    expect(result.isOk()).toBe(true);
    const createdDeployment = result._unsafeUnwrap();

    const deployment = await deployments.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate(createdDeployment.id)),
    );
    expect(deployment).not.toBeNull();
    expect(deployment?.toState().status.value).toBe("succeeded");
    expect(deployment?.toState().environmentSnapshot.variables).toEqual([
      expect.objectContaining({
        key: "DATABASE_URL",
        value: "postgres://db",
        isSecret: true,
      }),
    ]);
    expect(deployment?.toState().logs).toHaveLength(1);
    expect(eventBus.events.length).toBeGreaterThan(0);
  });

  test("rejects deployment admission when resource has no source binding", async () => {
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      resources,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy());
    const resourceWithoutSource = Resource.create({
      id: ResourceId.rehydrate("res_demo"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      destinationId: DestinationId.rehydrate("dst_demo"),
      name: ResourceName.rehydrate("web"),
      kind: ResourceKindValue.rehydrate("application"),
      runtimeProfile: {
        strategy: RuntimePlanStrategyValue.rehydrate("auto"),
      },
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();

    await resources.upsert(
      repositoryContext,
      resourceWithoutSource,
      UpsertResourceSpec.fromResource(resourceWithoutSource),
    );

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe("validation_error");
    expect(error.details).toMatchObject({
      phase: "resource-source-resolution",
      resourceId: "res_demo",
    });
  });

  test("rejects deployment admission when resource keeps an unnormalized GitHub tree URL", async () => {
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      resources,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy());
    const legacyResource = Resource.rehydrate({
      id: ResourceId.rehydrate("res_demo"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      destinationId: DestinationId.rehydrate("dst_demo"),
      name: ResourceName.rehydrate("web"),
      slug: ResourceSlug.rehydrate("web"),
      kind: ResourceKindValue.rehydrate("application"),
      services: [],
      sourceBinding: {
        kind: SourceKindValue.rehydrate("git-public"),
        locator: SourceLocator.rehydrate(
          "https://github.com/coollabsio/coolify-examples/tree/v4.x/bun",
        ),
        displayName: DisplayNameText.rehydrate("coollabsio/coolify-examples"),
      },
      runtimeProfile: {
        strategy: RuntimePlanStrategyValue.rehydrate("dockerfile"),
      },
      networkProfile: {
        internalPort: PortNumber.rehydrate(3000),
        upstreamProtocol: ResourceNetworkProtocolValue.rehydrate("http"),
        exposureMode: ResourceExposureModeValue.rehydrate("reverse-proxy"),
      },
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    });

    await resources.upsert(
      repositoryContext,
      legacyResource,
      UpsertResourceSpec.fromResource(legacyResource),
    );

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe("validation_error");
    expect(error.details).toMatchObject({
      phase: "resource-source-resolution",
      sourceKind: "git-public",
      sourceLocator: "https://github.com/coollabsio/coolify-examples/tree/v4.x/bun",
    });
  });

  test("rejects deployment admission when inbound resource has no internal port", async () => {
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      resources,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy());
    const resourceWithoutNetworkProfile = Resource.create({
      id: ResourceId.rehydrate("res_demo"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      destinationId: DestinationId.rehydrate("dst_demo"),
      name: ResourceName.rehydrate("web"),
      kind: ResourceKindValue.rehydrate("application"),
      sourceBinding: {
        kind: SourceKindValue.rehydrate("local-folder"),
        locator: SourceLocator.rehydrate("."),
        displayName: DisplayNameText.rehydrate("workspace"),
      },
      runtimeProfile: {
        strategy: RuntimePlanStrategyValue.rehydrate("auto"),
      },
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();

    await resources.upsert(
      repositoryContext,
      resourceWithoutNetworkProfile,
      UpsertResourceSpec.fromResource(resourceWithoutNetworkProfile),
    );

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe("validation_error");
    expect(error.details).toMatchObject({
      phase: "resource-network-resolution",
      resourceId: "res_demo",
      resourceKind: "application",
    });
  });

  test.skip("bootstraps a default local deployment context when ids are omitted", async () => {
    const projects = new MemoryProjectRepository();
    const servers = new MemoryServerRepository();
    const destinations = new MemoryDestinationRepository();
    const environments = new MemoryEnvironmentRepository();
    const resources = new MemoryResourceRepository();
    const deployments = new MemoryDeploymentRepository();
    const clock = new FixedClock("2026-01-01T00:00:00.000Z");
    const idGenerator = new SequenceIdGenerator();
    const eventBus = new CapturedEventBus();
    const logger = new NoopLogger();
    const defaultsFactory = new DeploymentContextDefaultsFactory(clock, idGenerator);
    const context = createTestContext();
    const repositoryContext = toRepositoryContext(context);

    const contextResolver = new DeploymentContextResolver(
      projects,
      servers,
      destinations,
      environments,
      resources,
    );
    const useCase = new CreateDeploymentUseCase(
      deployments,
      contextResolver,
      new DeploymentContextBootstrapService(
        new NullDeploymentConfigReader(),
        projects,
        servers,
        destinations,
        environments,
        resources,
        new StaticProviderRegistry(),
        new LocalEmbeddedDefaultsPolicy(),
        defaultsFactory,
        clock,
        idGenerator,
        eventBus,
        logger,
      ),
      new StaticSourceDetector(),
      new StaticRuntimePlanResolver(),
      new HermeticExecutionBackend(),
      eventBus,
      new NoopDeploymentProgressReporter(),
      logger,
      new DeploymentSnapshotFactory(clock, idGenerator),
      new RuntimePlanResolutionInputBuilder(clock, idGenerator),
      new DeploymentFactory(clock, idGenerator),
      new DeploymentLifecycleService(clock),
    );

    const result = await useCase.execute(context, {
      sourceLocator: ".",
    } as never);

    expect(result.isOk()).toBe(true);
    expect(projects.items.size).toBe(1);
    expect(servers.items.size).toBe(1);
    expect(destinations.items.size).toBe(1);
    expect(environments.items.size).toBe(1);
    expect(resources.items.size).toBe(1);

    const deployment = await deployments.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate(result._unsafeUnwrap().id)),
    );
    expect(deployment?.toState().projectId.value).toBe("prj_0001");
    expect(deployment?.toState().environmentId.value).toBe("env_0002");
    expect(deployment?.toState().serverId.value).toBe("srv_0003");
    expect(deployment?.toState().destinationId.value).toBe("dst_0004");
    expect(deployment?.toState().resourceId.value).toBe("res_0005");
    expect([...servers.items.values()][0]?.toState().providerKey.value).toBe("local-shell");
    expect([...environments.items.values()][0]?.toState().name.value).toBe("local");
  });

  test.skip("uses command resource bootstrap spec when ids are omitted", async () => {
    const projects = new MemoryProjectRepository();
    const servers = new MemoryServerRepository();
    const destinations = new MemoryDestinationRepository();
    const environments = new MemoryEnvironmentRepository();
    const resources = new MemoryResourceRepository();
    const deployments = new MemoryDeploymentRepository();
    const clock = new FixedClock("2026-01-01T00:00:00.000Z");
    const idGenerator = new SequenceIdGenerator();
    const eventBus = new CapturedEventBus();
    const logger = new NoopLogger();
    const defaultsFactory = new DeploymentContextDefaultsFactory(clock, idGenerator);
    const context = createTestContext();

    const contextResolver = new DeploymentContextResolver(
      projects,
      servers,
      destinations,
      environments,
      resources,
    );
    const useCase = new CreateDeploymentUseCase(
      deployments,
      contextResolver,
      new DeploymentContextBootstrapService(
        new NullDeploymentConfigReader(),
        projects,
        servers,
        destinations,
        environments,
        resources,
        new StaticProviderRegistry(),
        new LocalEmbeddedDefaultsPolicy(),
        defaultsFactory,
        clock,
        idGenerator,
        eventBus,
        logger,
      ),
      new StaticSourceDetector(),
      new StaticRuntimePlanResolver(),
      new HermeticExecutionBackend(),
      eventBus,
      new NoopDeploymentProgressReporter(),
      logger,
      new DeploymentSnapshotFactory(clock, idGenerator),
      new RuntimePlanResolutionInputBuilder(clock, idGenerator),
      new DeploymentFactory(clock, idGenerator),
      new DeploymentLifecycleService(clock),
    );

    const result = await useCase.execute(context, {
      sourceLocator: "https://github.com/acme/hello-api.git",
      resource: {
        name: "hello-api",
        kind: "application",
      },
    } as never);

    expect(result.isOk()).toBe(true);
    expect(resources.items.size).toBe(1);
    const resource = [...resources.items.values()][0];
    expect(resource?.toState().name.value).toBe("hello-api");
    expect(resource?.toState().slug.value).toBe("hello-api");
    expect(resource?.toState().destinationId?.value).toBe("dst_0004");
  });

  test.skip("bootstraps deployment context from deployment config", async () => {
    const projects = new MemoryProjectRepository();
    const servers = new MemoryServerRepository();
    const destinations = new MemoryDestinationRepository();
    const environments = new MemoryEnvironmentRepository();
    const resources = new MemoryResourceRepository();
    const deployments = new MemoryDeploymentRepository();
    const clock = new FixedClock("2026-01-01T00:00:00.000Z");
    const idGenerator = new SequenceIdGenerator();
    const eventBus = new CapturedEventBus();
    const logger = new NoopLogger();
    const defaultsFactory = new DeploymentContextDefaultsFactory(clock, idGenerator);
    const context = createTestContext();
    const repositoryContext = toRepositoryContext(context);

    const contextResolver = new DeploymentContextResolver(
      projects,
      servers,
      destinations,
      environments,
      resources,
    );
    const useCase = new CreateDeploymentUseCase(
      deployments,
      contextResolver,
      new DeploymentContextBootstrapService(
        new StaticDeploymentConfigReader({
          project: {
            name: "Configured App",
          },
          environment: {
            name: "production",
            kind: "production",
          },
          resource: {
            name: "web",
            kind: "application",
          },
          targets: [
            {
              key: "aliyun",
              name: "Aliyun Production",
              providerKey: "aliyun",
              host: "203.0.113.10",
              port: 22,
            },
          ],
          deployment: {
            targetKey: "aliyun",
            method: "workspace-commands",
            startCommand: "node dist/server.js",
            port: 3000,
          },
        }),
        projects,
        servers,
        destinations,
        environments,
        resources,
        new StaticProviderRegistry(),
        new ExplicitContextRequiredPolicy(),
        defaultsFactory,
        clock,
        idGenerator,
        eventBus,
        logger,
      ),
      new StaticSourceDetector(),
      new StaticRuntimePlanResolver(),
      new HermeticExecutionBackend(),
      eventBus,
      new NoopDeploymentProgressReporter(),
      logger,
      new DeploymentSnapshotFactory(clock, idGenerator),
      new RuntimePlanResolutionInputBuilder(clock, idGenerator),
      new DeploymentFactory(clock, idGenerator),
      new DeploymentLifecycleService(clock),
    );

    const result = await useCase.execute(context, {
      sourceLocator: ".",
    } as never);

    expect(result.isOk()).toBe(true);
    expect([...projects.items.values()][0]?.toState().name.value).toBe("Configured App");
    expect([...environments.items.values()][0]?.toState().name.value).toBe("production");
    expect([...resources.items.values()][0]?.toState().name.value).toBe("web");
    expect([...servers.items.values()][0]?.toState().providerKey.value).toBe("aliyun");
    expect([...destinations.items.values()][0]?.toState().name.value).toBe("default");

    const deployment = await deployments.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate(result._unsafeUnwrap().id)),
    );
    expect(deployment?.toState().projectId.value).toBe("prj_0001");
    expect(deployment?.toState().environmentId.value).toBe("env_0002");
    expect(deployment?.toState().serverId.value).toBe("srv_0003");
    expect(deployment?.toState().destinationId.value).toBe("dst_0004");
    expect(deployment?.toState().resourceId.value).toBe("res_0005");
  });
});
