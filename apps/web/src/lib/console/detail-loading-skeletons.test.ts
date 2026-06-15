import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const detailPages = [
  {
    marker: "data-project-detail-loading-skeleton",
    path: "../../routes/projects/[projectId=consoleObjectId]/+page.svelte",
    renderCall: "{@render projectDetailLoadingSkeleton()}",
  },
  {
    marker: "data-resource-detail-loading-skeleton",
    path: "../../routes/resources/[resourceId=consoleObjectId]/+page.svelte",
    renderCall: "{@render resourceDetailLoadingSkeleton()}",
  },
  {
    marker: "data-deployment-detail-loading-skeleton",
    path: "../../routes/deployments/[deploymentId=deploymentId]/+page.svelte",
    renderCall: "{@render deploymentDetailLoadingSkeleton()}",
  },
  {
    marker: "data-server-detail-loading-skeleton",
    path: "../../routes/servers/[serverId=consoleObjectId]/+page.svelte",
    renderCall: "{@render serverDetailLoadingSkeleton()}",
  },
] as const;

describe("console detail loading skeletons", () => {
  test("[DETAIL-LOADING-001] detail pages keep fixed structure visible while records load", async () => {
    for (const page of detailPages) {
      const source = await readFile(new URL(page.path, import.meta.url), "utf8");

      expect(source).toContain(page.marker);
      expect(source).toContain("detailTabsClass");
      expect(source).toContain("{#if pageLoading}");
      expect(source).toContain(page.renderCall);
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
});
