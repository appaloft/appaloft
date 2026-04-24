import { describe, expect, test } from "bun:test";
import {
  BuildStrategyKindValue,
  ConfigScopeValue,
  CreatedAt,
  DeploymentTargetDescriptor,
  DeploymentTargetId,
  DeploymentTargetLifecycleStatusValue,
  DeploymentTargetName,
  type DeploymentTargetState,
  DetectSummary,
  DisplayNameText,
  EdgeProxyKindValue,
  EdgeProxyStatusValue,
  EnvironmentConfigSnapshot,
  EnvironmentId,
  EnvironmentSnapshotId,
  ExecutionStrategyKindValue,
  GeneratedAt,
  HostAddress,
  ImageReference,
  ok,
  PackagingModeValue,
  PlanStepText,
  PortNumber,
  ProviderKey,
  type Result,
  RuntimeExecutionPlan,
  RuntimePlan,
  RuntimePlanId,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
  TargetKindValue,
} from "@appaloft/core";
import { createExecutionContext, type ExecutionContext } from "../src/execution-context";
import { DefaultAccessDomainRuntimePlanResolver } from "../src/operations/deployments/default-access-domain-runtime-plan.resolver";
import {
  type DefaultAccessDomainGeneration,
  type DefaultAccessDomainProvider,
  type DefaultAccessDomainRequest,
  type RuntimePlanResolver,
} from "../src/ports";

class CapturingRuntimePlanResolver implements RuntimePlanResolver {
  capturedInput?: Parameters<RuntimePlanResolver["resolve"]>[1];

  async resolve(_context: ExecutionContext, input: Parameters<RuntimePlanResolver["resolve"]>[1]) {
    this.capturedInput = input;
    return RuntimePlan.create({
      id: RuntimePlanId.rehydrate(input.id),
      source: input.source,
      buildStrategy: BuildStrategyKindValue.rehydrate("dockerfile"),
      packagingMode: PackagingModeValue.rehydrate("all-in-one-docker"),
      execution: RuntimeExecutionPlan.rehydrate({
        kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
        image: ImageReference.rehydrate("demo:test"),
        port: PortNumber.rehydrate(input.requestedDeployment.port ?? 3000),
      }),
      target: DeploymentTargetDescriptor.rehydrate({
        kind: TargetKindValue.rehydrate("single-server"),
        providerKey: input.server.providerKey,
        serverIds: [input.server.id],
      }),
      detectSummary: DetectSummary.rehydrate(input.detectedReasoning.join(" | ")),
      steps: [PlanStepText.rehydrate("run")],
      generatedAt: GeneratedAt.rehydrate(input.generatedAt),
    });
  }
}

class StaticDefaultAccessDomainProvider implements DefaultAccessDomainProvider {
  request?: DefaultAccessDomainRequest;

  async generate(
    _context: ExecutionContext,
    input: DefaultAccessDomainRequest,
  ): Promise<Result<DefaultAccessDomainGeneration>> {
    this.request = input;
    return ok({
      kind: "generated",
      domain: {
        hostname: "web-resdemo.203.0.113.10.example.test",
        scheme: "http",
        providerKey: "test-provider",
      },
    });
  }
}

function createEnvironmentSnapshot(snapshotId: string) {
  return EnvironmentConfigSnapshot.rehydrate({
    id: EnvironmentSnapshotId.rehydrate(snapshotId),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    createdAt: GeneratedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    precedence: [ConfigScopeValue.rehydrate("environment")],
    variables: [],
  });
}

function createServer(): DeploymentTargetState {
  return {
    id: DeploymentTargetId.rehydrate("srv_demo"),
    name: DeploymentTargetName.rehydrate("demo"),
    host: HostAddress.rehydrate("203.0.113.10"),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate("generic-ssh"),
    targetKind: TargetKindValue.rehydrate("single-server"),
    lifecycleStatus: DeploymentTargetLifecycleStatusValue.active(),
    edgeProxy: {
      kind: EdgeProxyKindValue.rehydrate("traefik"),
      status: EdgeProxyStatusValue.rehydrate("ready"),
    },
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  };
}

