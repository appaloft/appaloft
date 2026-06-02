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
});
