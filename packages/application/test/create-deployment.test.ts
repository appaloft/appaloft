import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  ArchivedAt,
  BuildStrategyKindValue,
  CommandText,
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
  domainError,
  EdgeProxyKindValue,
  Environment,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  ExecutionResult,
  ExecutionStatusValue,
  ExecutionStrategyKindValue,
  ExitCode,
  err,
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
  ResourceByIdSpec,
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
  SourceBaseDirectory,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
  StaticPublishDirectory,
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
  type DomainRouteBindingCandidate,
  type DomainRouteBindingReader,
  type ExecutionBackend,
  type ProviderDescriptor,
  type ProviderRegistry,
  type RuntimePlanResolver,
  type ServerAppliedRouteDesiredStateReader,
  type ServerAppliedRouteDesiredStateRecord,
  type ServerAppliedRouteDesiredStateTarget,
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

class CapturingRuntimePlanResolver implements RuntimePlanResolver {
  public input?: Parameters<RuntimePlanResolver["resolve"]>[1];

  async resolve(context: ExecutionContext, input: Parameters<RuntimePlanResolver["resolve"]>[1]) {
    this.input = input;
    return new StaticRuntimePlanResolver().resolve(context, input);
  }
}

class StaticServerAppliedRouteDesiredStateReader implements ServerAppliedRouteDesiredStateReader {
  public targets: ServerAppliedRouteDesiredStateTarget[] = [];

  constructor(private readonly record: ServerAppliedRouteDesiredStateRecord | null) {}

  async read(
    target: ServerAppliedRouteDesiredStateTarget,
  ): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>> {
    this.targets.push(target);
    return ok(this.record);
  }
}

class StaticDomainRouteBindingReader implements DomainRouteBindingReader {
  public targets: Parameters<DomainRouteBindingReader["listDeployableBindings"]>[1][] = [];

  constructor(private readonly bindings: DomainRouteBindingCandidate[]) {}

