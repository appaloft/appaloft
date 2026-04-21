import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  AccessRoute,
  BuildStrategyKindValue,
  ConfigScopeValue,
  CreatedAt,
  Deployment,
  DeploymentId,
  DeploymentTargetDescriptor,
  DeploymentTargetId,
  DestinationId,
  DetectSummary,
  DisplayNameText,
  type DomainEvent,
  EdgeProxyKindValue,
  EnvironmentConfigSnapshot,
  EnvironmentId,
  EnvironmentSnapshotId,
  ErrorCodeText,
  ExecutionResult,
  ExecutionStatusValue,
  ExecutionStrategyKindValue,
  ExitCode,
  FinishedAt,
  GeneratedAt,
  ImageReference,
  ok,
  PackagingModeValue,
  PlanStepText,
  PortNumber,
  ProjectId,
  ProviderKey,
  PublicDomainName,
  ResourceId,
  type Result,
  RoutePathPrefix,
  RuntimeExecutionPlan,
  RuntimePlan,
  RuntimePlanId,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
  StartedAt,
  TargetKindValue,
  TlsModeValue,
  UpsertDeploymentSpec,
} from "@appaloft/core";
import { MemoryDeploymentRepository, NoopLogger } from "@appaloft/testkit";
import {
  createExecutionContext,
  type ExecutionContext,
  toRepositoryContext,
} from "../src/execution-context";
import { MarkServerAppliedRouteStatusOnDeploymentFinishedHandler } from "../src/operations/deployments/mark-server-applied-route-status-on-deployment-finished.handler";
import {
  type ServerAppliedRouteDesiredStateRecord,
  type ServerAppliedRouteDesiredStateTarget,
  type ServerAppliedRouteStateStore,
} from "../src/ports";

class CapturingServerAppliedRouteStateStore implements ServerAppliedRouteStateStore {
  readonly applied: Array<Parameters<ServerAppliedRouteStateStore["markApplied"]>[0]> = [];
  readonly failed: Array<Parameters<ServerAppliedRouteStateStore["markFailed"]>[0]> = [];

  async upsertDesired(
    input: Parameters<ServerAppliedRouteStateStore["upsertDesired"]>[0],
  ): Promise<Result<ServerAppliedRouteDesiredStateRecord>> {
    return ok({
      routeSetId: [
        input.target.projectId,
        input.target.environmentId,
        input.target.resourceId,
        input.target.serverId,
        input.target.destinationId ?? "default",
      ].join(":"),
      ...input.target,
      ...(input.sourceFingerprint ? { sourceFingerprint: input.sourceFingerprint } : {}),
      domains: input.domains,
      status: "desired",
      updatedAt: input.updatedAt,
    });
  }

  async read(
    _target: ServerAppliedRouteDesiredStateTarget,
  ): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>> {
    return ok(null);
  }

  async markApplied(
    input: Parameters<ServerAppliedRouteStateStore["markApplied"]>[0],
  ): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>> {
    this.applied.push(input);
    return ok(null);
  }

  async markFailed(
    input: Parameters<ServerAppliedRouteStateStore["markFailed"]>[0],
  ): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>> {
    this.failed.push(input);
    return ok(null);
  }

  async deleteDesired(): Promise<Result<boolean>> {
    return ok(false);
  }

  async deleteDesiredBySourceFingerprint(): Promise<Result<number>> {
    return ok(0);
  }
}

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    entrypoint: "cli",
    requestId: "req_server_applied_route_status_test",
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

function createRuntimePlan(): RuntimePlan {
  const accessRoute = AccessRoute.create({
    proxyKind: EdgeProxyKindValue.rehydrate("traefik"),
    domains: [PublicDomainName.create("www.example.test")._unsafeUnwrap()],
    pathPrefix: RoutePathPrefix.create("/")._unsafeUnwrap(),
    tlsMode: TlsModeValue.rehydrate("auto"),
    targetPort: PortNumber.rehydrate(3000),
  })._unsafeUnwrap();

  return RuntimePlan.create({
    id: RuntimePlanId.rehydrate("plan_1"),
    source: SourceDescriptor.rehydrate({
      kind: SourceKindValue.rehydrate("local-folder"),
      locator: SourceLocator.rehydrate("."),
      displayName: DisplayNameText.rehydrate("workspace"),
    }),
    buildStrategy: BuildStrategyKindValue.rehydrate("dockerfile"),
    packagingMode: PackagingModeValue.rehydrate("all-in-one-docker"),
    execution: RuntimeExecutionPlan.rehydrate({
      kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
      image: ImageReference.rehydrate("demo:test"),
      port: PortNumber.rehydrate(3000),
      accessRoutes: [accessRoute],
      metadata: {
        "access.routeSource": "server-applied-config-domain",
        "access.serverAppliedRouteSetId": "proj_1:env_1:res_1:srv_1:dst_1",
      },
    }),
    target: DeploymentTargetDescriptor.rehydrate({
      kind: TargetKindValue.rehydrate("single-server"),
      providerKey: ProviderKey.rehydrate("generic-ssh"),
      serverIds: [DeploymentTargetId.rehydrate("srv_1")],
    }),
    detectSummary: DetectSummary.rehydrate("detected workspace"),
    steps: [PlanStepText.rehydrate("Deploy container")],
    generatedAt: GeneratedAt.rehydrate("2026-04-19T00:00:00.000Z"),
  })._unsafeUnwrap();
}

