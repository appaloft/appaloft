import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const detailPages = [
  {
    marker: "data-project-detail-loading-skeleton",
    path: "../../routes/projects/[projectId=consoleObjectId]/+page.svelte",
  },
  {
    marker: "data-resource-detail-loading-skeleton",
    path: "../../routes/resources/[resourceId=consoleObjectId]/+page.svelte",
  },
  {
    marker: "data-deployment-detail-loading-skeleton",
    path: "../../routes/deployments/[deploymentId=deploymentId]/+page.svelte",
  },
  {
    marker: "data-server-detail-loading-skeleton",
    path: "../../routes/servers/[serverId=consoleObjectId]/+page.svelte",
  },
] as const;

describe("console detail loading skeletons", () => {
  test("[DETAIL-LOADING-001] detail pages keep fixed structure visible while records load", async () => {
    const detailTabsSource = await readFile(
      new URL("../components/console/ConsoleDetailTabs.svelte", import.meta.url),
      "utf8",
    );

    for (const page of detailPages) {
      const source = await readFile(new URL(page.path, import.meta.url), "utf8");

      expect(source).toContain(page.marker);
      expect(source).toContain("{#if pageLoading}");
      // Granular data skeletons, not a single outer page blank.
      expect(source).toContain("ConsoleDataSkeleton");
      expect(source).not.toContain('name="project-detail" loading={pageLoading}');
      expect(source).not.toContain("<Skeleton class=");
      if (source.includes("ConsoleDetailTabs")) {
        expect(detailTabsSource).toContain("detailTabsClass");
      } else {
        expect(source).toContain("detailTabsClass");
      }
    }
  });

  test("[PROJECT-ATTENTION-LAYOUT-001] aligns attention icon, title, and trigger on one row", async () => {
    const source = await readFile(
      new URL("../../routes/projects/[projectId=consoleObjectId]/+page.svelte", import.meta.url),
      "utf8",
    );

    expect(source).toContain('<div class="flex min-w-0 items-center justify-between gap-2">');
    expect(source).toContain('<div class="flex min-w-0 items-center gap-2">');
    expect(source.indexOf("data-project-attention-status-signal")).toBeLessThan(
      source.indexOf("data-project-attention-progress-trigger"),
    );
    expect(source.indexOf("data-project-attention-progress-trigger")).toBeLessThan(
      source.indexOf('<p class="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">'),
    );
  });

  test("[PROJECT-DETAIL-SKELETON-001] loading structure keeps balanced resource placeholders", async () => {
    const source = await readFile(
      new URL("../../routes/projects/[projectId=consoleObjectId]/+page.svelte", import.meta.url),
      "utf8",
    );

    const loadingSource = source.slice(
      source.indexOf("data-project-detail-loading-skeleton"),
      source.indexOf("{:else if !project}"),
    );

    expect(loadingSource).toContain("{#each Array.from({ length: 2 }) as _, groupIndex");
    expect(loadingSource).toContain("ConsoleDataSkeleton");
    expect(loadingSource).not.toContain("groupIndex === 0 ? 2 : 1");
    expect(loadingSource).not.toContain("<Skeleton class=");
  });
});
