<script lang="ts">
  import { Activity, ClipboardList, FileText, Gauge, RefreshCw } from "@lucide/svelte";
  import type { InspectRuntimeUsageResponse } from "@appaloft/contracts";

  import RuntimeUsagePanel from "$lib/components/console/RuntimeUsagePanel.svelte";
  import { Button } from "$lib/components/ui/button";
  import {
    appendRuntimeMonitoringSample,
    formatRuntimeMonitoringPercent,
    runtimeMonitoringSampleFromUsage,
    runtimeMonitoringSparklinePoints,
    type RuntimeMonitoringSample,
  } from "$lib/console/runtime-usage";
  import { i18nKeys, t } from "$lib/i18n";

  type Props = {
    usage: InspectRuntimeUsageResponse | null;
    loading: boolean;
    error?: string;
    logsHref?: string;
    eventsHref?: string;
    diagnosticsHref?: string;
  };

  let {
    usage,
    loading,
    error = "",
    logsHref = "",
    eventsHref = "",
    diagnosticsHref = "",
  }: Props = $props();

  let samples = $state<RuntimeMonitoringSample[]>([]);
  let lastSampleObservedAt = $state("");

  $effect(() => {
    const sample = runtimeMonitoringSampleFromUsage(usage);
    if (!sample || sample.observedAt === lastSampleObservedAt) {
      return;
    }

    samples = appendRuntimeMonitoringSample(samples, sample);
    lastSampleObservedAt = sample.observedAt;
  });

  const latestSample = $derived(samples.at(-1) ?? null);
  const liveSignals = $derived.by(() => [
    {
      key: "cpu",
      label: $t(i18nKeys.console.runtimeUsage.cpu),
      value: formatRuntimeMonitoringPercent(latestSample?.cpuLoadPercent ?? null),
      points: runtimeMonitoringSparklinePoints(samples.map((sample) => sample.cpuLoadPercent)),
    },
    {
      key: "memory",
      label: $t(i18nKeys.console.runtimeUsage.memory),
      value: formatRuntimeMonitoringPercent(latestSample?.memoryPercent ?? null),
      points: runtimeMonitoringSparklinePoints(samples.map((sample) => sample.memoryPercent)),
    },
    {
      key: "disk",
      label: $t(i18nKeys.console.runtimeUsage.disk),
      value: formatRuntimeMonitoringPercent(latestSample?.diskPercent ?? null),
      points: runtimeMonitoringSparklinePoints(samples.map((sample) => sample.diskPercent)),
    },
  ]);
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
          <Button href={logsHref} variant="outline">
            <FileText class="size-4" />
            {$t(i18nKeys.console.runtimeUsage.openLogs)}
          </Button>
        {/if}
        {#if eventsHref}
          <Button href={eventsHref} variant="outline">
            <Activity class="size-4" />
            {$t(i18nKeys.console.runtimeUsage.openEvents)}
          </Button>
        {/if}
        {#if diagnosticsHref}
          <Button href={diagnosticsHref} variant="outline">
            <ClipboardList class="size-4" />
            {$t(i18nKeys.console.runtimeUsage.openDiagnostics)}
          </Button>
        {/if}
      </div>
    </div>

    <div class="mt-4 grid gap-3 md:grid-cols-3">
      {#each liveSignals as signal (signal.key)}
        <div class="rounded-md bg-muted/25 p-3">
          <div class="flex items-center justify-between gap-3">
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {signal.label}
            </p>
            <p class="text-sm font-semibold">
              {signal.value ?? $t(i18nKeys.console.runtimeUsage.unavailable)}
            </p>
          </div>
          <svg
            class="mt-3 h-12 w-full overflow-visible"
            viewBox="0 0 160 48"
            role="img"
            aria-label={signal.label}
          >
            <line x1="0" y1="48" x2="160" y2="48" class="stroke-border" stroke-width="1" />
            {#if signal.points}
              <polyline
                points={signal.points}
                class="fill-none stroke-foreground"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            {:else}
              <line x1="0" y1="24" x2="160" y2="24" class="stroke-muted-foreground/40" stroke-dasharray="4 4" />
            {/if}
          </svg>
        </div>
      {/each}
    </div>

    <p class="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <RefreshCw class="size-3.5" />
      {$t(i18nKeys.console.runtimeUsage.liveSampleCount, { count: samples.length })}
    </p>
  </section>

  <RuntimeUsagePanel {usage} {loading} {error} />
</div>
