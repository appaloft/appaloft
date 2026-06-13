import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const resourcePageSource = readFileSync(
  fileURLToPath(new URL("./resources/[resourceId=consoleObjectId]/+page.svelte", import.meta.url)),
  "utf8",
);

describe("resource static artifact domains panel", () => {
  test("[RESOURCE-STATIC-DOMAINS-001] does not offer server-backed binding for serverless static artifacts", () => {
    expect(resourcePageSource).toContain("const isServerlessStaticArtifactAccess = $derived(");
    expect(resourcePageSource).toContain('currentAccessRoute?.kind === "static-artifact"');
    expect(resourcePageSource).toContain("!isServerlessStaticArtifactAccess &&");
    expect(resourcePageSource).toContain(
      "i18nKeys.console.resources.staticArtifactDomainBindingsUnavailableTitle",
    );
    expect(resourcePageSource).toContain(
      "i18nKeys.console.resources.staticArtifactDomainBindingsUnavailableDescription",
    );
    expect(resourcePageSource).toContain("data-resource-static-artifact-domain-unavailable");
    expect(resourcePageSource).toContain(
      "{#if isServerlessStaticArtifactAccess}\n                      <div",
    );
    expect(resourcePageSource).toContain("data-resource-domain-binding-create-dialog");
    expect(resourcePageSource).toContain("onsubmit={createResourceDomainBinding}");
    expect(resourcePageSource).not.toContain('id="resource-domain-binding-create-form"');
    expect(resourcePageSource).not.toContain(
      "disabled={isResourceArchived || isServerlessStaticArtifactAccess}",
    );
  });
});
