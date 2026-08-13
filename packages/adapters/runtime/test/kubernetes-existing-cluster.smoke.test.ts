import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { expect, test } from "bun:test";
import {
  createExecutionContext,
  toRepositoryContext,
  type DeploymentSummary,
  type ResourceRuntimeLogContext,
} from "@appaloft/application";
import {
  AccessRoute,
  BuildStrategyKindValue,
  CreatedAt,
  Deployment,
  DeploymentId,
  DeploymentTarget,
  DeploymentTargetDescriptor,
  DeploymentTargetId,
  DeploymentTargetName,
  DestinationId,
  DetectSummary,
  DisplayNameText,
  EdgeProxyKindValue,
  EnvironmentConfigSnapshot,
  EnvironmentId,
  EnvironmentSnapshotId,
  ExecutionStrategyKindValue,
  GeneratedAt,
  HostAddress,
  ImageReference,
  PackagingModeValue,
  PlanStepText,
  PortNumber,
  ProjectId,
  ProviderKey,
  PublicDomainName,
  ResourceId,
  RoutePathPrefix,
  RuntimeArtifactIntentValue,
  RuntimeArtifactKindValue,
  RuntimeArtifactSnapshot,
  RuntimeExecutionPlan,
  RuntimePlan,
  RuntimePlanId,
  RuntimeTargetProfile,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
  StartedAt,
  TargetKindValue,
  TlsModeValue,
  UpdatedAt,
  UpsertServerSpec,
  ok,
} from "@appaloft/core";
import { MemoryServerRepository } from "@appaloft/testkit";

import {
  FileKubernetesConnectionResolver,
  K3S_TRAEFIK_ROUTING_POLICY_REFERENCE,
  KubernetesRuntimeTargetBackend,
  KubernetesShellCommandRunner,
  RuntimeDeploymentProofEvidenceReader,
  RuntimeResourceHealthProbeRunner,
  RuntimeResourceRuntimeLogReader,
  runDeploymentProofCommand,
  type KubernetesCommandRunner,
  type KubernetesCommandRunnerInput,
} from "../src";

const kubeconfigPath = process.env.APPALOFT_KUBERNETES_SMOKE_KUBECONFIG?.trim();
const ingressUrl = process.env.APPALOFT_KUBERNETES_SMOKE_INGRESS_URL?.trim();
const existingClusterTest = kubeconfigPath && ingressUrl ? test : test.skip;
const generatedAt = GeneratedAt.rehydrate("2026-08-13T00:00:00.000Z");
const deploymentId = "dep_kubernetes_real_smoke";
const resourceId = "res_kubernetes_real_smoke";
const serverId = "srv_kubernetes_real_smoke";
const routeHost = "r5a.localhost";

function target(): DeploymentTarget {
  const cluster = DeploymentTarget.register({
    id: DeploymentTargetId.rehydrate(serverId),
    name: DeploymentTargetName.rehydrate("R5a disposable cluster"),
    host: HostAddress.rehydrate("kubernetes.invalid"),
    port: PortNumber.rehydrate(6443),
    providerKey: ProviderKey.rehydrate("kubernetes"),
    targetKind: TargetKindValue.rehydrate("orchestrator-cluster"),
    createdAt: CreatedAt.rehydrate("2026-08-13T00:00:00.000Z"),
  })._unsafeUnwrap();
  cluster
    .configureRuntimeTargetProfile({
      profile: RuntimeTargetProfile.create({
        connectionReference: new URL(`file://${kubeconfigPath}`).toString(),
        routingPolicyReference: K3S_TRAEFIK_ROUTING_POLICY_REFERENCE,
      })._unsafeUnwrap(),
      configuredAt: UpdatedAt.rehydrate("2026-08-13T00:01:00.000Z"),
    })
    ._unsafeUnwrap();
  return cluster;
}

function runtimePlan(input: { routeHost?: string } = {}): RuntimePlan {
  const port = PortNumber.rehydrate(80);
  const image = ImageReference.rehydrate("traefik/whoami:v1.11.0");
  return RuntimePlan.rehydrate({
    id: RuntimePlanId.rehydrate("rtp_kubernetes_real_smoke"),
    source: SourceDescriptor.rehydrate({
      kind: SourceKindValue.rehydrate("docker-image"),
      locator: SourceLocator.rehydrate("traefik/whoami:v1.11.0"),
      displayName: DisplayNameText.rehydrate("Traefik whoami"),
    }),
    buildStrategy: BuildStrategyKindValue.rehydrate("prebuilt-image"),
    packagingMode: PackagingModeValue.rehydrate("all-in-one-docker"),
    execution: RuntimeExecutionPlan.rehydrate({
      kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
      image,
      port,
      accessRoutes: [
        AccessRoute.rehydrate({
          proxyKind: EdgeProxyKindValue.rehydrate("traefik"),
          domains: [PublicDomainName.rehydrate(input.routeHost ?? routeHost)],
          pathPrefix: RoutePathPrefix.rehydrate("/"),
          tlsMode: TlsModeValue.rehydrate("disabled"),
          targetPort: port,
        }),
      ],
    }),
    runtimeArtifact: RuntimeArtifactSnapshot.rehydrate({
      kind: RuntimeArtifactKindValue.rehydrate("image"),
      intent: RuntimeArtifactIntentValue.rehydrate("prebuilt-image"),
      image,
    }),
    target: DeploymentTargetDescriptor.rehydrate({
      kind: TargetKindValue.rehydrate("orchestrator-cluster"),
      providerKey: ProviderKey.rehydrate("kubernetes"),
      serverIds: [DeploymentTargetId.rehydrate(serverId)],
    }),
    detectSummary: DetectSummary.rehydrate("Prebuilt image"),
    steps: [PlanStepText.rehydrate("Deploy Kubernetes smoke workload")],
    generatedAt,
  });
}

