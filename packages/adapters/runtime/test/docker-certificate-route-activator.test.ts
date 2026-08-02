import { describe, expect, test } from "bun:test";
import {
  createExecutionContext,
  type CertificateRouteActivationInput,
  type DeploymentRepository,
  type EdgeProxyProvider,
  type EdgeProxyProviderRegistry,
  type EdgeProxyProviderSelectionInput,
  type RepositoryContext,
  type ServerRepository,
} from "@appaloft/application";
import {
  AccessRoute,
  BuildStrategyKindValue,
  ConfigScopeValue,
  CreatedAt,
  Deployment,
  DeploymentId,
  DeploymentTarget,
  DeploymentTargetDescriptor,
  DeploymentTargetId,
  DeploymentTargetName,
  DetectSummary,
  DestinationId,
  DisplayNameText,
  EnvironmentConfigSnapshot,
  EnvironmentId,
  EnvironmentSnapshotId,
  ExecutionResult,
  ExecutionStatusValue,
  ExecutionStrategyKindValue,
  ExitCode,
  FinishedAt,
  GeneratedAt,
  HostAddress,
  ImageReference,
  ok,
  PackagingModeValue,
  PlanStepText,
  PortNumber,
  ProjectId,
  ProviderKey,
  PublicDomainName,
  ResourceId,
  ResourceServiceName,
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
  EdgeProxyKindValue,
  type Result,
  type Server,
} from "@appaloft/core";
import { TraefikEdgeProxyProvider } from "@appaloft/provider-edge-proxy-traefik";

import {
  DockerCertificateRouteActivator,
  type CertificateRouteRuntime,
  type CertificateRouteRuntimeActivationInput,
} from "../src";

