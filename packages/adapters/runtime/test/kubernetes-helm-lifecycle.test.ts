import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  BuildStrategyKindValue,
  DeploymentTargetDescriptor,
  DeploymentTargetId,
  DetectSummary,
  DisplayNameText,
  ExecutionStrategyKindValue,
  GeneratedAt,
  PackagingModeValue,
  PlanStepText,
  ProviderKey,
  RuntimeArtifactIntentValue,
  RuntimeArtifactKindValue,
  RuntimeArtifactSnapshot,
  RuntimeExecutionPlan,
  RuntimePlan,
  RuntimePlanId,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
  TargetKindValue,
  ok,
  type Result,
} from "@appaloft/core";
import { createExecutionContext } from "@appaloft/application";

import {
  KubernetesHelmLifecycle,
  renderKubernetesHelmIntent,
  type HelmCommandRunner,
  type HelmCommandRunnerInput,
  type HelmCommandRunnerResult,
  type KubernetesHelmValuesResolver,
} from "../src/kubernetes-helm-lifecycle";

function helmRuntimePlan(): RuntimePlan {
  return RuntimePlan.rehydrate({
    id: RuntimePlanId.rehydrate("rtp_helm"),
    source: SourceDescriptor.rehydrate({
      kind: SourceKindValue.rehydrate("helm-chart"),
      locator: SourceLocator.rehydrate("oci://registry.example.com/charts/storefront"),
      displayName: DisplayNameText.rehydrate("storefront"),
    }),
    buildStrategy: BuildStrategyKindValue.rehydrate("helm-package"),
    packagingMode: PackagingModeValue.rehydrate("helm-chart"),
    execution: RuntimeExecutionPlan.rehydrate({
      kind: ExecutionStrategyKindValue.rehydrate("helm-release"),
      metadata: {
        "helm.chartReference": "oci://registry.example.com/charts/storefront",
        "helm.chartVersion": "1.7.3",
        "helm.valuesSecretReferences": '["secret://helm/storefront/production"]',
        "helm.hookPolicy": "disabled",
        "helm.timeoutSeconds": "300",
      },
    }),
    runtimeArtifact: RuntimeArtifactSnapshot.rehydrate({
      kind: RuntimeArtifactKindValue.rehydrate("helm-chart"),
      intent: RuntimeArtifactIntentValue.rehydrate("helm-chart"),
    }),
    target: DeploymentTargetDescriptor.rehydrate({
      kind: TargetKindValue.rehydrate("orchestrator-cluster"),
      providerKey: ProviderKey.rehydrate("kubernetes"),
      serverIds: [DeploymentTargetId.rehydrate("srv_cluster")],
    }),
    detectSummary: DetectSummary.rehydrate("Typed Helm chart"),
    steps: [PlanStepText.rehydrate("Apply Helm release")],
    generatedAt: GeneratedAt.rehydrate("2026-08-13T00:00:00.000Z"),
  });
}

const identity = {
  organizationId: "org_demo",
  projectId: "prj_demo",
  environmentId: "env_prod",
  resourceId: "res_storefront",
  deploymentId: "dep_helm_2",
  targetId: "srv_cluster",
};

class RecordingHelmRunner implements HelmCommandRunner {
  readonly calls: HelmCommandRunnerInput[] = [];

  constructor(private readonly failUpgrade = false) {}

  async run(input: HelmCommandRunnerInput): Promise<Result<HelmCommandRunnerResult>> {
    this.calls.push(input);
    switch (input.step) {
      case "read-helm-history":
        return ok({
          exitCode: 0,
          stdout: JSON.stringify([{ revision: 1, status: "deployed", chart: "storefront-1.7.2" }]),
          stderr: "",
        });
      case "render-helm-diff":
        return ok({
          exitCode: 0,
          stdout: "apiVersion: v1\nkind: Secret\nstringData:\n  password: super-secret\n---\nkind: Service\n",
          stderr: "",
        });
      case "read-current-helm-manifest":
      case "read-rolled-back-helm-manifest":
        return ok({ exitCode: 0, stdout: "kind: Service\nmetadata:\n  name: stable\n", stderr: "" });
      case "apply-helm-release":
        return ok({
          exitCode: this.failUpgrade ? 1 : 0,
          stdout: "",
          stderr: this.failUpgrade ? "upgrade failed" : "",
        });
      case "verify-helm-release":
        return ok({
          exitCode: 0,
          stdout: JSON.stringify({ info: { status: "deployed" }, version: this.failUpgrade ? 1 : 2 }),
          stderr: "",
        });
      case "uninstall-helm-release":
        return ok({ exitCode: 0, stdout: "", stderr: "" });
      default:
        throw new Error(`Unexpected step ${input.step}`);
    }
  }
}

