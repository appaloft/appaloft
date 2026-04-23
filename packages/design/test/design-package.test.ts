import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import { designPackage, productIdentity } from "../src/index";

describe("design package", () => {
  test("exports the product identity from the canonical design package", () => {
    expect(productIdentity.name).toBe("Appaloft");
    expect(designPackage.cssEntrypoints.web).toBe("@appaloft/design/styles/web.css");
    expect(designPackage.cssEntrypoints.docs).toBe("@appaloft/design/styles/docs.css");
    expect(designPackage.cssEntrypoints.www).toBe("@appaloft/design/styles/www.css");
  });

  test("keeps Web semantic tokens available for Tailwind consumers", async () => {
    const tokensCss = await readFile(new URL("../styles/tokens.css", import.meta.url), "utf8");
    const tailwindCss = await readFile(new URL("../styles/tailwind.css", import.meta.url), "utf8");

    for (const token of ["--primary", "--background", "--foreground", "--ring", "--radius"]) {
      expect(tokensCss).toContain(token);
      expect(tailwindCss).toContain(token);
    }
  });
});
