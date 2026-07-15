import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("deployments page pagination surface", () => {
  test("[DEPLOYMENTS-LIST-UX-001] paginates deployment records and prefers table layout on wider screens", async () => {
    const pageSource = await readFile(new URL("deployments/+page.svelte", import.meta.url), "utf8");
    const tableSource = await readFile(
      new URL("../lib/components/console/DeploymentTable.svelte", import.meta.url),
      "utf8",
    );

    expect(pageSource).toContain("const deploymentPageSize = 12;");
    expect(pageSource).toContain("const paginatedDeployments = $derived(");
    expect(pageSource).toContain(
      "visibleDeployments.slice(deploymentOffset, deploymentOffset + deploymentPageSize)",
    );
    expect(pageSource).toContain("data-deployment-pagination");
    expect(pageSource).toContain("i18nKeys.console.deployments.listRange");
    expect(pageSource).toContain("<DeploymentTable deployments={paginatedDeployments}");
    expect(pageSource).not.toContain("<DeploymentTable deployments={visibleDeployments}");

    expect(tableSource).toContain('class="console-record-list md:hidden"');
    expect(tableSource).toContain(
      'class="hidden overflow-hidden rounded-lg border bg-card shadow-2xs md:block"',
    );
    expect(tableSource).toContain("data-deployment-table-display-surface");
  });

  test("[DEPLOYMENTS-LIST-UX-002] gates the resource filter behind project selection", async () => {
    const pageSource = await readFile(new URL("deployments/+page.svelte", import.meta.url), "utf8");

    expect(pageSource).toContain(
      'const filteredResourcesForProject = $derived.by(() =>\n    projectFilter === "all"\n      ? []',
    );
    expect(pageSource).toContain(
      "selectedProject\n        ? $t(i18nKeys.console.deployments.filterAllResources)\n        : $t(i18nKeys.console.deployments.selectProjectFirst)",
    );
    expect(pageSource).toContain(
      '<Select.Root bind:value={resourceFilter} disabled={pageLoading || !selectedProject} type="single">',
    );
  });
});
