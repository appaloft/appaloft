<script lang="ts">
  import type { ResourceHealthOverall } from "@appaloft/contracts";

  import { i18nKeys, t } from "$lib/i18n";

  type ResourceHealthViewStatus = ResourceHealthOverall | "loading";

  type Props = {
    status?: ResourceHealthViewStatus;
    class?: string;
  };

  let { status = "unknown", class: className = "" }: Props = $props();

  const tone = $derived.by(() => {
    switch (status) {
      case "healthy":
        return "text-emerald-700 dark:text-emerald-400";
      case "loading":
        return "animate-pulse text-muted-foreground";
      case "degraded":
      case "starting":
        return "text-amber-700 dark:text-amber-400";
      case "unhealthy":
      case "stopped":
        return "text-destructive";
      case "not-deployed":
      case "unknown":
        return "text-muted-foreground/70";
    }
  });

  const label = $derived.by(() => {
    switch (status) {
      case "healthy":
        return $t(i18nKeys.common.status.healthy);
      case "loading":
        return $t(i18nKeys.common.status.loading);
      case "degraded":
        return $t(i18nKeys.common.status.degraded);
      case "unhealthy":
        return $t(i18nKeys.common.status.unhealthy);
      case "starting":
        return $t(i18nKeys.common.status.starting);
      case "stopped":
        return $t(i18nKeys.common.status.stopped);
      case "not-deployed":
        return $t(i18nKeys.common.status.notDeployed);
      case "unknown":
        return $t(i18nKeys.common.status.unknown);
    }
  });
</script>

<span class={["max-w-[4.25rem] shrink-0 truncate text-[0.6875rem] leading-4", tone, className]}>
  {label}
</span>
