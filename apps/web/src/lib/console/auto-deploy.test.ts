import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("resource auto-deploy console settings", () => {
  test("[RES-DETAIL-IA-001] Resource detail removes the settings top-level tab and promotes overlapping sections", async () => {
    const source = await readFile(
      new URL("../../routes/resources/[resourceId]/+page.svelte", import.meta.url),
      "utf8",
    );

    const tabsBlock =
      source.match(/const resourceDetailTabs = \[([\s\S]*?)\] as const;/)?.[1] ?? "";

    expect(tabsBlock).not.toContain('"settings"');
    expect(source).not.toContain('value="settings"');
    expect(source).toContain('"dependencies"');
    expect(source).toContain('activeTab === "dependencies"');
    expect(source).toContain('case "configuration":');
    expect(source).toContain('return "environment";');
    expect(source).toContain('case "usage":');
    expect(source).toContain('return "monitor";');
    expect(source).toContain('deprecatedTab !== "settings"');
    expect(source).toContain("sectionMovedToTopTab");
    expect(source).toContain('value="overview"');
    expect(source).toContain('showResourceOverviewNavigation ? "" : "pt-5"');
    expect(source).toContain(
      '? "grid min-w-0 border-b lg:min-h-[42rem] lg:grid-cols-[10.5rem_minmax(0,1fr)]"',
    );
    expect(source).toContain(
      '<aside class="min-w-0 border-b bg-background lg:border-b-0 lg:border-r">',
    );
    expect(source).toContain('showResourceOverviewNavigation ? "space-y-8 p-5" : "space-y-8"');
    expect(source).toContain(
      '"profile" | "auto-deploy" | "storage" | "health" | "proxy" | "diagnostics"',
    );
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
