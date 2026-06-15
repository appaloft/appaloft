import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const resourcePageSource = readFileSync(
  fileURLToPath(new URL("./resources/[resourceId=consoleObjectId]/+page.svelte", import.meta.url)),
  "utf8",
);

describe("resource static artifact domains panel", () => {
  test("[RESOURCE-STATIC-DOMAINS-001] offers the normal domain binding flow for static artifacts", () => {
    expect(resourcePageSource).toContain(
      "const domainBindingUsesResourceRouteProvider = $derived(",
    );
    expect(resourcePageSource).toContain('currentAccessRoute?.kind === "static-artifact"');
    expect(resourcePageSource).toContain(
      "domainBindingUsesResourceRouteProvider || (serverId && destinationId)",
    );
    expect(resourcePageSource).not.toContain("isServerlessStaticArtifactAccess");
    expect(resourcePageSource).not.toContain("staticArtifactDomainBindingsUnavailableTitle");
    expect(resourcePageSource).not.toContain("staticArtifactDomainBindingsUnavailableDescription");
    expect(resourcePageSource).not.toContain("data-resource-static-artifact-domain-unavailable");
    expect(resourcePageSource).toContain("data-resource-domain-binding-create-dialog");
    expect(resourcePageSource).toContain("onsubmit={createResourceDomainBinding}");
    expect(resourcePageSource).toContain(
      "...(serverId && destinationId ? { serverId, destinationId } : {})",
    );
    expect(resourcePageSource).not.toContain('id="resource-domain-binding-create-form"');
    expect(resourcePageSource).not.toContain(
      "disabled={isResourceArchived || domainBindingUsesResourceRouteProvider}",
    );
  });
});
