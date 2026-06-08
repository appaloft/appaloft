import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CommandBus,
  CreateDeploymentCommand,
  type DeploymentRepository,
  type DurableWorkQueueAdapter,
  type ExecutionContext,
  type RuntimePlanResolver,
  type RuntimeTargetBackend,
  type RuntimeTargetBackendRegistry,
  type SourceDetector,
  type SourceVersionDetector,
  tokens,
  toRepositoryContext,
} from "@appaloft/application";
import { type AuthRuntime } from "@appaloft/auth-better";
import {
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
  type Result,
  type RollbackPlan,
  RuntimeExecutionPlan,
  RuntimeNameText,
  RuntimePlan,
  RuntimePlanId,
  RuntimePlanStrategyValue,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
  TargetKindValue,
  UpsertDeploymentTargetSpec,
  UpsertDestinationSpec,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  UpsertResourceSpec,
  Version,
} from "@appaloft/core";
import { createAppaloftServer } from "@appaloft/server";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function createTempDataDir(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "appaloft-durable-worker-runtime-"));
  tempRoots.push(path);
  return path;
}

class StaticSourceDetector implements SourceDetector {
  async detect(_context: ExecutionContext, locator: string) {
    return ok({
      source: SourceDescriptor.rehydrate({
        kind: SourceKindValue.rehydrate("local-folder"),
        locator: SourceLocator.rehydrate(locator),
        displayName: DisplayNameText.rehydrate("workspace"),
      }),
      reasoning: ["server smoke static source"],
    });
  }
}

class StaticSourceVersionDetector implements SourceVersionDetector {
  async detect(_context: ExecutionContext, _input: Parameters<SourceVersionDetector["detect"]>[1]) {
    return ok({
      version: Version.unknown(),
      reasoning: ["server smoke version detection skipped"],
    });
  }
}

class StaticRuntimePlanResolver implements RuntimePlanResolver {
  async resolve(_context: ExecutionContext, input: Parameters<RuntimePlanResolver["resolve"]>[1]) {
    return RuntimePlan.create({
      id: RuntimePlanId.rehydrate(input.id),
      source: input.source,
      buildStrategy: "dockerfile",
      packagingMode: "all-in-one-docker",
      execution: RuntimeExecutionPlan.rehydrate({
        kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
        image: ImageReference.rehydrate("server-smoke:test"),
        port: PortNumber.rehydrate(3000),
      }),
      target: DeploymentTargetDescriptor.rehydrate({
        kind: TargetKindValue.rehydrate("single-server"),
        providerKey: ProviderKey.rehydrate("generic-ssh"),
        serverIds: [DeploymentTargetId.rehydrate("srv_durable_smoke")],
      }),
      detectSummary: DetectSummary.rehydrate(input.detectedReasoning.join("; ")),
      steps: [PlanStepText.rehydrate("deploy")],
      generatedAt: GeneratedAt.rehydrate(input.generatedAt),
    });
  }
}

class HermeticExecutionBackend implements RuntimeTargetBackend {
  calls = 0;
  readonly descriptor = {
    key: "server-smoke-runtime",
    providerKey: "generic-ssh",
    targetKinds: ["single-server" as const],
    capabilities: [
      "runtime.apply",
      "runtime.verify",
      "runtime.logs",
      "runtime.health",
      "proxy.route",
    ] as const,
  };

  async execute(
    _context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    this.calls += 1;
    deployment.applyExecutionResult(
      FinishedAt.rehydrate("2026-06-08T00:03:00.000Z"),
      ExecutionResult.rehydrate({
        exitCode: ExitCode.rehydrate(0),
        status: ExecutionStatusValue.rehydrate("succeeded"),
        retryable: false,
        logs: [
          DeploymentLogEntry.rehydrate({
            timestamp: OccurredAt.rehydrate("2026-06-08T00:02:00.000Z"),
            phase: DeploymentPhaseValue.rehydrate("deploy"),
            level: LogLevelValue.rehydrate("info"),
            message: MessageText.rehydrate("Server smoke execution completed"),
          }),
        ],
      }),
    );

    return ok({ deployment });
  }

  async cancel(): Promise<Result<{ logs: DeploymentLogEntry[] }>> {
    return ok({ logs: [] });
  }

