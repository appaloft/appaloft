import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("resource auto-deploy console settings", () => {
  test("[RES-DETAIL-IA-001] Resource detail groups owner surfaces into primary tabs and secondary sections", async () => {
    const source = await readFile(
      new URL("../../routes/resources/[resourceId=consoleObjectId]/+page.svelte", import.meta.url),
      "utf8",
    );

    const tabsBlock =
      source.match(/const resourceDetailTabs = \[([\s\S]*?)\] as const;/)?.[1] ?? "";

    expect(tabsBlock).toContain('"overview"');
    expect(tabsBlock).toContain('"deployments"');
    expect(tabsBlock).toContain('"monitor"');
    expect(tabsBlock).toContain('"logs"');
    expect(tabsBlock).toContain('"terminal"');
    expect(tabsBlock).toContain('"networking"');
    expect(tabsBlock).toContain('"configuration"');
    expect(source).not.toContain('value="settings"');
    expect(tabsBlock).toContain('"dependencies"');
    expect(tabsBlock).toContain('"previews"');
    expect(tabsBlock).toContain('"jobs"');
    expect(tabsBlock).toContain('"settings"');
    expect(source).not.toContain("resourceRuntimeSections");
    expect(source).toContain(
      'const resourceNetworkingSections = ["access", "domains", "proxy"] as const;',
    );
    expect(source).toContain('"profile",\n    "configuration",\n    "auto-deploy",\n    "health"');
    expect(source).toContain(
      'const resourceDependenciesSections = ["dependencies", "storage"] as const;',
    );
    expect(source).toContain(
      'const resourceJobsSections = ["scheduled-tasks", "source-events"] as const;',
    );
    expect(source).toContain('"general",\n    "diagnostics",\n    "danger"');
    expect(source).not.toContain("resourceLegacyTabSections");
    expect(source).not.toContain("resourceLegacyQuerySections");
    expect(source).toContain("{#each resourceDetailTabs as tab (tab)}");
    expect(source).toContain("href={resourceTabHref(tab)}");
    expect(source).toContain("onclick={(event) => selectResourceTab(tab, event)}");
    expect(source).toContain('from "$lib/console/layout-classes"');
    expect(source).toContain("<div class={detailPageClass}>");
    expect(source).toContain("<div class={detailBodyClass}>");
    expect(source).toContain("detailTabPanelScrollClass");
    expect(source).toContain("detailTabPanelSubnavClass");
    expect(source).toContain('{#if activeTab === "deployments"}');
    expect(source).toContain('{:else if activeTab === "overview"}');
    expect(source).toContain('{:else if activeTab === "previews"}');
    expect(source).toContain('{:else if activeTab === "monitor"}');
    expect(source).toContain('{:else if activeTab === "logs"}');
    expect(source).toContain('{:else if activeTab === "terminal"}');
    expect(source).toContain('logsHref={resourceTabHref("logs")}');
    expect(source).toContain('id="resource-runtime-control"');
    expect(source).toContain('id="resource-runtime-logs"');
    expect(source).not.toContain('activeResourceSection === "logs"');
    expect(source).not.toContain('activeResourceSection === "control"');
    expect(source).not.toContain('activeResourceSection === "terminal"');
    expect(source).not.toContain('activeResourceSection === "previews"');
    expect(source).not.toContain("Tabs.Content");
    expect(source).not.toContain("activeResourceContentTab");
    expect(source).toContain("detailSubnavLayoutClass");
    expect(source).not.toContain("lg:min-h-[42rem]");
    expect(source).not.toContain("lg:grid-cols-[10.5rem_minmax(0,1fr)]");
    expect(source).toContain("<aside class={detailSubnavClass}>");
    expect(source).not.toContain("console-detail-");
    expect(source).not.toContain("console-subnav-");
    expect(source).toContain('activeResourceSection === "danger"');
    expect(source).toContain('id="resource-danger-zone"');
  });

  test("[RES-DETAIL-IA-002] Resource jobs keeps scheduled task creation behind explicit intent", async () => {
    const source = await readFile(
      new URL("../../routes/resources/[resourceId=consoleObjectId]/+page.svelte", import.meta.url),
      "utf8",
    );

    const jobsPanelStart = source.indexOf('{:else if activeTab === "jobs"}');
    const createDialogStart = source.indexOf(
      "<Dialog.Root bind:open={scheduledTaskCreateDialogOpen}>",
    );
    const createFormStart = source.indexOf('id="resource-scheduled-task-create-form"');

    expect(jobsPanelStart).toBeGreaterThanOrEqual(0);
    expect(createDialogStart).toBeGreaterThan(jobsPanelStart);
    expect(createFormStart).toBeGreaterThan(createDialogStart);

    const jobsPanelSource = source.slice(jobsPanelStart, createDialogStart);
    expect(jobsPanelSource).not.toContain('id="resource-scheduled-task-create-form"');
    expect(jobsPanelSource).toContain("onclick={openScheduledTaskCreateDialog}");
    expect(jobsPanelSource).toContain("scheduledTasks.length === 0");
    expect(source).toContain("const resourceScheduledTasksEnabled = $derived");
    expect(source).toContain('activeTab === "jobs"');
    expect(source).toContain('activeResourceSection === "scheduled-tasks"');
    expect(source).toContain("enabled: resourceScheduledTasksEnabled");
  });

  test("[RES-DETAIL-IA-003] Resource deploy intent stays in the resource detail context", async () => {
    const source = await readFile(
      new URL("../../routes/resources/[resourceId=consoleObjectId]/+page.svelte", import.meta.url),
      "utf8",
    );

    expect(source).toContain("function openResourceDeploymentDialog()");
    expect(source).toContain("<Dialog.Root bind:open={deploymentDialogOpen}");
    expect(source).toContain("onOpenChange={setResourceDeploymentDialogOpen}");
    expect(source).toContain("onsubmit={createResourceDeployment}");
    expect(source).toContain("onclick={openResourceDeploymentDialog}");
    expect(source).toContain("createDeploymentWithProgress");
    expect(source).not.toContain("resourceDeploymentHref");
    expect(source).not.toContain("resourceNewDeploymentHref");
  });

  test("[SRC-AUTO-ENTRY-001] Resource detail exposes auto-deploy settings over the shared command", async () => {
    const source = await readFile(
      new URL("../../routes/resources/[resourceId=consoleObjectId]/+page.svelte", import.meta.url),
      "utf8",
    );

    expect(source).toContain('"auto-deploy"');
    expect(source).toContain("orpcClient.resources.configureAutoDeploy");
    expect(source).toContain("ConfigureResourceAutoDeployInput");
    expect(source).toContain("autoDeployGenericWebhookSecretRef");
    expect(source).toContain("acknowledge-source-binding");
    expect(source).toContain("sourceAutoDeploySetup");
    expect(source).toContain("sourceAutoDeploySignatures");
  });
});
