import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import { webDocsHrefs } from "./docs-help";

describe("storage volume Web console surface", () => {
  test("[STOR-WEB-001] [STOR-WEB-002] [STOR-WEB-003] exposes resource storage through shared oRPC contracts", async () => {
    const [resourcePageSource, clientContractSource] = await Promise.all([
      readFile(
        new URL("../../routes/resources/[resourceId]/+page.svelte", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../../../../packages/orpc/src/client-contract.ts", import.meta.url),
        "utf8",
      ),
    ]);

    expect(resourcePageSource).toContain("orpcClient.storageVolumes.list");
    expect(resourcePageSource).toContain("orpcClient.storageVolumes.create");
    expect(resourcePageSource).toContain("orpcClient.storageVolumes.rename");
    expect(resourcePageSource).toContain("orpcClient.storageVolumes.delete");
    expect(resourcePageSource).toContain("orpcClient.storageVolumes.cleanupRuntime");
    expect(resourcePageSource).toContain("orpcClient.storageVolumes.backups.plan");
    expect(resourcePageSource).toContain("orpcClient.storageVolumes.backups.create");
    expect(resourcePageSource).toContain("orpcClient.storageVolumes.backups.list");
    expect(resourcePageSource).toContain("orpcClient.storageVolumes.backups.restore");
    expect(resourcePageSource).toContain("orpcClient.storageVolumes.backups.prune");
    expect(resourcePageSource).toContain("orpcClient.resources.attachStorage");
    expect(resourcePageSource).toContain("orpcClient.resources.detachStorage");
    expect(resourcePageSource).toContain("resourceStorageAttachments");
    expect(resourcePageSource).toContain("i18nKeys.console.resources.storageTitle");
    expect(resourcePageSource).toContain("storageAttachmentApplicationDataLabel(attachment)");
    expect(resourcePageSource).toContain("i18nKeys.console.resources.storageOverviewTitle");
    expect(resourcePageSource).toContain("storageAttachmentVolumeLabel(attachment)");
    expect(resourcePageSource).toContain("attachment.storageVolumeId");
    expect(resourcePageSource).toContain("attachment.destinationPath");
    expect(resourcePageSource).toContain("storageMountModeLabel(attachment.mountMode)");
    expect(resourcePageSource).toContain(
      "i18nKeys.console.resources.storageOverviewBackupManageAction",
    );
    expect(resourcePageSource).toContain('id="resource-mounted-storage-overview"');
    expect(resourcePageSource).toContain('resourceSettingsSectionHref("storage")');
    const mountedStorageOverviewSource = resourcePageSource.slice(
      resourcePageSource.indexOf('id="resource-mounted-storage-overview"'),
      resourcePageSource.indexOf('<aside class="space-y-5">'),
    );
    expect(mountedStorageOverviewSource).not.toContain("dependency-resources.create-backup");
    expect(mountedStorageOverviewSource).not.toContain("dependencyResources.createBackup");
    expect(resourcePageSource).toContain("i18nKeys.console.resources.storageVolumeManagementTitle");
    expect(resourcePageSource).toContain("i18nKeys.console.resources.storageBackupTitle");
    expect(resourcePageSource).toContain("storageBackupPlan");
    expect(resourcePageSource).toContain("storageVolumeBackups");
    expect(resourcePageSource).toContain("i18nKeys.console.resources.storageRuntimeCleanupTitle");
    expect(resourcePageSource).toContain("cleanupStorageRuntimeMutation");
    expect(resourcePageSource).toContain("cleanupStorageRuntime(true)");
    expect(resourcePageSource).toContain("cleanupStorageRuntime(false)");
    expect(resourcePageSource).toContain("webDocsHrefs.storageVolumeLifecycle");
    expect(clientContractSource).toContain("create: Client");
    expect(clientContractSource).toContain("rename: Client");
    expect(clientContractSource).toContain("delete: Client");
    expect(clientContractSource).toContain("cleanupRuntime: Client");
    expect(clientContractSource).toContain("backups: {");
    expect(clientContractSource).toContain("restorePlan: Client");
    expect(clientContractSource).toContain("attachStorage: Client");
    expect(clientContractSource).toContain("detachStorage: Client");
    expect(clientContractSource).toContain("storageVolumes: {");
  });

  test("[STOR-WEB-001] points resource storage help at the public storage volume anchor", () => {
    expect(webDocsHrefs.storageVolumeLifecycle).toBe(
      "/docs/resources/storage-volumes/#storage-volume-lifecycle",
    );
  });
});
