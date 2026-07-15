import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("console sidebar project loading state", () => {
  test("[SIDEBAR-PROJECT-LOADING-001] keeps the project group in loading state before rendering empty", async () => {
    const shellSource = await readFile(
      new URL("../components/console/ConsoleShell.svelte", import.meta.url),
      "utf8",
    );

    expect(shellSource).toContain('import { Skeleton } from "$lib/components/ui/skeleton";');
    expect(shellSource).toContain('name="console-shell-projects"');
    expect(shellSource).toContain("{#snippet fallback()}");
    expect(shellSource).not.toContain("<Skeleton class=");
    expect(shellSource).toContain(
      "const projectsLoading = $derived(projectsQuery.isPending && projects.length === 0);",
    );
    expect(shellSource.indexOf("{#if projectsLoading}")).toBeLessThan(
      shellSource.indexOf("{:else if filteredProjects.length > 0}"),
    );
    expect(shellSource.indexOf("{:else if filteredProjects.length > 0}")).toBeLessThan(
      shellSource.indexOf("i18nKeys.console.shell.noProjects"),
    );
  });

  test("[SIDEBAR-PROJECT-MORE-001] exposes the full project list when the sidebar is capped", async () => {
    const shellSource = await readFile(
      new URL("../components/console/ConsoleShell.svelte", import.meta.url),
      "utf8",
    );

    expect(shellSource).toContain("filteredProjects.slice(0, 8)");
    expect(shellSource).toContain("filteredProjects.length > 8");
    expect(shellSource).toContain('href="/projects"');
    expect(shellSource).toContain("i18nKeys.common.actions.viewAll");
  });
});
