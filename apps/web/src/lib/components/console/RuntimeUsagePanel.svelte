<script lang="ts">
  import {
    AlertTriangle,
    Clock3,
    Cpu,
    Database,
    HardDrive,
    MemoryStick,
    PackageOpen,
  } from "@lucide/svelte";
  import type { InspectRuntimeUsageResponse, RuntimeUsageFreshness } from "@appaloft/contracts";

  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { formatRuntimeUsageBytes } from "$lib/console/runtime-usage";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import { formatTime } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";

  type Props = {
    usage: InspectRuntimeUsageResponse | null;
    loading: boolean;
    error?: string;
  };

  let { usage, loading, error = "" }: Props = $props();

  const metricTiles = $derived.by(() => [
    {
      key: "disk",
      icon: HardDrive,
      label: $t(i18nKeys.console.runtimeUsage.disk),
      value: formatRuntimeUsageBytes(usage?.totals.disk?.usedBytes),
      detail:
        usage?.totals.disk?.totalBytes !== undefined
          ? $t(i18nKeys.console.runtimeUsage.totalBytes, {
              value: formatRuntimeUsageBytes(usage.totals.disk.totalBytes) ?? "",
            })
          : "",
    },
    {
      key: "memory",
      icon: MemoryStick,
      label: $t(i18nKeys.console.runtimeUsage.memory),
      value: formatRuntimeUsageBytes(usage?.totals.memory?.usedBytes),
      detail:
        usage?.totals.memory?.totalBytes !== undefined
          ? $t(i18nKeys.console.runtimeUsage.totalBytes, {
              value: formatRuntimeUsageBytes(usage.totals.memory.totalBytes) ?? "",
            })
          : "",
    },
    {
      key: "docker",
      icon: PackageOpen,
      label: $t(i18nKeys.console.runtimeUsage.docker),
      value: formatRuntimeUsageBytes(usage?.totals.docker?.imageBytes),
      detail:
        usage?.totals.docker?.buildCacheBytes !== undefined
          ? $t(i18nKeys.console.runtimeUsage.buildCacheBytes, {
              value: formatRuntimeUsageBytes(usage.totals.docker.buildCacheBytes) ?? "",
            })
          : "",
    },
    {
      key: "cpu",
      icon: Cpu,
      label: $t(i18nKeys.console.runtimeUsage.cpu),
      value:
        usage?.totals.cpu?.loadAverage1m !== undefined
          ? usage.totals.cpu.loadAverage1m.toFixed(2)
          : null,
      detail:
        usage?.totals.cpu?.logicalCores !== undefined
          ? $t(i18nKeys.console.runtimeUsage.logicalCores, {
              count: usage.totals.cpu.logicalCores,
            })
          : "",
    },
    {
      key: "artifacts",
      icon: Database,
      label: $t(i18nKeys.console.runtimeUsage.artifacts),
      value: usage ? String(usage.artifacts.length) : null,
      detail:
        usage?.byResource.length || usage?.byDeployment.length
          ? $t(i18nKeys.console.runtimeUsage.rollups, {
              count: usage.byResource.length + usage.byDeployment.length,
            })
          : "",
    },
  ]);

  function freshnessLabel(freshness: RuntimeUsageFreshness): string {
    switch (freshness) {
      case "live":
        return $t(i18nKeys.console.runtimeUsage.freshnessLive);
      case "recent-sample":
        return $t(i18nKeys.console.runtimeUsage.freshnessRecentSample);
      case "stale":
        return $t(i18nKeys.console.runtimeUsage.freshnessStale);
      case "unknown":
        return $t(i18nKeys.common.status.unknown);
    }
  }

  function freshnessVariant(
    freshness: RuntimeUsageFreshness,
  ): "default" | "secondary" | "outline" | "destructive" {
    switch (freshness) {
      case "live":
        return "default";
      case "recent-sample":
        return "secondary";
      case "stale":
        return "destructive";
      case "unknown":
        return "outline";
    }
  }
</script>

<section class="rounded-md border bg-background p-4">
  <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <h2 class="text-lg font-semibold">{$t(i18nKeys.console.runtimeUsage.title)}</h2>
        <DocsHelpLink
          href={webDocsHrefs.runtimeUsageInspect}
          ariaLabel={$t(i18nKeys.common.actions.openDocs)}
        />
      </div>
      <p class="mt-1 text-sm leading-6 text-muted-foreground">
        {$t(i18nKeys.console.runtimeUsage.description)}
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      {#if usage?.partial}
        <Badge variant="secondary">{$t(i18nKeys.console.runtimeUsage.partial)}</Badge>
      {/if}
      {#if usage}
        <Badge variant={freshnessVariant(usage.freshness)}>{freshnessLabel(usage.freshness)}</Badge>
      {/if}
    </div>
  </div>

  {#if loading}
    <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {#each metricTiles as tile (tile.key)}
        <Skeleton class="h-24 w-full" />
      {/each}
    </div>
  {:else if error}
    <div class="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      <AlertTriangle class="mt-0.5 size-4 shrink-0" />
      <span>{error}</span>
    </div>
  {:else if usage}
    <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {#each metricTiles as tile (tile.key)}
        <div class="rounded-md bg-muted/30 px-3 py-2">
          <p class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <tile.icon class="size-4" />
            {tile.label}
          </p>
          <p class="mt-2 truncate text-sm font-semibold">
            {tile.value ?? $t(i18nKeys.console.runtimeUsage.unavailable)}
          </p>
          {#if tile.detail}
            <p class="mt-1 truncate text-xs text-muted-foreground">{tile.detail}</p>
          {/if}
        </div>
      {/each}
    </div>

    <div class="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
      <span class="inline-flex items-center gap-1.5">
        <Clock3 class="size-3.5" />
        {$t(i18nKeys.console.runtimeUsage.generatedAt)} {formatTime(usage.generatedAt)}
      </span>
      {#if usage.observedAt}
        <span>
          {$t(i18nKeys.console.runtimeUsage.observedAt)} {formatTime(usage.observedAt)}
        </span>
      {/if}
    </div>

    {#if usage.warnings.length > 0 || usage.sourceErrors.length > 0}
      <div class="mt-4 space-y-2">
        {#each usage.warnings as warning (`${warning.code}-${warning.message}`)}
          <div class="flex items-start gap-2 rounded-md border bg-muted/20 px-3 py-2 text-xs">
            <AlertTriangle class="mt-0.5 size-3.5 shrink-0 text-amber-600" />
            <span class="leading-5">{warning.message}</span>
          </div>
        {/each}
        {#each usage.sourceErrors as sourceError (`${sourceError.source}-${sourceError.code}`)}
          <div class="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertTriangle class="mt-0.5 size-3.5 shrink-0" />
            <span class="leading-5">{sourceError.message}</span>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <p class="mt-4 text-sm text-muted-foreground">
      {$t(i18nKeys.console.runtimeUsage.empty)}
    </p>
  {/if}
</section>