function createDeployment(input: {
  status: "succeeded" | "failed";
  failurePhase?: string;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
}): { deployment: Deployment; event: DomainEvent } {
  const deployment = Deployment.create({
    id: DeploymentId.rehydrate("dep_1"),
    projectId: ProjectId.rehydrate("proj_1"),
    environmentId: EnvironmentId.rehydrate("env_1"),
    resourceId: ResourceId.rehydrate("res_1"),
    serverId: DeploymentTargetId.rehydrate("srv_1"),
    destinationId: DestinationId.rehydrate("dst_1"),
    runtimePlan: createRuntimePlan(),
    environmentSnapshot: EnvironmentConfigSnapshot.rehydrate({
      id: EnvironmentSnapshotId.rehydrate("snap_1"),
      environmentId: EnvironmentId.rehydrate("env_1"),
      createdAt: GeneratedAt.rehydrate("2026-04-19T00:00:00.000Z"),
      precedence: [ConfigScopeValue.rehydrate("environment")],
      variables: [],
    }),
    createdAt: CreatedAt.rehydrate("2026-04-19T00:00:00.000Z"),
  })._unsafeUnwrap();

  deployment.markPlanning(StartedAt.rehydrate("2026-04-19T00:01:00.000Z"));
  deployment.markPlanned(StartedAt.rehydrate("2026-04-19T00:01:10.000Z"));
  deployment.start(StartedAt.rehydrate("2026-04-19T00:02:00.000Z"));
  deployment.applyExecutionResult(
    FinishedAt.rehydrate("2026-04-19T00:03:00.000Z"),
    ExecutionResult.rehydrate({
      exitCode: ExitCode.rehydrate(input.status === "succeeded" ? 0 : 1),
      status: ExecutionStatusValue.rehydrate(input.status),
      logs: [],
      retryable: input.retryable ?? false,
      ...(input.errorCode ? { errorCode: ErrorCodeText.rehydrate(input.errorCode) } : {}),
      ...(input.failurePhase || input.errorMessage
        ? {
            metadata: {
              ...(input.failurePhase ? { phase: input.failurePhase } : {}),
              ...(input.errorMessage ? { message: input.errorMessage } : {}),
            },
          }
        : {}),
    }),
  );

  const event = deployment
    .pullDomainEvents()
    .find((candidate) => candidate.type === "deployment.finished");
  if (!event) {
    throw new Error("Expected deployment.finished event");
  }

  return { deployment, event };
}

describe("MarkServerAppliedRouteStatusOnDeploymentFinishedHandler", () => {
  test("[EDGE-PROXY-ROUTE-005] records applied state for successful server-applied routes", async () => {
    const context = createTestContext();
    const deployments = new MemoryDeploymentRepository();
    const store = new CapturingServerAppliedRouteStateStore();
    const handler = new MarkServerAppliedRouteStatusOnDeploymentFinishedHandler(
      deployments,
      store,
      new NoopLogger(),
    );
    const { deployment, event } = createDeployment({ status: "succeeded" });
    await deployments.upsert(
      toRepositoryContext(context),
      deployment,
      UpsertDeploymentSpec.fromDeployment(deployment),
    );

    const result = await handler.handle(context, event);

    expect(result.isOk()).toBe(true);
    expect(store.applied).toEqual([
      {
        target: {
          projectId: "proj_1",
          environmentId: "env_1",
          resourceId: "res_1",
          serverId: "srv_1",
          destinationId: "dst_1",
        },
        deploymentId: "dep_1",
        updatedAt: "2026-04-19T00:03:00.000Z",
        routeSetId: "proj_1:env_1:res_1:srv_1:dst_1",
        proxyKind: "traefik",
      },
    ]);
    expect(store.failed).toEqual([]);
  });

  test("[EDGE-PROXY-ROUTE-007] records failed state for server-applied route failures", async () => {
    const context = createTestContext();
    const deployments = new MemoryDeploymentRepository();
    const store = new CapturingServerAppliedRouteStateStore();
    const handler = new MarkServerAppliedRouteStatusOnDeploymentFinishedHandler(
      deployments,
      store,
      new NoopLogger(),
    );
    const { deployment, event } = createDeployment({
      status: "failed",
      failurePhase: "public-route-verification",
      errorCode: "ssh_public_route_health_check_failed",
      errorMessage: "Public route failed",
      retryable: true,
    });
    await deployments.upsert(
      toRepositoryContext(context),
      deployment,
      UpsertDeploymentSpec.fromDeployment(deployment),
    );

    const result = await handler.handle(context, event);

    expect(result.isOk()).toBe(true);
    expect(store.applied).toEqual([]);
    expect(store.failed).toEqual([
      {
        target: {
          projectId: "proj_1",
          environmentId: "env_1",
          resourceId: "res_1",
          serverId: "srv_1",
          destinationId: "dst_1",
        },
        deploymentId: "dep_1",
        updatedAt: "2026-04-19T00:03:00.000Z",
        routeSetId: "proj_1:env_1:res_1:srv_1:dst_1",
        phase: "public-route-verification",
        errorCode: "ssh_public_route_health_check_failed",
        message: "Public route failed",
        retryable: true,
        proxyKind: "traefik",
      },
    ]);
  });
});