class TestValuesResolver implements KubernetesHelmValuesResolver {
  disposed = false;

  async resolve() {
    return ok({
      filePaths: ["/private/tmp/appaloft-values.yaml"],
      dispose: async () => {
        this.disposed = true;
      },
    });
  }
}

describe("Kubernetes Helm lifecycle", () => {
  test("[K8S-HELM-013] derives a stable release scope and deployment receipt", () => {
    const first = renderKubernetesHelmIntent({ runtimePlan: helmRuntimePlan(), identity });
    const second = renderKubernetesHelmIntent({
      runtimePlan: helmRuntimePlan(),
      identity: { ...identity, deploymentId: "dep_helm_3" },
    });

    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
    expect(first._unsafeUnwrap().namespace).toBe(second._unsafeUnwrap().namespace);
    expect(first._unsafeUnwrap().releaseName).toBe(second._unsafeUnwrap().releaseName);
    expect(first._unsafeUnwrap().receipt).not.toBe(second._unsafeUnwrap().receipt);
  });

  test("[K8S-HELM-013] renders, applies, verifies, and disposes referenced values without evidence leakage", async () => {
    const runner = new RecordingHelmRunner();
    const values = new TestValuesResolver();
    const lifecycle = new KubernetesHelmLifecycle(runner, values);
    const intent = renderKubernetesHelmIntent({ runtimePlan: helmRuntimePlan(), identity })._unsafeUnwrap();
    const result = await lifecycle.deploy({
      context: createExecutionContext({ requestId: "req_helm", entrypoint: "system" }),
      targetId: identity.targetId,
      connection: { kubeconfigPath: "/private/tmp/kubeconfig", contextName: "k3d-appaloft" },
      intent,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      status: "succeeded",
      previousRevision: 1,
      currentRevision: 2,
    });
    expect(result._unsafeUnwrap().renderedDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("super-secret");
    expect(runner.calls.find((call) => call.step === "apply-helm-release")?.args).toContain(
      "/private/tmp/appaloft-values.yaml",
    );
    expect(runner.calls.flatMap((call) => call.args)).not.toContain("super-secret");
    expect(values.disposed).toBe(true);
  });

  test("[K8S-HELM-013] proves atomic rollback to the previous revision after upgrade failure", async () => {
    const lifecycle = new KubernetesHelmLifecycle(
      new RecordingHelmRunner(true),
      new TestValuesResolver(),
    );
    const intent = renderKubernetesHelmIntent({ runtimePlan: helmRuntimePlan(), identity })._unsafeUnwrap();
    const result = await lifecycle.deploy({
      context: createExecutionContext({ requestId: "req_helm_fail", entrypoint: "system" }),
      targetId: identity.targetId,
      connection: { kubeconfigPath: "/private/tmp/kubeconfig" },
      intent,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      status: "failed",
      previousRevision: 1,
      currentRevision: 1,
      rollbackVerified: true,
    });
  });

  test("[K8S-HELM-013] uninstalls the exact release with foreground cleanup", async () => {
    const runner = new RecordingHelmRunner();
    const lifecycle = new KubernetesHelmLifecycle(runner, new TestValuesResolver());
    const intent = renderKubernetesHelmIntent({ runtimePlan: helmRuntimePlan(), identity })._unsafeUnwrap();
    const result = await lifecycle.uninstall({
      context: createExecutionContext({ requestId: "req_helm_cleanup", entrypoint: "system" }),
      targetId: identity.targetId,
      connection: { kubeconfigPath: "/private/tmp/kubeconfig" },
      intent,
    });

    expect(result.isOk()).toBe(true);
    expect(runner.calls.at(-1)?.args).toEqual(
      expect.arrayContaining(["--cascade", "foreground", "--wait"]),
    );
  });
});
