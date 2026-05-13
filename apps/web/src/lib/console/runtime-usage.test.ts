import { readFile } from "node:fs/promises";
import { type InspectRuntimeUsageResponse } from "@appaloft/contracts";
import { describe, expect, test } from "vitest";

import {
  appendRuntimeMonitoringSample,
  formatRuntimeMonitoringPercent,
  formatRuntimeUsageBytes,
  runtimeMonitoringSampleFromUsage,
  runtimeMonitoringSparklinePoints,
  runtimeUsageQueryKey,
} from "./runtime-usage";

describe("runtime usage console readback", () => {
  test("[RT-USAGE-008] formats compact usage values without changing DTO semantics", () => {
    expect(formatRuntimeUsageBytes(undefined)).toBeNull();
    expect(formatRuntimeUsageBytes(0)).toBe("0 B");
    expect(formatRuntimeUsageBytes(1024 * 1024)).toBe("1.0 MB");
    expect(
      runtimeUsageQueryKey({
        kind: "resource",
        resourceId: "res_demo",
      }),
    ).toEqual(["runtime-usage", "resource", "res_demo"]);
  });

  test("[RT-USAGE-008] exposes server and resource runtime usage through the shared oRPC client", async () => {
    const [componentSource, monitorSource, serverSource, resourceSource] = await Promise.all([
      readFile(new URL("../components/console/RuntimeUsagePanel.svelte", import.meta.url), "utf8"),
      readFile(
        new URL("../components/console/RuntimeMonitorPanel.svelte", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../../routes/servers/[serverId]/+page.svelte", import.meta.url), "utf8"),
      readFile(
        new URL("../../routes/resources/[resourceId]/+page.svelte", import.meta.url),
        "utf8",
      ),
    ]);

    expect(componentSource).toContain("i18nKeys.console.runtimeUsage");
    expect(monitorSource).toContain("runtimeMonitoringSparklinePoints");
    expect(monitorSource).toContain("openLogs");
    expect(componentSource).toContain("runtimeUsageInspect");
    expect(serverSource).toContain("RuntimeMonitorPanel");
    expect(serverSource).toContain('"monitor"');
    expect(serverSource).toContain('kind: "server"');
    expect(resourceSource).toContain("RuntimeMonitorPanel");
    expect(resourceSource).toContain('"monitor"');
    expect(resourceSource).toContain('kind: "resource"');
  });

  test("[RT-MON-007] derives browser-local monitor samples without changing backend DTOs", () => {
    const usage: InspectRuntimeUsageResponse = {
      schemaVersion: "runtime-usage.inspect/v1",
      scope: { kind: "server", serverId: "srv_demo" },
      generatedAt: "2026-05-13T00:00:00.000Z",
      observedAt: "2026-05-13T00:00:01.000Z",
      freshness: "live",
      partial: false,
      totals: {
        cpu: { loadAverage1m: 1, logicalCores: 4 },
        memory: { usedBytes: 512, totalBytes: 1024 },
        disk: { usedBytes: 256, totalBytes: 1024 },
      },
      byProject: [],
      byEnvironment: [],
      byResource: [],
      byDeployment: [],
      artifacts: [],
      warnings: [],
      sourceErrors: [],
    };

    const sample = runtimeMonitoringSampleFromUsage(usage);
    expect(sample).not.toBeNull();
    if (!sample) {
      throw new Error("expected runtime monitoring sample");
    }
    expect(sample).toEqual({
      observedAt: "2026-05-13T00:00:01.000Z",
      cpuLoadPercent: 25,
      memoryPercent: 50,
      diskPercent: 25,
    });
    expect(formatRuntimeMonitoringPercent(sample?.memoryPercent ?? null)).toBe("50%");
    expect(
      appendRuntimeMonitoringSample(
        [
          {
            observedAt: "older",
            cpuLoadPercent: 1,
            memoryPercent: 2,
            diskPercent: 3,
          },
        ],
        sample,
        1,
      ),
    ).toEqual([sample]);
    expect(runtimeMonitoringSparklinePoints([0, 50, 100])).toBe("0.0,48.0 80.0,24.0 160.0,0.0");
  });
});