describe("DefaultAccessDomainRuntimePlanResolver", () => {
  test("enriches reverse-proxy resource deployments with a generated provider-neutral route", async () => {
    const inner = new CapturingRuntimePlanResolver();
    const provider = new StaticDefaultAccessDomainProvider();
    const resolver = new DefaultAccessDomainRuntimePlanResolver(inner, provider);
    const context = createExecutionContext({
      entrypoint: "system",
      requestId: "req_default_access",
    });

    const result = await resolver.resolve(context, {
      id: "plan_demo",
      source: SourceDescriptor.rehydrate({
        kind: SourceKindValue.rehydrate("git-public"),
        locator: SourceLocator.rehydrate("https://example.test/demo.git"),
        displayName: DisplayNameText.rehydrate("demo"),
      }),
      server: createServer(),
      environmentSnapshot: createEnvironmentSnapshot("snap_demo"),
      detectedReasoning: ["detected git source"],
      requestedDeployment: {
        method: "dockerfile",
        port: 3000,
        exposureMode: "reverse-proxy",
        upstreamProtocol: "http",
        accessContext: {
          projectId: "prj_demo",
          environmentId: "env_demo",
          resourceId: "res_demo",
          resourceSlug: "web",
          destinationId: "dst_demo",
          exposureMode: "reverse-proxy",
          upstreamProtocol: "http",
          routePurpose: "default-resource-access",
        },
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    expect(provider.request).toEqual(
      expect.objectContaining({
        publicAddress: "203.0.113.10",
        resourceId: "res_demo",
        resourceSlug: "web",
        routePurpose: "default-resource-access",
        correlationId: "req_default_access",
      }),
    );
    expect(inner.capturedInput?.requestedDeployment).toEqual(
      expect.objectContaining({
        proxyKind: "traefik",
        domains: ["web-resdemo.203.0.113.10.example.test"],
        tlsMode: "disabled",
        accessRouteMetadata: expect.objectContaining({
          "access.routeSource": "generated-default",
          "access.hostname": "web-resdemo.203.0.113.10.example.test",
          "access.providerKey": "test-provider",
          "access.scheme": "http",
        }),
      }),
    );
  });

  test("skips generated default access when the server has no enabled edge proxy", async () => {
    const inner = new CapturingRuntimePlanResolver();
    const provider = new StaticDefaultAccessDomainProvider();
    const resolver = new DefaultAccessDomainRuntimePlanResolver(inner, provider);
    const context = createExecutionContext({
      entrypoint: "system",
      requestId: "req_default_access_no_proxy",
    });
    const serverWithoutProxy = createServer();
    delete serverWithoutProxy.edgeProxy;

    const result = await resolver.resolve(context, {
      id: "plan_demo",
      source: SourceDescriptor.rehydrate({
        kind: SourceKindValue.rehydrate("git-public"),
        locator: SourceLocator.rehydrate("https://example.test/demo.git"),
        displayName: DisplayNameText.rehydrate("demo"),
      }),
      server: serverWithoutProxy,
      environmentSnapshot: createEnvironmentSnapshot("snap_demo"),
      detectedReasoning: ["detected git source"],
      requestedDeployment: {
        method: "dockerfile",
        port: 3000,
        exposureMode: "reverse-proxy",
        upstreamProtocol: "http",
        accessContext: {
          projectId: "prj_demo",
          environmentId: "env_demo",
          resourceId: "res_demo",
          resourceSlug: "web",
          destinationId: "dst_demo",
          exposureMode: "reverse-proxy",
          upstreamProtocol: "http",
          routePurpose: "default-resource-access",
        },
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    expect(provider.request).toBeUndefined();
    expect(inner.capturedInput?.requestedDeployment).toEqual(
      expect.objectContaining({
        accessRouteMetadata: {
          "access.routeSource": "none",
          "access.policyDisabledReason": "edge-proxy-missing",
        },
      }),
    );
    expect(inner.capturedInput?.requestedDeployment.domains).toBeUndefined();
    expect(inner.capturedInput?.requestedDeployment.proxyKind).toBeUndefined();
  });
});
