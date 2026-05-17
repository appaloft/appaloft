import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("community design primitives CSS source", () => {
  test("includes package UI primitives in the Web Tailwind scan", async () => {
    const layoutCss = await readFile(new URL("../../routes/layout.css", import.meta.url), "utf8");

    expect(layoutCss).toContain('@source "../../../../packages/ui/src";');
  });
});
