import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const source = (relativePath: string) =>
  readFile(new URL(`../src/${relativePath}`, import.meta.url), "utf8");

describe("semantic surface classes", () => {
  test("keeps cards and editable controls on distinct semantic roles", async () => {
    const [card, input, textarea, selectTrigger] = await Promise.all([
      source("card/card.svelte"),
      source("input/input.svelte"),
      source("textarea/textarea.svelte"),
      source("select/select-trigger.svelte"),
    ]);

    expect(card).toContain("border-divider bg-surface");
    for (const control of [input, textarea, selectTrigger]) {
      expect(control).toContain("border-control");
      expect(control).toContain("bg-surface");
    }
  });

  test("keeps every overlay and nested menu on one visible surface", async () => {
    const overlays = await Promise.all([
      source("dropdown-menu/dropdown-menu-content.svelte"),
      source("dropdown-menu/dropdown-menu-sub-content.svelte"),
      source("select/select-content.svelte"),
      source("popover/popover-content.svelte"),
      source("dialog/dialog-content.svelte"),
      source("sheet/sheet-content.svelte"),
    ]);

    for (const overlay of overlays) {
      expect(overlay).toContain("bg-surface-overlay");
      expect(overlay).toContain("border-divider");
    }
  });
});
