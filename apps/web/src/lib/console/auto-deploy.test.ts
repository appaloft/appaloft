import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("resource auto-deploy console settings", () => {
  test("[RES-DETAIL-IA-001] Resource detail groups owner surfaces into primary tabs and secondary sections", async () => {
    const source = await readFile(
      new URL("../../routes/resources/[resourceId]/+page.svelte", import.meta.url),
      "utf8",
    );

    const tabsBlock =
      source.match(/const resourceDetailTabs = \[([\s\S]*?)\] as const;/)?.[1] ?? "";

    expect(tabsBlock).toContain('"overview"');
    expect(tabsBlock).toContain('"deployments"');
    expect(tabsBlock).toContain('"runtime"');
    expect(tabsBlock).toContain('"networking"');
    expect(tabsBlock).toContain('"configuration"');
    expect(source).not.toContain('value="settings"');
    expect(tabsBlock).toContain('"dependencies"');
    expect(tabsBlock).toContain('"jobs"');
    expect(tabsBlock).toContain('"settings"');
    expect(source).toContain(
      'const resourceRuntimeSections = ["monitor", "logs", "terminal"] as const;',
    );
    expect(source).toContain(
      'const resourceNetworkingSections = ["access", "domains", "proxy"] as const;',
    );
    expect(source).toContain('"profile",\n    "configuration",\n    "auto-deploy",\n    "health"');
    expect(source).toContain(
      'const resourceDependenciesSections = ["dependencies", "storage"] as const;',
    );
    expect(source).toContain(
      'const resourceJobsSections = ["scheduled-tasks", "source-events", "previews"] as const;',
    );
    expect(source).toContain('"general",\n    "diagnostics",\n    "danger"');
    expect(source).toContain('logs: "logs"');
    expect(source).toContain('domains: "domains"');
    expect(source).toContain('environment: "profile"');
    expect(source).toContain('usage: "monitor"');
    expect(source).toContain("{#each resourceDetailTabs as tab (tab)}");
    expect(source).toContain("href={resourceTabHref(tab)}");
    expect(source).toContain("onclick={(event) => selectResourceTab(tab, event)}");
    expect(source).toContain('{#if activeTab === "deployments"}');
    expect(source).toContain('{:else if activeTab === "overview"}');
    expect(source).toContain('{:else if activeTab === "runtime"}');
    expect(source).not.toContain("Tabs.Content");
    expect(source).not.toContain("activeResourceContentTab");
    expect(source).toContain(
      'class="grid min-w-0 border-b lg:min-h-[42rem] lg:grid-cols-[10.5rem_minmax(0,1fr)]"',
    );
    expect(source).toContain(
      '<aside class="min-w-0 border-b bg-background lg:border-b-0 lg:border-r">',
    );
    expect(source).toContain('activeSettingsSection === "danger"');
    expect(source).toContain('id="resource-danger-zone"');
  });

  test("[SRC-AUTO-ENTRY-001] Resource detail exposes auto-deploy settings over the shared command", async () => {
    const source = await readFile(
      new URL("../../routes/resources/[resourceId]/+page.svelte", import.meta.url),
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
