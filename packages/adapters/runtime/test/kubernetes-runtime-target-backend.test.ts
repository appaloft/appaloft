import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
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
  domainError,
  err,
  ok,
  type Result,
} from "@appaloft/core";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import { MemoryServerRepository } from "@appaloft/testkit";

import {
  BuiltinKubernetesRoutingPolicyResolver,
  K3S_TRAEFIK_ROUTING_POLICY_REFERENCE,
  KubernetesRuntimeTargetBackend,
  type KubernetesCommandRunner,
  type KubernetesCommandRunnerInput,
  type KubernetesCommandRunnerResult,
  type KubernetesCanaryRouteProbe,
  type KubernetesConnectionResolver,
  type KubernetesRoutingPolicyResolver,
  type KubernetesRolloutClock,
} from "../src/kubernetes-runtime-target-backend";

class RecordingKubernetesCommandRunner implements KubernetesCommandRunner {
  readonly calls: KubernetesCommandRunnerInput[] = [];

  async run(input: KubernetesCommandRunnerInput): Promise<Result<KubernetesCommandRunnerResult>> {
    this.calls.push(input);
    switch (input.step) {
      case "read-server-version":
        return ok({
          exitCode: 0,
          stdout: JSON.stringify({ serverVersion: { gitVersion: "v1.31.2" } }),
          stderr: "",
        });
      case "check-workload-authorization":
      case "check-namespace-authorization":
        return ok({ exitCode: 0, stdout: "yes\n", stderr: "" });
      case "discover-namespaced-resources":
        return ok({
          exitCode: 0,
          stdout: [
            "deployments.apps",
            "services",
            "ingresses.networking.k8s.io",
            "middlewares.traefik.io",
            "persistentvolumeclaims",
          ].join("\n"),
          stderr: "",
        });
      case "verify-routing-controller-source":
        return ok({
          exitCode: 0,
          stdout: JSON.stringify({ items: [{ metadata: { name: "traefik-controller" } }] }),
          stderr: "",
        });
      default:
        throw new Error(`Unexpected step ${input.step}`);
    }
  }
}

function cluster(withRoutingPolicy = true) {
  const target = DeploymentTarget.register({
    id: DeploymentTargetId.rehydrate("srv_r5a_cluster"),
    name: DeploymentTargetName.rehydrate("R5a cluster"),
    host: HostAddress.rehydrate("kubernetes.invalid"),
    port: PortNumber.rehydrate(6443),
    providerKey: ProviderKey.rehydrate("kubernetes"),
    targetKind: TargetKindValue.rehydrate("orchestrator-cluster"),
    createdAt: CreatedAt.rehydrate("2026-08-13T00:00:00.000Z"),
  })._unsafeUnwrap();
  target
    .configureRuntimeTargetProfile({
      profile: RuntimeTargetProfile.create({
        connectionReference: "connection://cluster/r5a",
        credentialReference: "secret://cluster/r5a",
        ...(withRoutingPolicy
          ? { routingPolicyReference: K3S_TRAEFIK_ROUTING_POLICY_REFERENCE }
          : {}),
      })._unsafeUnwrap(),
      configuredAt: UpdatedAt.rehydrate("2026-08-13T00:01:00.000Z"),
    })
    ._unsafeUnwrap();
  return target;
}

function clusterState() {
  return cluster().toState();
}

const generatedAt = GeneratedAt.rehydrate("2026-08-13T00:00:00.000Z");

function kubernetesRuntimePlan(): RuntimePlan {
  const port = PortNumber.rehydrate(3000);
  const image = ImageReference.rehydrate("registry.example.com/team/app:sha");
  return RuntimePlan.rehydrate({
    id: RuntimePlanId.rehydrate("rtp_kubernetes_backend"),
    source: SourceDescriptor.rehydrate({
      kind: SourceKindValue.rehydrate("remote-git"),
      locator: SourceLocator.rehydrate("https://github.com/acme/app.git"),
      displayName: DisplayNameText.rehydrate("Acme App"),
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
          domains: [PublicDomainName.rehydrate("app.example.test")],
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
      serverIds: [DeploymentTargetId.rehydrate("srv_r5a_cluster")],
    }),
    detectSummary: DetectSummary.rehydrate("Prebuilt image"),
    steps: [PlanStepText.rehydrate("Deploy Kubernetes candidate")],
    generatedAt,
  });
}

