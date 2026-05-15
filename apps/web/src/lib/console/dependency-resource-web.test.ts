import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import { webDocsHrefs } from "./docs-help";

describe("dependency resource Web console surface", () => {
  test("[DEP-RES-WEB-001] exposes dependency resources and bindings through shared oRPC contracts", async () => {
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

    expect(resourcePageSource).toContain("orpcClient.dependencyResources.list");
    expect(resourcePageSource).toContain("orpcClient.dependencyResources.provisionPostgres");
    expect(resourcePageSource).toContain("orpcClient.dependencyResources.provisionRedis");
    expect(resourcePageSource).toContain("orpcClient.dependencyResources.importPostgres");
    expect(resourcePageSource).toContain("orpcClient.dependencyResources.importRedis");
    expect(resourcePageSource).toContain("orpcClient.dependencyResources.rename");
    expect(resourcePageSource).toContain("orpcClient.dependencyResources.delete");
    expect(resourcePageSource).toContain("orpcClient.dependencyResources.createBackup");
    expect(resourcePageSource).toContain("orpcClient.dependencyResources.listBackups");
    expect(resourcePageSource).toContain("orpcClient.dependencyResources.restoreBackup");
    expect(resourcePageSource).toContain("orpcClient.resources.dependencyBindings.list");
    expect(resourcePageSource).toContain("orpcClient.resources.dependencyBindings.bind");
    expect(resourcePageSource).toContain("orpcClient.resources.dependencyBindings.unbind");
    expect(resourcePageSource).toContain("orpcClient.resources.dependencyBindings.rotateSecret");
    expect(resourcePageSource).toContain("dependencyRenameNames");
    expect(resourcePageSource).toContain("dependencyImportConnectionUrl");
    expect(resourcePageSource).toContain("i18nKeys.console.resources.dependencyImportAction");
    expect(resourcePageSource).toContain("dependencyRestoreAcknowledgeDataOverwrite");
    expect(resourcePageSource).toContain("dependencyResources.length === 1");
    expect(resourcePageSource).toContain("bindableDependencyResources.length === 1");
    expect(resourcePageSource).toContain("i18nKeys.console.resources.dependencyBackupTitle");
    expect(resourcePageSource).toContain("resource-dependency-backup-resource-trigger");
    expect(resourcePageSource).toContain("resource-dependency-binding-resource-trigger");
    expect(resourcePageSource).toContain("webDocsHrefs.dependencyBackupRestore");
    expect(resourcePageSource).toContain("i18nKeys.console.resources.dependencyRenameAction");
    expect(resourcePageSource).toContain("i18nKeys.console.resources.dependencyDeleteAction");
    expect(resourcePageSource).toContain("i18nKeys.console.resources.dependencySecretRotateAction");
    expect(resourcePageSource).toContain("dependencyBindingSecretRotationAcks");
    expect(resourcePageSource).toContain("resourceDependencyBindings");
    expect(resourcePageSource).toContain("i18nKeys.console.resources.dependenciesTitle");
    expect(resourcePageSource).toContain("webDocsHrefs.dependencyResourceLifecycle");
    expect(resourcePageSource).toContain("webDocsHrefs.dependencyRuntimeInjection");
    expect(clientContractSource).toContain("dependencyResources: {");
    expect(clientContractSource).toContain("dependencyBindings: {");
    expect(clientContractSource).toContain("provisionPostgres: Client");
    expect(clientContractSource).toContain("provisionRedis: Client");
    expect(clientContractSource).toContain("importPostgres: Client");
    expect(clientContractSource).toContain("importRedis: Client");
    expect(clientContractSource).toContain("rename: Client");
    expect(clientContractSource).toContain("delete: Client");
    expect(clientContractSource).toContain("createBackup: Client");
    expect(clientContractSource).toContain("listBackups: Client");
    expect(clientContractSource).toContain("restoreBackup: Client");
    expect(clientContractSource).toContain("bind: Client");
    expect(clientContractSource).toContain("unbind: Client");
    expect(clientContractSource).toContain("rotateSecret: Client");
  });

  test("[DEP-RES-WEB-001] points dependency help at public lifecycle anchors", () => {
    expect(webDocsHrefs.dependencyResourceLifecycle).toBe(
      "/docs/resources/dependencies/#dependency-resource-lifecycle",
    );
    expect(webDocsHrefs.dependencyRuntimeInjection).toBe(
      "/docs/resources/dependencies/#dependency-runtime-injection",
    );
    expect(webDocsHrefs.dependencyBackupRestore).toBe(
      "/docs/resources/dependencies/#dependency-backup-restore",
    );
  });
});
