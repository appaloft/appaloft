<script lang="ts">
  import type { DeploymentProgressEvent } from "@appaloft/contracts";
  import { tick } from "svelte";

  import {
    progressSourceLabel,
    type DeploymentProgressDialogStatus,
  } from "$lib/console/deployment-progress";
  import { i18nKeys, t } from "$lib/i18n";

  type Props = {
    events: DeploymentProgressEvent[];
    status?: DeploymentProgressDialogStatus;
    maxHeightClass?: string;
    minHeightClass?: string;
    class?: string;
  };

  let {
    events,
    status = "idle",
    maxHeightClass = "max-h-[50vh]",
    minHeightClass = "min-h-72",
    class: className = "",
  }: Props = $props();

  let terminalArea = $state<HTMLDivElement | undefined>();

  $effect(() => {
    const scrollKey = `${events.length}:${status}`;

    if (!terminalArea || scrollKey.length === 0) {
      return;
    }

    void scrollProgressToBottom();
  });

  async function scrollProgressToBottom(): Promise<void> {
    await tick();

    if (!terminalArea) {
      return;
    }

    terminalArea.scrollTop = terminalArea.scrollHeight;
  }

  function phaseLabel(phase: DeploymentProgressEvent["phase"]): string {
    switch (phase) {
      case "detect":
        return $t(i18nKeys.console.deployments.progressPhaseDetect);
      case "plan":
        return $t(i18nKeys.console.deployments.progressPhasePlan);
      case "package":
        return $t(i18nKeys.console.deployments.progressPhasePackage);
      case "deploy":
        return $t(i18nKeys.console.deployments.progressPhaseDeploy);
      case "verify":
        return $t(i18nKeys.console.deployments.progressPhaseVerify);
      case "rollback":
        return $t(i18nKeys.console.deployments.progressPhaseRollback);
    }
  }

  function levelClass(level: DeploymentProgressEvent["level"]): string {
    switch (level) {
      case "error":
        return "text-red-300";
      case "warn":
        return "text-amber-300";
      case "debug":
        return "text-zinc-500";
      case "info":
        return "text-zinc-200";
    }
  }

  function sourceClass(source: DeploymentProgressEvent["source"]): string {
    switch (source) {
      case "appaloft":
        return "text-emerald-300";
      case "docker":
        return "text-cyan-300";
      case "ssh":
        return "text-violet-300";
      case "health":
        return "text-lime-300";
      case "provider":
        return "text-amber-300";
      case "application":
        return "text-sky-300";
      case "domain-event":
        return "text-blue-300";
    }
  }

  function timeLabel(timestamp: string): string {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return timestamp.slice(11, 19) || "--:--:--";
    }

    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
  }
</script>

<div
  bind:this={terminalArea}
  data-deployment-progress-terminal
  class={[
    "overflow-auto rounded-md bg-zinc-950 px-4 py-3 font-mono text-xs text-zinc-100 shadow-inner ring-1 ring-zinc-800",
    maxHeightClass,
    minHeightClass,
    className,
  ]}
>
  {#if events.length === 0}
    <div class="flex items-center gap-2 py-2 text-zinc-400">
      <span>{$t(i18nKeys.console.deployments.progressWaiting)}</span>
    </div>
  {:else}
    <div class="space-y-1">
      {#each events as event, index (`${event.timestamp}-${event.phase}-${event.source}-${index}`)}
        <div
          class="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-x-2 gap-y-1 leading-5 md:grid-cols-[4.75rem_5rem_7rem_3.5rem_minmax(0,1fr)]"
        >
          <span class="text-zinc-600">{timeLabel(event.timestamp)}</span>
          <span class="hidden text-zinc-400 md:block">{phaseLabel(event.phase)}</span>
          <span class={["hidden font-medium md:block", sourceClass(event.source)]}>
            {progressSourceLabel(event)}
          </span>
          <span class={["hidden md:block", levelClass(event.level)]}>{event.level}</span>
          <span class={["min-w-0 break-words", levelClass(event.level)]}>
            {#if event.source === "application"}
              <span class="text-zinc-600">└ </span>
            {/if}
            {event.message}
            {#if event.status === "failed"}
              <span class="text-zinc-600"> · {$t(i18nKeys.common.status.failed)}</span>
            {/if}
          </span>
        </div>
      {/each}
    </div>
  {/if}
</div>
