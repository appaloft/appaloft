import { readFile } from "node:fs/promises";
import {
  type InspectRuntimeUsageResponse,
  type RuntimeMonitoringRollupResponse,
  type RuntimeMonitoringSamplesResponse,
  type RuntimeMonitoringThresholdsResponse,
} from "@appaloft/contracts";
import { describe, expect, test } from "vitest";

import {
  appendRuntimeMonitoringSample,
  buildRuntimeMonitoringThresholdConfigureInput,
  formatRuntimeMonitoringPercent,
  formatRuntimeUsageBytes,
  latestRuntimeMonitoringRollupValue,
  mergeRuntimeMonitoringSamples,
  retainedRuntimeMonitoringSamples,
  runtimeMonitoringDeploymentInObservationWindow,
  runtimeMonitoringDeploymentMarkerItems,
  runtimeMonitoringObservationHandoffFromSearchParams,
  runtimeMonitoringObservationHandoffMatchesScope,
  runtimeMonitoringObservationHref,
  runtimeMonitoringObservationWindow,
  runtimeMonitoringRollupSummary,
  runtimeMonitoringRollupValues,
  runtimeMonitoringSampleFromUsage,
  runtimeMonitoringScopeQueryKey,
  runtimeMonitoringSparklinePoints,
  runtimeMonitoringThresholdFormFromPolicy,
  runtimeMonitoringThresholdSummary,
  runtimeMonitoringTimestampInObservationWindow,
  runtimeMonitoringTopContributorItems,
  runtimeUsageQueryKey,
} from "./runtime-usage";

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, Math.max(startIndex, 0));

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return "";
  }

  return source.slice(startIndex, endIndex);
}

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

  test("[RT-USAGE-008] exposes server, resource, project, and environment runtime usage through the shared oRPC client", async () => {
    const [componentSource, monitorSource, serverSource, resourceSource, projectSource] =
      await Promise.all([
        readFile(
          new URL("../components/console/RuntimeUsagePanel.svelte", import.meta.url),
          "utf8",
        ),
        readFile(
          new URL("../components/console/RuntimeMonitorPanel.svelte", import.meta.url),
          "utf8",
        ),
        readFile(
          new URL("../../routes/servers/[serverId=consoleObjectId]/+page.svelte", import.meta.url),
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
            "../../routes/projects/[projectId=consoleObjectId]/+page.svelte",
            import.meta.url,
          ),
          "utf8",
        ),
      ]);

    expect(componentSource).toContain("i18nKeys.console.runtimeUsage");
    expect(monitorSource).toContain("runtimeMonitoringTimeRangeOptions");
    expect(monitorSource).toContain("runtimeMonitoringRefreshIntervalMs");
    expect(monitorSource).toContain('viewBox="0 0 360 150"');
    expect(monitorSource).toContain("icon: Cpu");
    expect(monitorSource).toContain("icon: MemoryStick");
    expect(monitorSource).toContain("icon: HardDrive");
    expect(monitorSource).toContain("data-runtime-signal-card={signal.key}");
    expect(monitorSource).toContain("data-runtime-signal-icon");
    expect(monitorSource).toContain("chartY(tick)");
    expect(monitorSource).toContain("retainedSamples");
    expect(monitorSource).toContain("rollup");
    expect(monitorSource).toContain("runtimeMonitoringDeploymentMarkerItems");
    expect(monitorSource).toContain("runtimeMonitoringTopContributorItems");
    expect(monitorSource).toContain("rollupMarkersTitle");
    expect(monitorSource).toContain("rollupContributorsTitle");
    expect(monitorSource).toContain("thresholds");
    expect(monitorSource).toContain("thresholdConfigure");
    expect(monitorSource).toContain("thresholdDialogOpen");
    expect(monitorSource).toContain("data-runtime-threshold-dialog");
    expect(monitorSource).toContain("openLogs");
    expect(monitorSource).toContain("refreshNow");
    expect(monitorSource).toContain("onTimeRangeChange");
    const timeRangeControlSource = sourceBetween(
      monitorSource,
      'class="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-1 text-sm text-muted-foreground"',
      '<Button type="button" variant="outline" onclick={() => onRefresh?.()}',
    );
    expect(timeRangeControlSource).toContain(
      'class="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-1 text-sm text-muted-foreground"',
    );
    expect(timeRangeControlSource).toContain("aria-pressed={timeRange === option}");
    expect(timeRangeControlSource).toContain("data-runtime-time-range-option={option}");
    expect(timeRangeControlSource).toContain("h-6 border-primary/30 bg-primary/10 px-2");
    expect(timeRangeControlSource).toContain("h-6 bg-transparent px-2 text-muted-foreground");
    expect(timeRangeControlSource).toContain("hover:bg-primary/5");
    expect(timeRangeControlSource).not.toContain('size="sm"');
    expect(monitorSource).not.toContain('variant={timeRange === option ? "default" : "ghost"}');
    expect(monitorSource).toContain("onclick={() => selectTimeRange(option)}");
    expect(monitorSource).not.toContain("<select");
    expect(componentSource).toContain("runtimeUsageInspect");
    expect(serverSource).toContain("RuntimeMonitorPanel");
    expect(serverSource).toContain('"monitor"');
    expect(serverSource).toContain('kind: "server"');
    expect(serverSource).toContain("runtimeMonitoringSamplesQueryOptions");
    expect(serverSource).toContain("runtimeMonitoringRollupQueryOptions");
    expect(serverSource).toContain("runtimeMonitoringThresholdsQueryOptions");
    expect(serverSource).toContain("runtimeMonitoringTimeRange");
    expect(serverSource).toContain("refreshRuntimeMonitor");
    expect(resourceSource).toContain("RuntimeMonitorPanel");
    expect(resourceSource).toContain('"monitor"');
    expect(resourceSource).toContain('kind: "resource"');
    expect(resourceSource).toContain("runtimeMonitoringSamplesQueryOptions");
    expect(resourceSource).toContain("runtimeMonitoringRollupQueryOptions");
    expect(resourceSource).toContain("runtimeMonitoringThresholdsQueryOptions");
    expect(resourceSource).toContain("runtimeMonitoringTimeRange");
    expect(resourceSource).toContain("refreshRuntimeMonitor");
    expect(resourceSource).toContain('activeTab === "monitor"');
    expect(resourceSource).toContain(
      "runtimeUsageQueryOptions(resourceRuntimeScope, resourceRuntimeMonitorEnabled)",
    );
    expect(resourceSource).toContain(
      "runtimeMonitoringThresholdsQueryOptions(resourceRuntimeScope, resourceRuntimeMonitorEnabled)",
    );
    expect(resourceSource).not.toContain(
      "runtimeUsageQueryOptions(resourceRuntimeScope, browser && resourceId.length > 0)",
    );
    expect(projectSource).toContain('kind: "project"');
    expect(projectSource).toContain('kind: "environment"');
    expect(projectSource).toContain("runtimeMonitoringRollupQueryOptions");
    expect(projectSource).toContain("projectRuntimeMonitoringRollupQuery");
    expect(projectSource).toContain("environmentRuntimeMonitoringRollupQuery");

    const thresholdDisplaySource =
      monitorSource.match(
        /<div class="mt-4 rounded-md border bg-muted\/20 p-3">[\s\S]*?<\/section>/,
      )?.[0] ?? "";
    const thresholdDialogSource =
      monitorSource.match(
        /<Dialog\.Root bind:open={thresholdDialogOpen}[\s\S]*?data-runtime-threshold-dialog[\s\S]*?<\/Dialog\.Root>/,
      )?.[0] ?? "";

    expect(thresholdDisplaySource).toContain("setThresholdDialogOpen(true)");
    expect(thresholdDisplaySource).toContain("configuredThresholdRuleSummaries");
    expect(thresholdDisplaySource).not.toContain("<Select.Root");
    expect(thresholdDisplaySource).not.toContain("<form");
    expect(thresholdDisplaySource).not.toContain("<Input");
    expect(thresholdDisplaySource).not.toContain("onsubmit={configureThresholdPolicy}");
    expect(thresholdDisplaySource).not.toContain('type="submit"');
    expect(thresholdDialogSource).toContain("<form");
    expect(thresholdDialogSource).toContain("<Input");
    expect(thresholdDialogSource).toContain("onsubmit={configureThresholdPolicy}");
    expect(thresholdDialogSource).toContain('type="submit"');
  });

  test("[RT-MON-005] Monitor links to logs diagnostics and cleanup without storing log lines", async () => {
    const [monitorSource, serverSource, resourceSource, samplesSpec, rollupSpec] =
      await Promise.all([
        readFile(
          new URL("../components/console/RuntimeMonitorPanel.svelte", import.meta.url),
          "utf8",
        ),
        readFile(
          new URL("../../routes/servers/[serverId=consoleObjectId]/+page.svelte", import.meta.url),
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
            "../../../../../docs/queries/runtime-monitoring.samples.list.md",
            import.meta.url,
          ),
          "utf8",
        ),
        readFile(
          new URL("../../../../../docs/queries/runtime-monitoring.rollup.md", import.meta.url),
          "utf8",
        ),
      ]);

    expect(monitorSource).toContain("logsHref?: string");
    expect(monitorSource).toContain("diagnosticsHref?: string");
    expect(monitorSource).toContain("cleanupHref?: string");
    expect(monitorSource).toContain("observationScope?: RuntimeUsageScope");
    expect(monitorSource).toContain("runtimeMonitoringObservationHref");
    expect(monitorSource).toContain("href={observationLinks.logs}");
    expect(monitorSource).toContain("href={observationLinks.diagnostics}");
    expect(monitorSource).toContain("href={observationLinks.cleanup}");
    expect(monitorSource).toContain("<Settings2");
    expect(monitorSource).not.toContain("<Trash2");
    expect(monitorSource).not.toContain("eventsHref?: string");
    expect(monitorSource).not.toContain("capacityHref?: string");
    expect(monitorSource).not.toContain("runtimeLogs");
    expect(monitorSource).not.toContain("deploymentLogs");
    expect(monitorSource).not.toContain("logLines");

    expect(serverSource).not.toContain('eventsHref={serverTabHref("deployments")}');
    expect(serverSource).not.toContain('capacityHref={serverTabHref("capacity")}');
    expect(serverSource).toContain('cleanupHref={serverTabHref("capacity")}');
    expect(serverSource).toContain("orpcClient.servers.capacity.inspect");
    expect(serverSource).toContain("orpcClient.servers.capacity.prune");
    expect(serverSource).toContain("capacityPruneBefore = handoff.to");
    expect(resourceSource).toContain('logsHref={resourceTabHref("logs")}');
    expect(resourceSource).not.toContain('eventsHref={resourceTabHref("deployments")}');
    expect(resourceSource).toContain('diagnosticsHref={resourceSectionHref("diagnostics")}');
    expect(resourceSource).toContain('cleanupHref={resourceSectionHref("storage")}');
    expect(serverSource).toContain("serverRuntimeMonitoringObservationHandoff");
    expect(serverSource).toContain("serverDeploymentsInObservationWindow");
    expect(resourceSource).toContain("resourceRuntimeMonitoringObservationHandoff");
    expect(resourceSource).toContain("showResourceServerRuntimeFallback");
    expect(resourceSource).toContain("resourceFallbackServerRuntimeUsageQuery");
    expect(resourceSource).toContain("resourceServerFallbackNotice");
    expect(resourceSource).toContain("resourceDeploymentsInObservationWindow");
    expect(resourceSource).toContain("runtimeLogsInObservationWindow");
    expect(resourceSource).toContain("storageRuntimeCleanupObservationHandoffKey");
    expect(resourceSource).toContain("storageRuntimeCleanupBefore = observationHandoff.to");
    expect(resourceSource).toContain(
      "void loadRuntimeLogs(currentResourceId, currentObservationHandoff?.from)",
    );
    expect(resourceSource).toContain("resourceRuntimeMonitoringObservationHandoff?.from");
    expect(resourceSource).toContain(
      "observationFrom: resourceRuntimeMonitoringObservationHandoff.from",
    );
    expect(resourceSource).toContain(
      "observationTo: resourceRuntimeMonitoringObservationHandoff.to",
    );

    expect(samplesSpec).toContain("runtime logs, deployment logs");
    expect(samplesSpec).toContain("not be persisted in monitoring samples");
    expect(rollupSpec).toContain("must not copy log lines into rollup output");
  });

  test("[RT-MON-005] Monitor observation links carry scope and time-window handoff parameters", () => {
    const rollup: RuntimeMonitoringRollupResponse = {
      schemaVersion: "runtime-monitoring.rollup/v1",
      scope: { kind: "resource", resourceId: "res_demo" },
      from: "2026-05-13T00:00:00.000Z",
      to: "2026-05-13T01:00:00.000Z",
      bucket: "minute",
      generatedAt: "2026-05-13T01:00:00.000Z",
      freshness: "recent-sample",
      partial: false,
      retention: {
        rawRetentionHours: 24,
        retainedFrom: "2026-05-13T00:00:00.000Z",
        retainedTo: "2026-05-13T01:00:00.000Z",
      },
      series: [],
      totals: {},
      topContributors: [],
      deploymentMarkers: [],
      warnings: [],
      sourceErrors: [],
    };
    const retainedSamples: RuntimeMonitoringSamplesResponse = {
      schemaVersion: "runtime-monitoring.samples.list/v1",
      scope: { kind: "resource", resourceId: "res_demo" },
      from: "2026-05-12T00:00:00.000Z",
      to: "2026-05-12T01:00:00.000Z",
      generatedAt: "2026-05-12T01:00:00.000Z",
      freshness: "recent-sample",
      partial: false,
      retention: {
        rawRetentionHours: 24,
        retainedFrom: "2026-05-12T00:00:00.000Z",
        retainedTo: "2026-05-12T01:00:00.000Z",
      },
      samples: [],
      warnings: [],
      sourceErrors: [],
    };

    expect(runtimeMonitoringObservationWindow(retainedSamples, rollup)).toEqual({
      from: "2026-05-13T00:00:00.000Z",
      to: "2026-05-13T01:00:00.000Z",
    });
    expect(runtimeMonitoringObservationWindow(retainedSamples, null)).toEqual({
      from: "2026-05-12T00:00:00.000Z",
      to: "2026-05-12T01:00:00.000Z",
    });
    expect(runtimeMonitoringObservationWindow(null, null)).toBeNull();
    expect(
      runtimeMonitoringObservationHref("/resources/res_demo?tab=logs", {
        scope: { kind: "resource", resourceId: "res_demo" },
        retainedSamples: null,
        rollup: null,
      }),
    ).toBe("/resources/res_demo?tab=logs");

    const href = runtimeMonitoringObservationHref("/resources/res_demo?tab=logs#tail", {
      scope: { kind: "resource", resourceId: "res_demo" },
      retainedSamples,
      rollup,
    });
    const url = new URL(href, "http://appaloft.local");

    expect(url.pathname).toBe("/resources/res_demo");
    expect(url.hash).toBe("#tail");
    expect(url.searchParams.get("tab")).toBe("logs");
    expect(url.searchParams.get("section")).toBeNull();
    expect(url.searchParams.get("runtimeMonitoringFrom")).toBe("2026-05-13T00:00:00.000Z");
    expect(url.searchParams.get("runtimeMonitoringTo")).toBe("2026-05-13T01:00:00.000Z");
    expect(url.searchParams.get("runtimeMonitoringScopeKind")).toBe("resource");
    expect(url.searchParams.get("runtimeMonitoringScopeId")).toBe("res_demo");
  });

  test("[RT-MON-005] target surfaces consume Monitor handoff windows for filtering", () => {
    const params = new URLSearchParams({
      runtimeMonitoringFrom: "2026-05-13T00:00:00.000Z",
      runtimeMonitoringTo: "2026-05-13T01:00:00.000Z",
      runtimeMonitoringScopeKind: "resource",
      runtimeMonitoringScopeId: "res_demo",
    });
    const handoff = runtimeMonitoringObservationHandoffFromSearchParams(params);

    expect(handoff).toEqual({
      from: "2026-05-13T00:00:00.000Z",
      to: "2026-05-13T01:00:00.000Z",
      scope: { kind: "resource", resourceId: "res_demo" },
    });
    expect(
      runtimeMonitoringObservationHandoffMatchesScope(handoff, {
        kind: "resource",
        resourceId: "res_demo",
      }),
    ).toBe(true);
    expect(
      runtimeMonitoringObservationHandoffMatchesScope(handoff, {
        kind: "resource",
        resourceId: "res_other",
      }),
    ).toBe(false);
    expect(runtimeMonitoringTimestampInObservationWindow("2026-05-13T00:30:00.000Z", handoff)).toBe(
      true,
    );
    expect(runtimeMonitoringTimestampInObservationWindow("2026-05-13T02:00:00.000Z", handoff)).toBe(
      false,
    );
    expect(
      runtimeMonitoringDeploymentInObservationWindow(
        {
          createdAt: "2026-05-12T23:50:00.000Z",
          startedAt: "2026-05-13T00:10:00.000Z",
          finishedAt: "2026-05-13T00:20:00.000Z",
        },
        handoff,
      ),
    ).toBe(true);
    expect(
      runtimeMonitoringDeploymentInObservationWindow(
        {
          createdAt: "2026-05-13T02:00:00.000Z",
          startedAt: "2026-05-13T02:10:00.000Z",
          finishedAt: "2026-05-13T02:20:00.000Z",
        },
        handoff,
      ),
    ).toBe(false);
    expect(runtimeMonitoringObservationHandoffFromSearchParams(new URLSearchParams())).toBeNull();
  });

  test("[RT-MON-003][RT-USAGE-007] runtime monitoring source-of-truth docs do not keep stale MCP, collector, or Observe gaps", async () => {
    const [samplesSpec, usageMatrix, usagePlan, roadmap] = await Promise.all([
      readFile(
        new URL("../../../../../docs/queries/runtime-monitoring.samples.list.md", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../../../../../docs/testing/runtime-usage-attribution-test-matrix.md",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../../../../docs/specs/068-runtime-usage-attribution-and-monitoring/plan.md",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../../../../../docs/PRODUCT_ROADMAP.md", import.meta.url), "utf8"),
    ]);
    const normalizedRoadmap = roadmap.replace(/\s+/g, " ");

    expect(samplesSpec).toContain("MCP-facing tool server registration");
    expect(samplesSpec).not.toContain("full MCP server\n  packaging/registration");
    expect(usageMatrix).toContain("runtime-usage inspect handler/server dispatch");
    expect(usageMatrix).not.toContain("Future MCP/tool tests\n  remain pending");
    expect(usagePlan).toContain(
      "disabled-by-default collector runner records process-attempt visibility",
    );
    expect(usagePlan).not.toContain("future collector worker records process-attempt visibility");
    expect(normalizedRoadmap).toContain(
      "WebView Observe verification, sample-evidence-based threshold inheritance, and MCP/tool handler dispatch are active",
    );
    expect(normalizedRoadmap).not.toContain(
      "Full Observe browser verification, cross-window log/event filtering, threshold inheritance, and full MCP server packaging remain open",
    );
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
    expect(
      mergeRuntimeMonitoringSamples(
        [
          {
            observedAt: "2026-05-13T00:00:00.000Z",
            cpuLoadPercent: 1,
            memoryPercent: 2,
            diskPercent: 3,
          },
          {
            observedAt: "2026-05-13T00:00:01.000Z",
            cpuLoadPercent: 4,
            memoryPercent: 5,
            diskPercent: 6,
          },
        ],
        [sample],
      ),
    ).toEqual([
      {
        observedAt: "2026-05-13T00:00:00.000Z",
        cpuLoadPercent: 1,
        memoryPercent: 2,
        diskPercent: 3,
      },
      sample,
    ]);
  });

  test("[RT-MON-007][RT-MON-008] maps retained samples and threshold state for the monitor panel", () => {
    expect(
      runtimeMonitoringScopeQueryKey("runtime-monitoring-samples", {
        kind: "server",
        serverId: "srv_demo",
      }),
    ).toEqual(["runtime-monitoring-samples", "server", "srv_demo"]);

    const samples: RuntimeMonitoringSamplesResponse = {
      schemaVersion: "runtime-monitoring.samples.list/v1",
      scope: { kind: "resource", resourceId: "res_demo" },
      from: "2026-05-13T00:00:00.000Z",
      to: "2026-05-13T01:00:00.000Z",
      generatedAt: "2026-05-13T01:00:00.000Z",
      freshness: "recent-sample",
      partial: false,
      retention: {
        rawRetentionHours: 24,
        retainedFrom: "2026-05-13T00:00:00.000Z",
        retainedTo: "2026-05-13T01:00:00.000Z",
      },
      samples: [
        {
          sampleId: "rms_1",
          observedAt: "2026-05-13T00:30:00.000Z",
          collectedAt: "2026-05-13T00:30:01.000Z",
          scopeEvidence: {
            scope: { kind: "resource", resourceId: "res_demo" },
            resourceId: "res_demo",
          },
          totals: {
            cpu: { containerCpuPercent: 42, logicalCores: 4 },
            memory: { usedBytes: 512, totalBytes: 1024 },
            disk: { usedBytes: 256, totalBytes: 1024 },
          },
          freshness: "recent-sample",
          partial: false,
          labels: {},
          warnings: [],
          sourceErrors: [],
        },
      ],
      warnings: [],
      sourceErrors: [],
    };

    expect(retainedRuntimeMonitoringSamples(samples)).toEqual([
      {
        observedAt: "2026-05-13T00:30:00.000Z",
        cpuLoadPercent: 42,
        memoryPercent: 50,
        diskPercent: 25,
      },
    ]);

    const thresholds: RuntimeMonitoringThresholdsResponse = {
      schemaVersion: "runtime-monitoring-thresholds.show/v1",
      scope: { kind: "resource", resourceId: "res_demo" },
      generatedAt: "2026-05-13T01:00:00.000Z",
      policy: null,
      evaluation: {
        state: "unknown",
        crossed: [],
        nextActions: ["configure-thresholds"],
        sourceErrors: [],
      },
    };

    expect(runtimeMonitoringThresholdSummary(thresholds)).toEqual({
      state: "unknown",
      crossingCount: 0,
      nextActionCount: 1,
      hasPolicy: false,
    });
  });

  test("[RT-MON-002][RT-MON-004][RT-MON-007][RT-MON-008] maps rollups and deployment markers for the monitor panel", () => {
    expect(
      runtimeMonitoringScopeQueryKey("runtime-monitoring-rollup", {
        kind: "resource",
        resourceId: "res_demo",
      }),
    ).toEqual(["runtime-monitoring-rollup", "resource", "res_demo"]);

    const rollup: RuntimeMonitoringRollupResponse = {
      schemaVersion: "runtime-monitoring.rollup/v1",
      scope: { kind: "resource", resourceId: "res_demo" },
      from: "2026-05-13T00:00:00.000Z",
      to: "2026-05-13T01:00:00.000Z",
      bucket: "minute",
      generatedAt: "2026-05-13T01:00:00.000Z",
      freshness: "recent-sample",
      partial: false,
      retention: {
        rawRetentionHours: 24,
        retainedFrom: "2026-05-13T00:00:00.000Z",
        retainedTo: "2026-05-13T01:00:00.000Z",
      },
      series: [
        {
          signal: "cpu",
          points: [
            {
              from: "2026-05-13T00:00:00.000Z",
              to: "2026-05-13T00:01:00.000Z",
              sampleCount: 1,
              totals: { cpu: { containerCpuPercent: 12 } },
            },
            {
              from: "2026-05-13T00:01:00.000Z",
              to: "2026-05-13T00:02:00.000Z",
              sampleCount: 1,
              totals: { cpu: { containerCpuPercent: 24 } },
            },
          ],
        },
      ],
      totals: {
        cpu: { containerCpuPercent: 18 },
      },
      topContributors: [
        {
          scope: { kind: "deployment", deploymentId: "dep_demo" },
          totals: { cpu: { containerCpuPercent: 18 } },
          sampleCount: 2,
        },
      ],
      deploymentMarkers: [
        {
          deploymentId: "dep_demo",
          resourceId: "res_demo",
          observedAt: "2026-05-13T00:01:00.000Z",
          status: "succeeded",
          label: "Deployment dep_demo succeeded",
          correlation: "time",
        },
      ],
      warnings: [],
      sourceErrors: [],
    };

    expect(runtimeMonitoringRollupValues(rollup, "cpu")).toEqual([12, 24]);
    expect(latestRuntimeMonitoringRollupValue(rollup, "cpu")).toBe(24);
    expect(runtimeMonitoringRollupSummary(rollup)).toEqual({
      seriesCount: 1,
      markerCount: 1,
      contributorCount: 1,
      bucket: "minute",
    });
    expect(runtimeMonitoringDeploymentMarkerItems(rollup)).toEqual([
      {
        deploymentId: "dep_demo",
        resourceId: "res_demo",
        observedAt: "2026-05-13T00:01:00.000Z",
        status: "succeeded",
        label: "Deployment dep_demo succeeded",
        correlation: "time",
        href: "/deployments/dep_demo",
      },
    ]);
    expect(runtimeMonitoringTopContributorItems(rollup)).toEqual([
      {
        scope: { kind: "deployment", deploymentId: "dep_demo" },
        scopeId: "dep_demo",
        href: "/deployments/dep_demo",
        sampleCount: 2,
      },
    ]);
  });

  test("[RT-MON-006][RT-MON-008] builds exact-scope multi-metric threshold configuration without dropping unedited rules", () => {
    const thresholds: RuntimeMonitoringThresholdsResponse = {
      schemaVersion: "runtime-monitoring-thresholds.show/v1",
      scope: { kind: "resource", resourceId: "res_demo" },
      generatedAt: "2026-05-13T01:00:00.000Z",
      policy: {
        schemaVersion: "runtime-monitoring-thresholds.policy/v1",
        policyId: "rmtp_demo",
        scope: { kind: "resource", resourceId: "res_demo" },
        rules: [
          {
            ruleId: "rmtr_memory",
            signal: "memory",
            metric: "usedBytes",
            warning: 1_000,
            critical: 2_000,
            comparator: "greater-than-or-equal",
          },
          {
            ruleId: "rmtr_network",
            signal: "network",
            metric: "rxBytes",
            warning: 3_000,
            critical: 4_000,
            comparator: "greater-than-or-equal",
          },
          {
            ruleId: "rmtr_cpu",
            signal: "cpu",
            metric: "containerCpuPercent",
            warning: 70,
            critical: 90,
            comparator: "greater-than-or-equal",
          },
        ],
        enabled: false,
        updatedAt: "2026-05-13T00:00:00.000Z",
      },
      evaluation: {
        state: "ok",
        crossed: [],
        nextActions: [],
        sourceErrors: [],
      },
    };

    expect(runtimeMonitoringThresholdFormFromPolicy(thresholds)).toEqual({
      enabled: false,
      rules: {
        cpu: { warning: "70", critical: "90" },
        memory: { warning: "1000", critical: "2000" },
        disk: { warning: "", critical: "" },
      },
    });

    const result = buildRuntimeMonitoringThresholdConfigureInput(
      { kind: "resource", resourceId: "res_demo" },
      thresholds,
      {
        enabled: true,
        rules: {
          cpu: { warning: "75", critical: "95" },
          memory: { warning: "1500", critical: "2500" },
          disk: { warning: "5000", critical: "" },
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected threshold input");
    }
    expect(result.input.policyId).toBe("rmtp_demo");
    expect(result.input.enabled).toBe(true);
    expect(result.input.rules).toEqual([
      {
        ruleId: "rmtr_network",
        signal: "network",
        metric: "rxBytes",
        warning: 3_000,
        critical: 4_000,
        comparator: "greater-than-or-equal",
      },
      {
        ruleId: "rmtr_cpu",
        signal: "cpu",
        metric: "containerCpuPercent",
        warning: 75,
        critical: 95,
        comparator: "greater-than-or-equal",
      },
      {
        ruleId: "rmtr_memory",
        signal: "memory",
        metric: "usedBytes",
        warning: 1_500,
        critical: 2_500,
        comparator: "greater-than-or-equal",
      },
      {
        signal: "disk",
        metric: "usedBytes",
        warning: 5_000,
        critical: undefined,
        comparator: "greater-than-or-equal",
      },
    ]);

    expect(
      buildRuntimeMonitoringThresholdConfigureInput(
        { kind: "resource", resourceId: "res_demo" },
        null,
        {
          enabled: true,
          rules: {
            cpu: { warning: "", critical: "" },
            memory: { warning: "", critical: "" },
            disk: { warning: "", critical: "" },
          },
        },
      ),
    ).toEqual({ ok: false, reason: "empty-policy" });
    expect(
      buildRuntimeMonitoringThresholdConfigureInput(
        { kind: "resource", resourceId: "res_demo" },
        thresholds,
        {
          enabled: true,
          rules: {
            cpu: { warning: "abc", critical: "" },
            memory: { warning: "", critical: "" },
            disk: { warning: "", critical: "" },
          },
        },
      ),
    ).toEqual({ ok: false, reason: "invalid-number" });
    expect(
      buildRuntimeMonitoringThresholdConfigureInput(
        { kind: "resource", resourceId: "res_demo" },
        thresholds,
        {
          enabled: true,
          rules: {
            cpu: { warning: "", critical: "" },
            memory: { warning: "90", critical: "80" },
            disk: { warning: "", critical: "" },
          },
        },
      ),
    ).toEqual({ ok: false, reason: "critical-before-warning" });
  });

  test("[RT-MON-006][RT-MON-008] creates an exact-scope threshold override from inherited readback", () => {
    const thresholds: RuntimeMonitoringThresholdsResponse = {
      schemaVersion: "runtime-monitoring-thresholds.show/v1",
      scope: { kind: "resource", resourceId: "res_demo" },
      generatedAt: "2026-05-13T01:00:00.000Z",
      policy: {
        schemaVersion: "runtime-monitoring-thresholds.policy/v1",
        policyId: "rmtp_environment",
        scope: { kind: "environment", environmentId: "env_prod" },
        rules: [
          {
            ruleId: "rmtr_memory_parent",
            signal: "memory",
            metric: "usedBytes",
            warning: 1_000,
            critical: 2_000,
            comparator: "greater-than-or-equal",
          },
          {
            ruleId: "rmtr_network_parent",
            signal: "network",
            metric: "rxBytes",
            warning: 3_000,
            critical: 4_000,
            comparator: "greater-than-or-equal",
          },
        ],
        enabled: true,
        updatedAt: "2026-05-13T00:00:00.000Z",
      },
      evaluation: {
        state: "warning",
        crossed: [],
        nextActions: [],
        sourceErrors: [],
      },
    };

    expect(runtimeMonitoringThresholdFormFromPolicy(thresholds)).toEqual({
      enabled: true,
      rules: {
        cpu: { warning: "", critical: "" },
        memory: { warning: "1000", critical: "2000" },
        disk: { warning: "", critical: "" },
      },
    });

    const result = buildRuntimeMonitoringThresholdConfigureInput(
      { kind: "resource", resourceId: "res_demo" },
      thresholds,
      {
        enabled: true,
        rules: {
          cpu: { warning: "75", critical: "95" },
          memory: { warning: "1500", critical: "2500" },
          disk: { warning: "", critical: "" },
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected threshold input");
    }
    expect(result.input.policyId).toBeUndefined();
    expect(result.input.scope).toEqual({ kind: "resource", resourceId: "res_demo" });
    expect(result.input.rules).toEqual([
      {
        signal: "cpu",
        metric: "containerCpuPercent",
        warning: 75,
        critical: 95,
        comparator: "greater-than-or-equal",
      },
      {
        signal: "memory",
        metric: "usedBytes",
        warning: 1_500,
        critical: 2_500,
        comparator: "greater-than-or-equal",
      },
    ]);
  });
});