  async listDeployableBindings(
    _context: Parameters<DomainRouteBindingReader["listDeployableBindings"]>[0],
    input: Parameters<DomainRouteBindingReader["listDeployableBindings"]>[1],
  ): Promise<DomainRouteBindingCandidate[]> {
    this.targets.push(input);
    return this.bindings;
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

class FailingStaticPackageExecutionBackend extends HermeticExecutionBackend {
  async execute(): Promise<Result<{ deployment: Deployment }>> {
    return err(
      domainError.provider(
        "Static artifact package failed",
        {
          phase: "image-build",
          step: "static-package",
          runtimePlanStrategy: "static",
          publishDirectory: "/dist",
        },
        true,
      ),
    );
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
  options: {
    runtimePlanResolver?: RuntimePlanResolver;
    executionBackend?: ExecutionBackend;
    edgeProxyKind?: "traefik" | "caddy";
    domainRouteBindingReader?: DomainRouteBindingReader;
    serverAppliedRouteDesiredStateReader?: ServerAppliedRouteDesiredStateReader;
  } = {},
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
    ...(options.edgeProxyKind
      ? { edgeProxyKind: EdgeProxyKindValue.rehydrate(options.edgeProxyKind) }
      : {}),
    createdAt: CreatedAt.rehydrate(clock.now()),
  })._unsafeUnwrap();
  if (options.edgeProxyKind) {
    server.markEdgeProxyReady({
      completedAt: UpdatedAt.rehydrate(clock.now()),
    });
  }
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
    options.runtimePlanResolver ?? new StaticRuntimePlanResolver(),
    options.executionBackend ?? new HermeticExecutionBackend(),
    eventBus,
    new NoopDeploymentProgressReporter(),
    logger,
    new DeploymentSnapshotFactory(clock, idGenerator),
    new RuntimePlanResolutionInputBuilder(clock, idGenerator),
    new DeploymentFactory(clock, idGenerator),
    new DeploymentLifecycleService(clock),
    options.domainRouteBindingReader,
    options.serverAppliedRouteDesiredStateReader,
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

function createStaticSiteResource(input: { publishDirectory?: string } = {}): Resource {
  return Resource.rehydrate({
    id: ResourceId.rehydrate("res_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    destinationId: DestinationId.rehydrate("dst_demo"),
    name: ResourceName.rehydrate("docs"),
    slug: ResourceSlug.rehydrate("docs"),
    kind: ResourceKindValue.rehydrate("static-site"),
    services: [],
    sourceBinding: {
      kind: SourceKindValue.rehydrate("local-folder"),
      locator: SourceLocator.rehydrate("."),
      displayName: DisplayNameText.rehydrate("workspace"),
      baseDirectory: SourceBaseDirectory.rehydrate("/site"),
    },
    runtimeProfile: {
      strategy: RuntimePlanStrategyValue.rehydrate("static"),
      buildCommand: CommandText.rehydrate("pnpm build"),
      ...(input.publishDirectory
        ? { publishDirectory: StaticPublishDirectory.rehydrate(input.publishDirectory) }
        : {}),
    },
    networkProfile: {
      internalPort: PortNumber.rehydrate(80),
      upstreamProtocol: ResourceNetworkProtocolValue.rehydrate("http"),
      exposureMode: ResourceExposureModeValue.rehydrate("reverse-proxy"),
    },
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
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

  test("[DEP-CREATE-ADM-035] rejects repository config fields at command schema boundary", () => {
    const command = CreateDeploymentCommand.create({
      projectId: "prj_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      configFilePath: "appaloft.json",
      runtime: {
        strategy: "workspace-commands",
      },
    } as never);

    expect(command.isErr()).toBe(true);
    expect(command._unsafeUnwrapErr().code).toBe("validation_error");
  });

  test("[WF-PLAN-BOUND-001] rejects framework-specific deployment fields at command schema boundary", () => {
    const command = CreateDeploymentCommand.create({
      projectId: "prj_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      framework: "nextjs",
      packageName: "web",
      baseImage: "node:22-alpine",
      runtimePreset: "nextjs",
      buildpack: "node",
      nodeVersion: "22",
    } as never);

    expect(command.isErr()).toBe(true);
    expect(command._unsafeUnwrapErr().code).toBe("validation_error");
  });

  test("[RES-PROFILE-ARCHIVE-004] rejects deployment creation for archived resources", async () => {
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      eventBus,
      repositoryContext,
      resources,
    } = await createDeploymentFixture();
    const resource = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_demo")),
    );
    if (!resource) {
      throw new Error("Expected resource fixture");
    }
    resource
      .archive({
        archivedAt: ArchivedAt.rehydrate("2026-01-01T00:00:05.000Z"),
      })
      ._unsafeUnwrap();
    await resources.upsert(repositoryContext, resource, UpsertResourceSpec.fromResource(resource));

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "resource_archived",
      details: {
        phase: "resource-lifecycle-guard",
        resourceId: "res_demo",
        commandName: "deployments.create",
      },
    });
    expect(eventBus.events).toHaveLength(0);
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

  test("[DEP-CREATE-ADM-026] resolves static resource profile into static artifact planning input", async () => {
    const runtimePlanResolver = new CapturingRuntimePlanResolver();
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      resources,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
      runtimePlanResolver,
    });
    const staticResource = createStaticSiteResource({ publishDirectory: "/dist" });

    await resources.upsert(
      repositoryContext,
      staticResource,
      UpsertResourceSpec.fromResource(staticResource),
    );

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    const requestedDeployment = runtimePlanResolver.input?.requestedDeployment as
      | Record<string, unknown>
      | undefined;
    expect(requestedDeployment).toMatchObject({
      method: "static",
      publishDirectory: "/dist",
      buildCommand: "pnpm build",
      port: 80,
      exposureMode: "reverse-proxy",
      upstreamProtocol: "http",
    });
  });

  test("[DEF-ACCESS-ROUTE-013][EDGE-PROXY-ROUTE-005] resolves server-applied config domains into deployment planning input", async () => {
    const runtimePlanResolver = new CapturingRuntimePlanResolver();
    const desiredRoutes = new StaticServerAppliedRouteDesiredStateReader({
      routeSetId: "prj_demo:env_demo:res_demo:srv_demo:dst_demo",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      sourceFingerprint: "local-folder:demo",
      domains: [
        {
          host: "www.example.test",
          pathPrefix: "/",
          tlsMode: "auto",
        },
        {
          host: "app.example.test",
          pathPrefix: "/",
          tlsMode: "auto",
        },
      ],
      status: "desired",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const { context, createDeploymentInput, createDeploymentUseCase } =
      await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
        runtimePlanResolver,
        edgeProxyKind: "traefik",
        serverAppliedRouteDesiredStateReader: desiredRoutes,
      });

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    expect(desiredRoutes.targets).toEqual([
      {
        projectId: "prj_demo",
        environmentId: "env_demo",
        resourceId: "res_demo",
        serverId: "srv_demo",
        destinationId: "dst_demo",
      },
    ]);
    expect(runtimePlanResolver.input?.requestedDeployment).toMatchObject({
      proxyKind: "traefik",
      domains: ["www.example.test", "app.example.test"],
      pathPrefix: "/",
      tlsMode: "auto",
      accessRoutes: [
        {
          proxyKind: "traefik",
          domains: ["www.example.test", "app.example.test"],
          pathPrefix: "/",
          tlsMode: "auto",
        },
      ],
      accessRouteMetadata: {
        "access.routeSource": "server-applied-config-domain",
        "access.serverAppliedRouteSetId": "prj_demo:env_demo:res_demo:srv_demo:dst_demo",
        "access.hostname": "www.example.test",
        "access.scheme": "https",
        "access.routeCount": "2",
        "access.routeGroupCount": "1",
        "access.sourceFingerprint": "local-folder:demo",
      },
    });
  });

  test("[DEF-ACCESS-ROUTE-004] durable domain binding takes precedence over server-applied config domain", async () => {
    const runtimePlanResolver = new CapturingRuntimePlanResolver();
    const desiredRoutes = new StaticServerAppliedRouteDesiredStateReader({
      routeSetId: "prj_demo:env_demo:res_demo:srv_demo:dst_demo",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domains: [
        {
          host: "server-applied.example.test",
          pathPrefix: "/",
          tlsMode: "auto",
        },
      ],
      status: "desired",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const routeBindingReader = new StaticDomainRouteBindingReader([
      {
        id: "dmb_ready",
        domainName: "durable.example.test",
        pathPrefix: "/",
        proxyKind: "traefik",
        tlsMode: "disabled",
        status: "ready",
        createdAt: "2026-01-01T00:02:00.000Z",
      },
    ]);
    const { context, createDeploymentInput, createDeploymentUseCase } =
      await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
        runtimePlanResolver,
        edgeProxyKind: "traefik",
        domainRouteBindingReader: routeBindingReader,
        serverAppliedRouteDesiredStateReader: desiredRoutes,
      });

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    expect(runtimePlanResolver.input?.requestedDeployment).toMatchObject({
      proxyKind: "traefik",
      domains: ["durable.example.test"],
      pathPrefix: "/",
      tlsMode: "disabled",
      accessRoutes: [
        {
          proxyKind: "traefik",
          domains: ["durable.example.test"],
          pathPrefix: "/",
          tlsMode: "disabled",
        },
      ],
      accessRouteMetadata: {
        "access.routeSource": "durable-domain-binding",
        "access.domainBindingId": "dmb_ready",
        "access.domainBindingStatus": "ready",
        "access.hostname": "durable.example.test",
        "access.scheme": "http",
      },
    });
  });

  test("[DEF-ACCESS-ROUTE-013] non-deployable durable binding does not block server-applied route", async () => {
    const runtimePlanResolver = new CapturingRuntimePlanResolver();
    const desiredRoutes = new StaticServerAppliedRouteDesiredStateReader({
      routeSetId: "prj_demo:env_demo:res_demo:srv_demo:dst_demo",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domains: [
        {
          host: "server-applied.example.test",
          pathPrefix: "/",
          tlsMode: "disabled",
        },
      ],
      status: "desired",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const routeBindingReader = new StaticDomainRouteBindingReader([
      {
        id: "dmb_pending",
        domainName: "pending.example.test",
        pathPrefix: "/",
        proxyKind: "traefik",
        tlsMode: "disabled",
        status: "pending_verification",
        createdAt: "2026-01-01T00:02:00.000Z",
      },
    ]);
    const { context, createDeploymentInput, createDeploymentUseCase } =
      await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
        runtimePlanResolver,
        edgeProxyKind: "traefik",
        domainRouteBindingReader: routeBindingReader,
        serverAppliedRouteDesiredStateReader: desiredRoutes,
      });

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    expect(runtimePlanResolver.input?.requestedDeployment).toMatchObject({
      proxyKind: "traefik",
      domains: ["server-applied.example.test"],
      accessRouteMetadata: {
        "access.routeSource": "server-applied-config-domain",
        "access.hostname": "server-applied.example.test",
      },
    });
  });

  test("[EDGE-PROXY-ROUTE-005] resolves mixed server-applied config domain route groups", async () => {
    const runtimePlanResolver = new CapturingRuntimePlanResolver();
    const desiredRoutes = new StaticServerAppliedRouteDesiredStateReader({
      routeSetId: "prj_demo:env_demo:res_demo:srv_demo:dst_demo",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domains: [
        {
          host: "www.example.test",
          pathPrefix: "/",
          tlsMode: "auto",
        },
        {
          host: "admin.example.test",
          pathPrefix: "/admin",
          tlsMode: "auto",
        },
      ],
      status: "desired",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const { context, createDeploymentInput, createDeploymentUseCase } =
      await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
        runtimePlanResolver,
        edgeProxyKind: "traefik",
        serverAppliedRouteDesiredStateReader: desiredRoutes,
      });

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    expect(runtimePlanResolver.input?.requestedDeployment).toMatchObject({
      proxyKind: "traefik",
      domains: ["www.example.test"],
      pathPrefix: "/",
      tlsMode: "auto",
      accessRoutes: [
        {
          proxyKind: "traefik",
          domains: ["www.example.test"],
          pathPrefix: "/",
          tlsMode: "auto",
        },
        {
          proxyKind: "traefik",
          domains: ["admin.example.test"],
          pathPrefix: "/admin",
          tlsMode: "auto",
        },
      ],
      accessRouteMetadata: {
        "access.routeSource": "server-applied-config-domain",
        "access.serverAppliedRouteSetId": "prj_demo:env_demo:res_demo:srv_demo:dst_demo",
        "access.hostname": "www.example.test",
        "access.scheme": "https",
        "access.routeCount": "2",
        "access.routeGroupCount": "2",
      },
    });
  });

  test("[EDGE-PROXY-ROUTE-008] preserves server-applied canonical redirect route intent", async () => {
    type ServerAppliedCanonicalRedirectDomain =
      ServerAppliedRouteDesiredStateRecord["domains"][number] & {
        redirectTo?: string;
        redirectStatus?: 301 | 302 | 307 | 308;
      };

    const runtimePlanResolver = new CapturingRuntimePlanResolver();
    const domains: ServerAppliedCanonicalRedirectDomain[] = [
      {
        host: "example.test",
        pathPrefix: "/",
        tlsMode: "auto",
      },
      {
        host: "www.example.test",
        pathPrefix: "/",
        tlsMode: "auto",
        redirectTo: "example.test",
        redirectStatus: 308,
      },
    ];
    const desiredRoutes = new StaticServerAppliedRouteDesiredStateReader({
      routeSetId: "prj_demo:env_demo:res_demo:srv_demo:dst_demo",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      domains,
      status: "desired",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const { context, createDeploymentInput, createDeploymentUseCase } =
      await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
        runtimePlanResolver,
        edgeProxyKind: "traefik",
        serverAppliedRouteDesiredStateReader: desiredRoutes,
      });

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    expect(runtimePlanResolver.input?.requestedDeployment).toMatchObject({
      proxyKind: "traefik",
      domains: ["example.test"],
      pathPrefix: "/",
      tlsMode: "auto",
      accessRoutes: [
        {
          proxyKind: "traefik",
          domains: ["example.test"],
          pathPrefix: "/",
          tlsMode: "auto",
        },
        {
          proxyKind: "traefik",
          domains: ["www.example.test"],
          pathPrefix: "/",
          tlsMode: "auto",
          routeBehavior: "redirect",
          redirectTo: "example.test",
          redirectStatus: 308,
        },
      ],
      accessRouteMetadata: {
        "access.routeSource": "server-applied-config-domain",
        "access.hostname": "example.test",
        "access.routeCount": "2",
        "access.routeGroupCount": "2",
        "access.redirectRouteCount": "1",
      },
    });
  });

  test("[ROUTE-TLS-ENTRY-016] preserves durable domain canonical redirect route intent", async () => {
    const runtimePlanResolver = new CapturingRuntimePlanResolver();
    const routeBindingReader = new StaticDomainRouteBindingReader([
      {
        id: "dmb_canonical",
        domainName: "example.test",
        pathPrefix: "/",
        proxyKind: "traefik",
        tlsMode: "auto",
        status: "ready",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "dmb_www",
        domainName: "www.example.test",
        pathPrefix: "/",
        proxyKind: "traefik",
        tlsMode: "auto",
        redirectTo: "example.test",
        redirectStatus: 308,
        status: "ready",
        createdAt: "2026-01-01T00:01:00.000Z",
      },
    ]);
    const { context, createDeploymentInput, createDeploymentUseCase } =
      await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
        runtimePlanResolver,
        edgeProxyKind: "traefik",
        domainRouteBindingReader: routeBindingReader,
      });

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    expect(routeBindingReader.targets).toEqual([
      {
        projectId: "prj_demo",
        environmentId: "env_demo",
        resourceId: "res_demo",
        serverId: "srv_demo",
        destinationId: "dst_demo",
      },
    ]);
    expect(runtimePlanResolver.input?.requestedDeployment).toMatchObject({
      proxyKind: "traefik",
      domains: ["example.test"],
      pathPrefix: "/",
      tlsMode: "auto",
      accessRoutes: [
        {
          proxyKind: "traefik",
          domains: ["example.test"],
          pathPrefix: "/",
          tlsMode: "auto",
        },
        {
          proxyKind: "traefik",
          domains: ["www.example.test"],
          pathPrefix: "/",
          tlsMode: "auto",
          routeBehavior: "redirect",
          redirectTo: "example.test",
          redirectStatus: 308,
        },
      ],
      accessRouteMetadata: {
        "access.routeSource": "durable-domain-binding",
        "access.domainBindingId": "dmb_canonical",
        "access.hostname": "example.test",
        "access.routeGroupCount": "2",
        "access.redirectRouteCount": "1",
      },
    });
  });

  test("[DEP-CREATE-ADM-027] rejects static resource without publish directory before acceptance", async () => {
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      deployments,
      resources,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy());
    const staticResource = createStaticSiteResource();

    await resources.upsert(
      repositoryContext,
      staticResource,
      UpsertResourceSpec.fromResource(staticResource),
    );

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe("validation_error");
    expect(error.details).toMatchObject({
      phase: "runtime-plan-resolution",
      resourceId: "res_demo",
      runtimePlanStrategy: "static",
    });
    expect(deployments.items.size).toBe(0);
  });

  test("[DEP-CREATE-ASYNC-017] keeps accepted static deployment ok when package fails after acceptance", async () => {
    const {
      context,
      createDeploymentInput,
      createDeploymentUseCase,
      deployments,
      resources,
      repositoryContext,
    } = await createDeploymentFixture(new ExplicitContextRequiredPolicy(), {
      executionBackend: new FailingStaticPackageExecutionBackend(),
    });
    const staticResource = createStaticSiteResource({ publishDirectory: "/dist" });

    await resources.upsert(
      repositoryContext,
      staticResource,
      UpsertResourceSpec.fromResource(staticResource),
    );

    const result = await createDeploymentUseCase.execute(context, createDeploymentInput);

    expect(result.isOk()).toBe(true);
    const deploymentId = result._unsafeUnwrap().id;
    const deployment = await deployments.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate(deploymentId)),
    );
    expect(deployment?.toState()).toMatchObject({
      status: { value: "failed" },
    });
    expect(deployment?.toState().logs.at(-1)?.toState().phase.value).toBe("package");
    expect(deployment?.toState().runtimePlan.toState().execution.toState().metadata).toMatchObject({
      phase: "image-build",
      step: "static-package",
      runtimePlanStrategy: "static",
      publishDirectory: "/dist",
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
