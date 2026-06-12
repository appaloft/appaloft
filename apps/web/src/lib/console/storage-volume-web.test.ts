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

    expect(resourcePageSource).toContain("orpcClient.storageVolumes.list");
    expect(resourcePageSource).toContain("orpcClient.storageVolumes.create");
    expect(resourcePageSource).toContain("orpcClient.storageVolumes.rename");
    expect(resourcePageSource).not.toContain("orpcClient.storageVolumes.delete");
    expect(resourcePageSource).toContain("orpcClient.storageVolumes.cleanupRuntime");
    expect(resourcePageSource).toContain("orpcClient.storageVolumes.backups.plan");
    expect(resourcePageSource).toContain("orpcClient.storageVolumes.backups.create");
    expect(resourcePageSource).toContain("orpcClient.storageVolumes.backups.list");
    expect(resourcePageSource).toContain("orpcClient.storageVolumes.backups.restore");
    expect(resourcePageSource).toContain("orpcClient.storageVolumes.backups.prune");
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
    expect(resourcePageSource).toContain('activeSettingsSection === "storage"');
    expect(resourcePageSource).not.toContain("Tabs.Content");
    expect(resourcePageSource).toContain('id="resource-storage"');
    expect(resourcePageSource).toContain(
      "i18nKeys.console.resources.storageVolumeBackupSummaryTitle",
    );
    expect(resourcePageSource).toContain(
      "i18nKeys.console.resources.storageVolumeBackupSummaryDescription",
    );
    expect(resourcePageSource).toContain('resourceSettingsSectionHref("storage")');
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
    expect(resourcePageSource).not.toContain("i18nKeys.console.resources.storageBackupTitle");
    expect(resourcePageSource).toContain("storageBackupPlan");
    expect(resourcePageSource).toContain("storageVolumeBackups");
    expect(resourcePageSource).not.toContain(
      "i18nKeys.console.resources.storageRuntimeCleanupTitle",
    );
    const resourceStorageSource = resourcePageSource.slice(
      resourcePageSource.indexOf('id="resource-storage"'),
      resourcePageSource.indexOf('id="resource-diagnostics"'),
    );
    expect(resourceStorageSource).not.toContain("<form");
    expect(resourceStorageSource).not.toContain("<Input");
    expect(resourceStorageSource).not.toContain("<Select.Root");
    expect(resourceStorageSource).not.toContain('type="submit"');
    expect(resourceStorageSource).not.toContain("openStorageBackupDialog");
    expect(resourceStorageSource).not.toContain("openStorageRuntimeCleanupDialog");
    expect(resourceStorageSource).not.toContain("storageBackupPlanAction");
    expect(resourceStorageSource).not.toContain("storageBackupCreateAction");
    expect(resourceStorageSource).not.toContain("storageBackupRestoreAction");
    expect(resourceStorageSource).not.toContain("storageBackupPruneAction");
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
