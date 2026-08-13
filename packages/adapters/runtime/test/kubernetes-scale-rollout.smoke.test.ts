import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { expect, test } from "bun:test";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
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
  HostAddress,
  ImageReference,
  PackagingModeValue,
  PlanStepText,
  PortNumber,
  ProjectId,
  ProviderKey,
  PublicDomainName,
  ResourceId,
  domainError,
  err,
  ok,
  type Result,
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
} from "@appaloft/core";
import { MemoryServerRepository } from "@appaloft/testkit";

import {
  FileKubernetesConnectionResolver,
  K3S_TRAEFIK_ROUTING_POLICY_REFERENCE,
  KubernetesRuntimeTargetBackend,
  KubernetesShellCommandRunner,
  renderKubernetesRuntimeIntent,
  type KubernetesCommandRunner,
  type KubernetesCommandRunnerInput,
  type KubernetesCommandRunnerResult,
  type KubernetesCanaryRouteProbe,
  type KubernetesRolloutClock,
  type KubernetesRuntimeIntent,
} from "../src";

const kubeconfigPath = process.env.APPALOFT_KUBERNETES_SMOKE_KUBECONFIG?.trim();
const ingressUrl = process.env.APPALOFT_KUBERNETES_SMOKE_INGRESS_URL?.trim();
const existingClusterTest = kubeconfigPath && ingressUrl ? test : test.skip;
const generatedAt = GeneratedAt.rehydrate("2026-08-13T00:00:00.000Z");
const serverId = "srv_kubernetes_r5b_smoke";
const stableDeploymentId = "dep_kubernetes_r5b_stable";
const candidateDeploymentId = "dep_kubernetes_r5b_candidate";
const routeHost = "r5b.localhost";

