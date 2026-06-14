<script lang="ts">
  import {
    Activity,
    ClipboardList,
    Clock3,
    Cpu,
    FileText,
    Gauge,
    HardDrive,
    MemoryStick,
    RefreshCw,
    Settings2,
    ShieldAlert,
  } from "@lucide/svelte";
  import { createMutation } from "@tanstack/svelte-query";
  import type {
    InspectRuntimeUsageResponse,
    RuntimeMonitoringRollupResponse,
    RuntimeMonitoringSamplesResponse,
    RuntimeMonitoringThresholdsResponse,
    RuntimeUsageScope,
  } from "@appaloft/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import RuntimeUsagePanel from "$lib/components/console/RuntimeUsagePanel.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import {
    appendRuntimeMonitoringSample,
    buildRuntimeMonitoringThresholdConfigureInput,
    formatRuntimeMonitoringPercent,
    latestRuntimeMonitoringRollupValue,
    mergeRuntimeMonitoringSamples,
    retainedRuntimeMonitoringSamples,
    runtimeMonitoringDeploymentMarkerItems,
    runtimeMonitoringObservationHref,
    runtimeMonitoringThresholdFormFromPolicy,
    runtimeMonitoringRollupSummary,
    runtimeMonitoringRollupValues,
    runtimeMonitoringSampleFromUsage,
    runtimeMonitoringSignalChartPoints,
    runtimeMonitoringScopeQueryKey,
    runtimeMonitoringThresholdSummary,
    runtimeMonitoringTopContributorItems,
    type RuntimeMonitoringThresholdConfigureInput,
    type RuntimeMonitoringSample,
    type RuntimeMonitoringSignalKey,
  } from "$lib/console/runtime-usage";
  import {
    runtimeMonitoringRefreshIntervalMs,
    runtimeMonitoringTimeRangeOptions,
    type RuntimeMonitoringTimeRangeId,
  } from "$lib/console/runtime-usage-query";
  import { formatTime } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type Props = {
    scope: RuntimeUsageScope;
    observationScope?: RuntimeUsageScope;
    usage: InspectRuntimeUsageResponse | null;
    loading: boolean;
    error?: string;
    retainedSamples?: RuntimeMonitoringSamplesResponse | null;
    retainedSamplesLoading?: boolean;
    retainedSamplesError?: string;
    rollup?: RuntimeMonitoringRollupResponse | null;
    rollupLoading?: boolean;
    rollupError?: string;
    thresholds?: RuntimeMonitoringThresholdsResponse | null;
    thresholdsLoading?: boolean;
    thresholdsError?: string;
    logsHref?: string;
    diagnosticsHref?: string;
    cleanupHref?: string;
    timeRange?: RuntimeMonitoringTimeRangeId;
    refreshing?: boolean;
    onTimeRangeChange?: (timeRange: RuntimeMonitoringTimeRangeId) => void;
    onRefresh?: () => void;
  };

  let {
    scope,
    observationScope = scope,
    usage,
    loading,
    error = "",
    retainedSamples = null,
    retainedSamplesLoading = false,
    retainedSamplesError = "",
    rollup = null,
    rollupLoading = false,
    rollupError = "",
    thresholds = null,
    thresholdsLoading = false,
    thresholdsError = "",
    logsHref = "",
    diagnosticsHref = "",
    cleanupHref = "",
    timeRange = "1h",
    refreshing = false,
    onTimeRangeChange,
    onRefresh,
  }: Props = $props();

  let samples = $state<RuntimeMonitoringSample[]>([]);
  let lastSampleObservedAt = $state("");
  let thresholdEnabled = $state(true);
  let thresholdCpuWarning = $state("");
  let thresholdCpuCritical = $state("");
  let thresholdMemoryWarning = $state("");
  let thresholdMemoryCritical = $state("");
  let thresholdDiskWarning = $state("");
  let thresholdDiskCritical = $state("");
  let thresholdPolicyFingerprint = $state("");
  let thresholdDialogOpen = $state(false);
  let thresholdFeedback = $state<{ kind: "error" | "success"; title: string; detail: string } | null>(
    null,
  );
  $effect(() => {
    const sample = runtimeMonitoringSampleFromUsage(usage);
    if (!sample || sample.observedAt === lastSampleObservedAt) {
      return;
    }

    samples = appendRuntimeMonitoringSample(samples, sample);
    lastSampleObservedAt = sample.observedAt;
  });

  const latestSample = $derived(samples.at(-1) ?? null);
  const retainedChartSamples = $derived(retainedRuntimeMonitoringSamples(retainedSamples));
  const chartSamples = $derived(mergeRuntimeMonitoringSamples(retainedChartSamples, samples));
  const latestChartSample = $derived(chartSamples.at(-1) ?? latestSample);
  const currentUsage = $derived(usage);
  const currentLoading = $derived(loading && !usage);
  const currentError = $derived(error);
  const rollupSummary = $derived(runtimeMonitoringRollupSummary(rollup));
  const deploymentMarkerItems = $derived(runtimeMonitoringDeploymentMarkerItems(rollup));
  const topContributorItems = $derived(runtimeMonitoringTopContributorItems(rollup));
  const thresholdSummary = $derived(runtimeMonitoringThresholdSummary(thresholds));
  const observationLinks = $derived.by(() => ({
    logs: runtimeMonitoringObservationHref(logsHref, {
      scope: observationScope,
      retainedSamples,
      rollup,
    }),
    diagnostics: runtimeMonitoringObservationHref(diagnosticsHref, {
      scope: observationScope,
      retainedSamples,
      rollup,
    }),
    cleanup: runtimeMonitoringObservationHref(cleanupHref, {
      scope: observationScope,
      retainedSamples,
      rollup,
    }),
  }));
  const fallbackValues = $derived.by((): Record<RuntimeMonitoringSignalKey, Array<number | null>> => ({
    cpu: chartSamples.map((sample) => sample.cpuLoadPercent),
    memory: chartSamples.map((sample) => sample.memoryPercent),
    disk: chartSamples.map((sample) => sample.diskPercent),
  }));
  function signalValues(signal: RuntimeMonitoringSignalKey): Array<number | null> {
    const rollupValues = runtimeMonitoringRollupValues(rollup, signal);
    return rollupValues.length > 0 ? rollupValues : fallbackValues[signal];
  }
  function latestSignalValue(
    signal: RuntimeMonitoringSignalKey,
    fallbackValue: number | null | undefined,
  ): number | null {
    return latestRuntimeMonitoringRollupValue(rollup, signal) ?? fallbackValue ?? null;
  }
  function formatChartAxisTime(value: unknown): string {
    const date = value instanceof Date ? value : new Date(String(value));
    if (!Number.isFinite(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }
  function formatChartTooltipTime(value: string): string {
    return formatTime(value);
  }
  function timeRangeLabel(value: RuntimeMonitoringTimeRangeId): string {
    switch (value) {
      case "15m":
        return $t(i18nKeys.console.runtimeUsage.timeRange15m);
      case "1h":
        return $t(i18nKeys.console.runtimeUsage.timeRange1h);
      case "6h":
        return $t(i18nKeys.console.runtimeUsage.timeRange6h);
      case "24h":
        return $t(i18nKeys.console.runtimeUsage.timeRange24h);
    }
  }
  function refreshIntervalLabel(): string {
    return $t(i18nKeys.console.runtimeUsage.refreshInterval, {
      seconds: Math.round(runtimeMonitoringRefreshIntervalMs / 1000),
    });
  }
  function selectTimeRange(nextTimeRange: RuntimeMonitoringTimeRangeId): void {
    onTimeRangeChange?.(nextTimeRange);
  }
  function xTickPoints(data: { observedAt: Date }[]): { x: number; label: string }[] {
    if (data.length === 0) {
      return [];
    }

    const indexes = Array.from(new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]));
    return indexes.map((index) => ({
      x: chartX(data[index].observedAt, data),
      label: formatChartAxisTime(data[index].observedAt),
    }));
  }
  function chartX(value: Date, data: { observedAt: Date }[]): number {
    const min = data[0]?.observedAt.getTime() ?? value.getTime();
    const max = data.at(-1)?.observedAt.getTime() ?? value.getTime();
    const width = 298;
    if (max <= min) {
      return 42;
    }

    return 42 + ((value.getTime() - min) / (max - min)) * width;
  }
  function chartY(value: number): number {
    return 116 - (Math.max(0, Math.min(100, value)) / 100) * 96;
  }
  function linePath(data: { observedAt: Date; value: number }[]): string {
    return data
      .map((point, index) => `${index === 0 ? "M" : "L"} ${chartX(point.observedAt, data).toFixed(1)} ${chartY(point.value).toFixed(1)}`)
      .join(" ");
  }
  function areaPath(data: { observedAt: Date; value: number }[]): string {
    if (data.length === 0) {
      return "";
    }

    const startX = chartX(data[0].observedAt, data);
    const endX = chartX(data.at(-1)?.observedAt ?? data[0].observedAt, data);
    return `${linePath(data)} L ${endX.toFixed(1)} 116 L ${startX.toFixed(1)} 116 Z`;
  }
  const liveSignals = $derived.by(() => [
    {
      key: "cpu",
      icon: Cpu,
      label: $t(i18nKeys.console.runtimeUsage.cpu),
      value: formatRuntimeMonitoringPercent(latestSignalValue("cpu", latestChartSample?.cpuLoadPercent)),
      data: runtimeMonitoringSignalChartPoints(rollup, chartSamples, "cpu"),
      color: "hsl(217 91% 60%)",
      fillColor: "hsl(217 91% 60% / 0.14)",
    },
    {
      key: "memory",
      icon: MemoryStick,
      label: $t(i18nKeys.console.runtimeUsage.memory),
      value: formatRuntimeMonitoringPercent(latestSignalValue("memory", latestChartSample?.memoryPercent)),
      data: runtimeMonitoringSignalChartPoints(rollup, chartSamples, "memory"),
      color: "hsl(173 58% 39%)",
      fillColor: "hsl(173 58% 39% / 0.14)",
    },
    {
      key: "disk",
      icon: HardDrive,
      label: $t(i18nKeys.console.runtimeUsage.disk),
      value: formatRuntimeMonitoringPercent(latestSignalValue("disk", latestChartSample?.diskPercent)),
      data: runtimeMonitoringSignalChartPoints(rollup, chartSamples, "disk"),
      color: "hsl(38 92% 50%)",
      fillColor: "hsl(38 92% 50% / 0.14)",
    },
  ]);

  $effect(() => {
    const fingerprint = thresholds?.policy
      ? `${thresholds.policy.policyId}:${thresholds.policy.updatedAt}:${thresholds.policy.enabled}:${JSON.stringify(thresholds.policy.rules)}`
      : "none";
    if (fingerprint === thresholdPolicyFingerprint) {
      return;
    }

    thresholdPolicyFingerprint = fingerprint;
    const form = runtimeMonitoringThresholdFormFromPolicy(thresholds);
    thresholdEnabled = form.enabled;
    thresholdCpuWarning = form.rules.cpu.warning;
    thresholdCpuCritical = form.rules.cpu.critical;
    thresholdMemoryWarning = form.rules.memory.warning;
    thresholdMemoryCritical = form.rules.memory.critical;
    thresholdDiskWarning = form.rules.disk.warning;
    thresholdDiskCritical = form.rules.disk.critical;
  });

  const thresholdRuleSummaries = $derived.by(() => [
    {
      key: "cpu",
      label: $t(i18nKeys.console.runtimeUsage.thresholdCpuTitle),
      warning: thresholdCpuWarning,
      critical: thresholdCpuCritical,
    },
    {
      key: "memory",
      label: $t(i18nKeys.console.runtimeUsage.thresholdMemoryTitle),
      warning: thresholdMemoryWarning,
      critical: thresholdMemoryCritical,
    },
    {
      key: "disk",
      label: $t(i18nKeys.console.runtimeUsage.thresholdDiskTitle),
      warning: thresholdDiskWarning,
      critical: thresholdDiskCritical,
    },
  ]);
  const configuredThresholdRuleSummaries = $derived(
    thresholdRuleSummaries.filter((rule) => rule.warning || rule.critical),
  );

  function thresholdStateLabel(
    state: RuntimeMonitoringThresholdsResponse["evaluation"]["state"] | undefined,
  ): string {
    switch (state) {
      case "ok":
        return $t(i18nKeys.console.runtimeUsage.thresholdStateOk);
      case "warning":
        return $t(i18nKeys.console.runtimeUsage.thresholdStateWarning);
      case "critical":
        return $t(i18nKeys.console.runtimeUsage.thresholdStateCritical);
      case "stale":
        return $t(i18nKeys.console.runtimeUsage.thresholdStateStale);
      case "unknown":
      default:
        return $t(i18nKeys.console.runtimeUsage.thresholdStateUnknown);
    }
  }

  function scopeKindLabel(kind: RuntimeUsageScope["kind"]): string {
    switch (kind) {
      case "deployment":
        return $t(i18nKeys.common.domain.deployment);
      case "environment":
        return $t(i18nKeys.common.domain.environment);
      case "project":
        return $t(i18nKeys.common.domain.project);
      case "resource":
        return $t(i18nKeys.common.domain.resource);
      case "server":
        return $t(i18nKeys.common.domain.server);
    }
  }

  function resetThresholdForm(): void {
    const form = runtimeMonitoringThresholdFormFromPolicy(thresholds);
    thresholdEnabled = form.enabled;
    thresholdCpuWarning = form.rules.cpu.warning;
    thresholdCpuCritical = form.rules.cpu.critical;
    thresholdMemoryWarning = form.rules.memory.warning;
    thresholdMemoryCritical = form.rules.memory.critical;
    thresholdDiskWarning = form.rules.disk.warning;
    thresholdDiskCritical = form.rules.disk.critical;
    thresholdFeedback = null;
  }

  function setThresholdDialogOpen(open: boolean): void {
    thresholdDialogOpen = open;
    if (open) {
      resetThresholdForm();
    }
  }

  function configureThresholdPolicy(event: SubmitEvent) {
    event.preventDefault();
    thresholdFeedback = null;

    const result = buildRuntimeMonitoringThresholdConfigureInput(scope, thresholds, {
      enabled: thresholdEnabled,
      rules: {
        cpu: {
          warning: thresholdCpuWarning,
          critical: thresholdCpuCritical,
        },
        memory: {
          warning: thresholdMemoryWarning,
          critical: thresholdMemoryCritical,
        },
        disk: {
          warning: thresholdDiskWarning,
          critical: thresholdDiskCritical,
        },
      },
    });
    if (!result.ok) {
      thresholdFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.runtimeUsage.thresholdSaveFailed),
        detail:
          result.reason === "critical-before-warning"
            ? $t(i18nKeys.console.runtimeUsage.thresholdCriticalBeforeWarning)
            : result.reason === "empty-policy"
              ? $t(i18nKeys.console.runtimeUsage.thresholdEmptyPolicy)
              : $t(i18nKeys.console.runtimeUsage.thresholdInvalidNumber),
      };
      return;
    }

    configureThresholdMutation.mutate(result.input);
  }

  const configureThresholdMutation = createMutation(() => ({
    mutationFn: (input: RuntimeMonitoringThresholdConfigureInput) =>
      orpcClient.runtimeMonitoring.thresholdConfigure(input),
    onSuccess: (result) => {
      thresholdFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.runtimeUsage.thresholdConfigureSaved),
        detail: result.policy.policyId,
      };
      thresholdDialogOpen = false;
      void queryClient.invalidateQueries({
        queryKey: runtimeMonitoringScopeQueryKey("runtime-monitoring-thresholds", scope),
      });
    },
    onError: (error) => {
      thresholdFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.runtimeUsage.thresholdSaveFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
</script>

<div class="space-y-4">
  <section class="rounded-md border bg-background p-4">
    <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <Gauge class="size-5 text-muted-foreground" />
          <h2 class="text-lg font-semibold">{$t(i18nKeys.console.runtimeUsage.monitorTitle)}</h2>
        </div>
        <p class="mt-1 text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.runtimeUsage.monitorDescription)}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <div
          class="inline-flex items-center gap-1 rounded-md border bg-background p-1 text-sm text-muted-foreground"
          aria-label={$t(i18nKeys.console.runtimeUsage.timeRange)}
        >
          <Clock3 class="size-4" />
          <span class="sr-only">{$t(i18nKeys.console.runtimeUsage.timeRange)}</span>
          {#each runtimeMonitoringTimeRangeOptions as option (option)}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              class={timeRange === option
                ? "border-primary/30 bg-primary/10 text-primary shadow-none hover:bg-primary/15 hover:text-primary"
                : "bg-transparent text-muted-foreground hover:bg-primary/5 hover:text-foreground"}
              aria-pressed={timeRange === option}
              data-runtime-time-range-option={option}
              onclick={() => selectTimeRange(option)}
            >
              {timeRangeLabel(option)}
            </Button>
          {/each}
        </div>
        <Button type="button" variant="outline" onclick={() => onRefresh?.()} disabled={refreshing}>
          <RefreshCw class="size-4" />
          {refreshing
            ? $t(i18nKeys.common.status.loading)
            : $t(i18nKeys.console.runtimeUsage.refreshNow)}
        </Button>
        {#if logsHref}
          <Button href={observationLinks.logs} variant="outline">
            <FileText class="size-4" />
            {$t(i18nKeys.console.runtimeUsage.openLogs)}
          </Button>
        {/if}
        {#if diagnosticsHref}
          <Button href={observationLinks.diagnostics} variant="outline">
            <ClipboardList class="size-4" />
            {$t(i18nKeys.console.runtimeUsage.openDiagnostics)}
          </Button>
        {/if}
        {#if cleanupHref}
          <Button href={observationLinks.cleanup} variant="outline">
            <Settings2 class="size-4" />
            {$t(i18nKeys.console.runtimeUsage.openCleanup)}
          </Button>
        {/if}
      </div>
    </div>

    <div class="mt-4 grid gap-3 lg:grid-cols-3">
      {#each liveSignals as signal (signal.key)}
        <article class="rounded-md border bg-muted/20 p-3" data-runtime-signal-card={signal.key}>
          <div class="space-y-1">
            <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <signal.icon class="size-4" aria-hidden="true" data-runtime-signal-icon />
              {signal.label}
            </p>
            <p class="text-xl font-semibold leading-none">
              {signal.value ??
                (currentLoading
                  ? $t(i18nKeys.common.status.loading)
                  : $t(i18nKeys.console.runtimeUsage.unavailable))}
            </p>
          </div>
          <div class="mt-3 h-36 w-full">
            {#if signal.data.length > 1}
              <svg
                aria-label={`${signal.label} ${signal.value ?? ""}`}
                class="h-full w-full overflow-visible font-sans text-[11px] tabular-nums"
                role="img"
                viewBox="0 0 360 150"
              >
                <title>
                  {signal.label}
                  {signal.value ? ` ${signal.value}` : ""}
                  {signal.data.at(-1)?.observedAtIso
                    ? ` · ${formatChartTooltipTime(signal.data.at(-1)?.observedAtIso ?? "")}`
                    : ""}
                </title>
                <line x1="42" x2="340" y1="20" y2="20" class="stroke-border" />
                <line x1="42" x2="340" y1="68" y2="68" class="stroke-border" stroke-dasharray="3 4" />
                <line x1="42" x2="340" y1="116" y2="116" class="stroke-border" />
                {#each [0, 50, 100] as tick (tick)}
                  <text
                    x="36"
                    y={chartY(tick) + 4}
                    class="fill-muted-foreground"
                    text-anchor="end"
                  >
                    {tick}%
                  </text>
                {/each}
                <path d={areaPath(signal.data)} fill={signal.fillColor} />
                <path
                  d={linePath(signal.data)}
                  fill="none"
                  stroke={signal.color}
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2.2"
                />
                {#each xTickPoints(signal.data) as tick (tick.label + tick.x)}
                  <text
                    x={tick.x}
                    y="140"
                    class="fill-muted-foreground"
                    text-anchor="middle"
                  >
                    {tick.label}
                  </text>
                {/each}
              </svg>
            {:else}
              <div
                class="flex h-full items-center justify-center border-y border-dashed border-border text-xs text-muted-foreground"
              >
                {currentLoading
                  ? $t(i18nKeys.common.status.loading)
                  : $t(i18nKeys.console.runtimeUsage.unavailable)}
              </div>
            {/if}
          </div>
        </article>
      {/each}
    </div>

    <div class="mt-3 flex flex-col gap-2 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
      <p class="inline-flex items-center gap-1.5">
        <RefreshCw class="size-3.5" />
        {#if retainedChartSamples.length > 0}
          {$t(i18nKeys.console.runtimeUsage.retainedSampleCount, { count: retainedChartSamples.length })}
        {:else if retainedSamplesLoading}
          {$t(i18nKeys.console.runtimeUsage.retainedSamplesLoading)}
        {:else}
          {$t(i18nKeys.console.runtimeUsage.retainedSampleCount, { count: chartSamples.length })}
        {/if}
        · {refreshIntervalLabel()}
      </p>
      {#if retainedSamplesError}
        <p>{retainedSamplesError}</p>
      {/if}
      {#if currentError}
        <p>{currentError}</p>
      {/if}
    </div>

    <div class="mt-4 rounded-md border bg-muted/20 p-3" data-runtime-threshold-display-surface>
      <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div class="flex min-w-0 items-center gap-2">
          <Activity class="size-4 text-muted-foreground" />
          <p class="text-sm font-medium">{$t(i18nKeys.console.runtimeUsage.rollupTitle)}</p>
        </div>
        <p class="text-sm font-semibold">
          {#if rollupLoading}
            {$t(i18nKeys.console.runtimeUsage.rollupLoading)}
          {:else if rollupSummary}
            {$t(i18nKeys.console.runtimeUsage.rollupBucket, { bucket: rollupSummary.bucket })}
          {:else}
            {$t(i18nKeys.console.runtimeUsage.unavailable)}
          {/if}
        </p>
      </div>
      <p class="mt-2 text-xs leading-5 text-muted-foreground">
        {#if rollupError}
          {rollupError}
        {:else if rollupSummary}
          {$t(i18nKeys.console.runtimeUsage.rollupSummary, {
            series: rollupSummary.seriesCount,
            markers: rollupSummary.markerCount,
            contributors: rollupSummary.contributorCount,
          })}
        {:else}
          {$t(i18nKeys.console.runtimeUsage.rollupUnavailable)}
        {/if}
      </p>
      {#if rollupSummary}
        <div class="mt-3 grid gap-3 lg:grid-cols-2">
          <div class="min-w-0">
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {$t(i18nKeys.console.runtimeUsage.rollupMarkersTitle)}
            </p>
            {#if deploymentMarkerItems.length > 0}
              <ul class="mt-2 space-y-2">
                {#each deploymentMarkerItems as marker (marker.deploymentId + marker.observedAt)}
                  <li class="min-w-0 text-xs">
                    <a class="block truncate font-medium text-foreground hover:underline" href={marker.href}>
                      {marker.label}
                    </a>
                    <p class="mt-0.5 text-muted-foreground">
                      {$t(i18nKeys.console.runtimeUsage.rollupMarkerMeta, {
                        status: marker.status,
                        observedAt: formatTime(marker.observedAt),
                      })}
                    </p>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="mt-2 text-xs text-muted-foreground">
                {$t(i18nKeys.console.runtimeUsage.rollupMarkersEmpty)}
              </p>
            {/if}
          </div>

          <div class="min-w-0">
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {$t(i18nKeys.console.runtimeUsage.rollupContributorsTitle)}
            </p>
            {#if topContributorItems.length > 0}
              <ul class="mt-2 space-y-2">
                {#each topContributorItems as contributor (contributor.scope.kind + contributor.scopeId)}
                  <li class="min-w-0 text-xs">
                    <a class="block truncate font-medium text-foreground hover:underline" href={contributor.href}>
                      {scopeKindLabel(contributor.scope.kind)} · {contributor.scopeId}
                    </a>
                    <p class="mt-0.5 text-muted-foreground">
                      {$t(i18nKeys.console.runtimeUsage.rollupContributorSamples, {
                        count: contributor.sampleCount,
                      })}
                    </p>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="mt-2 text-xs text-muted-foreground">
                {$t(i18nKeys.console.runtimeUsage.rollupContributorsEmpty)}
              </p>
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <div class="mt-4 rounded-md border bg-muted/20 p-3">
      <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div class="flex min-w-0 items-center gap-2">
          <ShieldAlert class="size-4 text-muted-foreground" />
          <p class="text-sm font-medium">{$t(i18nKeys.console.runtimeUsage.thresholdTitle)}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <p class="text-sm font-semibold">
            {#if thresholdsLoading}
              {$t(i18nKeys.console.runtimeUsage.thresholdLoading)}
            {:else}
              {thresholdStateLabel(thresholdSummary?.state)}
            {/if}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={thresholdsLoading}
            onclick={() => setThresholdDialogOpen(true)}
          >
            {$t(i18nKeys.common.actions.edit)}
          </Button>
        </div>
      </div>
      <p class="mt-2 text-xs leading-5 text-muted-foreground">
        {#if thresholdsError}
          {thresholdsError}
        {:else if thresholdSummary && !thresholdSummary.hasPolicy}
          {$t(i18nKeys.console.runtimeUsage.thresholdNoPolicy)}
        {:else if thresholdSummary}
          {$t(i18nKeys.console.runtimeUsage.thresholdSummary, {
            crossings: thresholdSummary.crossingCount,
            actions: thresholdSummary.nextActionCount,
          })}
        {:else}
          {$t(i18nKeys.console.runtimeUsage.thresholdUnavailable)}
        {/if}
      </p>

      {#if configuredThresholdRuleSummaries.length > 0}
        <div class="mt-4 grid gap-2 md:grid-cols-3">
          {#each configuredThresholdRuleSummaries as rule (rule.key)}
            <div class="rounded-md border bg-background/60 px-3 py-2 text-xs">
              <p class="font-semibold text-foreground">{rule.label}</p>
              <div class="mt-2 flex flex-wrap gap-2 text-muted-foreground">
                {#if rule.warning}
                  <span>
                    {$t(i18nKeys.console.runtimeUsage.thresholdWarningLabel)}:
                    <span class="font-medium text-foreground">{rule.warning}</span>
                  </span>
                {/if}
                {#if rule.critical}
                  <span>
                    {$t(i18nKeys.console.runtimeUsage.thresholdCriticalLabel)}:
                    <span class="font-medium text-foreground">{rule.critical}</span>
                  </span>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}

      {#if thresholdFeedback}
        <div
          class={`mt-3 rounded-md border p-3 text-xs ${thresholdFeedback.kind === "error" ? "border-destructive/30 text-destructive" : "border-border text-foreground"}`}
        >
          <p class="font-medium">{thresholdFeedback.title}</p>
          <p class="mt-1 text-muted-foreground">{thresholdFeedback.detail}</p>
        </div>
      {/if}
    </div>
  </section>

  <RuntimeUsagePanel usage={currentUsage} loading={currentLoading} error={currentError} />
</div>

<Dialog.Root bind:open={thresholdDialogOpen} onOpenChange={setThresholdDialogOpen}>
  <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-4xl">
    <Dialog.Header>
      <Dialog.Title>{$t(i18nKeys.console.runtimeUsage.thresholdTitle)}</Dialog.Title>
      <Dialog.Description>
        {#if thresholdSummary && !thresholdSummary.hasPolicy}
          {$t(i18nKeys.console.runtimeUsage.thresholdNoPolicy)}
        {:else if thresholdSummary}
          {$t(i18nKeys.console.runtimeUsage.thresholdSummary, {
            crossings: thresholdSummary.crossingCount,
            actions: thresholdSummary.nextActionCount,
          })}
        {:else}
          {$t(i18nKeys.console.runtimeUsage.thresholdUnavailable)}
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    <form class="space-y-4 px-5 pb-5" onsubmit={configureThresholdPolicy} data-runtime-threshold-dialog>
      <div class="grid gap-3 lg:grid-cols-3">
        <div class="rounded-md border bg-background p-3">
          <p class="text-xs font-semibold text-foreground">
            {$t(i18nKeys.console.runtimeUsage.thresholdCpuTitle)}
          </p>
          <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <label class="space-y-1.5 text-xs font-medium text-muted-foreground">
              <span>{$t(i18nKeys.console.runtimeUsage.thresholdWarningLabel)}</span>
              <Input
                bind:value={thresholdCpuWarning}
                inputmode="decimal"
                placeholder={$t(i18nKeys.console.runtimeUsage.thresholdPercentPlaceholder)}
              />
            </label>
            <label class="space-y-1.5 text-xs font-medium text-muted-foreground">
              <span>{$t(i18nKeys.console.runtimeUsage.thresholdCriticalLabel)}</span>
              <Input
                bind:value={thresholdCpuCritical}
                inputmode="decimal"
                placeholder={$t(i18nKeys.console.runtimeUsage.thresholdPercentPlaceholder)}
              />
            </label>
          </div>
        </div>

        <div class="rounded-md border bg-background p-3">
          <p class="text-xs font-semibold text-foreground">
            {$t(i18nKeys.console.runtimeUsage.thresholdMemoryTitle)}
          </p>
          <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <label class="space-y-1.5 text-xs font-medium text-muted-foreground">
              <span>{$t(i18nKeys.console.runtimeUsage.thresholdWarningLabel)}</span>
              <Input
                bind:value={thresholdMemoryWarning}
                inputmode="numeric"
                placeholder={$t(i18nKeys.console.runtimeUsage.thresholdBytesPlaceholder)}
              />
            </label>
            <label class="space-y-1.5 text-xs font-medium text-muted-foreground">
              <span>{$t(i18nKeys.console.runtimeUsage.thresholdCriticalLabel)}</span>
              <Input
                bind:value={thresholdMemoryCritical}
                inputmode="numeric"
                placeholder={$t(i18nKeys.console.runtimeUsage.thresholdBytesPlaceholder)}
              />
            </label>
          </div>
        </div>

        <div class="rounded-md border bg-background p-3">
          <p class="text-xs font-semibold text-foreground">
            {$t(i18nKeys.console.runtimeUsage.thresholdDiskTitle)}
          </p>
          <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <label class="space-y-1.5 text-xs font-medium text-muted-foreground">
              <span>{$t(i18nKeys.console.runtimeUsage.thresholdWarningLabel)}</span>
              <Input
                bind:value={thresholdDiskWarning}
                inputmode="numeric"
                placeholder={$t(i18nKeys.console.runtimeUsage.thresholdBytesPlaceholder)}
              />
            </label>
            <label class="space-y-1.5 text-xs font-medium text-muted-foreground">
              <span>{$t(i18nKeys.console.runtimeUsage.thresholdCriticalLabel)}</span>
              <Input
                bind:value={thresholdDiskCritical}
                inputmode="numeric"
                placeholder={$t(i18nKeys.console.runtimeUsage.thresholdBytesPlaceholder)}
              />
            </label>
          </div>
        </div>
      </div>

      {#if thresholdFeedback}
        <div
          class={`rounded-md border p-3 text-xs ${thresholdFeedback.kind === "error" ? "border-destructive/30 text-destructive" : "border-border text-foreground"}`}
        >
          <p class="font-medium">{thresholdFeedback.title}</p>
          <p class="mt-1 text-muted-foreground">{thresholdFeedback.detail}</p>
        </div>
      {/if}

      <Dialog.Footer class="px-0 pb-0">
        <label class="mr-auto flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <input
            class="size-4 rounded border-border"
            type="checkbox"
            bind:checked={thresholdEnabled}
          />
          {$t(i18nKeys.console.runtimeUsage.thresholdEnabledLabel)}
        </label>
        <Button type="button" variant="outline" onclick={() => setThresholdDialogOpen(false)}>
          {$t(i18nKeys.common.actions.cancel)}
        </Button>
        <Button disabled={configureThresholdMutation.isPending} type="submit">
          {configureThresholdMutation.isPending
            ? $t(i18nKeys.common.actions.saving)
            : $t(i18nKeys.common.actions.save)}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
