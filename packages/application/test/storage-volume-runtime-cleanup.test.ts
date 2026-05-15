import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetId,
  DeploymentTargetLifecycleStatusValue,
  DeploymentTargetName,
  EnvironmentId,
  HostAddress,
  ok,
  PortNumber,
  ProjectId,
  ProviderKey,
  type Result,
  StorageBindSourcePath,
  StorageVolume,
  StorageVolumeId,
  StorageVolumeKindValue,
  StorageVolumeName,
  TargetKindValue,
  UpsertDeploymentTargetSpec,
  UpsertStorageVolumeSpec,
} from "@appaloft/core";
import { MemoryServerRepository, MemoryStorageVolumeRepository } from "@appaloft/testkit";

import {
  CleanupStorageVolumeRuntimeCommand,
  CleanupStorageVolumeRuntimeUseCase,
  createExecutionContext,
  type DeploymentReadModel,
  type DeploymentSummary,
  type ExecutionContext,
  type RepositoryContext,
  toRepositoryContext,
} from "../src";
import {
  type AuditEventRecorder,
  type AuditEventRecordInput,
  type Clock,
  type StorageRuntimeCleaner,
  type StorageRuntimeCleanupResult,
  type StorageVolumeBackupSafetyEvidence,
  type StorageVolumeBackupSafetyReader,
  type StorageVolumeReadModel,
  type StorageVolumeSummary,
} from "../src/ports";

function unwrap<T>(result: Result<T>): T {
  expect(result.isOk()).toBe(true);
  return result._unsafeUnwrap();
}

function createContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_storage_runtime_cleanup_test",
    entrypoint: "system",
  });
}

