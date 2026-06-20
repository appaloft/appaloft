import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("console layout classes", () => {
  test("[CONSOLE-SUBNAV-001] secondary navigation does not depend on shell padding compensation", async () => {
    const source = await readFile(new URL("./layout-classes.ts", import.meta.url), "utf8");

    const detailPanelClass =
      source.match(/export const detailTabPanelScrollClass =\n {2}"([^"]+)";/)?.[1] ?? "";
    const detailSubnavClass =
      source.match(/export const detailTabPanelSubnavClass =\n {2}"([^"]+)";/)?.[1] ?? "";
    const shellSubnavClass =
      source.match(/export const subnavLayoutClass =\n {2}"([^"]+)";/)?.[1] ?? "";

    expect(detailPanelClass).toContain("px-4");
    expect(detailPanelClass).toContain("md:px-6");
    expect(detailSubnavClass).not.toContain("-mx-");
    expect(detailSubnavClass).not.toContain("w-[calc");
    expect(shellSubnavClass).not.toContain("-m-");
    expect(shellSubnavClass).not.toContain("w-[calc");
  });

  test("[CONSOLE-SUBNAV-002] console shell mains leave page padding to content owners", async () => {
    const consoleShellSource = await readFile(
      new URL("../components/console/ConsoleShell.svelte", import.meta.url),
      "utf8",
    );
    const settingsShellSource = await readFile(
      new URL("../components/console/SettingsShell.svelte", import.meta.url),
      "utf8",
    );

    expect(consoleShellSource).toContain(
      '<main data-console-main class="min-h-0 min-w-0 flex-1 overflow-y-auto">',
    );
    expect(settingsShellSource).toContain('<main data-console-main class="min-w-0 flex-1">');
    expect(consoleShellSource).not.toContain(
      'data-console-main class="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 md:p-6"',
    );
    expect(settingsShellSource).not.toContain(
      'data-console-main class="min-w-0 flex-1 p-4 md:p-6"',
    );
  });
});
