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
  domainError,
  EdgeProxyKindValue,
  EnvironmentConfigSnapshot,
  EnvironmentId,
  EnvironmentSnapshotId,
  ErrorCodeText,
  ExecutionResult,
  ExecutionStatusValue,
  ExecutionStrategyKindValue,
  ExitCode,
  err,
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
  type MarkServerAppliedRouteAppliedSpec,
  type MarkServerAppliedRouteFailedSpec,
  type ServerAppliedRouteDesiredStateRecord,
  type ServerAppliedRouteStateRepository,
  type ServerAppliedRouteStateSelectionSpec,
  type ServerAppliedRouteStateSelectionSpecVisitor,
  type ServerAppliedRouteStateUpdateSpec,
  type ServerAppliedRouteStateUpdateSpecVisitor,
} from "../src/ports";

class CapturingServerAppliedRouteStateRepository implements ServerAppliedRouteStateRepository {
  readonly applied: Array<{
    routeSetId: string;
    deploymentId: string;
    updatedAt: string;
    providerKey?: string;
    proxyKind?: string;
  }> = [];
  readonly failed: Array<{
    routeSetId: string;
    deploymentId: string;
    updatedAt: string;
    phase: string;
    errorCode: string;
    message?: string;
    retryable: boolean;
    providerKey?: string;
    proxyKind?: string;
  }> = [];

  async findOne(
    spec: ServerAppliedRouteStateSelectionSpec,
  ): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>> {
    const unsupported: Result<ServerAppliedRouteDesiredStateRecord | null> = err(
      domainError.validation("Unsupported route-state selection spec for test repository", {
        phase: "test-double",
      }),
    );

    return spec.accept<Result<ServerAppliedRouteDesiredStateRecord | null>>(unsupported, {
      visitServerAppliedRouteStateByTarget: () =>
        ok({
          routeSetId: "proj_1:env_1:res_1:srv_1:dst_1",
          projectId: "proj_1",
          environmentId: "env_1",
          resourceId: "res_1",
          serverId: "srv_1",
          destinationId: "dst_1",
          domains: [],
          status: "desired",
          updatedAt: "2026-04-19T00:00:00.000Z",
        }),
      visitServerAppliedRouteStateByRouteSetId: () => unsupported,
      visitServerAppliedRouteStateBySourceFingerprint: () => unsupported,
    } satisfies ServerAppliedRouteStateSelectionSpecVisitor<
      Result<ServerAppliedRouteDesiredStateRecord | null>
    >);
  }

  async upsert(): Promise<Result<ServerAppliedRouteDesiredStateRecord>> {
    throw new Error("Unexpected upsert call");
  }