function runningDeployment(
  input: { deploymentId?: string; resourceId?: string; routeHost?: string } = {},
): Deployment {
  const deployment = Deployment.create({
    id: DeploymentId.rehydrate(input.deploymentId ?? deploymentId),
    projectId: ProjectId.rehydrate("prj_kubernetes_smoke"),
    environmentId: EnvironmentId.rehydrate("env_kubernetes_smoke"),
    resourceId: ResourceId.rehydrate(input.resourceId ?? resourceId),
    serverId: DeploymentTargetId.rehydrate(serverId),
    destinationId: DestinationId.rehydrate("dst_kubernetes_smoke"),
    runtimePlan: runtimePlan({ routeHost: input.routeHost }),
    environmentSnapshot: EnvironmentConfigSnapshot.rehydrate({
      id: EnvironmentSnapshotId.rehydrate("envsnap_kubernetes_smoke"),
      environmentId: EnvironmentId.rehydrate("env_kubernetes_smoke"),
      createdAt: generatedAt,
      precedence: [],
      variables: [],
    }),
    createdAt: CreatedAt.rehydrate("2026-08-13T00:00:00.000Z"),
  })._unsafeUnwrap();
  const startedAt = StartedAt.rehydrate("2026-08-13T00:01:00.000Z");
  deployment.markPlanning(startedAt)._unsafeUnwrap();
  deployment.markPlanned(startedAt)._unsafeUnwrap();
  deployment.start(startedAt)._unsafeUnwrap();
  return deployment;
}

class UnavailableObservationRunner implements KubernetesCommandRunner {
  constructor(private readonly delegate: KubernetesCommandRunner) {}

  async run(input: KubernetesCommandRunnerInput) {
    if (input.step !== "observe-candidate-deployment") {
      return await this.delegate.run(input);
    }

    return ok({
      exitCode: 0,
      stdout: JSON.stringify({
        metadata: { generation: 1 },
        spec: { replicas: 1 },
        status: { availableReplicas: 0, observedGeneration: 1 },
      }),
      stderr: "",
    });
  }
}