function scaledKubernetesRuntimePlan(): RuntimePlan {
  const state = kubernetesRuntimePlan().toState();
  return RuntimePlan.rehydrate({
    ...state,
    execution: RuntimeExecutionPlan.rehydrate({
      ...state.execution.toState(),
      metadata: {
        "appaloft.scale.replicas": "3",
        "appaloft.scale.cpuRequestMillicores": "250",
        "appaloft.scale.hpa.minReplicas": "2",
        "appaloft.scale.hpa.maxReplicas": "8",
        "appaloft.scale.hpa.targetCpuUtilizationPercent": "70",
      },
    }),
  });
}

function canaryKubernetesRuntimePlan(): RuntimePlan {
  const state = kubernetesRuntimePlan().toState();
  return RuntimePlan.rehydrate({
    ...state,
    execution: RuntimeExecutionPlan.rehydrate({
      ...state.execution.toState(),
      healthCheck: {
        enabled: true,
        type: HealthCheckTypeValue.rehydrate("http"),
        intervalSeconds: HealthCheckIntervalSeconds.rehydrate(5),
        timeoutSeconds: HealthCheckTimeoutSeconds.rehydrate(5),
        retries: HealthCheckRetryCount.rehydrate(3),
        startPeriodSeconds: HealthCheckStartPeriodSeconds.rehydrate(0),
        http: {
          method: HealthCheckHttpMethodValue.rehydrate("GET"),
          scheme: HealthCheckSchemeValue.rehydrate("http"),
          host: HealthCheckHostText.rehydrate("127.0.0.1"),
          port: PortNumber.rehydrate(3000),
          path: HealthCheckPathText.rehydrate("/healthz"),
          expectedStatusCode: HealthCheckExpectedStatusCode.rehydrate(200),
        },
      },
      metadata: {
        "appaloft.rollout.strategy": "canary",
        "appaloft.rollout.canary.initialTrafficPercent": "10",
        "appaloft.rollout.canary.stepTrafficPercent": "30",
        "appaloft.rollout.canary.intervalSeconds": "60",
      },
    }),
  });
}