  async rollback(
    _context: ExecutionContext,
    deployment: Deployment,
    _plan: RollbackPlan,
  ): Promise<Result<{ deployment: Deployment }>> {
    return ok({ deployment });
  }
}

class StaticRuntimeTargetBackendRegistry implements RuntimeTargetBackendRegistry {
  constructor(private readonly backend: RuntimeTargetBackend) {}

  find(): Result<RuntimeTargetBackend> {
    return ok(this.backend);
  }
}

function createTestAuthRuntime(): AuthRuntime {
  return {
    auth: {} as AuthRuntime["auth"],
    async authenticateRequest() {
      return null;
    },
    async authorizeProductSession() {
      return null;
    },
    async issueSessionCookie() {
      return null;
    },
  };
}

async function seedDeploymentContext(server: Awaited<ReturnType<typeof createAppaloftServer>>) {
  const context = server.executionContextFactory.create({ entrypoint: "system" });
  const repositoryContext = toRepositoryContext(context);
  const project = Project.create({
    id: ProjectId.rehydrate("prj_durable_smoke"),
    name: ProjectName.rehydrate("Durable Smoke"),
    createdAt: CreatedAt.rehydrate("2026-06-08T00:00:00.000Z"),
  })._unsafeUnwrap();
  const deploymentTarget = DeploymentTarget.register({
    id: DeploymentTargetId.rehydrate("srv_durable_smoke"),
    name: DeploymentTargetName.rehydrate("durable-smoke-server"),
    host: HostAddress.rehydrate("127.0.0.1"),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate("generic-ssh"),
    targetKind: TargetKindValue.rehydrate("single-server"),
    createdAt: CreatedAt.rehydrate("2026-06-08T00:00:00.000Z"),
  })._unsafeUnwrap();
  const destination = Destination.register({
    id: DestinationId.rehydrate("dst_durable_smoke"),
    serverId: DeploymentTargetId.rehydrate("srv_durable_smoke"),
    name: DestinationName.rehydrate("default"),
    kind: DestinationKindValue.rehydrate("generic"),
    createdAt: CreatedAt.rehydrate("2026-06-08T00:00:00.000Z"),
  })._unsafeUnwrap();
  const environment = Environment.create({
    id: EnvironmentId.rehydrate("env_durable_smoke"),
    projectId: ProjectId.rehydrate("prj_durable_smoke"),
    name: EnvironmentName.rehydrate("production"),
    kind: EnvironmentKindValue.rehydrate("production"),
    createdAt: CreatedAt.rehydrate("2026-06-08T00:00:00.000Z"),
  })._unsafeUnwrap();
  const resource = Resource.create({
    id: ResourceId.rehydrate("res_durable_smoke"),
    projectId: ProjectId.rehydrate("prj_durable_smoke"),
    environmentId: EnvironmentId.rehydrate("env_durable_smoke"),
    destinationId: DestinationId.rehydrate("dst_durable_smoke"),
    name: ResourceName.rehydrate("web"),
    kind: ResourceKindValue.rehydrate("application"),
    sourceBinding: {
      kind: SourceKindValue.rehydrate("local-folder"),
      locator: SourceLocator.rehydrate("."),
      displayName: DisplayNameText.rehydrate("workspace"),
    },
    runtimeProfile: {
      strategy: RuntimePlanStrategyValue.rehydrate("auto"),
      runtimeName: RuntimeNameText.rehydrate("web"),
    },
    networkProfile: {
      internalPort: PortNumber.rehydrate(3000),
      upstreamProtocol: ResourceNetworkProtocolValue.rehydrate("http"),
      exposureMode: ResourceExposureModeValue.rehydrate("reverse-proxy"),
    },
    createdAt: CreatedAt.rehydrate("2026-06-08T00:00:00.000Z"),
  })._unsafeUnwrap();

  await server.container
    .resolve<typeof import("@appaloft/application").ProjectRepository>(tokens.projectRepository)
    .upsert(repositoryContext, project, UpsertProjectSpec.fromProject(project));
  await server.container
    .resolve<typeof import("@appaloft/application").ServerRepository>(tokens.serverRepository)
    .upsert(
      repositoryContext,
      deploymentTarget,
      UpsertDeploymentTargetSpec.fromDeploymentTarget(deploymentTarget),
    );
  await server.container
    .resolve<typeof import("@appaloft/application").DestinationRepository>(
      tokens.destinationRepository,
    )
    .upsert(repositoryContext, destination, UpsertDestinationSpec.fromDestination(destination));
  await server.container
    .resolve<typeof import("@appaloft/application").EnvironmentRepository>(
      tokens.environmentRepository,
    )
    .upsert(repositoryContext, environment, UpsertEnvironmentSpec.fromEnvironment(environment));
  await server.container
    .resolve<typeof import("@appaloft/application").ResourceRepository>(tokens.resourceRepository)
    .upsert(repositoryContext, resource, UpsertResourceSpec.fromResource(resource));
}

