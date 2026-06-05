<script lang="ts">
  import {
    Activity,
    ClipboardList,
    FileText,
    Gauge,
    RefreshCw,
    ShieldAlert,
    Trash2,
  } from "@lucide/svelte";
  import { browser } from "$app/environment";
  import { createMutation } from "@tanstack/svelte-query";
  import { AreaChart, Tooltip as LayerChartTooltip } from "layerchart";
  import { onDestroy } from "svelte";
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
  import * as Chart from "$lib/components/ui/chart";
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
    runtimeUsageQueryKey,
    type RuntimeMonitoringThresholdConfigureInput,
    type RuntimeMonitoringSample,
    type RuntimeMonitoringSignalKey,
  } from "$lib/console/runtime-usage";
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
    eventsHref?: string;
    diagnosticsHref?: string;
    capacityHref?: string;
    cleanupHref?: string;
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
    eventsHref = "",
    diagnosticsHref = "",
    capacityHref = "",
    cleanupHref = "",
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
  let thresholdFeedback = $state<{ kind: "error" | "success"; title: string; detail: string } | null>(
    null,
  );
  let streamUsage = $state<InspectRuntimeUsageResponse | null>(null);
  let streamLoading = $state(false);
  let streamError = $state("");
  let runtimeUsageStream: AsyncIterator<InspectRuntimeUsageResponse, Record<string, never>, void> | null =
    null;
  let runtimeUsageStreamScopeKey = "";
  let runtimeUsageInitialLoadingTimeout: ReturnType<typeof setTimeout> | null = null;

  function clearRuntimeUsageInitialLoadingTimeout(): void {
    if (!runtimeUsageInitialLoadingTimeout) {
      return;
    }

    clearTimeout(runtimeUsageInitialLoadingTimeout);
    runtimeUsageInitialLoadingTimeout = null;
  }

  function stopRuntimeUsageStream(): void {
    const stream = runtimeUsageStream;
    runtimeUsageStream = null;
    runtimeUsageStreamScopeKey = "";
    clearRuntimeUsageInitialLoadingTimeout();
    void stream?.return?.();
  }

  async function consumeRuntimeUsageStream(
    currentScope: RuntimeUsageScope,
    currentScopeKey: string,
  ): Promise<void> {
    stopRuntimeUsageStream();
    runtimeUsageStreamScopeKey = currentScopeKey;
    streamLoading = true;
    streamError = "";
    runtimeUsageInitialLoadingTimeout = setTimeout(() => {
      if (runtimeUsageStreamScopeKey === currentScopeKey && !streamUsage) {
        streamLoading = false;
      }
    }, 8_000);

    try {
      const stream = await orpcClient.runtimeUsage.inspectStream({
        scope: currentScope,
        mode: "current",
        includeArtifacts: true,
        includeWarnings: true,
      });
      runtimeUsageStream = stream;

      let result = await stream.next();
      while (runtimeUsageStream === stream && runtimeUsageStreamScopeKey === currentScopeKey && !result.done) {
        streamUsage = result.value;
        streamLoading = false;
        clearRuntimeUsageInitialLoadingTimeout();
        result = await stream.next();
      }
    } catch (error) {
      if (runtimeUsageStreamScopeKey === currentScopeKey) {
        streamError = readErrorMessage(error);
      }
    } finally {
      clearRuntimeUsageInitialLoadingTimeout();
      if (runtimeUsageStreamScopeKey === currentScopeKey) {
        streamLoading = false;
      }
    }
  }

  $effect(() => {
    if (!browser) {
      return;
    }

    const currentScopeKey = runtimeUsageQueryKey(scope).join(":");
    if (runtimeUsageStreamScopeKey === currentScopeKey) {
      return;
    }

    void consumeRuntimeUsageStream(scope, currentScopeKey);
  });

  onDestroy(stopRuntimeUsageStream);

  $effect(() => {
    const sample = runtimeMonitoringSampleFromUsage(streamUsage ?? usage);
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
  const currentUsage = $derived(streamUsage ?? usage);
  const currentLoading = $derived((streamLoading || loading) && !streamUsage && !usage);
  const currentError = $derived(streamError || error);
  const chartConfig = {
    cpu: { label: "CPU", color: "hsl(217 91% 60%)" },
    memory: { label: "Memory", color: "hsl(173 58% 39%)" },
    disk: { label: "Disk", color: "hsl(38 92% 50%)" },
  } satisfies Chart.ChartConfig;
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
    events: runtimeMonitoringObservationHref(eventsHref, {
      scope: observationScope,
      retainedSamples,
      rollup,
    }),
    diagnostics: runtimeMonitoringObservationHref(diagnosticsHref, {
      scope: observationScope,
      retainedSamples,
      rollup,
    }),
    capacity: runtimeMonitoringObservationHref(capacityHref, {
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
    if (value instanceof Date) {
      return value.toISOString().slice(11, 16);
    }

    return String(value).slice(0, 5);
  }
  function formatChartTooltipTime(value: string): string {
    return formatTime(value);
  }
  const liveSignals = $derived.by(() => [
    {
      key: "cpu",
      label: $t(i18nKeys.console.runtimeUsage.cpu),
      value: formatRuntimeMonitoringPercent(latestSignalValue("cpu", latestChartSample?.cpuLoadPercent)),
      data: runtimeMonitoringSignalChartPoints(rollup, chartSamples, "cpu"),
      color: "var(--color-cpu)",
    },
    {
      key: "memory",
      label: $t(i18nKeys.console.runtimeUsage.memory),
      value: formatRuntimeMonitoringPercent(latestSignalValue("memory", latestChartSample?.memoryPercent)),
      data: runtimeMonitoringSignalChartPoints(rollup, chartSamples, "memory"),
      color: "var(--color-memory)",
    },
    {
      key: "disk",
      label: $t(i18nKeys.console.runtimeUsage.disk),
      value: formatRuntimeMonitoringPercent(latestSignalValue("disk", latestChartSample?.diskPercent)),
      data: runtimeMonitoringSignalChartPoints(rollup, chartSamples, "disk"),
      color: "var(--color-disk)",
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
      <div class="flex flex-wrap gap-2">
        {#if logsHref}
          <Button href={observationLinks.logs} variant="outline">
            <FileText class="size-4" />
            {$t(i18nKeys.console.runtimeUsage.openLogs)}
          </Button>
        {/if}
        {#if eventsHref}
          <Button href={observationLinks.events} variant="outline">
            <Activity class="size-4" />
            {$t(i18nKeys.console.runtimeUsage.openEvents)}
          </Button>
        {/if}
        {#if diagnosticsHref}
          <Button href={observationLinks.diagnostics} variant="outline">
            <ClipboardList class="size-4" />
            {$t(i18nKeys.console.runtimeUsage.openDiagnostics)}
          </Button>
        {/if}
        {#if capacityHref}
          <Button href={observationLinks.capacity} variant="outline">
            <Gauge class="size-4" />
            {$t(i18nKeys.console.runtimeUsage.openCapacity)}
          </Button>
        {/if}
        {#if cleanupHref}
          <Button href={observationLinks.cleanup} variant="outline">
            <Trash2 class="size-4" />
            {$t(i18nKeys.console.runtimeUsage.openCleanup)}
          </Button>
        {/if}
      </div>
    </div>

    <div class="mt-4 grid gap-3 lg:grid-cols-3">
      {#each liveSignals as signal (signal.key)}
        <article class="rounded-md border bg-muted/20 p-3">
          <div class="space-y-1">
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{signal.label}</p>
            <p class="text-xl font-semibold leading-none">
              {signal.value ??
                (currentLoading
                  ? $t(i18nKeys.common.status.loading)
                  : $t(i18nKeys.console.runtimeUsage.unavailable))}
            </p>
          </div>
          <Chart.Container config={chartConfig} class="mt-3 h-32 w-full">
            {#if signal.data.length > 1}
              <AreaChart
                data={signal.data}
                x="observedAt"
                y="value"
                axis
                grid={{ x: false, y: true }}
                points={false}
                rule
                series={[
                  {
                    key: "value",
                    label: signal.label,
                    color: signal.color,
                  },
                ]}
                props={{
                  area: {
                    fillOpacity: 0.18,
                    line: {
                      strokeWidth: 2,
                    },
                  },
                  xAxis: {
                    format: formatChartAxisTime,
                    ticks: 3,
                  },
                  yAxis: {
                    format: (value: unknown) => `${Math.round(Number(value))}%`,
                    ticks: 3,
                  },
                  tooltip: {
                    root: {
                      anchor: "top-left",
                      x: "data",
                      y: "data",
                    },
                  },
                }}
              >
                <svelte:fragment slot="tooltip">
                  <LayerChartTooltip.Root anchor="top-left" x="data" y="data" let:data>
                    <LayerChartTooltip.Header value={formatChartTooltipTime(data.observedAtIso)} />
                    <LayerChartTooltip.List>
                      <LayerChartTooltip.Item
                        label={signal.label}
                        value={formatRuntimeMonitoringPercent(data.value)}
                        color={signal.color}
                        valueAlign="right"
                      />
                    </LayerChartTooltip.List>
                  </LayerChartTooltip.Root>
                </svelte:fragment>
              </AreaChart>
            {:else}
              <div
                class="flex h-full items-center justify-center border-y border-dashed border-border text-xs text-muted-foreground"
              >
                {currentLoading
                  ? $t(i18nKeys.common.status.loading)
                  : $t(i18nKeys.console.runtimeUsage.unavailable)}
              </div>
            {/if}
          </Chart.Container>
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
          {$t(i18nKeys.console.runtimeUsage.liveSampleCount, { count: samples.length })}
        {/if}
      </p>
      {#if retainedSamplesError}
        <p>{retainedSamplesError}</p>
      {/if}
      {#if currentError}
        <p>{currentError}</p>
      {/if}
    </div>

    <div class="mt-4 rounded-md border bg-muted/20 p-3">
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
        <p class="text-sm font-semibold">
          {#if thresholdsLoading}
            {$t(i18nKeys.console.runtimeUsage.thresholdLoading)}
          {:else}
            {thresholdStateLabel(thresholdSummary?.state)}
          {/if}
        </p>
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

      <form class="mt-4 space-y-3" onsubmit={configureThresholdPolicy}>
        <div class="grid gap-3 lg:grid-cols-3">
          <div class="rounded-md border bg-background/60 p-3">
            <p class="text-xs font-semibold text-foreground">
              {$t(i18nKeys.console.runtimeUsage.thresholdCpuTitle)}
            </p>
            <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <label class="space-y-1.5 text-xs font-medium text-muted-foreground">
                {$t(i18nKeys.console.runtimeUsage.thresholdWarningLabel)}
                <Input
                  bind:value={thresholdCpuWarning}
                  inputmode="decimal"
                  placeholder={$t(i18nKeys.console.runtimeUsage.thresholdPercentPlaceholder)}
                />
              </label>
              <label class="space-y-1.5 text-xs font-medium text-muted-foreground">
                {$t(i18nKeys.console.runtimeUsage.thresholdCriticalLabel)}
                <Input
                  bind:value={thresholdCpuCritical}
                  inputmode="decimal"
                  placeholder={$t(i18nKeys.console.runtimeUsage.thresholdPercentPlaceholder)}
                />
              </label>
            </div>
          </div>

          <div class="rounded-md border bg-background/60 p-3">
            <p class="text-xs font-semibold text-foreground">
              {$t(i18nKeys.console.runtimeUsage.thresholdMemoryTitle)}
            </p>
            <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <label class="space-y-1.5 text-xs font-medium text-muted-foreground">
                {$t(i18nKeys.console.runtimeUsage.thresholdWarningLabel)}
                <Input
                  bind:value={thresholdMemoryWarning}
                  inputmode="numeric"
                  placeholder={$t(i18nKeys.console.runtimeUsage.thresholdBytesPlaceholder)}
                />
              </label>
              <label class="space-y-1.5 text-xs font-medium text-muted-foreground">
                {$t(i18nKeys.console.runtimeUsage.thresholdCriticalLabel)}
                <Input
                  bind:value={thresholdMemoryCritical}
                  inputmode="numeric"
                  placeholder={$t(i18nKeys.console.runtimeUsage.thresholdBytesPlaceholder)}
                />
              </label>
            </div>
          </div>

          <div class="rounded-md border bg-background/60 p-3">
            <p class="text-xs font-semibold text-foreground">
              {$t(i18nKeys.console.runtimeUsage.thresholdDiskTitle)}
            </p>
            <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <label class="space-y-1.5 text-xs font-medium text-muted-foreground">
                {$t(i18nKeys.console.runtimeUsage.thresholdWarningLabel)}
                <Input
                  bind:value={thresholdDiskWarning}
                  inputmode="numeric"
                  placeholder={$t(i18nKeys.console.runtimeUsage.thresholdBytesPlaceholder)}
                />
              </label>
              <label class="space-y-1.5 text-xs font-medium text-muted-foreground">
                {$t(i18nKeys.console.runtimeUsage.thresholdCriticalLabel)}
                <Input
                  bind:value={thresholdDiskCritical}
                  inputmode="numeric"
                  placeholder={$t(i18nKeys.console.runtimeUsage.thresholdBytesPlaceholder)}
                />
              </label>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <label class="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <input
              class="size-4 rounded border-border"
              type="checkbox"
              bind:checked={thresholdEnabled}
            />
            {$t(i18nKeys.console.runtimeUsage.thresholdEnabledLabel)}
          </label>
          <Button disabled={configureThresholdMutation.isPending} type="submit">
            {configureThresholdMutation.isPending
              ? $t(i18nKeys.common.actions.saving)
              : $t(i18nKeys.common.actions.save)}
          </Button>
        </div>
      </form>

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
