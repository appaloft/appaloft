import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("console layout classes", () => {
  test("[CONSOLE-SUBNAV-001] secondary navigation owns full-bleed shell padding compensation", async () => {
    const source = await readFile(new URL("./layout-classes.ts", import.meta.url), "utf8");

    const detailSubnavClass =
      source.match(/export const detailTabPanelSubnavClass =\n {2}"([^"]+)";/)?.[1] ?? "";
    const shellSubnavClass =
      source.match(/export const subnavLayoutClass =\n {2}"([^"]+)";/)?.[1] ?? "";

    expect(detailSubnavClass).toContain("-mx-4");
    expect(detailSubnavClass).toContain("w-[calc(100%+2rem)]");
    expect(detailSubnavClass).toContain("md:-mx-6");
    expect(detailSubnavClass).toContain("md:w-[calc(100%+3rem)]");
    expect(shellSubnavClass).toContain("-m-4");
    expect(shellSubnavClass).toContain("w-[calc(100%+2rem)]");
    expect(shellSubnavClass).toContain("md:-m-6");
    expect(shellSubnavClass).toContain("md:w-[calc(100%+3rem)]");
  });
});
