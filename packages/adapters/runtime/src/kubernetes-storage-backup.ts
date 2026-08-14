import { createHash } from "node:crypto";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  StorageBackupExecutionRequest,
  StorageBackupSourceResult,
  StorageBackupTargetRestoreRequest,
  StorageBackupTargetRestoreResult,
} from "@appaloft/application";
import { domainError, err, ok, type DeploymentTargetState, type Result } from "@appaloft/core";

import {
  kubernetesStorageClaimName,
  kubernetesStorageVolumeLabelValue,
} from "./kubernetes-runtime-intent";
import {
  FileKubernetesConnectionResolver,
  KubernetesShellCommandRunner,
  type KubernetesCommandRunner,
  type KubernetesConnectionResolver,
  type KubernetesResolvedConnection,
} from "./kubernetes-runtime-target-backend";

interface PersistentVolumeClaimObservation {
  namespace: string;
  name: string;
}

function safeName(value: string, fallback: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 8);
  const readable = normalized || fallback;
  return `${readable.slice(0, 54).replace(/-+$/g, "")}-${digest}`;
}

function resolveProfile(target: DeploymentTargetState | undefined): Result<{
  targetId: string;
  connectionReference: string;
  credentialReference?: string;
}> {
  const profile = target?.runtimeTargetProfile?.toSnapshot();
  if (
    !target ||
    target.providerKey.value !== "kubernetes" ||
    target.targetKind.value !== "orchestrator-cluster" ||
    !profile
  ) {
    return err(
      domainError.runtimeTargetUnsupported("Kubernetes storage backup target is unavailable", {
        phase: "kubernetes-storage-backup-target-resolution",
      }),
    );
  }
  return ok({
    targetId: target.id.value,
    connectionReference: profile.connectionReference,
    ...(profile.credentialReference ? { credentialReference: profile.credentialReference } : {}),
  });
}

function connectionArgs(connection: KubernetesResolvedConnection): string[] {
  return [
    "--kubeconfig",
    connection.kubeconfigPath,
    ...(connection.contextName ? ["--context", connection.contextName] : []),
  ];
}

function discoverClaim(stdout: string): Result<PersistentVolumeClaimObservation> {
  try {
    const payload = JSON.parse(stdout) as {
      items?: Array<{ metadata?: { namespace?: string; name?: string }; status?: { phase?: string } }>;
    };
    const claims = (payload.items ?? []).filter(
      (item) => item.metadata?.namespace && item.metadata.name && item.status?.phase === "Bound",
    );
    if (claims.length !== 1) {
      return err(
        domainError.conflict("Kubernetes storage volume must resolve to exactly one bound PVC", {
          phase: "kubernetes-storage-pvc-discovery",
          matchedClaims: claims.length,
        }),
      );
    }
    return ok({
      namespace: claims[0]?.metadata?.namespace ?? "",
      name: claims[0]?.metadata?.name ?? "",
    });
  } catch {
    return err(
      domainError.infra("Kubernetes PVC discovery returned invalid JSON", {
        phase: "kubernetes-storage-pvc-discovery",
      }),
    );
  }
}

async function fileEvidence(path: string): Promise<Result<{ sizeBytes: number; checksum: string }>> {
  try {
    const bytes = await Bun.file(path).arrayBuffer();
    return ok({
      sizeBytes: bytes.byteLength,
      checksum: createHash("sha256").update(new Uint8Array(bytes)).digest("hex"),
    });
  } catch {
    return err(
      domainError.infra("Kubernetes storage backup artifact is unavailable", {
        phase: "kubernetes-storage-backup-artifact-readback",
      }),
    );
  }
}

export class KubernetesStorageBackupExecutor {
  constructor(
    private readonly runner: KubernetesCommandRunner = new KubernetesShellCommandRunner(
      undefined,
      15 * 60 * 1_000,
    ),
    private readonly connectionResolver: KubernetesConnectionResolver =
      new FileKubernetesConnectionResolver(),
    private readonly helperImage = "busybox:1.36.1",
  ) {}

  private async connection(input: {
    context: StorageBackupExecutionRequest["context"];
    runtimeTarget?: DeploymentTargetState | undefined;
  }): Promise<Result<{ targetId: string; connection: KubernetesResolvedConnection }>> {
    const profile = resolveProfile(input.runtimeTarget);
    if (profile.isErr()) return err(profile.error);
    const connection = await this.connectionResolver.resolve({
      context: input.context,
      connectionReference: profile.value.connectionReference,
      ...(profile.value.credentialReference
        ? { credentialReference: profile.value.credentialReference }
        : {}),
    });
    return connection.map((resolved) => ({ targetId: profile.value.targetId, connection: resolved }));
  }

