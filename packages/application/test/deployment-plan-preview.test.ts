import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  BuildStrategyKindValue,
  CreatedAt,
  DependencyResourceSecretRef,
  DependencyResourceSourceModeValue,
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
  ExecutionStrategyKindValue,
  GeneratedAt,
  HostAddress,
  ImageReference,
  ok,
  PackagingModeValue,
  PlanStepText,
  PortNumber,
  Project,
  ProjectId,
  ProjectName,
  ProviderKey,
  Resource,
  ResourceBinding,
  ResourceBindingId,
  ResourceBindingScopeValue,
  ResourceBindingTargetName,
  ResourceExposureModeValue,
  ResourceId,
  ResourceInjectionModeValue,
  ResourceInstance,
  ResourceInstanceId,
  ResourceInstanceKindValue,
  ResourceInstanceName,
  ResourceKindValue,
  ResourceName,
  ResourceNetworkProtocolValue,
  type Result,
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
  UpsertResourceBindingSpec,
  UpsertResourceInstanceSpec,
  UpsertResourceSpec,
} from "@appaloft/core";
import {
  FakeDependencyResourceSecretStore,
  FixedClock,
  MemoryDependencyResourceRepository,
  MemoryDestinationRepository,
  MemoryEnvironmentRepository,
  MemoryProjectRepository,
  MemoryResourceDependencyBindingReadModel,
  MemoryResourceDependencyBindingRepository,
  MemoryResourceRepository,
  MemoryServerRepository,
  SequenceIdGenerator,
} from "@appaloft/testkit";

import {
  createExecutionContext,
  type ExecutionContext,
  toRepositoryContext,
} from "../src/execution-context";
import { DeploymentPlanQuery } from "../src/messages";
import {
  type DeploymentPlanPreview,
  type ResourceDependencyBindingReadModel,
  type ResourceDependencyBindingSummary,
  type RuntimePlanResolver,
  type RuntimeTargetBackend,
  type RuntimeTargetBackendRegistry,
  type RuntimeTargetCapability,
  type SourceDetector,
} from "../src/ports";
import {
  DeploymentContextResolver,
  DeploymentPlanQueryService,
  DeploymentSnapshotFactory,
  RuntimePlanResolutionInputBuilder,
} from "../src/use-cases";

class StaticSourceDetector implements SourceDetector {
  async detect(_context: ExecutionContext, locator: string) {
    return ok({
      source: SourceDescriptor.rehydrate({
        kind: SourceKindValue.rehydrate("local-folder"),
        locator: SourceLocator.rehydrate(locator),
        displayName: DisplayNameText.rehydrate("workspace"),
      }),
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
      }),
      detectSummary: DetectSummary.rehydrate(input.detectedReasoning.join(" | ")),
      steps: [PlanStepText.rehydrate("deploy")],
      generatedAt: GeneratedAt.rehydrate(input.generatedAt),
    });
  }
}

class StaticRuntimeTargetBackendRegistry implements RuntimeTargetBackendRegistry {
  find(): Result<RuntimeTargetBackend> {
    return ok({
      descriptor: {
        key: "single-server-generic-ssh",
        providerKey: "generic-ssh",
        targetKinds: ["single-server" as const],
        capabilities: [
          "runtime.apply",
          "runtime.verify",
          "runtime.dependency-secrets",
          "runtime.logs",
          "proxy.route",
        ] satisfies RuntimeTargetCapability[],
      },
      async execute() {
        throw new Error("plan preview must not execute runtime work");
      },
      async rollback() {
        throw new Error("plan preview must not rollback runtime work");
      },
      async cancel() {
        throw new Error("plan preview must not cancel runtime work");
      },
    });
  }
}

class BlockingBindingReadModel implements ResourceDependencyBindingReadModel {
  constructor(private readonly inner: ResourceDependencyBindingReadModel) {}

  async list(
    context: Parameters<ResourceDependencyBindingReadModel["list"]>[0],
    input: Parameters<ResourceDependencyBindingReadModel["list"]>[1],
  ) {
    const result = await this.inner.list(context, input);
    return result.map((items) =>
      items.map(
        (item): ResourceDependencyBindingSummary => ({
          ...item,
          snapshotReadiness: {
            status: "blocked",
            reason: "dependency resource readiness is degraded",
          },
        }),
      ),
    );
  }

