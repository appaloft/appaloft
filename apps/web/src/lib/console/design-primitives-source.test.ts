import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("community design primitives CSS source", () => {
  test("includes package UI primitives in the Web Tailwind scan", async () => {
    const layoutCss = await readFile(new URL("../../routes/layout.css", import.meta.url), "utf8");

    expect(layoutCss).toContain('@source "../../../../packages/ui/src";');
    expect(layoutCss).toContain('@source "../../../../packages/blueprint-marketplace-web/src";');
  });

  test("does not define a second stronger generic border token for console panels", async () => {
    const layoutCss = await readFile(new URL("../../routes/layout.css", import.meta.url), "utf8");
    const homeSource = await readFile(
      new URL("../../routes/+page.svelte", import.meta.url),
      "utf8",
    );

    expect(layoutCss).not.toContain("--border-visible");
    expect(homeSource).not.toContain("--border-visible");
  });

  test("keeps console hierarchy on semantic surfaces and an active navigation rail", async () => {
    const layoutCss = await readFile(new URL("../../routes/layout.css", import.meta.url), "utf8");
    const emptyStateSource = await readFile(
      new URL("../components/console/ConsoleEmptyState.svelte", import.meta.url),
      "utf8",
    );

    expect(layoutCss).toContain("border: 1px solid var(--divider)");
    expect(layoutCss).toContain('[data-sidebar="menu-button"][data-active="true"]');
    expect(layoutCss).toContain("box-shadow: inset 2px 0 0 var(--sidebar-primary)");
    expect(layoutCss).toContain("background: var(--sidebar-primary)");
    expect(layoutCss).toContain(
      "background: color-mix(in oklch, var(--primary) 5%, var(--surface))",
    );
    expect(emptyStateSource).toContain("border border-dashed bg-card");
  });

  test("keeps ordinary subtle panels neutral instead of giving empty states a danger tint", async () => {
    const layoutCss = await readFile(new URL("../../routes/layout.css", import.meta.url), "utf8");
    const subtlePanelSource = layoutCss.match(/\.console-subtle-panel\s*\{([\s\S]*?)\}/)?.[1] ?? "";

    expect(subtlePanelSource).toContain("background: var(--surface-subtle)");
    expect(subtlePanelSource).not.toMatch(/destructive|red|rose|pink|color-mix/);
  });

  test("[CLOUD-WWW-SHADCN-SYSTEM-018] keeps status borders visible and non-error feedback free of pink", async () => {
    const statusBadgeSource = await readFile(
      new URL("../components/console/DeploymentStatusBadge.svelte", import.meta.url),
      "utf8",
    );
    const feedbackSources = await Promise.all(
      [
        "../components/console/OperationProgressPanel.svelte",
        "../components/console/QuickDeployProgressDialog.svelte",
        "../components/console/DeploymentProgressTerminal.svelte",
      ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
    );

    expect(statusBadgeSource).toContain("border-emerald-200 bg-emerald-50");
    expect(statusBadgeSource).toContain("border-amber-200 bg-amber-50");
    expect(statusBadgeSource).toContain("border-red-200 bg-red-50");
    expect(statusBadgeSource).not.toContain("border-transparent");
    expect(feedbackSources.join("\n")).not.toMatch(/pink|rose|fuchsia|#ef476f/i);
  });

  test("[CLOUD-WWW-SHADCN-SYSTEM-018] renders profile diagnostics as divided records with semantic severity badges", async () => {
    const resourcePageSource = await readFile(
      new URL("../../routes/resources/[resourceId=consoleObjectId]/+page.svelte", import.meta.url),
      "utf8",
    );

    expect(resourcePageSource).toContain("data-resource-profile-diagnostics");
    expect(resourcePageSource).toContain(
      'class="divide-y border-t" data-resource-profile-diagnostic-list',
    );
    expect(resourcePageSource).toContain("data-resource-profile-diagnostic");
    expect(resourcePageSource).toContain("border-blue-200 bg-blue-50 text-blue-700");
    expect(resourcePageSource).toContain("border-amber-200 bg-amber-50 text-amber-800");
    expect(resourcePageSource).toContain("border-red-200 bg-red-50 text-red-700");
  });

  test("[APPALOFT-WEB-ILLUSTRATION-001] uses decorative human workplace illustrations for collection empty states", async () => {
    const emptyStateSource = await readFile(
      new URL("../components/console/ConsoleEmptyState.svelte", import.meta.url),
      "utf8",
    );

    expect(emptyStateSource).toContain("illustrationForTone");
    expect(emptyStateSource).toContain("/illustrations/console-empty-workstation.png");
    expect(emptyStateSource).toContain("/illustrations/console-empty-infrastructure.png");
    expect(emptyStateSource).toContain('alt=""');
    expect(emptyStateSource).not.toContain("<svg");
  });
});
