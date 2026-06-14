import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("projects page loading state", () => {
  test("[PROJECT-LIST-LOADING-001] keeps the page structure visible while project cards load", async () => {
    const pageSource = await readFile(new URL("projects/+page.svelte", import.meta.url), "utf8");

    expect(pageSource).toContain(
      "const projectListLoading = $derived(projectsQuery.isPending && visibleProjects.length === 0);",
    );
    expect(pageSource).not.toContain("{#if pageLoading}");
    expect(pageSource.indexOf("<ConsoleResourceCanvas>")).toBeLessThan(
      pageSource.indexOf("{#if visibleProjects.length > 0 || projectListLoading}"),
    );
    expect(pageSource.indexOf("i18nKeys.console.projects.focusTitle")).toBeLessThan(
      pageSource.indexOf("{#if projectListLoading}"),
    );
    expect(pageSource).toContain("data-project-loading-card");
    expect(pageSource).toContain(
      'class="flex min-h-56 min-w-0 flex-col rounded-md border bg-card p-4 shadow-sm"',
    );
    expect(pageSource).toContain('class="grid gap-4 md:grid-cols-2 xl:grid-cols-3"');
  });
});
