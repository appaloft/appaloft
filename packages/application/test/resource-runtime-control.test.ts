import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CommandText,
  CreatedAt,
  EnvironmentId,
  HealthCheckExpectedStatusCode,
  HealthCheckHostText,
  HealthCheckHttpMethodValue,
  HealthCheckIntervalSeconds,
  HealthCheckPathText,
  HealthCheckRetryCount,
  HealthCheckSchemeValue,
  HealthCheckStartPeriodSeconds,
  HealthCheckTimeoutSeconds,
  HealthCheckTypeValue,
  ok,
  ProjectId,
  Resource,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  ResourceSlug,
  type Result,
  RuntimePlanStrategyValue,
  UpsertResourceSpec,
} from "@appaloft/core";
import {
  FixedClock,
  MemoryResourceRepository,
  PassThroughMutationCoordinator,
  SequenceIdGenerator,
} from "@appaloft/testkit";

import {
  createExecutionContext,
  type ExecutionContext,
  type RepositoryContext,
  toRepositoryContext,
} from "../src";
import {
  type CoordinationOwner,
  type CoordinationPolicy,
  type CoordinationScope,
  type DeploymentLogSummary,
  type DeploymentReadModel,
  type DeploymentSummary,
  type MutationCoordinator,
  type MutationCoordinatorRunExclusiveInput,
  type ResourceReadModel,
  type ResourceRuntimeControlAttemptRecord,
  type ResourceRuntimeControlAttemptRecorder,
  type ResourceRuntimeControlTargetPort,
  type ResourceRuntimeControlTargetRequest,
  type ResourceRuntimeControlTargetResult,
  type ResourceSummary,
} from "../src/ports";
import { ResourceRuntimeControlUseCase } from "../src/use-cases";

class StaticResourceReadModel implements ResourceReadModel {
  constructor(private readonly resource: ResourceSummary) {}

  async list(): Promise<ResourceSummary[]> {
    return [this.resource];
  }

  async findOne(): Promise<ResourceSummary | null> {
    return this.resource;
  }
}

class StaticDeploymentReadModel implements DeploymentReadModel {
  constructor(private readonly deployments: DeploymentSummary[]) {}

  async list(
    _context: RepositoryContext,
    input?: {
      projectId?: string;
      resourceId?: string;
    },
  ): Promise<DeploymentSummary[]> {
    return this.deployments
      .filter((deployment) => (input?.projectId ? deployment.projectId === input.projectId : true))
      .filter((deployment) =>
        input?.resourceId ? deployment.resourceId === input.resourceId : true,
      );
  }

  async findOne(): Promise<DeploymentSummary | null> {
    return null;
  }

  async findLogs(): Promise<DeploymentLogSummary[]> {
    return [];
  }
}

class RecordingRuntimeControlTargetPort implements ResourceRuntimeControlTargetPort {
  readonly requests: ResourceRuntimeControlTargetRequest[] = [];

  constructor(private readonly result?: ResourceRuntimeControlTargetResult) {}

  async control(
    _context: ExecutionContext,
    request: ResourceRuntimeControlTargetRequest,
  ): Promise<Result<ResourceRuntimeControlTargetResult>> {
    this.requests.push(request);
    return ok(this.result ?? defaultTargetResult(request.operation));
  }
}

class RecordingRuntimeControlAttemptRecorder implements ResourceRuntimeControlAttemptRecorder {
  readonly records: ResourceRuntimeControlAttemptRecord[] = [];

  async record(
    _context: RepositoryContext,
    attempt: ResourceRuntimeControlAttemptRecord,
  ): Promise<Result<ResourceRuntimeControlAttemptRecord>> {
    this.records.push(attempt);
    return ok(attempt);
  }
}

class CapturingMutationCoordinator implements MutationCoordinator {
  readonly calls: Array<{
    policy: CoordinationPolicy;
    scope: CoordinationScope;
    owner: CoordinationOwner;
  }> = [];

  async runExclusive<T>(input: MutationCoordinatorRunExclusiveInput<T>): Promise<Result<T>> {
    this.calls.push({
      policy: input.policy,
      scope: input.scope,
      owner: input.owner,
    });
    return new PassThroughMutationCoordinator().runExclusive(input);
  }
}

function defaultTargetResult(operation: ResourceRuntimeControlTargetRequest["operation"]) {
  switch (operation) {
    case "stop":
      return {
        status: "succeeded",
        runtimeState: "stopped",
      } satisfies ResourceRuntimeControlTargetResult;
    case "start":
      return {
        status: "succeeded",
        runtimeState: "running",
      } satisfies ResourceRuntimeControlTargetResult;
    case "restart":
      return {
        status: "succeeded",
        runtimeState: "running",
        phases: [
          {
            phase: "stop",
            status: "succeeded",
          },
          {
            phase: "start",
            status: "succeeded",
          },
        ],
      } satisfies ResourceRuntimeControlTargetResult;
  }
}

