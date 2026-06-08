import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const projectPageSource = readFileSync(
  fileURLToPath(new URL("./projects/[projectId]/+page.svelte", import.meta.url)),
  "utf8",
);

describe("project public access summary", () => {
  test("[PROJECT-PUBLIC-ACCESS-001] counts the current resource access route", () => {
    expect(projectPageSource).toContain(
      'import { selectCurrentResourceAccessRoute } from "$lib/console/resource-access-route";',
    );
    expect(projectPageSource).toContain(
      "const currentAccessRoute = selectCurrentResourceAccessRoute(resource.accessSummary);",
    );
    expect(projectPageSource).toContain("projectResources.flatMap((resource) =>");
    expect(projectPageSource).not.toContain(
      "projectDeployments.flatMap((deployment) =>\n      (deployment.runtimePlan.execution.accessRoutes",
    );
  });
});
