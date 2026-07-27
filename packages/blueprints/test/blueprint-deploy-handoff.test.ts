import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  createBlueprintDeployHandoffUrl,
  createDeployButtonBadgeUrl,
  createDeployButtonMarkdown,
} from "../src/deploy-handoff";

describe("Blueprint deploy handoff URLs", () => {
  test("keeps deploy handoff on its explicit ESM package subpath", () => {
    const rootSource = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    const packageManifest = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { exports?: Record<string, string> };

    expect(rootSource).not.toContain('export * from "./deploy-handoff"');
    expect(packageManifest.exports?.["./deploy-handoff"]).toBe("./src/deploy-handoff.ts");
  });

  test("creates a Cloud catalog Blueprint deploy handoff URL", () => {
    expect(
      createBlueprintDeployHandoffUrl({
        deployBaseUrl: "https://app.appaloft.com/",
        source: {
          kind: "catalog",
          slug: "pocketbase",
          title: "PocketBase",
          sourceExtension: "cloud-blueprint-marketplace",
        },
        profile: "production",
        variant: "sqlite",
      }),
    ).toBe(
      "https://app.appaloft.com/?modal=quick-deploy&source=blueprint&sourceExtension=cloud-blueprint-marketplace&blueprintSlug=pocketbase&blueprintTitle=PocketBase&blueprintVariant=sqlite&blueprintProfile=production&step=project&projectMode=new&projectName=PocketBase",
    );
  });

  test("creates a neutral remote Blueprint URL handoff without Cloud catalog metadata", () => {
    expect(
      createBlueprintDeployHandoffUrl({
        deployBaseUrl: "",
        source: {
          kind: "url",
          url: "https://example.com/appaloft.blueprint.yaml",
          title: "Example App",
        },
        step: "source",
      }),
    ).toBe(
      "/?modal=quick-deploy&source=blueprint&blueprintUrl=https%3A%2F%2Fexample.com%2Fappaloft.blueprint.yaml&blueprintTitle=Example+App&step=source&projectMode=new&projectName=Example+App",
    );
  });

  test("creates Appaloft deploy button badge and Markdown snippets", () => {
    expect(
      createDeployButtonBadgeUrl({
        badgeBaseUrl: "https://appaloft.com",
      }),
    ).toBe("https://appaloft.com/badge/deploy.svg");

    expect(
      createDeployButtonMarkdown({
        badgeBaseUrl: "https://appaloft.com",
        deployBaseUrl: "https://app.appaloft.com",
        source: {
          kind: "catalog",
          slug: "n8n",
          title: "n8n",
          sourceExtension: "cloud-blueprint-marketplace",
        },
      }),
    ).toBe(
      "[![Deploy on Appaloft](https://appaloft.com/badge/deploy.svg)](https://app.appaloft.com/?modal=quick-deploy&source=blueprint&sourceExtension=cloud-blueprint-marketplace&blueprintSlug=n8n&blueprintTitle=n8n&step=project&projectMode=new&projectName=n8n)",
    );
  });
});