  async updateOne(
    selectionSpec: ServerAppliedRouteStateSelectionSpec,
    updateSpec: ServerAppliedRouteStateUpdateSpec,
  ): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>> {
    const unsupportedRouteSetId: Result<string> = err(
      domainError.validation("Unsupported route-state selection spec for test repository", {
        phase: "test-double",
      }),
    );

    const routeSetIdResult = selectionSpec.accept(unsupportedRouteSetId, {
      visitServerAppliedRouteStateByTarget: () => unsupportedRouteSetId,
      visitServerAppliedRouteStateByRouteSetId: (_query, spec) => ok(spec.routeSetId),
      visitServerAppliedRouteStateBySourceFingerprint: () => unsupportedRouteSetId,
    } satisfies ServerAppliedRouteStateSelectionSpecVisitor<Result<string>>);
    if (routeSetIdResult.isErr()) {
      return err(routeSetIdResult.error);
    }

    const updateAction = updateSpec.accept<
      | { kind: "applied"; spec: MarkServerAppliedRouteAppliedSpec }
      | { kind: "failed"; spec: MarkServerAppliedRouteFailedSpec }
    >({
      visitMarkServerAppliedRouteApplied: (spec) => ({ kind: "applied" as const, spec }),
      visitMarkServerAppliedRouteFailed: (spec) => ({ kind: "failed" as const, spec }),
    } satisfies ServerAppliedRouteStateUpdateSpecVisitor<
      | { kind: "applied"; spec: MarkServerAppliedRouteAppliedSpec }
      | { kind: "failed"; spec: MarkServerAppliedRouteFailedSpec }
    >);

    if (updateAction.kind === "applied") {
      this.applied.push({
        routeSetId: routeSetIdResult.value,
        deploymentId: updateAction.spec.deploymentId,
        updatedAt: updateAction.spec.updatedAt,
        ...(updateAction.spec.providerKey ? { providerKey: updateAction.spec.providerKey } : {}),
        ...(updateAction.spec.proxyKind ? { proxyKind: updateAction.spec.proxyKind } : {}),
      });
      return ok(null);
    }

    this.failed.push({
      routeSetId: routeSetIdResult.value,
      deploymentId: updateAction.spec.deploymentId,
      updatedAt: updateAction.spec.updatedAt,
      phase: updateAction.spec.phase,
      errorCode: updateAction.spec.errorCode,
      retryable: updateAction.spec.retryable,
      ...(updateAction.spec.message ? { message: updateAction.spec.message } : {}),
      ...(updateAction.spec.providerKey ? { providerKey: updateAction.spec.providerKey } : {}),
      ...(updateAction.spec.proxyKind ? { proxyKind: updateAction.spec.proxyKind } : {}),
    });
    return ok(null);
  }

  async deleteOne(): Promise<Result<boolean>> {
    return ok(false);
  }

  async deleteMany(): Promise<Result<number>> {
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
    const repository = new CapturingServerAppliedRouteStateRepository();
    const handler = new MarkServerAppliedRouteStatusOnDeploymentFinishedHandler(
      deployments,
      repository,
      new NoopLogger(),
    );
    const { deployment, event } = createDeployment({ status: "succeeded" });
    await deployments.insertOne(
      toRepositoryContext(context),
      deployment,
      UpsertDeploymentSpec.fromDeployment(deployment),
    );

    const result = await handler.handle(context, event);

    expect(result.isOk()).toBe(true);
    expect(repository.applied).toEqual([
      {
        routeSetId: "proj_1:env_1:res_1:srv_1:dst_1",
        deploymentId: "dep_1",
        updatedAt: "2026-04-19T00:03:00.000Z",
        proxyKind: "traefik",
      },
    ]);
    expect(repository.failed).toEqual([]);
  });

  test("[EDGE-PROXY-ROUTE-007] records failed state for server-applied route failures", async () => {
    const context = createTestContext();
    const deployments = new MemoryDeploymentRepository();
    const repository = new CapturingServerAppliedRouteStateRepository();
    const handler = new MarkServerAppliedRouteStatusOnDeploymentFinishedHandler(
      deployments,
      repository,
      new NoopLogger(),
    );
    const { deployment, event } = createDeployment({
      status: "failed",
      failurePhase: "public-route-verification",
      errorCode: "ssh_public_route_health_check_failed",
      errorMessage: "Public route failed",
      retryable: true,
    });
    await deployments.insertOne(
      toRepositoryContext(context),
      deployment,
      UpsertDeploymentSpec.fromDeployment(deployment),
    );

    const result = await handler.handle(context, event);

    expect(result.isOk()).toBe(true);
    expect(repository.applied).toEqual([]);
    expect(repository.failed).toEqual([
      {
        routeSetId: "proj_1:env_1:res_1:srv_1:dst_1",
        deploymentId: "dep_1",
        updatedAt: "2026-04-19T00:03:00.000Z",
        phase: "public-route-verification",
        errorCode: "ssh_public_route_health_check_failed",
        message: "Public route failed",
        retryable: true,
        proxyKind: "traefik",
      },
    ]);
  });
});
