import { render } from "svelte/server";
import { describe, expect, test } from "vitest";

import DataSkeletonCaptureFixture from "./data-skeleton-capture-fixture.svelte";
import DataSkeletonFallbackClassFixture from "./data-skeleton-fallback-class-fixture.svelte";

describe("DataSkeleton", () => {
  test("[UI-DATA-SKELETON-001] hides capture fallback content as one composited layer", () => {
    const { body } = render(DataSkeletonCaptureFixture);

    expect(body).toContain("Capture placeholder");
    expect(body).not.toContain("Loaded value");
    expect(body).toContain('data-data-skeleton-fallback-content="true"');
    expect(body).toContain('style="opacity:0;visibility:hidden"');
  });

  test("[UI-DATA-SKELETON-002] applies the configured fallback shape when capture content exists", () => {
    const { body } = render(DataSkeletonFallbackClassFixture);

    expect(body).toContain("custom-fallback-shape min-h-48 w-full");
  });
});
