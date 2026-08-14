import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import {
  BuildStrategyKindValue,
  CommandText,
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
  ResourceId,
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
  UpdatedAt,
  UpsertServerSpec,
} from "@appaloft/core";
import { MemoryServerRepository } from "@appaloft/testkit";

import {
  FileKubernetesConnectionResolver,
  KubernetesRuntimeTargetBackend,
  KubernetesShellCommandRunner,
  KubernetesStorageBackupExecutor,
  kubernetesStorageClaimName,
} from "../src";

const kubeconfigPath = process.env.APPALOFT_KUBERNETES_SMOKE_KUBECONFIG?.trim();
const existingClusterTest = kubeconfigPath ? test : test.skip;
const generatedAt = GeneratedAt.rehydrate("2026-08-13T00:00:00.000Z");
const serverId = "srv_kubernetes_r5c_smoke";
const resourceId = "res_kubernetes_r5c_stateful";
const storageVolumeId = "stv_kubernetes_r5c_data";
const restoredStorageVolumeId = "stv_kubernetes_r5c_restored";
const chartDirectory = resolve(
  import.meta.dir,
  "fixtures/r5c-helm-chart",
);

function target(): DeploymentTarget {
  const cluster = DeploymentTarget.register({
    id: DeploymentTargetId.rehydrate(serverId),
    name: DeploymentTargetName.rehydrate("R5c disposable cluster"),
    host: HostAddress.rehydrate("kubernetes.invalid"),
    port: PortNumber.rehydrate(6443),
    providerKey: ProviderKey.rehydrate("kubernetes"),
    targetKind: TargetKindValue.rehydrate("orchestrator-cluster"),
    createdAt: CreatedAt.rehydrate("2026-08-13T00:00:00.000Z"),
  })._unsafeUnwrap();
  cluster
    .configureRuntimeTargetProfile({
      profile: RuntimeTargetProfile.create({
        connectionReference: pathToFileURL(kubeconfigPath!).toString(),
      })._unsafeUnwrap(),
      configuredAt: UpdatedAt.rehydrate("2026-08-13T00:01:00.000Z"),
    })
    ._unsafeUnwrap();
  return cluster;
}

