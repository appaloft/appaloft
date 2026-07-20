import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import {
  planStorageVolumeBackup,
  type StorageBackupPlanRequest,
  type StorageBackupRetentionPolicy,
  type StorageBackupSourceAdapterPort,
  type StorageBackupSourceDescriptor,
  type StorageBackupTargetDescriptor,
  type StorageBackupTargetProviderPort,
} from "../src";

const tarVolumeSourceAdapter: StorageBackupSourceAdapterPort = {
  key: "tar-volume",
  supports(input) {
    return (
      input.source.dataFormat !== "sqlite" &&
      input.requestedConsistency !== "application-consistent"
    );
  },
};

const sqliteOnlineBackupSourceAdapter: StorageBackupSourceAdapterPort = {
  key: "sqlite-online-backup",
  supports(input) {
    return (
      input.source.dataFormat === "sqlite" &&
      input.requestedConsistency === "application-consistent"
    );
  },
};

const localFilesystemTargetProvider: StorageBackupTargetProviderPort = {
  key: "local-filesystem",
  localOnly: () => true,
  supports: (input) => input.target.providerKey === "local-filesystem",
};

const s3CompatibleTargetProvider: StorageBackupTargetProviderPort = {
  key: "s3-compatible",
  localOnly: () => false,
  supports: (input) => input.target.providerKey === "s3-compatible",
};

type StorageBackupPlanRequestFixtureInput = Omit<
  Partial<StorageBackupPlanRequest>,
  "source" | "target" | "retention"
> & {
  source?: Partial<StorageBackupSourceDescriptor>;
  target?: Partial<StorageBackupTargetDescriptor>;
  retention?: Partial<StorageBackupRetentionPolicy>;
};

function backupRequest(input: StorageBackupPlanRequestFixtureInput = {}): StorageBackupPlanRequest {
  const request: StorageBackupPlanRequest = {
    source: {
      storageVolumeId: "stv_data",
      resourceId: "res_pocketbase",
      attachmentId: "rsa_data",
      destinationPath: "/pb_data",
      dataFormat: "filesystem",
      liveWrites: false,
      ...(input.source ?? {}),
    },
    requestedConsistency: input.requestedConsistency ?? "quiesced",
    target: {
      providerKey: "local-filesystem",
      targetRef: "local://backups/pocketbase",
      ...(input.target ?? {}),
    },
    retention: {
      maxCount: 7,
      minFreeBytes: 1024 * 1024 * 1024,
      ...(input.retention ?? {}),
    },
  };
  if (input.preferredSourceAdapter) {
    request.preferredSourceAdapter = input.preferredSourceAdapter;
  }
  return {
    ...request,
  };
}

describe("storage volume backup contract", () => {
  test("[STOR-BACKUP-PLAN-001][STOR-BACKUP-OFFSITE-PLAN-001] separates source adapter consistency from target provider storage", () => {
    const result = planStorageVolumeBackup(
      backupRequest({
        target: {
          providerKey: "s3-compatible",
          targetRef: "s3://appaloft-backups/pocketbase",
          secretRef: "secret://backup-targets/s3/appaloft",
        },
      }),
      {
        sourceAdapters: [tarVolumeSourceAdapter],
        targetProviders: [localFilesystemTargetProvider, s3CompatibleTargetProvider],
      },
    );

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();
    expect(plan).toMatchObject({
      schemaVersion: "storage-volumes.backup-plan/v1",
      storageVolumeId: "stv_data",
      sourceAdapterKey: "tar-volume",
      targetProviderKey: "s3-compatible",
      consistency: "quiesced",
      localOnly: false,
      blockers: [],
    });
    expect(JSON.stringify(plan)).not.toContain("secret://backup-targets");
  });

  test("[STOR-BACKUP-PLAN-002] blocks live SQLite application-consistent backup without a compatible source adapter", () => {
    const result = planStorageVolumeBackup(
      backupRequest({
        source: {
          dataFormat: "sqlite",
          liveWrites: true,
        },
        requestedConsistency: "application-consistent",
      }),
      {
        sourceAdapters: [tarVolumeSourceAdapter],
        targetProviders: [localFilesystemTargetProvider],
      },
    );

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();
    expect(plan.sourceAdapterKey).toBe("unsupported");
    expect(plan.blockers).toEqual([
      {
        code: "unsafe-live-sqlite-copy",
        message:
          "Live SQLite data requires an application-consistent source adapter; unsafe file copy is blocked.",
      },
    ]);
  });

  test("[STOR-BACKUP-SQLITE-001] accepts live SQLite only through an application-consistent adapter", () => {
    const result = planStorageVolumeBackup(
      backupRequest({
        source: {
          dataFormat: "sqlite",
          liveWrites: true,
        },
        requestedConsistency: "application-consistent",
      }),
      {
        sourceAdapters: [tarVolumeSourceAdapter, sqliteOnlineBackupSourceAdapter],
        targetProviders: [localFilesystemTargetProvider],
      },
    );

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();
    expect(plan.sourceAdapterKey).toBe("sqlite-online-backup");
    expect(plan.blockers).toEqual([]);
  });

  test("[STOR-BACKUP-RETENTION-001] requires bounded retention and a local free-disk guard", () => {
    const request = backupRequest();
    request.retention = {
      maxCount: 0,
    };
    const result = planStorageVolumeBackup(request, {
      sourceAdapters: [tarVolumeSourceAdapter],
      targetProviders: [localFilesystemTargetProvider],
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();
    expect(plan.localOnly).toBe(true);
    expect(plan.blockers).toEqual([
      {
        code: "local-target-guard-missing",
        message: "Local filesystem backup targets require a free-disk guard.",
      },
      {
        code: "retention-policy-invalid",
        message: "Storage backup retention must keep at least one restore point.",
      },
    ]);
  });
});
