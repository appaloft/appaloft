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
    expect(shellSource).toContain("data-console-header-switcher-link");
    expect(shellSource).toContain("DropdownMenuTrigger");
    expect(shellSource).toContain("switcherItems(item).length > 0");
    expect(shellSource.indexOf("data-console-header-switcher-link")).toBeLessThan(
      shellSource.indexOf("data-console-header-switcher-trigger"),
    );
    expect(projectPageSource).toContain("projectHeaderSwitchItems");
    expect(projectPageSource).toContain(
      "href: project ? projectDetailHref(project.id) : undefined",
    );
    expect(resourcePageSource).toContain("resourceHeaderSwitchItems");
    expect(resourcePageSource).toContain(
      "href: resource ? resourceDetailHref(resource) : undefined",
    );
    expect(deploymentPageSource).toContain("deploymentHeaderSwitchItems");
    expect(deploymentPageSource).toContain("createConsoleQueries(browser");
    expect(deploymentPageSource).toContain(
      "href: headerDeployment ? deploymentDetailHref(headerDeployment) : undefined",
    );
  });
});