  async findOne(
    context: Parameters<ResourceDependencyBindingReadModel["findOne"]>[0],
    input: Parameters<ResourceDependencyBindingReadModel["findOne"]>[1],
  ) {
    return this.inner.findOne(context, input);
  }
}

function context(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_deployment_plan_preview_test",
    entrypoint: "system",
  });
}

async function createHarness(input?: { blockedBinding?: boolean; unresolvedSecret?: boolean }) {
  const testContext = context();
  const repositoryContext = toRepositoryContext(testContext);
  const clock = new FixedClock("2026-01-01T00:00:00.000Z");
  const idGenerator = new SequenceIdGenerator();
  const projects = new MemoryProjectRepository();
  const servers = new MemoryServerRepository();
  const destinations = new MemoryDestinationRepository();
  const environments = new MemoryEnvironmentRepository();
  const resources = new MemoryResourceRepository();
  const dependencyResources = new MemoryDependencyResourceRepository();
  const dependencyResourceSecretStore = new FakeDependencyResourceSecretStore();
  const dependencyBindings = new MemoryResourceDependencyBindingRepository();
  const baseBindingReadModel = new MemoryResourceDependencyBindingReadModel(
    dependencyBindings,
    dependencyResources,
  );
  const bindingReadModel = input?.blockedBinding
    ? new BlockingBindingReadModel(baseBindingReadModel)
    : baseBindingReadModel;
  const createdAt = CreatedAt.rehydrate(clock.now());

  const project = Project.create({
    id: ProjectId.rehydrate("prj_demo"),
    name: ProjectName.rehydrate("Demo"),
    createdAt,
  })._unsafeUnwrap();
  const server = DeploymentTarget.register({
    id: DeploymentTargetId.rehydrate("srv_demo"),
    name: DeploymentTargetName.rehydrate("demo-server"),
    host: HostAddress.rehydrate("127.0.0.1"),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate("generic-ssh"),
    createdAt,
  })._unsafeUnwrap();
  const destination = Destination.register({
    id: DestinationId.rehydrate("dst_demo"),
    serverId: DeploymentTargetId.rehydrate("srv_demo"),
    name: DestinationName.rehydrate("default"),
    kind: DestinationKindValue.rehydrate("generic"),
    createdAt,
  })._unsafeUnwrap();
  const environment = Environment.create({
    id: EnvironmentId.rehydrate("env_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    name: EnvironmentName.rehydrate("Production"),
    kind: EnvironmentKindValue.rehydrate("production"),
    createdAt,
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
      runtimeName: RuntimeNameText.rehydrate("www"),
    },
    networkProfile: {
      internalPort: PortNumber.rehydrate(3000),
      upstreamProtocol: ResourceNetworkProtocolValue.rehydrate("http"),
      exposureMode: ResourceExposureModeValue.rehydrate("reverse-proxy"),
    },
    createdAt,
  })._unsafeUnwrap();
  const dependencyResource = ResourceInstance.createPostgresDependencyResource({
    id: ResourceInstanceId.rehydrate("rsi_pg"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    name: ResourceInstanceName.rehydrate("External Postgres"),
    kind: ResourceInstanceKindValue.rehydrate("postgres"),
    sourceMode: DependencyResourceSourceModeValue.rehydrate("imported-external"),
    providerKey: ProviderKey.rehydrate("external-postgres"),
    endpoint: {
      host: "db.example.com",
      port: 5432,
      databaseName: "app",
      maskedConnection: "postgres://app:********@db.example.com:5432/app",
    },
    connectionSecretRef: DependencyResourceSecretRef.rehydrate(
      "appaloft://dependency-resources/rsi_pg/connection",
    ),
    providerManaged: false,
    createdAt,
  })._unsafeUnwrap();
  const binding = ResourceBinding.create({
    id: ResourceBindingId.rehydrate("rbd_pg"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    resourceId: ResourceId.rehydrate("res_demo"),
    resourceInstanceId: ResourceInstanceId.rehydrate("rsi_pg"),
    targetName: ResourceBindingTargetName.rehydrate("DATABASE_URL"),
    scope: ResourceBindingScopeValue.rehydrate("runtime-only"),
    injectionMode: ResourceInjectionModeValue.rehydrate("env"),
    createdAt,
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
  await dependencyResources.upsert(
    repositoryContext,
    dependencyResource,
    UpsertResourceInstanceSpec.fromResourceInstance(dependencyResource),
  );
  if (!input?.unresolvedSecret) {
    await dependencyResourceSecretStore.storeConnection(testContext, {
      dependencyResourceId: "rsi_pg",
      projectId: "prj_demo",
      environmentId: "env_demo",
      kind: "postgres",
      purpose: "connection",
      secretValue: "postgres://app:super-secret@db.example.com:5432/app",
      storedAt: clock.now(),
    });
  }
  await dependencyBindings.upsert(
    repositoryContext,
    binding,
    UpsertResourceBindingSpec.fromResourceBinding(binding),
  );

  return {
    context: testContext,
    service: new DeploymentPlanQueryService(
      new DeploymentContextResolver(projects, servers, destinations, environments, resources),
      new StaticSourceDetector(),
      new StaticRuntimePlanResolver(),
      new DeploymentSnapshotFactory(clock, idGenerator),
      new RuntimePlanResolutionInputBuilder(clock, idGenerator),
      new StaticRuntimeTargetBackendRegistry(),
      undefined,
      undefined,
      bindingReadModel,
      dependencyResourceSecretStore,
    ),
    query: DeploymentPlanQuery.create({
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      includeCommandSpecs: true,
    })._unsafeUnwrap(),
  };
}

function unwrap(
  result: Result<DeploymentPlanPreview> | DeploymentPlanPreview,
): DeploymentPlanPreview {
  let current: unknown = result;
  while (current && typeof current === "object") {
    const candidate = current as { isOk?: unknown; _unsafeUnwrap?: unknown };
    if (typeof candidate._unsafeUnwrap !== "function") {
      break;
    }
    if (typeof candidate.isOk === "function") {
      expect(candidate.isOk()).toBe(true);
    }
    current = (candidate._unsafeUnwrap as () => unknown)();
  }
  return current as DeploymentPlanPreview;
}

describe("DeploymentPlanQueryService", () => {
  test("[DEP-BIND-SNAP-REF-005] reports safe dependency binding readiness without side effects", async () => {
    const harness = await createHarness();

    const preview = unwrap(await harness.service.execute(harness.context, harness.query));

    expect(preview.readiness.status).toBe("ready");
    expect(preview.dependencyBindings).toMatchObject({
      status: "ready",
      references: [
        {
          bindingId: "rbd_pg",
          dependencyResourceId: "rsi_pg",
          kind: "postgres",
          targetName: "DATABASE_URL",
          scope: "runtime-only",
          injectionMode: "env",
          snapshotReadiness: {
            status: "ready",
          },
        },
      ],
      runtimeInjection: {
        status: "ready",
      },
    });
    const serialized = JSON.stringify(preview.dependencyBindings);
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("postgres://");
  });

  test("[DEP-BIND-SNAP-REF-004] [DEP-BIND-RUNTIME-INJECT-003] reports not-ready binding as blocked runtime injection readiness", async () => {
    const harness = await createHarness({ blockedBinding: true });

    const preview = unwrap(await harness.service.execute(harness.context, harness.query));

    expect(preview.readiness.status).toBe("ready");
    expect(preview.dependencyBindings).toMatchObject({
      status: "blocked",
      references: [
        {
          bindingId: "rbd_pg",
          snapshotReadiness: {
            status: "blocked",
            reason: "dependency resource readiness is degraded",
          },
        },
      ],
      runtimeInjection: {
        status: "blocked",
        reason: "dependency resource readiness is degraded",
      },
    });
  });

  test("[DEP-BIND-SECRET-RESOLVE-004] reports unresolved Appaloft-owned dependency runtime refs as blocked", async () => {
    const harness = await createHarness({ unresolvedSecret: true });

    const preview = unwrap(await harness.service.execute(harness.context, harness.query));

    expect(preview.readiness.status).toBe("ready");
    expect(preview.dependencyBindings).toMatchObject({
      status: "blocked",
      references: [
        {
          bindingId: "rbd_pg",
          snapshotReadiness: {
            status: "ready",
          },
        },
      ],
      runtimeInjection: {
        status: "blocked",
        reason: "dependency_runtime_secret_unresolved",
      },
    });
    expect(JSON.stringify(preview.dependencyBindings)).not.toContain("super-secret");
    expect(JSON.stringify(preview.dependencyBindings)).not.toContain("postgres://");
  });
});
