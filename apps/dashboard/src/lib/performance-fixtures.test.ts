import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";

import {
  dashboardPerformanceBudgets,
  dashboardResourceFixtureSizes,
  makeResourceFixture,
  visibleResourceRows,
} from "./performance-fixtures";

describe("Dashboard performance fixtures", () => {
  test("[DASH-PERF-002][DASH-PERF-008] provides deterministic 1/10/50/100 Resource fixtures", () => {
    expect(dashboardResourceFixtureSizes).toEqual([1, 10, 50, 100]);

    for (const size of dashboardResourceFixtureSizes) {
      const first = makeResourceFixture(size);
      const second = makeResourceFixture(size);

      expect(first).toEqual(second);
      expect(first).toHaveLength(size);
      expect(new Set(first.map(({ id }) => id)).size).toBe(size);
      expect(first[0]?.id).toBe("resource-001");
      expect(first.at(-1)?.id).toBe(`resource-${String(size).padStart(3, "0")}`);
    }
  });

  test("[DASH-PERF-002] caps initially mounted Resource rows at 50", () => {
    expect(visibleResourceRows(makeResourceFixture(100))).toHaveLength(50);
    expect(visibleResourceRows(makeResourceFixture(10))).toHaveLength(10);
  });

  test("[DASH-PERF-001..008] exposes the accepted blocking budgets to harnesses", () => {
    expect(dashboardPerformanceBudgets.initialRouteJavaScriptGzipBytes).toBe(300 * 1024);
    expect(dashboardPerformanceBudgets.navigationInpP75Ms).toBe(200);
    expect(dashboardPerformanceBudgets.topologyMinimumFps).toBe(55);
    expect(dashboardPerformanceBudgets.topologyEnabled).toBe(false);
  });

  test("[DASH-PERF-001..007] records same-toolchain bundle and route evidence", async () => {
    const evidence = JSON.parse(
      await readFile(
        new URL("../../test/evidence/foundation-2026-08-24.json", import.meta.url),
        "utf8",
      ),
    ) as {
      bundle: {
        "legacy-console-v1": { gzipBytes: number };
        "dashboard-v2": {
          gzipBytes: number;
          blockingBudgetBytes: number;
          largestActiveRouteGzipBytes: number;
        };
        allBundleReductionPercent: number;
      };
      productDataRequestTiming: {
        status: string;
        scenarios: {
          projects: { p95ReductionPercent: number };
          projectOverview: { dashboard: { mountedRows: number } };
        };
      };
    };

    expect(evidence.bundle["dashboard-v2"].gzipBytes).toBeGreaterThanOrEqual(
      evidence.bundle["dashboard-v2"].largestActiveRouteGzipBytes,
    );
    expect(evidence.bundle.allBundleReductionPercent).toBeGreaterThanOrEqual(30);
    expect(evidence.bundle["legacy-console-v1"].gzipBytes).toBeGreaterThan(
      evidence.bundle["dashboard-v2"].gzipBytes,
    );
    expect(evidence.productDataRequestTiming.status).toBe("pass");
    expect(
      evidence.productDataRequestTiming.scenarios.projects.p95ReductionPercent,
    ).toBeGreaterThanOrEqual(30);
    expect(evidence.productDataRequestTiming.scenarios.projectOverview.dashboard.mountedRows).toBe(
      50,
    );
    expect(evidence.bundle["dashboard-v2"].largestActiveRouteGzipBytes).toBeLessThanOrEqual(
      evidence.bundle["dashboard-v2"].blockingBudgetBytes,
    );
    expect(evidence.bundle["dashboard-v2"].blockingBudgetBytes).toBe(
      dashboardPerformanceBudgets.initialRouteJavaScriptGzipBytes,
    );
  });
});
