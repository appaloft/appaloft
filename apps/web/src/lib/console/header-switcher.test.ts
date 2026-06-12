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
    const [shellSource, projectPageSource, resourcePageSource, deploymentPageSource] =
      await Promise.all([
        readFile(new URL("../components/console/ConsoleShell.svelte", import.meta.url), "utf8"),
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
      'class="inline-flex h-8 min-w-0 max-w-[12rem] items-center gap-1',
    );
    expect(shellSource).toContain(
      'class="group/link inline-flex h-8 min-w-0 flex-1 items-center gap-2 px-1.5',
    );
    expect(shellSource).toContain(
      'class="group/dropdown-trigger inline-flex size-8 shrink-0 items-center justify-center rounded-md',
    );
    expect(shellSource).not.toContain("border-l border-border/70");
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
