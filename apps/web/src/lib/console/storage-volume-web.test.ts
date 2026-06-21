import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import { webDocsHrefs } from "./docs-help";

describe("storage volume Web console surface", () => {
  test("[STOR-WEB-001] [STOR-WEB-002] [STOR-WEB-003] exposes resource storage through shared oRPC contracts", async () => {
    const [resourcePageSource, clientContractSource] = await Promise.all([
      readFile(
        new URL(
          "../../routes/resources/[resourceId=consoleObjectId]/+page.svelte",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../../../../../packages/orpc/src/client-contract.ts", import.meta.url),
        "utf8",
      ),
    ]);

    expect(resourcePageSource).toContain("orpc.storageVolumes.list.queryOptions");
    expect(resourcePageSource).toContain("orpcClient.storageVolumes.create");
    expect(resourcePageSource).toContain("orpcClient.storageVolumes.rename");
    expect(resourcePageSource).not.toContain("orpcClient.storageVolumes.delete");
    expect(resourcePageSource).toContain("orpcClient.storageVolumes.cleanupRuntime");
    expect(resourcePageSource).toContain("orpcClient.storageVolumes.backups.plan");
    expect(resourcePageSource).toContain("orpcClient.storageVolumes.backups.create");
    expect(resourcePageSource).toContain("orpc.storageVolumes.backups.list.queryOptions");
    expect(resourcePageSource).toContain("orpcClient.storageVolumes.backups.restore");
    expect(resourcePageSource).toContain("orpcClient.storageVolumes.backups.prune");
    expect(resourcePageSource).toContain('operationKey: "storage-volumes.backup-plan"');
    expect(resourcePageSource).toContain('operationKey: "storage-volumes.create-backup"');
    expect(resourcePageSource).toContain('operationKey: "storage-volumes.restore-backup"');
    expect(resourcePageSource).toContain('operationKey: "storage-volumes.prune-backups"');
    expect(resourcePageSource).toContain("canCreateStorageBackupByCapability");
    expect(resourcePageSource).toContain("canRestoreStorageBackupByCapability");
    expect(resourcePageSource).toContain("canPruneStorageBackupByCapability");
    expect(resourcePageSource).toContain("orpcClient.resources.attachStorage");
    expect(resourcePageSource).not.toContain("orpcClient.resources.detachStorage");
    expect(resourcePageSource).toContain("resourceStorageAttachments");
    expect(resourcePageSource).toContain("i18nKeys.console.resources.storageTitle");
    expect(resourcePageSource).toContain("storageAttachmentApplicationDataLabel(attachment)");
    expect(resourcePageSource).toContain("storageAttachmentVolumeLabel(attachment)");
    expect(resourcePageSource).toContain("attachment.storageVolumeId");
    expect(resourcePageSource).toContain("attachment.destinationPath");
    expect(resourcePageSource).toContain("storageMountModeLabel(attachment.mountMode)");
    expect(resourcePageSource).toContain(
      'const resourceDependenciesSections = ["dependencies", "storage"] as const;',
    );
    expect(resourcePageSource).toContain('activeTab === "dependencies"');
    expect(resourcePageSource).toContain('case "storage":\n        return "dependencies";');
    expect(resourcePageSource).toContain("resourceSectionsForTab(activeTab)");
    expect(resourcePageSource).toContain("href={resourceSectionHref(section)}");
    expect(resourcePageSource).not.toContain("Tabs.Content");
    expect(resourcePageSource).toContain('id="resource-storage"');
    expect(resourcePageSource).toContain(
      "i18nKeys.console.resources.storageVolumeBackupSummaryTitle",
    );
    expect(resourcePageSource).toContain("i18nKeys.console.resources.storageBackupTitle");
    expect(resourcePageSource).toContain("i18nKeys.console.resources.storageBackupDescription");
    const resourceOverviewSource = resourcePageSource.slice(
      resourcePageSource.indexOf('id="resource-overview"'),
      resourcePageSource.indexOf('id="resource-settings-general"'),
    );
    expect(resourceOverviewSource).not.toContain("storageVolumeBackups");
    expect(resourceOverviewSource).not.toContain("storageBackupPlan");
    expect(resourceOverviewSource).not.toContain('id="resource-storage"');
    expect(resourcePageSource).not.toContain(
      "i18nKeys.console.resources.storageVolumeManagementTitle",
    );
    expect(resourcePageSource).toContain("storageBackupPlan");
    expect(resourcePageSource).toContain("storageVolumeBackups");
    expect(resourcePageSource).not.toContain(
      "i18nKeys.console.resources.storageRuntimeCleanupTitle",
    );
    const resourceStorageSource = resourcePageSource.slice(
      resourcePageSource.indexOf('id="resource-storage"'),
      resourcePageSource.indexOf('id="resource-diagnostics"'),
    );
    const storageBackupDialogSource = resourcePageSource.slice(
      resourcePageSource.indexOf("<Dialog.Root bind:open={storageBackupDialogOpen}>"),
      resourcePageSource.indexOf("<Dialog.Root bind:open={configEditorDialogOpen}>"),
    );
    expect(resourceStorageSource).not.toContain("data-resource-storage-backup-form");
    expect(resourceStorageSource).toContain("openStorageBackupDialog()");
    expect(resourceStorageSource).toContain("storageBackupAttachmentOptionLabel");
    expect(storageBackupDialogSource).toContain("<form");
    expect(storageBackupDialogSource).toContain("data-resource-storage-backup-form");
    expect(storageBackupDialogSource).toContain("<Input");
    expect(storageBackupDialogSource).toContain("<Select.Root");
    expect(storageBackupDialogSource).toContain('type="submit"');
    expect(storageBackupDialogSource).toContain('id="resource-storage-backup-data-format"');
    expect(storageBackupDialogSource).not.toContain("bind:value={storageBackupDataFormat}");
    expect(resourceStorageSource).toContain("storageBackupLocalOnly");
    expect(resourceStorageSource).toContain("storageBackupCreateAction");
    expect(storageBackupDialogSource).toContain("storageBackupPlanAction");
    expect(storageBackupDialogSource).toContain("storageBackupCreateAction");
    expect(resourceStorageSource).toContain("storageBackupRestoreAction");
    expect(resourceStorageSource).toContain("storageBackupPruneAction");
    expect(resourceStorageSource).toContain("restoreStorageBackup(backup)");
    expect(resourceStorageSource).toContain("pruneStorageBackup(backup)");
    expect(resourceStorageSource).toContain("openStorageBackupDialog");
    expect(resourceStorageSource).not.toContain("openStorageRuntimeCleanupDialog");
    expect(resourceStorageSource).not.toContain("storageRuntimeCleanupApplyAction");
    expect(resourceStorageSource).not.toContain("storageRuntimeCleanupPreviewAction");
    expect(resourcePageSource).toContain("cleanupStorageRuntimeMutation");
    expect(resourcePageSource).toContain("cleanupStorageRuntime(true)");
    expect(resourcePageSource).not.toContain("cleanupStorageRuntime(false)");
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
