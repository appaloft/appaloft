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
  type KubernetesConnectionResolver,
  type KubernetesRoutingPolicyResolver,
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

function runningDeployment(): Deployment {
  const deployment = Deployment.create({
    id: DeploymentId.rehydrate("dep_kubernetes_candidate"),
    projectId: ProjectId.rehydrate("prj_shop"),
    environmentId: EnvironmentId.rehydrate("env_prod"),
    resourceId: ResourceId.rehydrate("res_api"),
    serverId: DeploymentTargetId.rehydrate("srv_r5a_cluster"),
    destinationId: DestinationId.rehydrate("dst_prod"),
    runtimePlan: kubernetesRuntimePlan(),
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
