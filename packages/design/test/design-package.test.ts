import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import { appaloftPortableDesignTokens, designPackage, productIdentity } from "../src/index";

describe("design package", () => {
  test("exports the product identity from the canonical design package", () => {
    expect(productIdentity.name).toBe("Appaloft");
    expect(designPackage.cssEntrypoints.web).toBe("@appaloft/design/styles/web.css");
    expect(designPackage.cssEntrypoints.docs).toBe("@appaloft/design/styles/docs.css");
    expect(designPackage.cssEntrypoints.www).toBe("@appaloft/design/styles/www.css");
    expect(designPackage.assets.iconLight).toBe("@appaloft/design/assets/appaloft-icon-light.svg");
  });

  test("keeps Web semantic tokens available for Tailwind consumers", async () => {
    const tokensCss = await readFile(new URL("../styles/tokens.css", import.meta.url), "utf8");
    const tailwindCss = await readFile(new URL("../styles/tailwind.css", import.meta.url), "utf8");

    for (const token of ["--primary", "--background", "--foreground", "--ring", "--radius"]) {
      expect(tokensCss).toContain(token);
      expect(tailwindCss).toContain(token);
    }
  });

  test("gives the Web console a crisp control-plane theme without changing portable tokens", async () => {
    const webCss = await readFile(new URL("../styles/web.css", import.meta.url), "utf8");

    expect(webCss).toContain("--background: #f4f7fb");
    expect(webCss).toContain("--border: #c9d4e3");
    expect(webCss).toContain("--input: #b5c3d6");
    expect(webCss).toContain("--radius: 0.25rem");
  });

  test("exports portable design tokens for non-CSS renderers", () => {
    expect(appaloftPortableDesignTokens.color.primary).toBe("#4e84ff");
    expect(appaloftPortableDesignTokens.color.background).toBe("#ffffff");
    expect(appaloftPortableDesignTokens.radius.lg).toBe("8px");
    expect(appaloftPortableDesignTokens.fontFamily.sans).toContain("IBM Plex Sans");
  });

  test("keeps brand assets available to product surfaces", async () => {
    const icon = await readFile(
      new URL("../assets/appaloft-icon-light.svg", import.meta.url),
      "utf8",
    );

    expect(icon).toContain("<title>Appaloft icon light</title>");
    expect(icon).toContain("#4E84FF");
  });
});