function target(): DeploymentTarget {
  const cluster = DeploymentTarget.register({
    id: DeploymentTargetId.rehydrate(serverId),
    name: DeploymentTargetName.rehydrate("R5b disposable cluster"),
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

function runtimePlan(strategy: "rolling" | "canary"): RuntimePlan {
  const port = PortNumber.rehydrate(80);
  const image = ImageReference.rehydrate("traefik/whoami:v1.11.0");
  return RuntimePlan.rehydrate({
    id: RuntimePlanId.rehydrate(`rtp_kubernetes_r5b_${strategy}`),
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
      healthCheck: {
        enabled: true,
        type: HealthCheckTypeValue.rehydrate("http"),
        intervalSeconds: HealthCheckIntervalSeconds.rehydrate(2),
        timeoutSeconds: HealthCheckTimeoutSeconds.rehydrate(2),
        retries: HealthCheckRetryCount.rehydrate(10),
        startPeriodSeconds: HealthCheckStartPeriodSeconds.rehydrate(0),
        http: {
          method: HealthCheckHttpMethodValue.rehydrate("GET"),
          scheme: HealthCheckSchemeValue.rehydrate("http"),
          host: HealthCheckHostText.rehydrate("127.0.0.1"),
          port,
          path: HealthCheckPathText.rehydrate("/"),
          expectedStatusCode: HealthCheckExpectedStatusCode.rehydrate(200),
        },
      },
      accessRoutes: [
        AccessRoute.rehydrate({
          proxyKind: EdgeProxyKindValue.rehydrate("traefik"),
          domains: [PublicDomainName.rehydrate(routeHost)],
          pathPrefix: RoutePathPrefix.rehydrate("/"),
          tlsMode: TlsModeValue.rehydrate("disabled"),
          targetPort: port,
        }),
      ],
      metadata:
        strategy === "rolling"
          ? { "appaloft.rollout.strategy": "rolling" }
          : {
              "appaloft.scale.replicas": "2",
              "appaloft.scale.cpuRequestMillicores": "10",
              "appaloft.scale.cpuLimitMillicores": "100",
              "appaloft.scale.memoryRequestMebibytes": "8",
              "appaloft.scale.memoryLimitMebibytes": "64",
              "appaloft.scale.hpa.minReplicas": "2",
              "appaloft.scale.hpa.maxReplicas": "4",
              "appaloft.scale.hpa.targetCpuUtilizationPercent": "70",
              "appaloft.rollout.strategy": "canary",
              "appaloft.rollout.canary.initialTrafficPercent": "10",
              "appaloft.rollout.canary.stepTrafficPercent": "30",
              "appaloft.rollout.canary.intervalSeconds": "1",
            },
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
    steps: [PlanStepText.rehydrate(`Deploy Kubernetes ${strategy} workload`)],
    generatedAt,
  });
}

function runningDeployment(input: {
  id: string;
  plan: RuntimePlan;
  supersedesDeploymentId?: string;
}): Deployment {
  const deployment = Deployment.create({
    id: DeploymentId.rehydrate(input.id),
    projectId: ProjectId.rehydrate("prj_kubernetes_r5b_smoke"),
    environmentId: EnvironmentId.rehydrate("env_kubernetes_r5b_smoke"),
    resourceId: ResourceId.rehydrate("res_kubernetes_r5b_smoke"),
    serverId: DeploymentTargetId.rehydrate(serverId),
    destinationId: DestinationId.rehydrate("dst_kubernetes_r5b_smoke"),
    runtimePlan: input.plan,
    ...(input.supersedesDeploymentId
      ? { supersedesDeploymentId: DeploymentId.rehydrate(input.supersedesDeploymentId) }
      : {}),
    environmentSnapshot: EnvironmentConfigSnapshot.rehydrate({
      id: EnvironmentSnapshotId.rehydrate(`envsnap_${input.id}`),
      environmentId: EnvironmentId.rehydrate("env_kubernetes_r5b_smoke"),
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

async function routedBodies(count: number): Promise<string[]> {
  const target = new URL(ingressUrl!);
  target.hostname = routeHost;
  const responses = await Promise.all(
    Array.from({ length: count }, async () => {
      const response = await fetch(target, { headers: { connection: "close" } });
      return response.ok ? await response.text() : "";
    }),
  );
  return responses.filter(Boolean);
}

class TrafficObservingClock implements KubernetesRolloutClock {
  readonly samples: string[][] = [];

  async wait(_milliseconds: number): Promise<void> {
    this.samples.push(await routedBodies(80));
  }
}

class IngressCanaryRouteProbe implements KubernetesCanaryRouteProbe {
  async prove(input: {
    intent: KubernetesRuntimeIntent;
    expectedDeploymentId: string;
  }): Promise<Result<void>> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const target = new URL(ingressUrl!);
      target.hostname = input.intent.routes[0]?.domains[0] ?? routeHost;
      try {
        const response = await fetch(target, { headers: { connection: "close" } });
        const deploymentId = response.headers.get("x-appaloft-deployment-id");
        await response.body?.cancel();
        if (response.ok && deploymentId === input.expectedDeploymentId) return ok(undefined);
      } catch {
        // The disposable ingress controller may still be reconciling the route.
      }
      await Bun.sleep(250);
    }
    return err(
      domainError.infra("Disposable canary route did not converge", {
        expectedDeploymentId: input.expectedDeploymentId,
      }),
    );
  }
}

class DiagnosticRunner implements KubernetesCommandRunner {
  readonly records: Array<{
    step: string;
    exitCode?: number;
    stdout?: string;
    stderr?: string;
    error?: string;
  }> = [];

  constructor(private readonly delegate: KubernetesCommandRunner) {}

  async run(
    input: KubernetesCommandRunnerInput,
  ): Promise<Result<KubernetesCommandRunnerResult>> {
    const result = await this.delegate.run(input);
    this.records.push(
      result.isOk()
        ? { step: input.step, ...result.value }
        : { step: input.step, error: result.error.message },
    );
    return result;
  }
}

existingClusterTest(
  "[SCALE-CONVERGE-010][ROLLOUT-PROFILE-011] scales and promotes a real weighted canary",
  async () => {
    const context = createExecutionContext({
      requestId: "req_kubernetes_r5b_smoke",
      entrypoint: "system",
      tenant: {
        tenantId: "org_kubernetes_r5b_smoke",
        organizationId: "org_kubernetes_r5b_smoke",
      },
    });
    const repository = new MemoryServerRepository();
    const cluster = target();
    await repository.upsert(
      toRepositoryContext(context),
      cluster,
      UpsertServerSpec.fromServer(cluster),
    );
    const resolver = new FileKubernetesConnectionResolver();
    const runner = new DiagnosticRunner(new KubernetesShellCommandRunner());
    const stableBackend = new KubernetesRuntimeTargetBackend(runner, resolver, repository);
    const stable = runningDeployment({ id: stableDeploymentId, plan: runtimePlan("rolling") });
    const clock = new TrafficObservingClock();
    const candidatePlan = runtimePlan("canary");
    const candidate = runningDeployment({
      id: candidateDeploymentId,
      plan: candidatePlan,
      supersedesDeploymentId: stableDeploymentId,
    });
    const candidateBackend = new KubernetesRuntimeTargetBackend(
      runner,
      resolver,
      repository,
      undefined,
      undefined,
      undefined,
      clock,
      new IngressCanaryRouteProbe(),
    );
    const candidateIntent = renderKubernetesRuntimeIntent({
      runtimePlan: candidatePlan,
      environmentSnapshot: candidate.toState().environmentSnapshot,
      identity: {
        organizationId: "org_kubernetes_r5b_smoke",
        projectId: "prj_kubernetes_r5b_smoke",
        environmentId: "env_kubernetes_r5b_smoke",
        resourceId: "res_kubernetes_r5b_smoke",
        deploymentId: candidateDeploymentId,
        targetId: serverId,
      },
    })._unsafeUnwrap();
    let stableExecuted = false;
    let candidateExecuted = false;

    try {
      const stableResult = await stableBackend.execute(context, stable);
      expect(stableResult.isOk()).toBe(true);
      expect(stable.toState().status.value).toBe("succeeded");
      stableExecuted = true;

      const candidateResult = await candidateBackend.execute(context, candidate);
      if (candidateResult.isErr()) {
        throw new Error(
          `Canary execution failed: ${candidateResult.error.message} ${JSON.stringify(candidateResult.error.details ?? {})}`,
        );
      }
      if (candidate.toState().status.value !== "succeeded") {
        throw new Error(
          `Canary deployment failed: ${JSON.stringify({ state: candidate.toState(), records: runner.records }, null, 2)}`,
        );
      }
      candidateExecuted = true;

      const metadata = candidate.toState().runtimePlan.execution.metadata ?? {};
      expect(metadata).toMatchObject({
        "runtime.scale.desiredReplicas": "2",
        "runtime.scale.currentReplicas": "2",
        "runtime.scale.readyReplicas": "2",
        "runtime.rollout.strategy": "canary",
        "runtime.rollout.candidateTrafficPercent": "100",
        "runtime.rollout.promotionProof": "passed",
      });
      expect(metadata["runtime.scale.metricDecision"]).not.toBe("disabled");

      const hpa = await runner.run({
        step: "verify-real-hpa",
        args: [
          "--kubeconfig",
          kubeconfigPath!,
          "get",
          "horizontalpodautoscaler",
          candidateIntent.workloadName,
          "--namespace",
          candidateIntent.namespace,
          "-o",
          "json",
        ],
      });
      expect(hpa.isOk()).toBe(true);
      expect(hpa._unsafeUnwrap().exitCode).toBe(0);
      expect(JSON.parse(hpa._unsafeUnwrap().stdout).spec).toMatchObject({
        minReplicas: 2,
        maxReplicas: 4,
      });

      const stableWorkloadName =
        stable.toState().runtimePlan.execution.metadata?.["kubernetes.workloadName"];
      expect(stableWorkloadName).toBeTruthy();
      const stableNamespace =
        stable.toState().runtimePlan.execution.metadata?.["kubernetes.namespace"];
      expect(stableNamespace).toBeTruthy();
      const podNames = async (namespace: string, step: string): Promise<string[]> => {
        const result = await runner.run({
          step,
          args: ["--kubeconfig", kubeconfigPath!, "get", "pods", "--namespace", namespace, "-o", "json"],
        });
        expect(result.isOk()).toBe(true);
        return (
          JSON.parse(result._unsafeUnwrap().stdout) as {
            items: Array<{ metadata: { name: string } }>;
          }
        ).items.map((item) => item.metadata.name);
      };
      const stablePods = await podNames(stableNamespace!, "read-stable-canary-pods");
      const candidatePods = await podNames(
        candidateIntent.namespace,
        "read-candidate-canary-pods",
      );
      const observedMixedTraffic = clock.samples.some(
        (sample) =>
          sample.some((body) => stablePods.some((pod) => body.includes(pod))) &&
          sample.some((body) => candidatePods.some((pod) => body.includes(pod))),
      );
      if (!observedMixedTraffic) {
        const diagnostics = await Promise.all(
          [
            {
              step: "diagnose-canary-ingress-route",
              args: [
                "--kubeconfig",
                kubeconfigPath!,
                "get",
                "ingressroute,traefikservice,service,endpointslice",
                "--namespace",
                candidateIntent.namespace,
                "-o",
                "yaml",
              ],
            },
            {
              step: "diagnose-canary-traefik-log",
              args: [
                "--kubeconfig",
                kubeconfigPath!,
                "logs",
                "--namespace",
                "kube-system",
                "--selector",
                "app.kubernetes.io/name=traefik",
                "--tail=120",
              ],
            },
          ].map(async (input) => {
            const result = await runner.run(input);
            return result.isOk()
              ? { step: input.step, stdout: result.value.stdout, stderr: result.value.stderr }
              : { step: input.step, error: result.error.message };
          }),
        );
        throw new Error(
          `Weighted traffic was not observed: ${JSON.stringify({ stablePods, candidatePods, sampleCounts: clock.samples.map((sample) => ({ stable: sample.filter((body) => stablePods.some((pod) => body.includes(pod))).length, candidate: sample.filter((body) => candidatePods.some((pod) => body.includes(pod))).length })), diagnostics })}`,
        );
      }

      const promoted = await routedBodies(20);
      expect(promoted).toHaveLength(20);
      expect(
        promoted.every((body) => candidatePods.some((pod) => body.includes(pod))),
      ).toBe(true);
    } finally {
      if (candidateExecuted) {
        expect((await candidateBackend.cancel(context, candidate)).isOk()).toBe(true);
      }
      if (stableExecuted) {
        expect((await stableBackend.cancel(context, stable)).isOk()).toBe(true);
      }
      const residual = await runner.run({
        step: "verify-r5b-zero-owned-residual",
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