function applicationResourceFixture(): Resource {
  return Resource.rehydrate({
    id: ResourceId.rehydrate("res_web"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    name: ResourceName.rehydrate("Web"),
    slug: ResourceSlug.rehydrate("web"),
    kind: ResourceKindValue.rehydrate("application"),
    services: [],
    runtimeProfile: {
      strategy: RuntimePlanStrategyValue.rehydrate("workspace-commands"),
      startCommand: CommandText.rehydrate("bun run start"),
      healthCheckPath: HealthCheckPathText.rehydrate("/health"),
      healthCheck: {
        enabled: true,
        type: HealthCheckTypeValue.rehydrate("http"),
        intervalSeconds: HealthCheckIntervalSeconds.rehydrate(5),
        timeoutSeconds: HealthCheckTimeoutSeconds.rehydrate(5),
        retries: HealthCheckRetryCount.rehydrate(10),
        startPeriodSeconds: HealthCheckStartPeriodSeconds.rehydrate(5),
        http: {
          method: HealthCheckHttpMethodValue.rehydrate("GET"),
          scheme: HealthCheckSchemeValue.rehydrate("http"),
          host: HealthCheckHostText.rehydrate("localhost"),
          path: HealthCheckPathText.rehydrate("/health"),
          expectedStatusCode: HealthCheckExpectedStatusCode.rehydrate(200),
        },
      },
    },
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

function resourceSummary(overrides?: Partial<ResourceSummary>): ResourceSummary {
  return {
    id: "res_web",
    projectId: "prj_demo",
    environmentId: "env_demo",
    destinationId: "dst_demo",
    name: "Web",
    slug: "web",
    kind: "application",
    services: [
      {
        name: "web",
        kind: "web",
      },
    ],
    deploymentCount: 1,
    lastDeploymentId: "dep_web",
    lastDeploymentStatus: "succeeded",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function deploymentSummary(overrides?: Partial<DeploymentSummary>): DeploymentSummary {
  return {
    id: "dep_web",
    projectId: "prj_demo",
    environmentId: "env_demo",
    resourceId: "res_web",
    serverId: "srv_demo",
    destinationId: "dst_demo",
    status: "succeeded",
    runtimePlan: {
      id: "rplan_demo",
      source: {
        kind: "local-folder",
        locator: ".",
        displayName: "workspace",
      },
      buildStrategy: "workspace-commands",
      packagingMode: "host-process-runtime",
      execution: {
        kind: "docker-container",
        port: 3000,
      },
      target: {
        kind: "single-server",
        providerKey: "local-shell",
        serverIds: ["srv_demo"],
      },
      detectSummary: "detected workspace",
      generatedAt: "2026-01-01T00:00:00.000Z",
      steps: ["start process"],
    },
    environmentSnapshot: {
      id: "snap_demo",
      environmentId: "env_demo",
      createdAt: "2026-01-01T00:00:00.000Z",
      precedence: ["environment", "deployment"],
      variables: [],
    },
    logs: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    startedAt: "2026-01-01T00:00:01.000Z",
    finishedAt: "2026-01-01T00:00:04.000Z",
    logCount: 0,
    ...overrides,
  };
}

async function createHarness(input?: {
  resource?: ResourceSummary;
  deployments?: DeploymentSummary[];
  targetPort?: RecordingRuntimeControlTargetPort;
  coordinator?: CapturingMutationCoordinator;
}) {
  const resourceRepository = new MemoryResourceRepository();
  const context = createExecutionContext({
    requestId: "req_resource_runtime_control_test",
    entrypoint: "system",
  });
  const resource = applicationResourceFixture();
  await resourceRepository.upsert(
    toRepositoryContext(context),
    resource,
    UpsertResourceSpec.fromResource(resource),
  );

  const targetPort = input?.targetPort ?? new RecordingRuntimeControlTargetPort();
  const attemptRecorder = new RecordingRuntimeControlAttemptRecorder();
  const coordinator = input?.coordinator ?? new CapturingMutationCoordinator();

  return {
    attemptRecorder,
    context,
    coordinator,
    targetPort,
    useCase: new ResourceRuntimeControlUseCase(
      resourceRepository,
      new StaticResourceReadModel(input?.resource ?? resourceSummary()),
      new StaticDeploymentReadModel(input?.deployments ?? [deploymentSummary()]),
      targetPort,
      attemptRecorder,
      new SequenceIdGenerator(),
      new FixedClock("2026-01-01T00:00:10.000Z"),
      coordinator,
    ),
  };
}

describe("ResourceRuntimeControlUseCase", () => {
  test("[RUNTIME-CTRL-STOP-001] records stop attempt before adapter execution and sends normalized request", async () => {
    const { attemptRecorder, context, targetPort, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      operation: "stop",
      resourceId: "res_web",
      reason: "operator requested maintenance",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      runtimeControlAttemptId: "rtc_0001",
      resourceId: "res_web",
      deploymentId: "dep_web",
      operation: "stop",
      status: "succeeded",
      runtimeState: "stopped",
    });
    expect(attemptRecorder.records).toHaveLength(2);
    expect(attemptRecorder.records[0]).toMatchObject({
      runtimeControlAttemptId: "rtc_0001",
      operation: "stop",
      status: "running",
      runtimeState: "stopping",
      reason: "operator requested maintenance",
    });
    expect(targetPort.requests).toEqual([
      expect.objectContaining({
        runtimeControlAttemptId: "rtc_0001",
        operation: "stop",
        resourceId: "res_web",
        deploymentId: "dep_web",
        serverId: "srv_demo",
        destinationId: "dst_demo",
        runtimeKind: "docker-container",
        targetKind: "single-server",
        providerKey: "local-shell",
      }),
    ]);
  });

  test("[RUNTIME-CTRL-START-001] starts stopped runtime from retained placement metadata", async () => {
    const { attemptRecorder, context, targetPort, useCase } = await createHarness({
      resource: resourceSummary({
        latestRuntimeControl: {
          runtimeControlAttemptId: "rtc_previous",
          operation: "stop",
          status: "succeeded",
          startedAt: "2026-01-01T00:00:05.000Z",
          completedAt: "2026-01-01T00:00:06.000Z",
          runtimeState: "stopped",
        },
      }),
    });

    const result = await useCase.execute(context, {
      operation: "start",
      resourceId: "res_web",
      acknowledgeRetainedRuntimeMetadata: true,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      operation: "start",
      status: "succeeded",
      runtimeState: "running",
    });
    expect(attemptRecorder.records[0]).toMatchObject({
      operation: "start",
      status: "running",
      runtimeState: "starting",
    });
    expect(targetPort.requests).toHaveLength(1);
    expect(targetPort.requests[0]).toMatchObject({
      operation: "start",
      deploymentId: "dep_web",
    });
  });

  test("[RUNTIME-CTRL-RESTART-001] records stop and start phases without deployment creation", async () => {
    const { attemptRecorder, context, targetPort, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      operation: "restart",
      resourceId: "res_web",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      operation: "restart",
      status: "succeeded",
      runtimeState: "running",
      phases: [
        {
          phase: "stop",
          status: "succeeded",
        },
        {
          phase: "start",
          status: "succeeded",
        },
      ],
    });
    expect(attemptRecorder.records[0]?.phases).toEqual([
      {
        phase: "stop",
        status: "pending",
      },
      {
        phase: "start",
        status: "pending",
      },
    ]);
    expect(targetPort.requests).toHaveLength(1);
    expect(targetPort.requests[0]?.operation).toBe("restart");
  });

  test("[RUNTIME-CTRL-BLOCK-001] blocks missing runtime metadata before adapter execution", async () => {
    const notDeployedResource = resourceSummary({
      deploymentCount: 0,
    });
    delete notDeployedResource.lastDeploymentId;
    delete notDeployedResource.lastDeploymentStatus;
    const { attemptRecorder, context, targetPort, useCase } = await createHarness({
      resource: notDeployedResource,
      deployments: [],
    });

    const result = await useCase.execute(context, {
      operation: "stop",
      resourceId: "res_web",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "resource_runtime_metadata_missing",
      details: expect.objectContaining({
        phase: "runtime-control-admission",
        resourceId: "res_web",
        operation: "stop",
        missingMetadataKind: "runtime-placement",
      }),
    });
    expect(attemptRecorder.records).toHaveLength(0);
    expect(targetPort.requests).toHaveLength(0);
  });

  test("[RUNTIME-CTRL-COORD-001] serializes through the resource-runtime coordination scope", async () => {
    const coordinator = new CapturingMutationCoordinator();
    const { context, useCase } = await createHarness({
      coordinator,
    });

    const result = await useCase.execute(context, {
      operation: "stop",
      resourceId: "res_web",
    });

    expect(result.isOk()).toBe(true);
    expect(coordinator.calls).toEqual([
      {
        policy: expect.objectContaining({
          operationKey: "resources.runtime.stop",
          scopeKind: "resource-runtime",
          mode: "serialize-with-bounded-wait",
        }),
        scope: {
          kind: "resource-runtime",
          key: "res_web:srv_demo:dst_demo",
        },
        owner: {
          ownerId: "req_resource_runtime_control_test",
          label: "resources.runtime.stop",
        },
      },
    ]);
  });
});
