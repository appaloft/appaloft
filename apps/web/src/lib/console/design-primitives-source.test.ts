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

    expect(layoutCss).toContain("border: 1px solid var(--border)");
    expect(layoutCss).toContain('[data-sidebar="menu-button"][data-active="true"]');
    expect(layoutCss).toContain("box-shadow: inset 2px 0 0 var(--sidebar-primary)");
    expect(layoutCss).toContain("background: var(--sidebar-primary)");
    expect(layoutCss).toContain("background: color-mix(in oklch, var(--primary) 5%, var(--card))");
    expect(emptyStateSource).toContain("border border-dashed bg-card");
  });

  test("keeps ordinary subtle panels neutral instead of giving empty states a danger tint", async () => {
    const layoutCss = await readFile(new URL("../../routes/layout.css", import.meta.url), "utf8");
    const subtlePanelSource = layoutCss.match(/\.console-subtle-panel\s*\{([\s\S]*?)\}/)?.[1] ?? "";

    expect(subtlePanelSource).toContain("background: var(--card)");
    expect(subtlePanelSource).not.toMatch(/destructive|red|rose|pink|color-mix/);
  });
});
