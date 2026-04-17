<script lang="ts">
  import type { DeploymentProgressEvent } from "@appaloft/contracts";
  import { tick } from "svelte";

  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import {
    groupDeploymentProgressEvents,
    progressSourceLabel,
    progressStatusVariant,
    type DeploymentProgressDialogStatus,
  } from "$lib/console/deployment-progress";
  import { i18nKeys, t } from "$lib/i18n";

  type Props = {
    open: boolean;
    status: DeploymentProgressDialogStatus;
    events: DeploymentProgressEvent[];
    streamError?: string;
    requestId?: string;
    deploymentId?: string;
    title?: string;
    description?: string;
    onClose?: () => void;
    onOpenDeployment?: () => void;
  };

  let {
    open,
    status,
    events,
    streamError = "",
    requestId = "",
    deploymentId = "",
    title,
    description,
    onClose,
    onOpenDeployment,
  }: Props = $props();

  const sections = $derived(groupDeploymentProgressEvents(events));
  const resolvedStatus = $derived(status === "idle" ? undefined : status);
  let progressScrollArea = $state<HTMLDivElement | undefined>();

  $effect(() => {
    const scrollKey = `${events.length}:${status}:${streamError}`;

    if (!open || !progressScrollArea || scrollKey.length === 0) {
      return;
    }

    void scrollProgressToBottom();
  });

  async function scrollProgressToBottom(): Promise<void> {
    await tick();

    if (!progressScrollArea) {
      return;
    }

    progressScrollArea.scrollTop = progressScrollArea.scrollHeight;
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

  function progressStatusLabel(status?: DeploymentProgressEvent["status"]): string {
    switch (status) {
      case "running":
        return $t(i18nKeys.console.deployments.progressStatusRunning);
      case "succeeded":
        return $t(i18nKeys.console.deployments.progressStatusSucceeded);
      case "failed":
        return $t(i18nKeys.common.status.failed);
      default:
        return $t(i18nKeys.console.deployments.progressStatusLog);
    }
  }

  function levelClass(level: DeploymentProgressEvent["level"]): string {
    switch (level) {
      case "error":
        return "text-red-300";
      case "warn":
        return "text-amber-200";
      case "debug":
        return "text-zinc-500";
      case "info":
        return "text-zinc-200";
    }
  }

  function timeLabel(timestamp: string): string {
    return timestamp.slice(11, 19) || "--:--:--";
  }
</script>

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
    <div
      aria-labelledby="deployment-progress-title"
      aria-modal="true"
      role="dialog"
      class="flex max-h-[86vh] w-full max-w-5xl flex-col rounded-lg border bg-background shadow-lg"
    >
      <header class="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <h2 id="deployment-progress-title" class="text-lg font-semibold">
              {title ?? $t(i18nKeys.console.deployments.progressTitle)}
            </h2>
            <Badge variant={progressStatusVariant(resolvedStatus)}>
              {progressStatusLabel(resolvedStatus)}
            </Badge>
          </div>
          <p class="text-sm text-muted-foreground">
            {description ?? $t(i18nKeys.console.deployments.progressDescription)}
          </p>
          <p class="font-mono text-xs text-muted-foreground">
            {$t(i18nKeys.console.deployments.progressRequestLabel)} {requestId || "-"}
            {#if deploymentId}
              · {$t(i18nKeys.console.deployments.progressDeploymentLabel)} {deploymentId}
            {/if}
          </p>
        </div>
        <div class="flex gap-2">
          {#if deploymentId && onOpenDeployment}
            <Button type="button" size="sm" variant="outline" onclick={() => onOpenDeployment?.()}>
              {$t(i18nKeys.common.actions.viewDeployment)}
            </Button>
          {/if}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={status === "running" && Boolean(requestId)}
            onclick={() => onClose?.()}
          >
            {$t(i18nKeys.common.actions.close)}
          </Button>
        </div>
      </header>

      <div class="min-h-0 flex-1 overflow-hidden p-5">
        {#if streamError}
          <div class="mb-3 rounded-md border border-destructive/30 px-3 py-2 text-sm text-destructive">
            {streamError}
          </div>
        {/if}

        <div
          bind:this={progressScrollArea}
          class="flex max-h-[62vh] min-h-72 flex-col overflow-auto rounded-md border border-zinc-800 bg-zinc-950 px-4 py-3 font-mono text-xs text-zinc-200 shadow-inner"
        >
          {#if sections.length === 0}
            <p class="text-zinc-500">{$t(i18nKeys.console.deployments.progressWaiting)}</p>
          {:else}
            {#each sections as section (section.phase)}
              <div class="border-t border-zinc-800/80 py-2 first:border-t-0 first:pt-0">
                <div class="flex flex-wrap items-center gap-2 text-zinc-400">
                  <span class="text-emerald-300">
                    [{section.step?.current ?? "-"} / {section.step?.total ?? "-"}]
                  </span>
                  <span>{phaseLabel(section.phase)}</span>
                  <span class="text-zinc-600">·</span>
                  <span>{section.step?.label ?? $t(i18nKeys.console.deployments.progressStepFallback)}</span>
                  {#if section.status}
                    <span class="text-zinc-600">·</span>
                    <span>{progressStatusLabel(section.status)}</span>
                  {/if}
                </div>

                <div class="mt-2 space-y-1">
                  {#each section.events as event, index (`${event.timestamp}-${section.phase}-${index}`)}
                    <div class="grid grid-cols-[4.75rem_6rem_3.5rem_minmax(0,1fr)] gap-2 leading-5">
                      <span class="text-zinc-600">{timeLabel(event.timestamp)}</span>
                      <span class={event.source === "application" ? "text-sky-300" : "text-emerald-300"}>
                        {progressSourceLabel(event)}
                      </span>
                      <span class={levelClass(event.level)}>{event.level}</span>
                      <span class={`min-w-0 break-words ${levelClass(event.level)} ${event.source === "application" ? "pl-3" : ""}`}>
                        {event.source === "application" ? "└ " : ""}
                        {event.message}
                      </span>
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
