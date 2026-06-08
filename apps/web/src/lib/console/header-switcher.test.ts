import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("console header switcher", () => {
  test("[CONSOLE-HEADER-SWITCHER-001] renders loading skeletons before object names resolve", async () => {
    const shellSource = await readFile(
      new URL("../components/console/ConsoleShell.svelte", import.meta.url),
      "utf8",
    );

    expect(shellSource).toContain("data-console-header-breadcrumb-skeleton");
    expect(shellSource).toContain("{#if item.loading}");
    expect(shellSource).toContain('import { Skeleton } from "$lib/components/ui/skeleton";');
  });

  test("[CONSOLE-HEADER-SWITCHER-002] exposes project resource and deployment switchers", async () => {
    const [shellSource, projectPageSource, resourcePageSource, deploymentPageSource] =
      await Promise.all([
        readFile(new URL("../components/console/ConsoleShell.svelte", import.meta.url), "utf8"),
        readFile(
          new URL("../../routes/projects/[projectId]/+page.svelte", import.meta.url),
          "utf8",
        ),
        readFile(
          new URL("../../routes/resources/[resourceId]/+page.svelte", import.meta.url),
          "utf8",
        ),
        readFile(
          new URL("../../routes/deployments/[deploymentId]/+page.svelte", import.meta.url),
          "utf8",
        ),
      ]);

    expect(shellSource).toContain("data-console-header-switcher-trigger");
    expect(shellSource).toContain("DropdownMenuTrigger");
    expect(shellSource).toContain("switcherItems(item).length > 0");
    expect(projectPageSource).toContain("projectHeaderSwitchItems");
    expect(resourcePageSource).toContain("resourceHeaderSwitchItems");
    expect(deploymentPageSource).toContain("deploymentHeaderSwitchItems");
    expect(deploymentPageSource).toContain("createConsoleQueries(browser");
  });
});