function succeededDeployment(input: {
  kind?: "docker-container" | "docker-compose-stack";
  targetServiceName?: string;
} = {}): Deployment {
  const route = AccessRoute.create({
    proxyKind: EdgeProxyKindValue.rehydrate("traefik"),
    domains: [PublicDomainName.create("manual.example.test")._unsafeUnwrap()],
    pathPrefix: RoutePathPrefix.create("/")._unsafeUnwrap(),
    tlsMode: TlsModeValue.rehydrate("auto"),
    source: "domain-binding",
    certificate: { source: "appaloft-managed", certificateId: "crt_previous" },
    targetPort: PortNumber.rehydrate(3000),
    ...(input.targetServiceName
      ? { targetServiceName: ResourceServiceName.rehydrate(input.targetServiceName) }
      : {}),
  })._unsafeUnwrap();
  const runtimePlan = RuntimePlan.create({
    id: RuntimePlanId.rehydrate("plan_previous"),
    source: SourceDescriptor.rehydrate({
      kind: SourceKindValue.rehydrate("local-folder"),
      locator: SourceLocator.rehydrate("."),
      displayName: DisplayNameText.rehydrate("workspace"),
    }),
    buildStrategy: BuildStrategyKindValue.rehydrate("dockerfile"),
    packagingMode: PackagingModeValue.rehydrate("all-in-one-docker"),
    execution: RuntimeExecutionPlan.rehydrate({
      kind: ExecutionStrategyKindValue.rehydrate(input.kind ?? "docker-container"),
      image: ImageReference.rehydrate("demo:test"),
      port: PortNumber.rehydrate(3000),
      accessRoutes: [route],
    }),
    target: DeploymentTargetDescriptor.rehydrate({
      kind: TargetKindValue.rehydrate("single-server"),
      providerKey: ProviderKey.rehydrate("generic-ssh"),
      serverIds: [DeploymentTargetId.rehydrate("srv_demo")],
    }),
    detectSummary: DetectSummary.rehydrate("existing deployment"),
    steps: [PlanStepText.rehydrate("Deploy container")],
    generatedAt: GeneratedAt.rehydrate("2026-08-02T00:00:00.000Z"),
  })._unsafeUnwrap();
  const deployment = Deployment.create({
    id: DeploymentId.rehydrate("dep_previous"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    resourceId: ResourceId.rehydrate("res_demo"),
    serverId: DeploymentTargetId.rehydrate("srv_demo"),
    destinationId: DestinationId.rehydrate("dst_demo"),
    runtimePlan,
    environmentSnapshot: EnvironmentConfigSnapshot.rehydrate({
      id: EnvironmentSnapshotId.rehydrate("snap_previous"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      createdAt: GeneratedAt.rehydrate("2026-08-02T00:00:00.000Z"),
      precedence: [ConfigScopeValue.rehydrate("environment")],
      variables: [],
    }),
    createdAt: CreatedAt.rehydrate("2026-08-02T00:00:00.000Z"),
  })._unsafeUnwrap();
  deployment.markPlanning(StartedAt.rehydrate("2026-08-02T00:00:01.000Z"));
  deployment.markPlanned(StartedAt.rehydrate("2026-08-02T00:00:02.000Z"));
  deployment.start(StartedAt.rehydrate("2026-08-02T00:00:03.000Z"));
  deployment.applyExecutionResult(
    FinishedAt.rehydrate("2026-08-02T00:00:04.000Z"),
    ExecutionResult.rehydrate({
      exitCode: ExitCode.rehydrate(0),
      status: ExecutionStatusValue.rehydrate("succeeded"),
      retryable: false,
      timeline: [],
    }),
  );
  return deployment;
}

class StaticDeploymentRepository implements DeploymentRepository {
  constructor(private readonly deployment: Deployment) {}
  async findOne(): Promise<Deployment> { return this.deployment; }
  async insertOne(): Promise<Result<void>> { return ok(undefined); }
  async updateOne(): Promise<Result<void>> { return ok(undefined); }
}

class StaticServerRepository implements ServerRepository {
  constructor(private readonly server: Server) {}
  async findOne(): Promise<Server> { return this.server; }
  async upsert(_context: RepositoryContext): Promise<void> {}
}

class StaticRegistry implements EdgeProxyProviderRegistry {
  constructor(private readonly provider: EdgeProxyProvider) {}
  resolve(): Result<EdgeProxyProvider> { return ok(this.provider); }
  defaultFor(_input: EdgeProxyProviderSelectionInput): Result<EdgeProxyProvider> {
    return ok(this.provider);
  }
}

class CapturingCertificateRouteRuntime implements CertificateRouteRuntime {
  input: CertificateRouteRuntimeActivationInput | undefined;
  async activate(input: CertificateRouteRuntimeActivationInput) {
    this.input = input;
    return ok({ activationId: "act_candidate", previousActivationId: "act_previous" });
  }
  async rollback() { return ok(undefined); }
  async finalize() { return ok(undefined); }
}

function activationInput(): CertificateRouteActivationInput {
  return {
    certificateId: "crt_candidate",
    certificateSource: "imported",
    domainBindingId: "dmb_demo",
    projectId: "prj_demo",
    environmentId: "env_demo",
    resourceId: "res_demo",
    serverId: "srv_demo",
    destinationId: "dst_demo",
    domainName: "manual.example.test",
    pathPrefix: "/",
    proxyKind: "traefik",
    material: {
      certificateId: "crt_candidate",
      certificateChain: "candidate-chain",
      privateKey: "candidate-key",
    },
  };
}

describe("DockerCertificateRouteActivator", () => {
  test("[EDGE-PROXY-RELOAD-004A] resolves the serving deployment and activates the selected certificate route", async () => {
    const server = DeploymentTarget.register({
      id: DeploymentTargetId.rehydrate("srv_demo"),
      name: DeploymentTargetName.rehydrate("Demo"),
      host: HostAddress.rehydrate("203.0.113.45"),
      port: PortNumber.rehydrate(22),
      providerKey: ProviderKey.rehydrate("generic-ssh"),
      createdAt: CreatedAt.rehydrate("2026-08-02T00:00:00.000Z"),
    })._unsafeUnwrap();
    const runtime = new CapturingCertificateRouteRuntime();
    const activator = new DockerCertificateRouteActivator(
      new StaticDeploymentRepository(succeededDeployment()),
      new StaticServerRepository(server),
      new StaticRegistry(new TraefikEdgeProxyProvider()),
      runtime,
    );

    const result = await activator.activate(
      createExecutionContext({ requestId: "req_certificate_activation", entrypoint: "system" }),
      activationInput(),
    );

    expect(result._unsafeUnwrap()).toEqual({
      activationId: "act_candidate",
      previousActivationId: "act_previous",
    });
    expect(runtime.input).toMatchObject({
      deploymentId: "dep_previous",
      certificateId: "crt_candidate",
      proxyKind: "traefik",
      server: expect.objectContaining({ id: expect.objectContaining({ value: "srv_demo" }) }),
      accessRoutes: [
        expect.objectContaining({
          source: "domain-binding",
          domains: ["manual.example.test"],
          certificate: {
            source: "appaloft-imported",
            certificateId: "crt_candidate",
          },
        }),
      ],
      routePlan: expect.objectContaining({
        labels: expect.not.arrayContaining([
          expect.stringContaining("tls.certresolver=appaloft"),
        ]),
      }),
    });
  });

  test("[EDGE-PROXY-RELOAD-004B] selects the authoritative Compose project and route service", async () => {
    const server = DeploymentTarget.register({
      id: DeploymentTargetId.rehydrate("srv_demo"),
      name: DeploymentTargetName.rehydrate("Demo"),
      host: HostAddress.rehydrate("203.0.113.45"),
      port: PortNumber.rehydrate(22),
      providerKey: ProviderKey.rehydrate("generic-ssh"),
      createdAt: CreatedAt.rehydrate("2026-08-02T00:00:00.000Z"),
    })._unsafeUnwrap();
    const runtime = new CapturingCertificateRouteRuntime();
    const activator = new DockerCertificateRouteActivator(
      new StaticDeploymentRepository(
        succeededDeployment({ kind: "docker-compose-stack", targetServiceName: "api" }),
      ),
      new StaticServerRepository(server),
      new StaticRegistry(new TraefikEdgeProxyProvider()),
      runtime,
    );

    const result = await activator.activate(
      createExecutionContext({ requestId: "req_compose_activation", entrypoint: "system" }),
      { ...activationInput(), targetServiceName: "api" },
    );

    expect(result.isOk()).toBe(true);
    expect(runtime.input?.containerSelector).toEqual({
      composeProjectName: "appaloft-dep_previous",
      serviceName: "api",
    });
  });
});