async function waitFor<T>(
  callback: () => Promise<T | null>,
  input: { timeoutMs: number; intervalMs: number },
): Promise<T | null> {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    const value = await callback();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, input.intervalMs));
  }
  return null;
}

describe("durable work server runtime", () => {
  test("[PROC-DELIVERY-WORKER-023] composed server drains deployment work through PG durable queue", async () => {
    const dataDir = await createTempDataDir();
    const executionBackend = new HermeticExecutionBackend();
    const server = await createAppaloftServer({
      flags: {
        appVersion: "0.1.0-test",
        authProvider: "none",
        dataDir,
        docsStaticDir: "",
        httpHost: "localhost",
        httpPort: 3001,
        pgliteDataDir: join(dataDir, "pglite"),
        webStaticDir: "",
        workerCount: 1,
        workerRuntimeMode: "embedded",
        workerQueueBackend: "database",
      },
      authRuntime: createTestAuthRuntime(),
      extensions: [
        {
          configureRuntime({ container }) {
            container.register(tokens.sourceDetector, { useValue: new StaticSourceDetector() });
            container.register(tokens.sourceVersionDetector, {
              useValue: new StaticSourceVersionDetector(),
            });
            container.register(tokens.runtimePlanResolver, {
              useValue: new StaticRuntimePlanResolver(),
            });
            container.register(tokens.executionBackend, { useValue: executionBackend });
            container.register(tokens.runtimeTargetBackendRegistry, {
              useValue: new StaticRuntimeTargetBackendRegistry(executionBackend),
            });
          },
        },
      ],
    });

    try {
      await seedDeploymentContext(server);
      const context = server.executionContextFactory.create({ entrypoint: "system" });
      const repositoryContext = toRepositoryContext(context);
      const command = CreateDeploymentCommand.create({
        projectId: "prj_durable_smoke",
        serverId: "srv_durable_smoke",
        destinationId: "dst_durable_smoke",
        environmentId: "env_durable_smoke",
        resourceId: "res_durable_smoke",
      })._unsafeUnwrap();
      const commandBus = server.container.resolve<CommandBus>(tokens.commandBus);
      const accepted = await commandBus.execute(context, command);
      expect(accepted.isOk()).toBe(true);
      if (accepted.isErr()) throw new Error(accepted.error.message);
      const deploymentId = accepted.value.id;
      expect(executionBackend.calls).toBe(0);

      const durableWork = server.container.resolve<DurableWorkQueueAdapter>(
        tokens.durableWorkQueueAdapter,
      );
      const pending = await durableWork.listItems(repositoryContext, {
        deploymentId,
        status: "pending",
      });
      expect(pending.isOk()).toBe(true);
      if (pending.isErr()) throw new Error(pending.error.message);
      expect(pending.value).toHaveLength(1);

      await server.startWorkerRuntime();
      const completed = await waitFor(
        async () => {
          const items = await durableWork.listItems(repositoryContext, {
            deploymentId,
            status: "succeeded",
          });
          if (items.isErr() || items.value.length === 0) {
            return null;
          }
          return items.value[0];
        },
        { timeoutMs: 5_000, intervalMs: 100 },
      );
      expect(completed).toMatchObject({
        deploymentId,
        status: "succeeded",
      });
      expect(executionBackend.calls).toBe(1);

      const deployment = await server.container
        .resolve<DeploymentRepository>(tokens.deploymentRepository)
        .findOne(
          repositoryContext,
          DeploymentByIdSpec.create(DeploymentId.rehydrate(deploymentId)),
        );
      expect(deployment?.toState().status.value).toBe("succeeded");
    } finally {
      await server.shutdown();
    }
  }, 20_000);
});
