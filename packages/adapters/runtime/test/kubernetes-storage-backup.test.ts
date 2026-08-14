import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createExecutionContext } from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";

import {
  KubernetesStorageBackupExecutor,
} from "../src/kubernetes-storage-backup";
import type {
  KubernetesCommandRunner,
  KubernetesCommandRunnerInput,
  KubernetesCommandRunnerResult,
} from "../src/kubernetes-runtime-target-backend";

class StorageRunner implements KubernetesCommandRunner {
  readonly calls: KubernetesCommandRunnerInput[] = [];

  async run(input: KubernetesCommandRunnerInput): Promise<Result<KubernetesCommandRunnerResult>> {
    this.calls.push(input);
    if (input.step === "discover-source-pvc") {
      return ok({
        exitCode: 0,
        stdout: JSON.stringify({
          items: [
            {
              metadata: { namespace: "appaloft-stateful", name: "appaloft-stv-data" },
              status: { phase: "Bound" },
            },
          ],
        }),
        stderr: "",
      });
    }
    if (input.step === "copy-backup-artifact") {
      const target = input.args.at(-1) ?? "";
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, "stateful-data");
    }
    return ok({ exitCode: 0, stdout: "", stderr: "" });
  }
}

const context = createExecutionContext({ requestId: "req_k8s_backup", entrypoint: "system" });
const target = {
  providerKey: { value: "kubernetes" },
  targetKind: { value: "orchestrator-cluster" },
  id: { value: "srv_cluster" },
  runtimeTargetProfile: {
    toSnapshot: () => ({ connectionReference: "file:///private/tmp/kubeconfig" }),
  },
} as never;

describe("Kubernetes storage backup executor", () => {
  test("[K8S-STATEFUL-014] copies an exact labeled PVC into a local backup artifact and removes its helper", async () => {
    const runner = new StorageRunner();
    const executor = new KubernetesStorageBackupExecutor(runner, {
      resolve: async () => ok({ kubeconfigPath: "/private/tmp/kubeconfig" }),
    });
    const result = await executor.createBackup({
      context,
      backupId: "svb_demo",
      attemptId: "sba_demo",
      requestedAt: "2026-08-13T00:00:00.000Z",
      plan: {
        schemaVersion: "storage-volumes.backup-plan/v1",
        storageVolumeId: "stv_data",
        sourceAdapterKey: "tar-volume",
        targetProviderKey: "local-filesystem",
        consistency: "crash-consistent",
        localOnly: true,
        retention: { maxCount: 3 },
        blockers: [],
      },
      source: { storageVolumeId: "stv_data", resourceId: "res_app" },
      runtimeTarget: target,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().sourceRef).toMatch(/svb_demo\.sba_demo\.tar\.gz$/);
    expect(result._unsafeUnwrap().manifest).toMatchObject({
      namespace: "appaloft-stateful",
      claimName: "appaloft-stv-data",
      sizeBytes: 13,
    });
    expect(runner.calls[0]?.args).toContain(
      "appaloft.io/storage-volume-id=stv-data",
    );
    const helperManifest = runner.calls.find((call) => call.step === "apply-backup-helper")?.stdin;
    expect(helperManifest).toContain("touch /work/ready && sleep 900");
    expect(
      runner.calls.find((call) => call.step === "wait-backup-helper")?.args,
    ).toContain("--for=condition=Ready");
    expect(runner.calls.map((call) => call.step)).toEqual([
      "discover-source-pvc",
      "apply-backup-helper",
      "wait-backup-helper",
      "copy-backup-artifact",
      "delete-backup-helper",
    ]);
  });

  test("[K8S-STATEFUL-014] restores into a new canonical PVC and preserves it after helper cleanup", async () => {
    const runner = new StorageRunner();
    const executor = new KubernetesStorageBackupExecutor(runner, {
      resolve: async () => ok({ kubeconfigPath: "/private/tmp/kubeconfig" }),
    });
    const fixtureDirectory = mkdtempSync(join(tmpdir(), "appaloft-k8s-storage-restore-test-"));
    try {
      const artifactHandle = join(fixtureDirectory, "svb_demo.tar.gz");
      writeFileSync(artifactHandle, "stateful-data");
      const result = await executor.restoreLocalBackup({
        context,
        backupId: "svb_demo",
        restoreAttemptId: "sra_demo",
        requestedAt: "2026-08-13T00:00:00.000Z",
        artifactHandle,
        targetStorageVolumeId: "stv_restored",
        sourceStorageVolumeId: "stv_data",
        resourceId: "res_app",
        runtimeTarget: target,
      });

      expect(result.isOk()).toBe(true);
      const manifestCall = runner.calls.find((call) => call.step === "apply-restore-helper");
      expect(manifestCall?.stdin).toContain('"kind":"PersistentVolumeClaim"');
      expect(manifestCall?.stdin).toContain('"appaloft.io/storage-volume-id":"stv-restored"');
      expect(runner.calls.map((call) => call.step)).toEqual([
        "discover-source-pvc",
        "apply-restore-helper",
        "wait-restore-helper",
        "copy-restore-artifact",
        "extract-restore-artifact",
        "delete-restore-helper",
      ]);
      expect(runner.calls.at(-1)?.args.join(" ")).not.toContain("persistentvolumeclaim");
    } finally {
      rmSync(fixtureDirectory, { recursive: true, force: true });
    }
  });
});
