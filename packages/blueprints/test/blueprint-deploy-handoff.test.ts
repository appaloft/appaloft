import { describe, expect, test } from "bun:test";
import {
  createBlueprintDeployHandoffUrl,
  createDeployButtonBadgeUrl,
  createDeployButtonMarkdown,
} from "../src";

describe("Blueprint deploy handoff URLs", () => {
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
      "https://app.appaloft.com/deploy?source=blueprint&sourceExtension=cloud-blueprint-marketplace&blueprintSlug=pocketbase&blueprintTitle=PocketBase&blueprintVariant=sqlite&blueprintProfile=production&step=project&projectMode=new&projectName=PocketBase",
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
      "/deploy?source=blueprint&blueprintUrl=https%3A%2F%2Fexample.com%2Fappaloft.blueprint.yaml&blueprintTitle=Example+App&step=source&projectMode=new&projectName=Example+App",
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
      "[![Deploy on Appaloft](https://appaloft.com/badge/deploy.svg)](https://app.appaloft.com/deploy?source=blueprint&sourceExtension=cloud-blueprint-marketplace&blueprintSlug=n8n&blueprintTitle=n8n&step=project&projectMode=new&projectName=n8n)",
    );
  });
});