function storageVolumeFixture(
  input: {
    id?: string;
    kind?: "named-volume" | "bind-mount";
    backupRetentionRequired?: boolean;
  } = {},
): StorageVolume {
  const backupRelationship =
    input.backupRetentionRequired === undefined
      ? {}
      : { backupRelationship: { retentionRequired: input.backupRetentionRequired } };
  return unwrap(
    StorageVolume.create({
      id: StorageVolumeId.rehydrate(input.id ?? "stv_data"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      name: StorageVolumeName.rehydrate("Data"),
      kind: StorageVolumeKindValue.rehydrate(input.kind ?? "named-volume"),
      ...(input.kind === "bind-mount"
        ? { sourcePath: StorageBindSourcePath.rehydrate("/srv/appaloft/data") }
        : {}),
      ...backupRelationship,
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    }),
  );
}

function serverFixture(): DeploymentTarget {
  return DeploymentTarget.rehydrate({
    id: DeploymentTargetId.rehydrate("srv_primary"),
    name: DeploymentTargetName.rehydrate("Primary"),
    providerKey: ProviderKey.rehydrate("generic-ssh"),
    targetKind: TargetKindValue.rehydrate("single-server"),
    host: HostAddress.rehydrate("203.0.113.10"),
    port: PortNumber.rehydrate(22),
    lifecycleStatus: DeploymentTargetLifecycleStatusValue.active(),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

class FixedAttachmentStorageReadModel implements StorageVolumeReadModel {
  constructor(private readonly attachmentCount: number) {}

  async list(): Promise<StorageVolumeSummary[]> {
    return [];
  }

  async findOne(): Promise<StorageVolumeSummary | null> {
    return null;
  }

  async countAttachments(): Promise<number> {
    return this.attachmentCount;
  }
}

function deploymentSummary(overrides: Partial<DeploymentSummary> = {}): DeploymentSummary {
  return {
    id: "dep_storage_snapshot",
    projectId: "prj_demo",
    environmentId: "env_demo",
    resourceId: "res_web",
    serverId: "srv_primary",
    destinationId: "dst_demo",
    status: "succeeded",
    triggerKind: "create",
    runtimePlan: {
      id: "rplan_storage_snapshot",
      source: {
        kind: "git-public",
        locator: "https://github.com/acme/web.git",
        displayName: "acme/web",
      },
      buildStrategy: "workspace-commands",
      packagingMode: "all-in-one-docker",
      runtimeArtifact: {
        kind: "image",
        intent: "build-image",
        image: "appaloft/res_web:dep_storage_snapshot",
      },
      execution: {
        kind: "docker-container",
        image: "appaloft/res_web:dep_storage_snapshot",
        metadata: {
          "storage.mounts": JSON.stringify([
            {
              attachmentId: "rsa_data",
              storageVolumeId: "stv_data",
              storageVolumeKind: "named-volume",
              destinationPath: "/var/lib/app/data",
              mountMode: "read-write",
            },
          ]),
        },
      },
      target: {
        kind: "single-server",
        providerKey: "generic-ssh",
        serverIds: ["srv_primary"],
      },
      detectSummary: "detected workspace",
      generatedAt: "2026-01-01T00:00:00.000Z",
      steps: ["detect", "plan", "deploy", "verify"],
    },
    environmentSnapshot: {
      id: "snap_storage_snapshot",
      environmentId: "env_demo",
      createdAt: "2026-01-01T00:00:00.000Z",
      precedence: ["defaults", "project", "environment", "deployment"],
      variables: [],
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:01:00.000Z",
    logs: [],
    logCount: 0,
    ...overrides,
  };
}

class StaticDeploymentReadModel implements DeploymentReadModel {
  constructor(private readonly deployments: DeploymentSummary[]) {}

  async list(
    _context: RepositoryContext,
    input?: { projectId?: string; resourceId?: string },
  ): Promise<DeploymentSummary[]> {
    return this.deployments
      .filter((deployment) => (input?.projectId ? deployment.projectId === input.projectId : true))
      .filter((deployment) =>
        input?.resourceId ? deployment.resourceId === input.resourceId : true,
      );
  }

  async findOne(): Promise<DeploymentSummary | null> {
    return null;
  }

  async findLogs(): Promise<[]> {
    return [];
  }
}

class FixedStorageVolumeBackupSafetyReader implements StorageVolumeBackupSafetyReader {
  constructor(
    private readonly evidence: StorageVolumeBackupSafetyEvidence = {
      backupRetentionRequired: false,
      backupRestoreInFlightCount: 0,
    },
  ) {}

  async findSafetyEvidence(): Promise<Result<StorageVolumeBackupSafetyEvidence>> {
    return ok(this.evidence);
  }
}

class FakeStorageRuntimeCleaner implements StorageRuntimeCleaner {
  readonly inputs: Parameters<StorageRuntimeCleaner["cleanup"]>[1][] = [];

  async cleanup(
    _context: Parameters<StorageRuntimeCleaner["cleanup"]>[0],
    input: Parameters<StorageRuntimeCleaner["cleanup"]>[1],
  ): Promise<Result<StorageRuntimeCleanupResult>> {
    this.inputs.push(input);
    const blockedByAttachment = input.safetyEvidence.activeAttachmentCount > 0;
    const blockedByRetainedSnapshot = input.safetyEvidence.retainedSnapshotCount > 0;
    const blockedByRollbackCandidate = input.safetyEvidence.rollbackCandidateCount > 0;
    const blockedByBackupRestore = input.safetyEvidence.backupRestoreInFlightCount > 0;
    const blockedByBackup = input.safetyEvidence.backupRetentionRequired;
    const blockedBindMount = input.storageVolume.kind.value === "bind-mount";
    const blocked =
      blockedByAttachment ||
      blockedByRetainedSnapshot ||
      blockedByRollbackCandidate ||
      blockedByBackupRestore ||
      blockedByBackup ||
      blockedBindMount;
    const cleanedCount = input.dryRun || blocked ? 0 : 1;
    const action = blocked ? "blocked" : input.dryRun ? "matched" : "cleaned";
    const blockedReason = blockedByAttachment
      ? "active-attachment"
      : blockedByRetainedSnapshot
        ? "retained-snapshot"
        : blockedByRollbackCandidate
          ? "rollback-candidate"
          : blockedByBackupRestore
            ? "backup-restore-in-flight"
            : blockedByBackup
              ? "backup-retention"
              : blockedBindMount
                ? "bind-mount-unsupported"
                : undefined;

    return ok({
      schemaVersion: "storage-volumes.cleanup-runtime/v1",
      storageVolume: {
        id: input.storageVolume.id.value,
        name: input.storageVolume.name.value,
        kind: input.storageVolume.kind.value,
      },
      server: {
        id: input.server.id.value,
        name: input.server.name.value,
        host: input.server.host.value,
        port: input.server.port.value,
        providerKey: input.server.providerKey.value,
        targetKind: input.server.targetKind.value,
      },
      before: input.before,
      dryRun: input.dryRun,
      cleanedAt: "2026-01-01T00:10:00.000Z",
      summary: {
        inspectedCount: 1,
        matchedCount: blocked ? 0 : 1,
        cleanedCount,
        skippedCount: 0,
        blockedCount: blocked ? 1 : 0,
      },
      candidates: [
        {
          id: "appaloft-stv_data",
          kind: input.storageVolume.kind.value,
          target: "appaloft-stv_data",
          updatedAt: "2026-01-01T00:00:00.000Z",
          action,
          ...(blockedReason ? { blockedReason } : {}),
        },
      ],
      warnings: [],
    });
  }
}

class MemoryAuditEventRecorder implements AuditEventRecorder {
  readonly records: AuditEventRecordInput[] = [];

  async record(_context: RepositoryContext, input: AuditEventRecordInput): Promise<Result<void>> {
    this.records.push(input);
    return ok(undefined);
  }
}

class FixedClock implements Clock {
  now(): string {
    return "2026-01-01T00:11:00.000Z";
  }
}

class SequenceIdGenerator {
  private count = 0;

  next(prefix: string): string {
    this.count += 1;
    return `${prefix}_${this.count}`;
  }
}

async function createHarness(
  input: {
    storageVolume?: StorageVolume;
    attachmentCount?: number;
    deployments?: DeploymentSummary[];
    backupSafety?: StorageVolumeBackupSafetyEvidence;
  } = {},
) {
  const context = createContext();
  const repositoryContext = toRepositoryContext(context);
  const storageVolumes = new MemoryStorageVolumeRepository();
  const servers = new MemoryServerRepository();
  const storageVolume = input.storageVolume ?? storageVolumeFixture();
  const cleaner = new FakeStorageRuntimeCleaner();
  const auditRecorder = new MemoryAuditEventRecorder();

  await storageVolumes.upsert(
    repositoryContext,
    storageVolume,
    UpsertStorageVolumeSpec.fromStorageVolume(storageVolume),
  );
  const server = serverFixture();
  await servers.upsert(
    repositoryContext,
    server,
    UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
  );

  return {
    auditRecorder,
    cleaner,
    context,
    useCase: new CleanupStorageVolumeRuntimeUseCase(
      storageVolumes,
      new FixedAttachmentStorageReadModel(input.attachmentCount ?? 0),
      new FixedStorageVolumeBackupSafetyReader(input.backupSafety),
      new StaticDeploymentReadModel(input.deployments ?? []),
      servers,
      cleaner,
      auditRecorder,
      new SequenceIdGenerator(),
      new FixedClock(),
    ),
  };
}

describe("storage-volumes.cleanup-runtime", () => {
  test("[STOR-CLEANUP-001] dry-runs storage runtime cleanup by default", async () => {
    const { auditRecorder, cleaner, context, useCase } = await createHarness();
    const command = unwrap(
      CleanupStorageVolumeRuntimeCommand.create({
        storageVolumeId: "stv_data",
        serverId: "srv_primary",
        before: "2026-01-01T00:05:00.000Z",
      }),
    );

    const result = await useCase.execute(context, command.input);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "storage-volumes.cleanup-runtime/v1",
      dryRun: true,
      summary: { matchedCount: 1, cleanedCount: 0 },
    });
    expect(cleaner.inputs[0]).toMatchObject({
      before: "2026-01-01T00:05:00.000Z",
      dryRun: true,
      safetyEvidence: {
        activeAttachmentCount: 0,
        backupRetentionRequired: false,
        backupRestoreInFlightCount: 0,
      },
    });
    expect(auditRecorder.records).toHaveLength(0);
  });

  test("[STOR-CLEANUP-002] destructive storage runtime cleanup requires explicit opt-in", async () => {
    const { auditRecorder, context, useCase } = await createHarness();
    const command = unwrap(
      CleanupStorageVolumeRuntimeCommand.create({
        storageVolumeId: "stv_data",
        serverId: "srv_primary",
        before: "2026-01-01T00:05:00.000Z",
        dryRun: false,
      }),
    );

    const result = await useCase.execute(context, command.input);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      dryRun: false,
      summary: { matchedCount: 1, cleanedCount: 1 },
      candidates: [expect.objectContaining({ action: "cleaned" })],
    });
    expect(auditRecorder.records).toContainEqual(
      expect.objectContaining({
        aggregateId: "stv_data",
        eventType: "storage-volume-runtime-cleaned",
      }),
    );
  });

  test("[STOR-CLEANUP-003][STOR-CLEANUP-004] passes attachment backup and bind-mount blockers to runtime cleanup", async () => {
    const { context, useCase } = await createHarness({
      attachmentCount: 2,
      storageVolume: storageVolumeFixture({
        kind: "bind-mount",
        backupRetentionRequired: true,
      }),
    });
    const command = unwrap(
      CleanupStorageVolumeRuntimeCommand.create({
        storageVolumeId: "stv_data",
        serverId: "srv_primary",
        before: "2026-01-01T00:05:00.000Z",
        dryRun: false,
      }),
    );

    const result = await useCase.execute(context, command.input);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      summary: { cleanedCount: 0, blockedCount: 1 },
      candidates: [
        expect.objectContaining({
          action: "blocked",
          blockedReason: "active-attachment",
        }),
      ],
    });
  });

  test("[STOR-CLEANUP-004] reports bind-mount runtime cleanup as unsupported without cleaning", async () => {
    const { context, useCase } = await createHarness({
      storageVolume: storageVolumeFixture({ kind: "bind-mount" }),
    });
    const command = unwrap(
      CleanupStorageVolumeRuntimeCommand.create({
        storageVolumeId: "stv_data",
        serverId: "srv_primary",
        before: "2026-01-01T00:05:00.000Z",
        dryRun: false,
      }),
    );

    const result = await useCase.execute(context, command.input);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      dryRun: false,
      storageVolume: { kind: "bind-mount" },
      summary: { cleanedCount: 0, blockedCount: 1 },
      candidates: [
        expect.objectContaining({
          kind: "bind-mount",
          action: "blocked",
          blockedReason: "bind-mount-unsupported",
        }),
      ],
    });
  });

  test("[STOR-CLEANUP-003] passes retained snapshot and rollback candidate blockers to runtime cleanup", async () => {
    const { cleaner, context, useCase } = await createHarness({
      deployments: [
        deploymentSummary(),
        deploymentSummary({
          id: "dep_other_server",
          serverId: "srv_other",
        }),
        deploymentSummary({
          id: "dep_other_volume",
          runtimePlan: {
            ...deploymentSummary().runtimePlan,
            execution: {
              ...deploymentSummary().runtimePlan.execution,
              metadata: {
                "storage.mounts": JSON.stringify([
                  {
                    attachmentId: "rsa_cache",
                    storageVolumeId: "stv_cache",
                    storageVolumeKind: "named-volume",
                    destinationPath: "/cache",
                    mountMode: "read-write",
                  },
                ]),
              },
            },
          },
        }),
      ],
    });
    const command = unwrap(
      CleanupStorageVolumeRuntimeCommand.create({
        storageVolumeId: "stv_data",
        serverId: "srv_primary",
        before: "2026-01-01T00:05:00.000Z",
        dryRun: false,
      }),
    );

    const result = await useCase.execute(context, command.input);

    expect(result.isOk()).toBe(true);
    expect(cleaner.inputs[0]).toMatchObject({
      safetyEvidence: {
        retainedSnapshotCount: 1,
        rollbackCandidateCount: 1,
      },
    });
    expect(result._unsafeUnwrap()).toMatchObject({
      summary: { cleanedCount: 0, blockedCount: 1 },
      candidates: [
        expect.objectContaining({
          action: "blocked",
          blockedReason: "retained-snapshot",
        }),
      ],
    });
  });

  test("[STOR-CLEANUP-003] passes storage backup retention and in-flight restore blockers to runtime cleanup", async () => {
    const { cleaner, context, useCase } = await createHarness({
      backupSafety: {
        backupRetentionRequired: true,
        backupRestoreInFlightCount: 1,
      },
    });
    const command = unwrap(
      CleanupStorageVolumeRuntimeCommand.create({
        storageVolumeId: "stv_data",
        serverId: "srv_primary",
        before: "2026-01-01T00:05:00.000Z",
        dryRun: false,
      }),
    );

    const result = await useCase.execute(context, command.input);

    expect(result.isOk()).toBe(true);
    expect(cleaner.inputs[0]).toMatchObject({
      safetyEvidence: {
        backupRetentionRequired: true,
        backupRestoreInFlightCount: 1,
      },
    });
    expect(result._unsafeUnwrap()).toMatchObject({
      summary: { cleanedCount: 0, blockedCount: 1 },
      candidates: [
        expect.objectContaining({
          action: "blocked",
          blockedReason: "backup-restore-in-flight",
        }),
      ],
    });
  });

  test("[STOR-CLEANUP-005] command validation defaults dryRun and rejects malformed cutoff", () => {
    expect(
      CleanupStorageVolumeRuntimeCommand.create({
        storageVolumeId: "stv_data",
        serverId: "srv_primary",
        before: "2026-01-01T00:05:00.000Z",
      })._unsafeUnwrap().input,
    ).toMatchObject({ dryRun: true });

    const invalid = CleanupStorageVolumeRuntimeCommand.create({
      storageVolumeId: "stv_data",
      serverId: "srv_primary",
      before: "not-a-date",
    });
    expect(invalid.isErr()).toBe(true);
  });
});