  private async discover(
    context: StorageBackupExecutionRequest["context"],
    targetId: string,
    connection: KubernetesResolvedConnection,
    storageVolumeId: string,
  ): Promise<Result<PersistentVolumeClaimObservation>> {
    const result = await this.runner.run({
      context,
      targetId,
      step: "discover-source-pvc",
      args: [
        ...connectionArgs(connection),
        "get",
        "persistentvolumeclaims",
        "--all-namespaces",
        "--selector",
        `appaloft.io/storage-volume-id=${kubernetesStorageVolumeLabelValue(storageVolumeId)}`,
        "--output",
        "json",
      ],
    });
    if (result.isErr()) return err(result.error);
    if (result.value.exitCode !== 0) {
      return err(domainError.infra("Kubernetes PVC discovery failed", {
        phase: "kubernetes-storage-pvc-discovery",
      }));
    }
    return discoverClaim(result.value.stdout);
  }

  async createBackup(input: StorageBackupExecutionRequest): Promise<Result<StorageBackupSourceResult>> {
    const resolved = await this.connection(input);
    if (resolved.isErr()) return err(resolved.error);
    const claim = await this.discover(
      input.context,
      resolved.value.targetId,
      resolved.value.connection,
      input.source.storageVolumeId,
    );
    if (claim.isErr()) return err(claim.error);
    const helperName = safeName(`appaloft-backup-${input.attemptId}`, "appaloft-backup");
    const workingDirectory = mkdtempSync(join(tmpdir(), "appaloft-k8s-storage-backup-"));
    const sourceRef = join(workingDirectory, `${input.backupId}.${input.attemptId}.tar.gz`);
    const run = async (step: string, args: string[], stdin?: string) =>
      await this.runner.run({
        context: input.context,
        targetId: resolved.value.targetId,
        step,
        args: [...connectionArgs(resolved.value.connection), ...args],
        ...(stdin === undefined ? {} : { stdin }),
      });
    const manifest = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        namespace: claim.value.namespace,
        name: helperName,
        labels: {
          "appaloft.io/managed-by": "appaloft",
          "appaloft.io/backup-attempt-id": input.attemptId,
        },
      },
      spec: {
        restartPolicy: "Never",
        terminationGracePeriodSeconds: 1,
        containers: [
          {
            name: "backup",
            image: this.helperImage,
            command: [
              "sh",
              "-c",
              "tar -C /data -czf /work/backup.tar.gz . && touch /work/ready && sleep 900",
            ],
            readinessProbe: {
              exec: { command: ["sh", "-c", "test -f /work/ready"] },
              periodSeconds: 1,
            },
            volumeMounts: [
              { name: "data", mountPath: "/data", readOnly: true },
              { name: "work", mountPath: "/work" },
            ],
          },
        ],
        volumes: [
          { name: "data", persistentVolumeClaim: { claimName: claim.value.name, readOnly: true } },
          { name: "work", emptyDir: {} },
        ],
      },
    };
    try {
      const applied = await run(
        "apply-backup-helper",
        ["apply", "--server-side=true", "--field-manager=appaloft", "-f", "-"],
        JSON.stringify(manifest),
      );
      if (applied.isErr()) return err(applied.error);
      if (applied.value.exitCode !== 0) {
        return err(domainError.infra("Kubernetes backup helper could not be applied", {
          phase: "kubernetes-storage-backup-helper",
        }));
      }
      const waited = await run("wait-backup-helper", [
        "wait",
        "--for=condition=Ready",
        `pod/${helperName}`,
        "--namespace",
        claim.value.namespace,
        "--timeout=600s",
      ]);
      if (waited.isErr()) return err(waited.error);
      if (waited.value.exitCode !== 0) {
        return err(domainError.infra("Kubernetes backup helper did not complete", {
          phase: "kubernetes-storage-backup-helper",
        }));
      }
      const copied = await run("copy-backup-artifact", [
        "cp",
        `${claim.value.namespace}/${helperName}:/work/backup.tar.gz`,
        sourceRef,
      ]);
      if (copied.isErr()) return err(copied.error);
      if (copied.value.exitCode !== 0 || !existsSync(sourceRef)) {
        return err(domainError.infra("Kubernetes backup artifact copy failed", {
          phase: "kubernetes-storage-backup-copy",
        }));
      }
      const evidence = await fileEvidence(sourceRef);
      if (evidence.isErr()) return err(evidence.error);
      return ok({
        sourceRef,
        manifest: {
          namespace: claim.value.namespace,
          claimName: claim.value.name,
          sizeBytes: evidence.value.sizeBytes,
          checksum: evidence.value.checksum,
        },
      });
    } finally {
      await run("delete-backup-helper", [
        "delete",
        `pod/${helperName}`,
        "--namespace",
        claim.value.namespace,
        "--ignore-not-found=true",
        "--wait=true",
      ]);
    }
  }

  async restoreLocalBackup(
    input: StorageBackupTargetRestoreRequest,
  ): Promise<Result<StorageBackupTargetRestoreResult>> {
    if (!existsSync(input.artifactHandle)) {
      return err(domainError.validation("Local Kubernetes restore artifact does not exist", {
        phase: "kubernetes-storage-restore-artifact",
      }));
    }
    if (!input.resourceId) {
      return err(domainError.validation("Kubernetes storage restore requires resource identity", {
        phase: "kubernetes-storage-restore-target",
      }));
    }
    const resolved = await this.connection(input);
    if (resolved.isErr()) return err(resolved.error);
    const sourceClaim = await this.discover(
      input.context,
      resolved.value.targetId,
      resolved.value.connection,
      input.sourceStorageVolumeId,
    );
    if (sourceClaim.isErr()) return err(sourceClaim.error);
    const claimName = kubernetesStorageClaimName(input.resourceId, input.targetStorageVolumeId);
    const helperName = safeName(`appaloft-restore-${input.restoreAttemptId}`, "appaloft-restore");
    const run = async (step: string, args: string[], stdin?: string) =>
      await this.runner.run({
        context: input.context,
        targetId: resolved.value.targetId,
        step,
        args: [...connectionArgs(resolved.value.connection), ...args],
        ...(stdin === undefined ? {} : { stdin }),
      });
    const manifest = {
      apiVersion: "v1",
      kind: "List",
      items: [
        {
          apiVersion: "v1",
          kind: "PersistentVolumeClaim",
          metadata: {
            namespace: sourceClaim.value.namespace,
            name: claimName,
            labels: {
              "appaloft.io/managed-by": "appaloft",
              "appaloft.io/storage-volume-id": kubernetesStorageVolumeLabelValue(
                input.targetStorageVolumeId,
              ),
            },
            annotations: { "appaloft.io/restored-from-backup-id": input.backupId },
          },
          spec: { accessModes: ["ReadWriteOnce"], resources: { requests: { storage: "1Gi" } } },
        },
        {
          apiVersion: "v1",
          kind: "Pod",
          metadata: {
            namespace: sourceClaim.value.namespace,
            name: helperName,
            labels: {
              "appaloft.io/managed-by": "appaloft",
              "appaloft.io/restore-attempt-id": input.restoreAttemptId,
            },
          },
          spec: {
            restartPolicy: "Never",
            terminationGracePeriodSeconds: 1,
            containers: [
              {
                name: "restore",
                image: this.helperImage,
                command: ["sh", "-c", "sleep 900"],
                volumeMounts: [
                  { name: "data", mountPath: "/data" },
                  { name: "work", mountPath: "/work" },
                ],
              },
            ],
            volumes: [
              { name: "data", persistentVolumeClaim: { claimName } },
              { name: "work", emptyDir: {} },
            ],
          },
        },
      ],
    };
    try {
      const applied = await run(
        "apply-restore-helper",
        ["apply", "--server-side=true", "--field-manager=appaloft", "-f", "-"],
        JSON.stringify(manifest),
      );
      if (applied.isErr()) return err(applied.error);
      if (applied.value.exitCode !== 0) {
        return err(domainError.infra("Kubernetes restore helper could not be applied", {
          phase: "kubernetes-storage-restore-helper",
        }));
      }
      const waited = await run("wait-restore-helper", [
        "wait",
        "--for=condition=Ready",
        `pod/${helperName}`,
        "--namespace",
        sourceClaim.value.namespace,
        "--timeout=600s",
      ]);
      if (waited.isErr()) return err(waited.error);
      if (waited.value.exitCode !== 0) {
        return err(domainError.infra("Kubernetes restore helper did not become ready", {
          phase: "kubernetes-storage-restore-helper",
        }));
      }
      const copied = await run("copy-restore-artifact", [
        "cp",
        input.artifactHandle,
        `${sourceClaim.value.namespace}/${helperName}:/work/backup.tar.gz`,
      ]);
      if (copied.isErr()) return err(copied.error);
      if (copied.value.exitCode !== 0) {
        return err(domainError.infra("Kubernetes restore artifact copy failed", {
          phase: "kubernetes-storage-restore-copy",
        }));
      }
      const extracted = await run("extract-restore-artifact", [
        "exec",
        `pod/${helperName}`,
        "--namespace",
        sourceClaim.value.namespace,
        "--",
        "tar",
        "-C",
        "/data",
        "-xzf",
        "/work/backup.tar.gz",
      ]);
      if (extracted.isErr()) return err(extracted.error);
      if (extracted.value.exitCode !== 0) {
        return err(domainError.infra("Kubernetes storage restore extraction failed", {
          phase: "kubernetes-storage-restore-extract",
        }));
      }
      return ok({ restoredAt: new Date().toISOString() });
    } finally {
      await run("delete-restore-helper", [
        "delete",
        `pod/${helperName}`,
        "--namespace",
        sourceClaim.value.namespace,
        "--ignore-not-found=true",
        "--wait=true",
      ]);
    }
  }
}