function runningDeployment(
  runtimePlan = kubernetesRuntimePlan(),
  supersedesDeploymentId?: string,
): Deployment {
  const deployment = Deployment.create({
    id: DeploymentId.rehydrate("dep_kubernetes_candidate"),
    projectId: ProjectId.rehydrate("prj_shop"),
    environmentId: EnvironmentId.rehydrate("env_prod"),
    resourceId: ResourceId.rehydrate("res_api"),
    serverId: DeploymentTargetId.rehydrate("srv_r5a_cluster"),
    destinationId: DestinationId.rehydrate("dst_prod"),
    runtimePlan,
    ...(supersedesDeploymentId
      ? { supersedesDeploymentId: DeploymentId.rehydrate(supersedesDeploymentId) }
      : {}),
    environmentSnapshot: EnvironmentConfigSnapshot.rehydrate({
      id: EnvironmentSnapshotId.rehydrate("envsnap_kubernetes_backend"),
      environmentId: EnvironmentId.rehydrate("env_prod"),
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

async function executionHarness(
  runner: KubernetesCommandRunner,
  target = cluster(),
  routingPolicyResolver?: KubernetesRoutingPolicyResolver,
  rolloutClock?: KubernetesRolloutClock,
  canaryRouteProbe: KubernetesCanaryRouteProbe = {
    prove: async () => ok(undefined),
  },
) {
  const context = createExecutionContext({
    requestId: "req_r5a_execute",
    entrypoint: "system",
    tenant: { tenantId: "org_acme", organizationId: "org_acme" },
  });
  const repository = new MemoryServerRepository();
  await repository.upsert(toRepositoryContext(context), target, UpsertServerSpec.fromServer(target));
  const backend = new KubernetesRuntimeTargetBackend(
    runner,
    {
      resolve: async () =>
        ok({ kubeconfigPath: "/private/tmp/r5a.kubeconfig", contextName: "r5a" }),
    },
    repository,
    undefined,
    undefined,
    routingPolicyResolver,
    rolloutClock,
    canaryRouteProbe,
  );
  return { backend, context };
}

class SuccessfulExecutionRunner implements KubernetesCommandRunner {
  readonly calls: KubernetesCommandRunnerInput[] = [];
  namespace = "";
  receipt = "";

  async run(input: KubernetesCommandRunnerInput): Promise<Result<KubernetesCommandRunnerResult>> {
    this.calls.push(input);
    if (input.step === "apply-candidate-manifest") {
      const manifest = JSON.parse(input.stdin ?? "{}") as {
        items: Array<{ kind: string; metadata: { name: string; labels: Record<string, string> } }>;
      };
      const namespace = manifest.items.find((item) => item.kind === "Namespace");
      this.namespace = namespace?.metadata.name ?? "";
      this.receipt = namespace?.metadata.labels["appaloft.io/receipt"] ?? "";
      return ok({ exitCode: 0, stdout: "applied", stderr: "" });
    }
    if (input.step === "observe-candidate-deployment") {
      return ok({
        exitCode: 0,
        stdout: JSON.stringify({
          metadata: { generation: 1 },
          spec: { replicas: 1 },
          status: { availableReplicas: 1, observedGeneration: 1 },
        }),
        stderr: "",
      });
    }
    if (input.step === "verify-candidate-namespace-ownership") {
      return ok({
        exitCode: 0,
        stdout: JSON.stringify({
          metadata: {
            labels: {
              "appaloft.io/managed-by": "appaloft",
              "appaloft.io/receipt": this.receipt,
            },
          },
        }),
        stderr: "",
      });
    }
    return ok({ exitCode: 0, stdout: "ok", stderr: "" });
  }
}

class CanaryExecutionRunner extends SuccessfulExecutionRunner {
  readonly trafficWeights: number[] = [];
  private weightedServices: Array<{ name: string; weight: number }> = [];

  constructor(private readonly failProofAt?: number) {
    super();
  }

  override async run(
    input: KubernetesCommandRunnerInput,
  ): Promise<Result<KubernetesCommandRunnerResult>> {
    if (input.step === "check-canary-routing-api") {
      this.calls.push(input);
      return ok({
        exitCode: 0,
        stdout: [
          "ingressroutes.traefik.io",
          "traefikservices.traefik.io",
          "middlewares.traefik.io",
        ].join("\n"),
        stderr: "",
      });
    }
    if (input.step === "check-canary-endpointslice-api") {
      this.calls.push(input);
      return ok({
        exitCode: 0,
        stdout: "endpointslices.discovery.k8s.io\n",
        stderr: "",
      });
    }
    if (input.step === "check-canary-proof-authorization") {
      this.calls.push(input);
      return ok({ exitCode: 0, stdout: "yes\n", stderr: "" });
    }
    if (
      input.step === "verify-stable-endpoints" ||
      input.step.startsWith("refresh-stable-endpoints:")
    ) {
      this.calls.push(input);
      return ok({
        exitCode: 0,
        stdout: JSON.stringify({
          subsets: [{ addresses: [{ ip: "10.42.0.10" }], ports: [{ port: 3000 }] }],
        }),
        stderr: "",
      });
    }
    if (input.step.startsWith("apply-canary-traffic:")) {
      this.calls.push(input);
      const manifest = JSON.parse(input.stdin ?? "{}") as {
        items?: Array<{
          kind?: string;
          spec?: { weighted?: { services?: Array<{ name?: string; weight?: number }> } };
        }>;
      };
      const weighted = manifest.items?.find((item) => item.kind === "TraefikService");
      this.weightedServices = (weighted?.spec?.weighted?.services ?? []).flatMap((service) =>
        typeof service.name === "string" && typeof service.weight === "number"
          ? [{ name: service.name, weight: service.weight }]
          : [],
      );
      const candidate = this.weightedServices.at(-1);
      this.trafficWeights.push(candidate?.weight ?? 0);
      return ok({ exitCode: 0, stdout: "applied", stderr: "" });
    }
    if (input.step === "prove-canary-candidate" || input.step.startsWith("prove-canary-traffic:")) {
      this.calls.push(input);
      const traffic = input.step.startsWith("prove-canary-traffic:")
        ? Number(input.step.split(":").at(-1))
        : undefined;
      const fails = this.failProofAt !== undefined && traffic === this.failProofAt;
      return ok({
        exitCode: fails ? 1 : 0,
        stdout: fails
          ? ""
          : input.step === "prove-canary-candidate"
            ? JSON.stringify({
                subsets: [{ addresses: [{ ip: "10.42.0.11" }], ports: [{ port: 3000 }] }],
              })
            : JSON.stringify({ spec: { weighted: { services: this.weightedServices } } }),
        stderr: fails ? "proof failed" : "",
      });
    }
    return await super.run(input);
  }
}

describe("KubernetesRuntimeTargetBackend readiness", () => {
  test("[K8S-ISO-006] built-in routing policy resolver accepts only the exact k3s Traefik reference", async () => {
    const resolver = new BuiltinKubernetesRoutingPolicyResolver();

    expect(
      (
        await resolver.resolve({
          routingPolicyReference: K3S_TRAEFIK_ROUTING_POLICY_REFERENCE,
        })
      )._unsafeUnwrap(),
    ).toEqual({
      schemaVersion: "kubernetes.routing-policy/v1",
      ingressControllerSources: [
        {
          namespace: "kube-system",
          podSelector: { "app.kubernetes.io/name": "traefik" },
        },
      ],
    });
    const unknown = await resolver.resolve({
      routingPolicyReference: "builtin://kubernetes/ingress-controller/any",
    });
    expect(unknown.isErr()).toBe(true);
    expect(unknown._unsafeUnwrapErr().details).toMatchObject({
      phase: "kubernetes-routing-policy-resolution",
      reason: "routing-policy-reference-unsupported",
    });
  });

  test("[K8S-READY-002] probes the cluster with read-only argv and normalizes six checks", async () => {
    const runner = new RecordingKubernetesCommandRunner();
    const resolver: KubernetesConnectionResolver = {
      resolve: async (input) => {
        expect(input).toMatchObject({
          context: expect.objectContaining({ requestId: "req_r5a_ready" }),
          connectionReference: "connection://cluster/r5a",
          credentialReference: "secret://cluster/r5a",
        });
        return ok({ kubeconfigPath: "/private/tmp/r5a.kubeconfig", contextName: "r5a" });
      },
    };
    const backend = new KubernetesRuntimeTargetBackend(runner, resolver);

    expect(backend.descriptor.capabilities).toEqual([
      "runtime.readiness",
      "runtime.apply",
      "runtime.verify",
      "runtime.cleanup",
      "runtime.logs",
      "runtime.health",
      "runtime.scale",
      "runtime.autoscale",
      "runtime.rollout",
      "proxy.route",
    ]);

    const result = await backend.inspectReadiness(
      createExecutionContext({ requestId: "req_r5a_ready", entrypoint: "system" }),
      clusterState(),
    );

    expect(result._unsafeUnwrap()).toEqual({
      checks: [
        {
          capability: "api-reachability",
          status: "ready",
        },
        {
          capability: "version",
          status: "ready",
          message: "Kubernetes v1.31.2",
        },
        {
          capability: "authorization",
          status: "ready",
        },
        {
          capability: "namespace-isolation",
          status: "ready",
        },
        {
          capability: "routing",
          status: "ready",
          message:
            "Ingress API, Traefik identity middleware, and exact controller source are available",
        },
        {
          capability: "storage",
          status: "ready",
          message: "PersistentVolumeClaim API is available",
        },
      ],
    });
    expect(runner.calls).toHaveLength(5);
    expect(runner.calls.map((call) => call.args)).toEqual([
      ["--kubeconfig", "/private/tmp/r5a.kubeconfig", "--context", "r5a", "version", "-o", "json"],
      [
        "--kubeconfig",
        "/private/tmp/r5a.kubeconfig",
        "--context",
        "r5a",
        "auth",
        "can-i",
        "create",
        "deployments.apps",
        "--all-namespaces",
      ],
      [
        "--kubeconfig",
        "/private/tmp/r5a.kubeconfig",
        "--context",
        "r5a",
        "auth",
        "can-i",
        "create",
        "namespaces",
      ],
      [
        "--kubeconfig",
        "/private/tmp/r5a.kubeconfig",
        "--context",
        "r5a",
        "api-resources",
        "--verbs=create",
        "--namespaced=true",
        "-o",
        "name",
      ],
      [
        "--kubeconfig",
        "/private/tmp/r5a.kubeconfig",
        "--context",
        "r5a",
        "get",
        "pods",
        "--namespace",
        "kube-system",
        "--selector",
        "app.kubernetes.io/name=traefik",
        "-o",
        "json",
      ],
    ]);
    expect(runner.calls.every((call) => call.stdin === undefined)).toBe(true);
  });

  test("[K8S-READY-002] returns stable blockers and stops after API reachability fails", async () => {
    const runner: KubernetesCommandRunner = {
      run: async () => ok({ exitCode: 1, stdout: "", stderr: "connection refused" }),
    };
    const backend = new KubernetesRuntimeTargetBackend(runner, {
      resolve: async () => ok({ kubeconfigPath: "/private/tmp/r5a.kubeconfig" }),
    });

    const result = await backend.inspectReadiness(
      createExecutionContext({ requestId: "req_r5a_blocked", entrypoint: "system" }),
      clusterState(),
    );

    expect(result._unsafeUnwrap()).toEqual({
      checks: [
        {
          capability: "api-reachability",
          status: "blocked",
          reasonCode: "kubernetes-api-unreachable",
          message: "Kubernetes API is unreachable",
        },
        {
          capability: "version",
          status: "blocked",
          reasonCode: "kubernetes-api-unreachable",
        },
        {
          capability: "authorization",
          status: "blocked",
          reasonCode: "kubernetes-api-unreachable",
        },
        {
          capability: "namespace-isolation",
          status: "blocked",
          reasonCode: "kubernetes-api-unreachable",
        },
        {
          capability: "routing",
          status: "blocked",
          reasonCode: "kubernetes-api-unreachable",
        },
        {
          capability: "storage",
          status: "blocked",
          reasonCode: "kubernetes-api-unreachable",
        },
      ],
    });
  });

  test("[K8S-READY-002][K8S-ISO-006] blocks routing when its policy reference is absent", async () => {
    const target = cluster(false);
    const result = await new KubernetesRuntimeTargetBackend(
      new RecordingKubernetesCommandRunner(),
      {
        resolve: async () => ok({ kubeconfigPath: "/private/tmp/r5a.kubeconfig" }),
      },
    ).inspectReadiness(
      createExecutionContext({ requestId: "req_r5a_policy_missing", entrypoint: "system" }),
      target.toState(),
    );

    expect(result._unsafeUnwrap().checks).toContainEqual({
      capability: "routing",
      status: "blocked",
      reasonCode: "kubernetes-routing-policy-reference-missing",
    });
  });

  test("[K8S-READY-002][K8S-ISO-006] rejects an injected policy with an empty pod selector", async () => {
    const result = await new KubernetesRuntimeTargetBackend(
      new RecordingKubernetesCommandRunner(),
      {
        resolve: async () => ok({ kubeconfigPath: "/private/tmp/r5a.kubeconfig" }),
      },
      undefined,
      undefined,
      undefined,
      {
        resolve: async () =>
          ok({
            schemaVersion: "kubernetes.routing-policy/v1" as const,
            ingressControllerSources: [{ namespace: "kube-system", podSelector: {} }],
          }),
      },
    ).inspectReadiness(
      createExecutionContext({ requestId: "req_r5a_policy_invalid", entrypoint: "system" }),
      clusterState(),
    );

    expect(result._unsafeUnwrap().checks).toContainEqual({
      capability: "routing",
      status: "blocked",
      reasonCode: "kubernetes-routing-policy-reference-unresolved",
    });
  });
});

describe("KubernetesRuntimeTargetBackend execution", () => {
  test("[SCALE-PROFILE-009] rejects HPA before mutation when metrics capability is unavailable", async () => {
    const runner = new SuccessfulExecutionRunner();
    const { backend, context } = await executionHarness(runner);

    const result = await backend.execute(
      context,
      runningDeployment(scaledKubernetesRuntimePlan()),
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().details).toMatchObject({
      phase: "kubernetes-autoscale-capability",
      missingCapability: "horizontal-autoscaling-metrics",
    });
    expect(runner.calls.map((call) => call.step)).toEqual([
      "check-autoscale-api",
      "check-metrics-api",
    ]);
    expect(runner.calls.every((call) => call.step !== "apply-candidate-manifest")).toBe(true);
  });

  test("[SCALE-CONVERGE-010] normalizes desired/current/ready replicas after convergence", async () => {
    class ScaleRunner extends SuccessfulExecutionRunner {
      override async run(
        input: KubernetesCommandRunnerInput,
      ): Promise<Result<KubernetesCommandRunnerResult>> {
        if (input.step === "check-autoscale-api") {
          this.calls.push(input);
          return ok({
            exitCode: 0,
            stdout: "horizontalpodautoscalers.autoscaling\n",
            stderr: "",
          });
        }
        if (input.step === "check-metrics-api") {
          this.calls.push(input);
          return ok({ exitCode: 0, stdout: '{"kind":"APIResourceList"}', stderr: "" });
        }
        if (input.step === "observe-candidate-deployment") {
          this.calls.push(input);
          return ok({
            exitCode: 0,
            stdout: JSON.stringify({
              metadata: { generation: 2 },
              spec: { replicas: 3 },
              status: { replicas: 3, readyReplicas: 3, availableReplicas: 3, observedGeneration: 2 },
            }),
            stderr: "",
          });
        }
        if (input.step === "observe-candidate-autoscaler") {
          this.calls.push(input);
          return ok({
            exitCode: 0,
            stdout: JSON.stringify({
              status: {
                currentMetrics: [
                  { resource: { name: "cpu", current: { averageUtilization: 72 } } },
                ],
              },
            }),
            stderr: "",
          });
        }
        return await super.run(input);
      }
    }
    const runner = new ScaleRunner();
    const { backend, context } = await executionHarness(runner);

    const result = await backend.execute(
      context,
      runningDeployment(scaledKubernetesRuntimePlan()),
    );

    expect(result._unsafeUnwrap().deployment.toState().runtimePlan.execution.metadata).toMatchObject({
      "runtime.scale.desiredReplicas": "3",
      "runtime.scale.currentReplicas": "3",
      "runtime.scale.readyReplicas": "3",
      "runtime.scale.metricDecision": "above-target",
    });
  });

  test("[ROLLOUT-PROFILE-011] proves and promotes canary traffic in bounded steps", async () => {
    const runner = new CanaryExecutionRunner();
    const waits: number[] = [];
    const { backend, context } = await executionHarness(runner, cluster(), undefined, {
      wait: async (milliseconds) => {
        waits.push(milliseconds);
      },
    });

    const result = await backend.execute(
      context,
      runningDeployment(canaryKubernetesRuntimePlan(), "dep_kubernetes_stable"),
    );

    const state = result._unsafeUnwrap().deployment.toState();
    expect(state.status.value).toBe("succeeded");
    expect(runner.trafficWeights).toEqual([10, 40, 70, 100]);
    expect(waits).toEqual([60_000, 60_000, 60_000]);
    expect(state.runtimePlan.execution.metadata).toMatchObject({
      "runtime.rollout.strategy": "canary",
      "runtime.rollout.candidateTrafficPercent": "100",
      "runtime.rollout.promotionProof": "passed",
    });
    expect(runner.calls.map((call) => call.step)).toEqual([
      "check-canary-routing-api",
      "check-canary-endpointslice-api",
      "check-canary-proof-authorization",
      "verify-stable-endpoints",
      "apply-candidate-manifest",
      "wait-candidate-rollout",
      "observe-candidate-deployment",
      "prove-canary-candidate",
      "refresh-stable-endpoints:10",
      "apply-canary-traffic:10",
      "prove-canary-traffic:10",
      "refresh-stable-endpoints:40",
      "apply-canary-traffic:40",
      "prove-canary-traffic:40",
      "refresh-stable-endpoints:70",
      "apply-canary-traffic:70",
      "prove-canary-traffic:70",
      "refresh-stable-endpoints:100",
      "apply-canary-traffic:100",
      "prove-canary-traffic:100",
    ]);
  });

  test("[ROLLOUT-PROFILE-011] rejects missing canary capabilities before candidate mutation", async () => {
    const runner = new SuccessfulExecutionRunner();
    const { backend, context } = await executionHarness(runner);

    const result = await backend.execute(
      context,
      runningDeployment(canaryKubernetesRuntimePlan(), "dep_kubernetes_stable"),
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().details).toMatchObject({
      phase: "kubernetes-canary-capability",
      missingCapability: "traefik-weighted-routing-or-endpoint-readback",
    });
    expect(runner.calls.every((call) => call.step !== "apply-candidate-manifest")).toBe(true);
  });

  test("[K8S-ROLLBACK-007][ROLLOUT-PROFILE-011] failed canary proof removes only candidate", async () => {
    const runner = new CanaryExecutionRunner(40);
    const { backend, context } = await executionHarness(runner, cluster(), undefined, {
      wait: async () => {},
    });

    const result = await backend.execute(
      context,
      runningDeployment(canaryKubernetesRuntimePlan(), "dep_kubernetes_stable"),
    );

    const state = result._unsafeUnwrap().deployment.toState();
    expect(state.status.value).toBe("failed");
    expect(runner.trafficWeights).toEqual([10, 40]);
    expect(runner.calls.map((call) => call.step)).toContain("delete-candidate-namespace");
    expect(
      runner.calls.some(
        (call) =>
          call.step === "delete-candidate-namespace" &&
          call.args.includes("dep_kubernetes_stable"),
      ),
    ).toBe(false);
  });

  test("[K8S-ROLLBACK-007][ROLLOUT-PROFILE-011] failed external route proof removes only candidate", async () => {
    const runner = new CanaryExecutionRunner();
    const { backend, context } = await executionHarness(
      runner,
      cluster(),
      undefined,
      { wait: async () => {} },
      {
        prove: async () =>
          err(
            domainError.runtimeTargetUnsupported("Candidate route did not converge", {
              phase: "kubernetes-canary-route-proof",
            }),
          ),
      },
    );

    const result = await backend.execute(
      context,
      runningDeployment(canaryKubernetesRuntimePlan(), "dep_kubernetes_stable"),
    );

    expect(result._unsafeUnwrap().deployment.toState().status.value).toBe("failed");
    expect(runner.trafficWeights).toEqual([10]);
    expect(runner.calls.map((call) => call.step)).toContain("delete-candidate-namespace");
    expect(
      runner.calls.some(
        (call) =>
          call.step === "delete-candidate-namespace" &&
          call.args.includes("dep_kubernetes_stable"),
      ),
    ).toBe(false);
  });

  test("[K8S-ISO-006] refuses a routed apply before kubectl when policy reference is absent", async () => {
    const runner = new SuccessfulExecutionRunner();
    const { backend, context } = await executionHarness(runner, cluster(false));

    const result = await backend.execute(context, runningDeployment());

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().details).toMatchObject({
      phase: "kubernetes-routing-policy-resolution",
      reason: "routing-policy-reference-required",
    });
    expect(runner.calls).toEqual([]);
  });

  test("[K8S-OCI-004][K8S-OBS-005][K8S-CLEAN-008] applies, observes, receipts, and exactly cleans a candidate", async () => {
    const runner = new SuccessfulExecutionRunner();
    const { backend, context } = await executionHarness(runner);
    const deployment = runningDeployment();

    const executed = await backend.execute(context, deployment);

    expect(executed.isOk()).toBe(true);
    const state = executed._unsafeUnwrap().deployment.toState();
    expect(state.status.value).toBe("succeeded");
    expect(runner.calls.map((call) => call.step)).toEqual([
      "apply-candidate-manifest",
      "wait-candidate-rollout",
      "observe-candidate-deployment",
    ]);
    expect(runner.calls[0]?.stdin).toContain('"kind":"Namespace"');
    expect(runner.calls[0]?.args).toEqual([
      "--kubeconfig",
      "/private/tmp/r5a.kubeconfig",
      "--context",
      "r5a",
      "apply",
      "--server-side=true",
      "--field-manager=appaloft",
      "-f",
      "-",
    ]);
    expect(state.runtimePlan.execution.metadata).toMatchObject({
      "kubernetes.namespace": runner.namespace,
      "kubernetes.receipt": runner.receipt,
      "kubernetes.intentSchemaVersion": "kubernetes.runtime-intent/v1",
    });

    const cleaned = await backend.cancel(context, deployment);

    expect(cleaned.isOk()).toBe(true);
    expect(runner.calls.slice(3).map((call) => call.step)).toEqual([
      "verify-candidate-namespace-ownership",
      "delete-candidate-namespace",
    ]);
    expect(runner.calls.at(-1)?.args).toEqual([
      "--kubeconfig",
      "/private/tmp/r5a.kubeconfig",
      "--context",
      "r5a",
      "delete",
      "namespace",
      runner.namespace,
      "--ignore-not-found=true",
      "--wait=true",
    ]);
  });

  test("[K8S-ROLLBACK-007] failed rollout deletes only the candidate receipt namespace", async () => {
    class FailedRolloutRunner extends SuccessfulExecutionRunner {
      override async run(
        input: KubernetesCommandRunnerInput,
      ): Promise<Result<KubernetesCommandRunnerResult>> {
        if (input.step === "wait-candidate-rollout") {
          this.calls.push(input);
          return ok({ exitCode: 1, stdout: "", stderr: "rollout failed" });
        }
        return await super.run(input);
      }
    }
    const runner = new FailedRolloutRunner();
    const { backend, context } = await executionHarness(runner);

    const result = await backend.execute(context, runningDeployment());

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().deployment.toState().status.value).toBe("failed");
    expect(runner.calls.map((call) => call.step)).toEqual([
      "apply-candidate-manifest",
      "wait-candidate-rollout",
      "verify-candidate-namespace-ownership",
      "delete-candidate-namespace",
    ]);
    expect(runner.calls.at(-1)?.args).toContain(runner.namespace);
  });

  test("[K8S-CLEAN-008] refuses deletion when the namespace receipt does not match", async () => {
    const runner: KubernetesCommandRunner & { calls: KubernetesCommandRunnerInput[] } = {
      calls: [],
      async run(input) {
        this.calls.push(input);
        return ok({
          exitCode: 0,
          stdout: JSON.stringify({
            metadata: {
              labels: {
                "appaloft.io/managed-by": "appaloft",
                "appaloft.io/receipt": "another-deployment",
              },
            },
          }),
          stderr: "",
        });
      },
    };
    const { backend, context } = await executionHarness(runner);

    const result = await backend.cancel(context, runningDeployment());

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().details).toMatchObject({
      phase: "kubernetes-cleanup-ownership",
    });
    expect(runner.calls.map((call) => call.step)).toEqual([
      "verify-candidate-namespace-ownership",
    ]);
  });
});