existingClusterTest(
  "[K8S-E2E-018] deploys, routes, observes, proves, and exactly cleans a real existing cluster",
  async () => {
    const context = createExecutionContext({
      requestId: "req_kubernetes_real_smoke",
      entrypoint: "system",
      tenant: { tenantId: "org_kubernetes_smoke", organizationId: "org_kubernetes_smoke" },
    });
    const repository = new MemoryServerRepository();
    const cluster = target();
    await repository.upsert(
      toRepositoryContext(context),
      cluster,
      UpsertServerSpec.fromServer(cluster),
    );
    const resolver = new FileKubernetesConnectionResolver();
    const runner = new KubernetesShellCommandRunner();
    const backend = new KubernetesRuntimeTargetBackend(runner, resolver, repository);
    const deployment = runningDeployment();
    let executed = false;

    const routeFetch = async (_url: string, init?: RequestInit): Promise<Response> => {
      const target = new URL(ingressUrl!);
      target.hostname = routeHost;
      return await fetch(target, init);
    };
    const waitForRoute = async (): Promise<Response> => {
      let response = new Response(null, { status: 503 });
      for (let attempt = 0; attempt < 30; attempt += 1) {
        response = await routeFetch(`http://${routeHost}/`);
        if (
          response.ok &&
          response.headers.get("x-appaloft-deployment-id") === deploymentId
        ) {
          return response;
        }
        await Bun.sleep(1_000);
      }
      return response;
    };

    try {
      const readiness = await backend.inspectReadiness(context, cluster.toState());
      expect(readiness.isOk()).toBe(true);
      expect(readiness._unsafeUnwrap().checks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ capability: "api-reachability", status: "ready" }),
          expect.objectContaining({ capability: "authorization", status: "ready" }),
          expect.objectContaining({ capability: "routing", status: "ready" }),
        ]),
      );

      const result = await backend.execute(context, deployment);
      expect(result.isOk()).toBe(true);
      executed = result.isOk();
      const state = deployment.toState();
      const metadata = state.runtimePlan.execution.metadata ?? {};
      const namespace = metadata["kubernetes.namespace"];
      const workloadName = metadata["kubernetes.workloadName"];
      expect(namespace).toBeTruthy();
      expect(workloadName).toBeTruthy();

      const routed = await waitForRoute();
      expect(routed.ok).toBe(true);
      expect(routed.headers.get("x-appaloft-deployment-id")).toBe(deploymentId);

      const health = await new RuntimeResourceHealthProbeRunner(
        undefined,
        repository,
        resolver,
      ).probeRuntime(context, {
        resourceId,
        deploymentId,
        targetServerId: serverId,
        runtimeKind: "docker-container",
        targetKind: "orchestrator-cluster",
        providerKey: "kubernetes",
        runtimeMetadata: metadata,
        timeoutSeconds: 20,
      });
      expect(health._unsafeUnwrap()).toMatchObject({
        lifecycle: "running",
        health: "healthy",
        reasonCode: "kubernetes_deployment_available",
      });

      const summary = {
        id: deploymentId,
        resourceId,
        runtimePlan: {
          execution: {
            kind: "docker-container",
            metadata,
            accessRoutes: [
              {
                proxyKind: "traefik",
                domains: [routeHost],
                pathPrefix: "/",
                tlsMode: "disabled",
              },
            ],
          },
          target: {
            kind: "orchestrator-cluster",
            providerKey: "kubernetes",
            serverIds: [serverId],
          },
        },
        environmentSnapshot: { variables: [] },
      } as unknown as DeploymentSummary;
      const proof = await new RuntimeDeploymentProofEvidenceReader(
        repository,
        runDeploymentProofCommand,
        routeFetch,
        resolver,
      ).read(context, summary);
      expect(proof._unsafeUnwrap()).toMatchObject({
        available: true,
        workload: { deploymentId },
        configuration: { matchesPlanned: true, matchesPlannedKeySet: true },
        health: { status: "passed" },
        access: { status: "passed", routeTargetsWorkload: true },
      });

      const logContext = {
        resource: { id: resourceId },
        deployment: summary,
        redactions: [],
      } as unknown as ResourceRuntimeLogContext;
      const streamResult = await new RuntimeResourceRuntimeLogReader(
        repository,
        undefined,
        { boundedProcessTimeoutMs: 20_000 },
        resolver,
      ).open(
        context,
        logContext,
        { tailLines: 20, follow: false },
        new AbortController().signal,
      );
      expect(streamResult.isOk()).toBe(true);
      const events = [];
      for await (const event of streamResult._unsafeUnwrap()) events.push(event);
      expect(events.length).toBeGreaterThan(0);

      const failedCandidate = runningDeployment({
        deploymentId: "dep_kubernetes_failed_candidate",
        resourceId: "res_kubernetes_failed_candidate",
        routeHost: "r5a-failed.localhost",
      });
      const failedBackend = new KubernetesRuntimeTargetBackend(
        new UnavailableObservationRunner(runner),
        resolver,
        repository,
      );
      const failedResult = await failedBackend.execute(context, failedCandidate);
      expect(failedResult.isOk()).toBe(true);
      expect(failedCandidate.toState().status.value).toBe("failed");
      const failedNamespace =
        failedCandidate.toState().runtimePlan.execution.metadata?.["kubernetes.namespace"];
      expect(failedNamespace).toBeTruthy();
      const failedCandidateReadback = await runner.run({
        step: "verify-failed-candidate-cleaned",
        args: [
          "--kubeconfig",
          kubeconfigPath!,
          "get",
          "namespace",
          failedNamespace!,
          "-o",
          "json",
        ],
      });
      expect(failedCandidateReadback.isOk()).toBe(true);
      expect(failedCandidateReadback._unsafeUnwrap().exitCode).not.toBe(0);

      const preservedRoute = await waitForRoute();
      expect(preservedRoute.ok).toBe(true);
      expect(preservedRoute.headers.get("x-appaloft-deployment-id")).toBe(deploymentId);
    } finally {
      if (executed) {
        const cleanup = await backend.cancel(context, deployment);
        expect(cleanup.isOk()).toBe(true);
      }
      const residual = await runner.run({
        step: "verify-zero-owned-residual",
        args: [
          "--kubeconfig",
          kubeconfigPath!,
          "get",
          "namespaces",
          "-l",
          "appaloft.io/managed-by=appaloft",
          "-o",
          "json",
        ],
      });
      expect(residual.isOk()).toBe(true);
      expect(JSON.parse(residual._unsafeUnwrap().stdout).items).toEqual([]);
    }
  },
  240_000,
);
