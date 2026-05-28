import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import { webDocsHrefs } from "./docs-help";

describe("dependency resource Web console surface", () => {
  test("[DEP-RES-WEB-001] exposes dependency resources and bindings through shared oRPC contracts", async () => {
    const [
      resourcePageSource,
      dependencyResourcePageSource,
      clientContractSource,
      projectCreateFormSource,
      environmentCreateFormSource,
      serverCreateFormSource,
      projectsPageSource,
      serverCreatePageSource,
      quickDeploySource,
    ] = await Promise.all([
      readFile(
        new URL("../../routes/resources/[resourceId]/+page.svelte", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../../routes/dependency-resources/+page.svelte", import.meta.url), "utf8"),
      readFile(
        new URL("../../../../../packages/orpc/src/client-contract.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../components/console/ProjectCreateForm.svelte", import.meta.url), "utf8"),
      readFile(
        new URL("../components/console/EnvironmentCreateForm.svelte", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../components/console/ServerCreateForm.svelte", import.meta.url), "utf8"),
      readFile(new URL("../../routes/projects/+page.svelte", import.meta.url), "utf8"),
      readFile(new URL("../../routes/servers/new/+page.svelte", import.meta.url), "utf8"),
      readFile(new URL("../components/console/QuickDeploySheet.svelte", import.meta.url), "utf8"),
    ]);

    expect(resourcePageSource).toContain("orpcClient.dependencyResources.list");
    expect(resourcePageSource).toContain("orpcClient.dependencyResources.provision");
    expect(resourcePageSource).toContain("orpcClient.dependencyResources.import");
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
    expect(dependencyResourcePageSource).toContain(
      "i18nKeys.console.dependencyResources.kindMysql",
    );
    expect(dependencyResourcePageSource).toContain(
      "i18nKeys.console.dependencyResources.kindClickHouse",
    );
    expect(dependencyResourcePageSource).toContain(
      "i18nKeys.console.dependencyResources.kindObjectStorage",
    );
    expect(dependencyResourcePageSource).toContain(
      "i18nKeys.console.dependencyResources.kindOpenSearch",
    );
    expect(dependencyResourcePageSource).toContain('from "@thesvg/icons/postgresql"');
    expect(dependencyResourcePageSource).toContain('from "@thesvg/icons/redis"');
    expect(dependencyResourcePageSource).toContain('from "@thesvg/icons/mysql"');
    expect(dependencyResourcePageSource).toContain('from "@thesvg/icons/clickhouse"');
    expect(dependencyResourcePageSource).toContain('from "@thesvg/icons/minio"');
    expect(dependencyResourcePageSource).toContain('from "@thesvg/icons/opensearch"');
    expect(dependencyResourcePageSource).toContain('brandIcon(mysqlIcon, "light")');
    expect(dependencyResourcePageSource).toContain("{@html icon.svg}");
    expect(dependencyResourcePageSource).not.toContain("background-color: ${iconColor");
    expect(dependencyResourcePageSource).not.toContain("simple-icons");
    expect(dependencyResourcePageSource).toContain("aria-pressed={createKind === dependencyKind}");
    expect(dependencyResourcePageSource).toContain("aria-pressed={provisioningMode === mode}");
    expect(dependencyResourcePageSource).not.toContain("<Select.Item value={dependencyKind}");
    expect(dependencyResourcePageSource).toContain(
      "orpcClient.dependencyResources.provisioning.plan",
    );
    expect(dependencyResourcePageSource).toContain(
      "orpcClient.dependencyResources.provisioning.accept",
    );
    expect(dependencyResourcePageSource).toContain(
      'import ProjectCreateForm from "$lib/components/console/ProjectCreateForm.svelte"',
    );
    expect(dependencyResourcePageSource).toContain(
      'import EnvironmentCreateForm from "$lib/components/console/EnvironmentCreateForm.svelte"',
    );
    expect(dependencyResourcePageSource).toContain(
      'import ServerCreateForm from "$lib/components/console/ServerCreateForm.svelte"',
    );
    expect(dependencyResourcePageSource).toContain("projectCreateDialogOpen");
    expect(dependencyResourcePageSource).toContain("environmentCreateDialogOpen");
    expect(dependencyResourcePageSource).toContain("serverCreateDialogOpen");
    expect(dependencyResourcePageSource).toContain("openEnvironmentAfterProjectCreate");
    expect(dependencyResourcePageSource).toContain("onclick={openProjectCreateDialog}");
    expect(dependencyResourcePageSource).toContain("onclick={openEnvironmentCreateDialog}");
    expect(dependencyResourcePageSource).toContain("onclick={openServerCreateDialog}");
    expect(dependencyResourcePageSource).toContain(
      "aria-label={$t(i18nKeys.console.dependencyResources.selectProject)}",
    );
    expect(dependencyResourcePageSource).toContain(
      "aria-label={$t(i18nKeys.console.dependencyResources.selectEnvironment)}",
    );
    expect(dependencyResourcePageSource).toContain(
      "aria-label={$t(i18nKeys.console.dependencyResources.selectServer)}",
    );
    expect(
      dependencyResourcePageSource.indexOf('id="dependency-resource-name-input"'),
    ).toBeLessThan(
      dependencyResourcePageSource.indexOf(
        "aria-label={$t(i18nKeys.console.dependencyResources.selectProject)}",
      ),
    );
    expect(dependencyResourcePageSource).toContain(
      '<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">',
    );
    expect(dependencyResourcePageSource).toContain("showIntro={false}");
    expect(dependencyResourcePageSource).toContain(
      "$t(i18nKeys.console.dependencyResources.selectProject)",
    );
    expect(dependencyResourcePageSource).toContain(
      "$t(i18nKeys.console.dependencyResources.selectEnvironment)",
    );
    expect(dependencyResourcePageSource).toContain(
      "$t(i18nKeys.console.dependencyResources.selectServer)",
    );
    expect(dependencyResourcePageSource).not.toContain(
      '<Select.Trigger class="w-full">{projectName(selectedProjectId)}</Select.Trigger>',
    );
    expect(dependencyResourcePageSource).not.toContain(
      '<Select.Trigger class="w-full">{environmentName(selectedEnvironmentId)}</Select.Trigger>',
    );
    expect(dependencyResourcePageSource).toContain('mode: "reuse"');
    expect(dependencyResourcePageSource).toContain("reuseConnectionUrl");
    expect(dependencyResourcePageSource).not.toContain(
      "i18nKeys.console.dependencyResources.createUnavailable",
    );
    expect(dependencyResourcePageSource).not.toContain("selectedDependencyKindOption.provision");
    expect(clientContractSource).toContain("dependencyResources: {");
    expect(clientContractSource).toContain("provisioning: {");
    expect(clientContractSource).toContain("plan: Client");
    expect(clientContractSource).toContain("accept: Client");
    expect(clientContractSource).toContain("status: Client");
    expect(clientContractSource).toContain("dependencyBindings: {");
    expect(clientContractSource).toContain("provision: Client");
    expect(clientContractSource).toContain("import: Client");
    expect(clientContractSource).not.toMatch(/provision(Postgres|Redis): Client/);
    expect(clientContractSource).not.toMatch(/import(Postgres|Redis): Client/);
    expect(clientContractSource).toContain("rename: Client");
    expect(clientContractSource).toContain("delete: Client");
    expect(clientContractSource).toContain("createBackup: Client");
    expect(clientContractSource).toContain("listBackups: Client");
    expect(clientContractSource).toContain("restoreBackup: Client");
    expect(clientContractSource).toContain("bind: Client");
    expect(clientContractSource).toContain("unbind: Client");
    expect(clientContractSource).toContain("rotateSecret: Client");
    expect(projectCreateFormSource).toContain("orpcClient.projects.create");
    expect(projectCreateFormSource).toContain(
      "onCreated?: (project: CreateProjectResponse) => void",
    );
    expect(environmentCreateFormSource).toContain("orpcClient.environments.create");
    expect(environmentCreateFormSource).toContain(
      "onCreated?: (environment: CreateEnvironmentResponse) => void",
    );
    expect(serverCreateFormSource).toContain("ServerRegistrationForm");
    expect(serverCreateFormSource).toContain("orpcClient.servers.create");
    expect(serverCreateFormSource).toContain(
      "onCreated?: (server: RegisterServerResponse) => void",
    );
    expect(projectsPageSource).toContain(
      'import ProjectCreateForm from "$lib/components/console/ProjectCreateForm.svelte"',
    );
    expect(projectsPageSource).toContain("<ProjectCreateForm onCreated={openCreatedProject} />");
    expect(serverCreatePageSource).toContain(
      'import ServerCreateForm from "$lib/components/console/ServerCreateForm.svelte"',
    );
    expect(serverCreatePageSource).toContain("<ServerCreateForm showSuccessLink />");
    expect(quickDeploySource).toContain('from "$lib/console/environment-form"');
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
