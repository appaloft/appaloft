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
  type Result,
  type RollbackPlan,
  RuntimeExecutionPlan,
  RuntimePlan,
  RuntimePlanId,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
  TargetKindValue,
  UpdatedAt,
  UpsertDeploymentTargetSpec,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  VariableExposureValue,
  VariableKindValue,
} from "@yundu/core";
import {
  CapturedEventBus,
  FixedClock,
  MemoryDeploymentRepository,
  MemoryEnvironmentRepository,
  MemoryProjectRepository,
  MemoryServerRepository,
  NoopLogger,
  SequenceIdGenerator,
} from "@yundu/testkit";
import { type ExecutionContext, toRepositoryContext } from "../src/execution-context";
import {
  type DeploymentContextDefaultsPolicy,
  type DeploymentProgressReporter,
  type ExecutionBackend,
  type RuntimePlanResolver,
  type SourceDetector,
} from "../src/ports";
import {
  CreateDeploymentUseCase,
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
}

class NoopDeploymentProgressReporter implements DeploymentProgressReporter {
  report(): void {}
}

class ExplicitContextRequiredPolicy implements DeploymentContextDefaultsPolicy {
  decide() {
    return ok({
      project: { mode: "required" as const },
      server: { mode: "required" as const },
      environment: { mode: "required" as const },
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
      environment: {
        mode: "reuse-or-create" as const,
        preset: "local-environment" as const,
      },
    });
  }
}

function createTestContext(): ExecutionContext {
  return {
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
  };
}

describe("CreateDeploymentUseCase", () => {
  test("creates a deployment with an immutable environment snapshot", async () => {
    const projects = new MemoryProjectRepository();
    const servers = new MemoryServerRepository();
    const environments = new MemoryEnvironmentRepository();
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
    const environment = Environment.create({
      id: EnvironmentId.rehydrate("env_demo"),
      projectId: ProjectId.rehydrate("prj_demo"),
      name: EnvironmentName.rehydrate("production"),
      kind: EnvironmentKindValue.rehydrate("production"),
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
    await environments.upsert(
      repositoryContext,
      environment,
      UpsertEnvironmentSpec.fromEnvironment(environment),
    );

    const contextResolver = new DeploymentContextResolver(
      projects,
      servers,
      environments,
      new ExplicitContextRequiredPolicy(),
      defaultsFactory,
      eventBus,
      logger,
    );
    const useCase = new CreateDeploymentUseCase(
      deployments,
      contextResolver,
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
      environmentId: "env_demo",
      sourceLocator: ".",
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

  test("bootstraps a default local deployment context when ids are omitted", async () => {
    const projects = new MemoryProjectRepository();
    const servers = new MemoryServerRepository();
    const environments = new MemoryEnvironmentRepository();
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
      environments,
      new LocalEmbeddedDefaultsPolicy(),
      defaultsFactory,
      eventBus,
      logger,
    );
    const useCase = new CreateDeploymentUseCase(
      deployments,
      contextResolver,
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
    });

    expect(result.isOk()).toBe(true);
    expect(projects.items.size).toBe(1);
    expect(servers.items.size).toBe(1);
    expect(environments.items.size).toBe(1);

    const deployment = await deployments.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate(result._unsafeUnwrap().id)),
    );
    expect(deployment?.toState().projectId.value).toBe("prj_0001");
    expect(deployment?.toState().environmentId.value).toBe("env_0002");
    expect(deployment?.toState().serverId.value).toBe("srv_0003");
    expect([...servers.items.values()][0]?.toState().providerKey.value).toBe("local-shell");
    expect([...environments.items.values()][0]?.toState().name.value).toBe("local");
  });
});