function statefulPlan(id: string): RuntimePlan {
  const image = ImageReference.rehydrate("busybox:1.36.1");
  return RuntimePlan.rehydrate({
    id: RuntimePlanId.rehydrate(`rtp_${id}`),
    source: SourceDescriptor.rehydrate({
      kind: SourceKindValue.rehydrate("docker-image"),
      locator: SourceLocator.rehydrate("busybox:1.36.1"),
      displayName: DisplayNameText.rehydrate("R5c stateful smoke"),
    }),
    buildStrategy: BuildStrategyKindValue.rehydrate("prebuilt-image"),
    packagingMode: PackagingModeValue.rehydrate("all-in-one-docker"),
    execution: RuntimeExecutionPlan.rehydrate({
      kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
      image,
      port: PortNumber.rehydrate(8080),
      startCommand: CommandText.rehydrate(
        "test -f /var/lib/app/data/value || echo durable-v1 > /var/lib/app/data/value; sleep 3600",
      ),
      metadata: {
        "appaloft.rollout.strategy": "recreate",
        "storage.mounts": JSON.stringify([
          {
            attachmentId: "rsa_r5c_data",
            storageVolumeId,
            storageVolumeKind: "named-volume",
            destinationPath: "/var/lib/app/data",
            mountMode: "read-write",
          },
        ]),
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
    detectSummary: DetectSummary.rehydrate("Stateful OCI image"),
    steps: [PlanStepText.rehydrate("Deploy a stateful Kubernetes workload")],
    generatedAt,
  });
}

function helmPlan(id: string, valuesFile: string): RuntimePlan {
  const chartReference = pathToFileURL(chartDirectory).toString();
  return RuntimePlan.rehydrate({
    id: RuntimePlanId.rehydrate(`rtp_${id}`),
    source: SourceDescriptor.rehydrate({
      kind: SourceKindValue.rehydrate("helm-chart"),
      locator: SourceLocator.rehydrate(chartReference),
      displayName: DisplayNameText.rehydrate("R5c Helm smoke"),
    }),
    buildStrategy: BuildStrategyKindValue.rehydrate("helm-package"),
    packagingMode: PackagingModeValue.rehydrate("helm-chart"),
    execution: RuntimeExecutionPlan.rehydrate({
      kind: ExecutionStrategyKindValue.rehydrate("helm-release"),
      metadata: {
        "helm.chartReference": chartReference,
        "helm.chartVersion": "0.1.0",
        "helm.valuesSecretReferences": JSON.stringify([
          pathToFileURL(resolve(chartDirectory, valuesFile)).toString(),
        ]),
        "helm.hookPolicy": "disabled",
        "helm.timeoutSeconds": "30",
      },
    }),
    runtimeArtifact: RuntimeArtifactSnapshot.rehydrate({
      kind: RuntimeArtifactKindValue.rehydrate("helm-chart"),
      intent: RuntimeArtifactIntentValue.rehydrate("helm-chart"),
    }),
    target: DeploymentTargetDescriptor.rehydrate({
      kind: TargetKindValue.rehydrate("orchestrator-cluster"),
      providerKey: ProviderKey.rehydrate("kubernetes"),
      serverIds: [DeploymentTargetId.rehydrate(serverId)],
    }),
    detectSummary: DetectSummary.rehydrate("Typed Helm chart"),
    steps: [PlanStepText.rehydrate("Apply a Helm release")],
    generatedAt,
  });
}

function runningDeployment(input: {
  id: string;
  resourceId: string;
  plan: RuntimePlan;
}): Deployment {
  const deployment = Deployment.create({
    id: DeploymentId.rehydrate(input.id),
    projectId: ProjectId.rehydrate("prj_kubernetes_r5c_smoke"),
    environmentId: EnvironmentId.rehydrate("env_kubernetes_r5c_smoke"),
    resourceId: ResourceId.rehydrate(input.resourceId),
    serverId: DeploymentTargetId.rehydrate(serverId),
    destinationId: DestinationId.rehydrate("dst_kubernetes_r5c_smoke"),
    runtimePlan: input.plan,
    environmentSnapshot: EnvironmentConfigSnapshot.rehydrate({
      id: EnvironmentSnapshotId.rehydrate(`envsnap_${input.id}`),
      environmentId: EnvironmentId.rehydrate("env_kubernetes_r5c_smoke"),
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

function expectDeploymentStatus(
  deployment: Deployment,
  expected: "succeeded" | "failed",
): void {
  const state = deployment.toState();
  expect(
    state.status.value,
    JSON.stringify(state.timeline.map((entry) => entry.toState())),
  ).toBe(expected);
}

existingClusterTest(
  "[K8S-E2E-019] preserves state, proves backup/restore, and verifies Helm atomic rollback on a real cluster",
  async () => {
    const context = createExecutionContext({
      requestId: "req_kubernetes_r5c_smoke",
      entrypoint: "system",
      tenant: {
        tenantId: "org_kubernetes_r5c_smoke",
        organizationId: "org_kubernetes_r5c_smoke",
      },
    });
    const repository = new MemoryServerRepository();
    const cluster = target();
    await repository.upsert(
      toRepositoryContext(context),
      cluster,
      UpsertServerSpec.fromServer(cluster),
    );
    const runner = new KubernetesShellCommandRunner(undefined, 15 * 60 * 1_000);
    const backend = new KubernetesRuntimeTargetBackend(
      runner,
      new FileKubernetesConnectionResolver(),
      repository,
    );
    const connectionArgs = ["--kubeconfig", kubeconfigPath!];
    const kubectl = async (step: string, args: string[], stdin?: string): Promise<string> => {
      const result = await runner.run({
        context,
        targetId: serverId,
        step,
        args: [...connectionArgs, ...args],
        ...(stdin === undefined ? {} : { stdin }),
      });
      expect(result.isOk()).toBe(true);
      const output = result._unsafeUnwrap();
      expect(output.exitCode, `${step}: ${output.stderr}`).toBe(0);
      return output.stdout.trim();
    };
    const currentHelmPod = async (step: string): Promise<string> => {
      const payload = JSON.parse(
        await kubectl(step, [
          "get",
          "pods",
          "--namespace",
          helmNamespace!,
          "--selector",
          `app.kubernetes.io/instance=${helmRelease}`,
          "-o",
          "json",
        ]),
      ) as {
        items?: Array<{
          metadata?: { name?: string; deletionTimestamp?: string };
          status?: { containerStatuses?: Array<{ ready?: boolean }> };
        }>;
      };
      const pod = payload.items?.find(
        (item) =>
          !item.metadata?.deletionTimestamp &&
          item.status?.containerStatuses?.every((container) => container.ready),
      );
      expect(pod?.metadata?.name).toBeTruthy();
      return pod!.metadata!.name!;
    };

    const first = runningDeployment({
      id: "dep_kubernetes_r5c_stateful_1",
      resourceId,
      plan: statefulPlan("stateful_1"),
    });
    const replacement = runningDeployment({
      id: "dep_kubernetes_r5c_stateful_2",
      resourceId,
      plan: statefulPlan("stateful_2"),
    });
    const helmV1 = runningDeployment({
      id: "dep_kubernetes_r5c_helm_1",
      resourceId: "res_kubernetes_r5c_helm",
      plan: helmPlan("helm_1", "values.yaml"),
    });
    const helmV2 = runningDeployment({
      id: "dep_kubernetes_r5c_helm_2",
      resourceId: "res_kubernetes_r5c_helm",
      plan: helmPlan("helm_2", "values-v2.yaml"),
    });
    const helmFailure = runningDeployment({
      id: "dep_kubernetes_r5c_helm_fail",
      resourceId: "res_kubernetes_r5c_helm",
      plan: helmPlan("helm_fail", "values-fail.yaml"),
    });

    let statefulNamespace: string | undefined;
    let statefulWorkload: string | undefined;
    let helmNamespace: string | undefined;
    let helmRelease: string | undefined;
    let backupSourceRef: string | undefined;
    try {
      expect((await backend.execute(context, first)).isOk()).toBe(true);
      expectDeploymentStatus(first, "succeeded");
      const firstMetadata = first.toState().runtimePlan.execution.metadata ?? {};
      statefulNamespace = firstMetadata["kubernetes.namespace"];
      statefulWorkload = firstMetadata["kubernetes.workloadName"];
      expect(statefulNamespace).toBeTruthy();
      expect(statefulWorkload).toBeTruthy();
      await kubectl("write-stateful-data", [
        "exec",
        `${statefulWorkload}-0`,
        "--namespace",
        statefulNamespace!,
        "--",
        "sh",
        "-c",
        "echo durable-v2 > /var/lib/app/data/value",
      ]);

      expect((await backend.execute(context, replacement)).isOk()).toBe(true);
      expectDeploymentStatus(replacement, "succeeded");
      const replacementMetadata = replacement.toState().runtimePlan.execution.metadata ?? {};
      expect(replacementMetadata["kubernetes.namespace"]).toBe(statefulNamespace);
      expect(replacementMetadata["kubernetes.workloadName"]).toBe(statefulWorkload);
      expect(
        await kubectl("read-redeployed-stateful-data", [
          "exec",
          `${statefulWorkload}-0`,
          "--namespace",
          statefulNamespace!,
          "--",
          "cat",
          "/var/lib/app/data/value",
        ]),
      ).toBe("durable-v2");

      expect((await backend.cancel(context, first)).isOk()).toBe(true);
      expect(
        await kubectl("prove-replacement-survives-old-cleanup", [
          "get",
          "statefulset",
          statefulWorkload!,
          "--namespace",
          statefulNamespace!,
          "-o",
          "name",
        ]),
      ).toContain("statefulset.apps/");
      expect(
        await kubectl("prove-pvc-survives-old-cleanup", [
          "get",
          "persistentvolumeclaim",
          kubernetesStorageClaimName(resourceId, storageVolumeId),
          "--namespace",
          statefulNamespace!,
          "-o",
          "name",
        ]),
      ).toContain("persistentvolumeclaim/");

      const storageExecutor = new KubernetesStorageBackupExecutor(
        runner,
        new FileKubernetesConnectionResolver(),
      );
      const backup = await storageExecutor.createBackup({
        context,
        backupId: "svb_kubernetes_r5c",
        attemptId: "sba_kubernetes_r5c",
        requestedAt: "2026-08-13T00:00:00.000Z",
        plan: {
          schemaVersion: "storage-volumes.backup-plan/v1",
          storageVolumeId,
          sourceAdapterKey: "tar-volume",
          targetProviderKey: "local-filesystem",
          consistency: "crash-consistent",
          localOnly: true,
          retention: { maxCount: 3 },
          blockers: [],
        },
        source: { storageVolumeId, resourceId },
        runtimeTarget: cluster.toState(),
      });
      expect(
        backup.isOk(),
        backup.isErr() ? JSON.stringify(backup.error) : undefined,
      ).toBe(true);
      backupSourceRef = backup._unsafeUnwrap().sourceRef;
      const restored = await storageExecutor.restoreLocalBackup({
        context,
        backupId: "svb_kubernetes_r5c",
        restoreAttemptId: "sra_kubernetes_r5c",
        requestedAt: "2026-08-13T00:00:00.000Z",
        artifactHandle: backupSourceRef,
        targetStorageVolumeId: restoredStorageVolumeId,
        sourceStorageVolumeId: storageVolumeId,
        resourceId,
        runtimeTarget: cluster.toState(),
      });
      expect(
        restored.isOk(),
        restored.isErr() ? JSON.stringify(restored.error) : undefined,
      ).toBe(true);
      const verifierName = "appaloft-r5c-restore-verifier";
      await kubectl(
        "apply-restore-verifier",
        ["apply", "-f", "-"],
        JSON.stringify({
          apiVersion: "v1",
          kind: "Pod",
          metadata: { name: verifierName, namespace: statefulNamespace },
          spec: {
            restartPolicy: "Never",
            terminationGracePeriodSeconds: 1,
            containers: [
              {
                name: "verify",
                image: "busybox:1.36.1",
                command: ["sh", "-c", "cat /data/value; sleep 3600"],
                volumeMounts: [{ name: "data", mountPath: "/data", readOnly: true }],
              },
            ],
            volumes: [
              {
                name: "data",
                persistentVolumeClaim: {
                  claimName: kubernetesStorageClaimName(resourceId, restoredStorageVolumeId),
                },
              },
            ],
          },
        }),
      );
      await kubectl("wait-restore-verifier", [
        "wait",
        "--for=condition=Ready",
        `pod/${verifierName}`,
        "--namespace",
        statefulNamespace!,
        "--timeout=180s",
      ]);
      expect(
        await kubectl("read-restored-stateful-data", [
          "exec",
          verifierName,
          "--namespace",
          statefulNamespace!,
          "--",
          "cat",
          "/data/value",
        ]),
      ).toBe("durable-v2");
      await kubectl("delete-restore-verifier", [
        "delete",
        `pod/${verifierName}`,
        "--namespace",
        statefulNamespace!,
        "--wait=true",
      ]);

      expect((await backend.execute(context, helmV1)).isOk()).toBe(true);
      expectDeploymentStatus(helmV1, "succeeded");
      const helmV1Metadata = helmV1.toState().runtimePlan.execution.metadata ?? {};
      helmNamespace = helmV1Metadata["kubernetes.namespace"];
      helmRelease = helmV1Metadata["helm.releaseName"];
      expect(helmNamespace).toBeTruthy();
      expect(helmRelease).toBeTruthy();
      expect((await backend.execute(context, helmV2)).isOk()).toBe(true);
      expectDeploymentStatus(helmV2, "succeeded");
      const helmPod = await currentHelmPod("find-helm-pod");
      expect(
        await kubectl("read-upgraded-helm-value", [
          "exec",
          helmPod,
          "--namespace",
          helmNamespace!,
          "--",
          "cat",
          "/tmp/appaloft-message",
        ]),
      ).toBe("v2");

      expect((await backend.execute(context, helmFailure)).isOk()).toBe(true);
      expectDeploymentStatus(helmFailure, "failed");
      const failureMetadata = helmFailure.toState().runtimePlan.execution.metadata ?? {};
      expect(failureMetadata["helm.rollbackVerified"]).toBe("true");
      const rolledBackPod = await currentHelmPod("find-rolled-back-helm-pod");
      expect(
        await kubectl("read-rolled-back-helm-value", [
          "exec",
          rolledBackPod,
          "--namespace",
          helmNamespace!,
          "--",
          "cat",
          "/tmp/appaloft-message",
        ]),
      ).toBe("v2");
      expect((await backend.cancel(context, helmV2)).isOk()).toBe(true);
      expect(
        await kubectl("prove-helm-release-removed", [
          "get",
          "all",
          "--namespace",
          helmNamespace!,
          "--selector",
          `app.kubernetes.io/instance=${helmRelease}`,
          "-o",
          "name",
        ]),
      ).toBe("");
    } finally {
      if (backupSourceRef) {
        rmSync(dirname(backupSourceRef), { recursive: true, force: true });
      }
      for (const namespace of [helmNamespace, statefulNamespace]) {
        if (!namespace) continue;
        await runner.run({
          context,
          targetId: serverId,
          step: "cleanup-r5c-smoke-namespace",
          args: [
            ...connectionArgs,
            "delete",
            "namespace",
            namespace,
            "--ignore-not-found=true",
            "--wait=true",
            "--timeout=180s",
          ],
        });
      }
    }
  },
  8 * 60 * 1_000,
);
