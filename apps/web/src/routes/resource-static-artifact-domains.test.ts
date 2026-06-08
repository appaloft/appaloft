import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const resourcePageSource = readFileSync(
  fileURLToPath(new URL("./resources/[resourceId]/+page.svelte", import.meta.url)),
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
      "{#if isServerlessStaticArtifactAccess}\n                  <div",
    );
    expect(resourcePageSource).toContain(
      '{:else}\n                  <form\n                    id="resource-domain-binding-create-form"',
    );
  });
});
