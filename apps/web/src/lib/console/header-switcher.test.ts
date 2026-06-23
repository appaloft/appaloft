import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("console header switcher", () => {
  test("[CONSOLE-HEADER-LAYOUT-001] keeps global shell headers as one-line navigation bars", async () => {
    const [shellSource, settingsShellSource] = await Promise.all([
      readFile(new URL("../components/console/ConsoleShell.svelte", import.meta.url), "utf8"),
      readFile(new URL("../components/console/SettingsShell.svelte", import.meta.url), "utf8"),
    ]);
    const headerStart = shellSource.indexOf("<header\n      data-console-header");
    const headerSource = shellSource.slice(
      headerStart,
      shellSource.indexOf("</header>", headerStart),
    );
    const settingsHeaderStart = settingsShellSource.indexOf(
      "<header\n      data-settings-shell-header",
    );
    const settingsHeaderSource = settingsShellSource.slice(
      settingsHeaderStart,
      settingsShellSource.indexOf("</header>", settingsHeaderStart),
    );

    expect(headerSource).toContain("pl-2 pr-3");
    expect(headerSource).toContain("md:pl-3 md:pr-4");
    expect(headerSource).not.toContain("{description}");
    expect(headerSource.indexOf("<SidebarTrigger />")).toBeLessThan(
      headerSource.indexOf("<Breadcrumb.Root"),
    );
    expect(settingsHeaderSource).toContain("pl-2 pr-3");
    expect(settingsHeaderSource).not.toContain("{description}");
    expect(settingsHeaderSource.indexOf("<SidebarTrigger />")).toBeLessThan(
      settingsHeaderSource.indexOf("<Breadcrumb.Root"),
    );
  });

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
    const [shellSource, utilsSource, projectPageSource, resourcePageSource, deploymentPageSource] =
      await Promise.all([
        readFile(new URL("../components/console/ConsoleShell.svelte", import.meta.url), "utf8"),
        readFile(new URL("./utils.ts", import.meta.url), "utf8"),
        readFile(
          new URL(
            "../../routes/projects/[projectId=consoleObjectId]/+page.svelte",
            import.meta.url,
          ),
          "utf8",
        ),
        readFile(
          new URL(
            "../../routes/resources/[resourceId=consoleObjectId]/+page.svelte",
            import.meta.url,
          ),
          "utf8",
        ),
        readFile(
          new URL(
            "../../routes/deployments/[deploymentId=deploymentId]/+page.svelte",
            import.meta.url,
          ),
          "utf8",
        ),
      ]);

    expect(shellSource).toContain("data-console-header-switcher-trigger");
    expect(shellSource).toContain("data-console-header-switcher-link");
    expect(shellSource).toContain("DropdownMenuTrigger");
    expect(shellSource).toContain("switcherItems(item).length > 0");
    expect(shellSource).toContain(
      '<Breadcrumb.List class="flex-nowrap gap-px overflow-hidden sm:gap-px">',
    );
    expect(shellSource).toContain(
      '<Breadcrumb.Item class="group/breadcrumb-item peer/breadcrumb-item min-w-0">',
    );
    expect(shellSource).toContain(
      'class="group/switcher inline-flex h-8 min-w-0 max-w-[12rem] items-center gap-0 rounded-md',
    );
    expect(shellSource).toContain(
      'class="group/link inline-flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-l-md rounded-r-none px-2',
    );
    expect(shellSource).toContain(
      'class="group/dropdown-trigger inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-l-none rounded-r-md',
    );
    expect(shellSource).toContain("hover:bg-primary/5");
    expect(shellSource).toContain("hover:bg-primary/10");
    expect(shellSource).toContain("data-[state=open]:bg-primary/10");
    expect(shellSource).toContain("group-hover/link:!text-primary");
    expect(shellSource).toContain("peer-hover/breadcrumb-item:text-foreground");
    expect(shellSource).not.toContain("gap-px text-sm font-medium text-foreground sm:max-w");
    expect(shellSource).not.toContain(
      "rounded-md px-2 transition-colors group-hover/switcher:bg-primary/5",
    );
    expect(shellSource).not.toContain(
      "rounded-md text-muted-foreground transition-colors group-hover/switcher:bg-primary/5",
    );
    expect(shellSource).not.toContain("border-l border-border/70");
    expect(shellSource.indexOf("data-console-header-switcher-link")).toBeLessThan(
      shellSource.indexOf("data-console-header-switcher-trigger"),
    );
    expect(utilsSource).toContain("function hrefWithSearchParams");
    expect(projectPageSource).toContain("projectHeaderSwitchItems");
    expect(projectPageSource).toContain("projectDetailHrefWithActiveSearch(projectItem.id)");
    expect(projectPageSource).toContain(
      "href: project ? projectDetailHrefWithActiveSearch(project.id) : undefined",
    );
    expect(resourcePageSource).toContain("resourceHeaderSwitchItems");
    expect(resourcePageSource).toContain("resourceDetailHrefWithActiveSearch(resourceItem)");
    expect(resourcePageSource).toContain(
      "href: resource ? resourceDetailHrefWithActiveSearch(resource) : undefined",
    );
    expect(deploymentPageSource).toContain("deploymentHeaderSwitchItems");
    expect(deploymentPageSource).toContain("createConsoleQueries(browser");
    expect(deploymentPageSource).toContain("deploymentDetailHrefWithActiveSearch(deploymentItem)");
    expect(deploymentPageSource).toContain(
      "href: headerDeployment ? deploymentDetailHrefWithActiveSearch(headerDeployment) : undefined",
    );
  });
});
