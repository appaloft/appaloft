import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import {
  createBlueprintDeployHandoffUrl,
  createBlueprintDetailHref,
  createBlueprintMarketplaceEndpoint,
  defaultBlueprintMarketplaceListEndpoint,
} from "../src/url";

describe("Blueprint marketplace web URLs", () => {
  test("builds catalog endpoints without owning catalog data", () => {
    expect(defaultBlueprintMarketplaceListEndpoint).toBe("/cloud/marketplace/blueprints");
    expect(createBlueprintMarketplaceEndpoint("", "/cloud/marketplace/blueprints")).toBe(
      "/cloud/marketplace/blueprints",
    );
    expect(
      createBlueprintMarketplaceEndpoint(
        "https://app.example.test/",
        "/cloud/marketplace/blueprints",
      ),
    ).toBe("https://app.example.test/cloud/marketplace/blueprints");
  });

  test("builds deploy handoff and detail URLs", () => {
    expect(createBlueprintDetailHref("/marketplace", "pocketbase")).toBe("/marketplace/pocketbase");
    expect(
      createBlueprintDeployHandoffUrl({
        deployBaseUrl: "https://app.example.test/",
        sourceExtension: "blueprint-marketplace",
        slug: "pocketbase",
        title: "PocketBase",
      }),
    ).toBe(
      "https://app.example.test/deploy?source=blueprint&sourceExtension=blueprint-marketplace&blueprintSlug=pocketbase&blueprintTitle=PocketBase&step=project&projectMode=new&projectName=PocketBase",
    );
  });

  test("keeps product icon and primary button visuals in the shared component", async () => {
    const source = await readFile(
      new URL("../src/BlueprintMarketplacePage.svelte", import.meta.url),
      "utf8",
    );

    expect(source).toContain("class:has-image={hasIconImage(item)}");
    expect(source).toContain("markIconFailed(item)");
    expect(source).toContain("--marketplace-primary: #4e84ff");
    expect(source).toContain("background: white;");
    expect(source).toContain("hasIconImage(item) ? undefined : iconFallbackStyle(item)");
  });
});
