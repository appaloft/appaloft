<script lang="ts">
  import { ExternalLink, Radio, Rows3 } from "@lucide/svelte";
  import type { DeploymentProgressEvent } from "@appaloft/contracts";
  import { tick } from "svelte";

  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import {
    groupDeploymentProgressEvents,
    progressSourceLabel,
    progressStatusVariant,
    type DeploymentProgressDialogStatus,
  } from "$lib/console/deployment-progress";
  import { i18nKeys, t } from "$lib/i18n";

  type Props = {
    status: DeploymentProgressDialogStatus;
    events: DeploymentProgressEvent[];
    streamError?: string;
    requestId?: string;
    deploymentId?: string;
    traceLink?: string;
    title?: string;
    description?: string;
    onOpenDeployment?: () => void;
    class?: string;
  };

  let {
    status,
    events,
    streamError = "",
    requestId = "",
    deploymentId = "",
    traceLink = "",
    title,
    description,
    onOpenDeployment,
    class: className = "",
  }: Props = $props();

  const sections = $derived(groupDeploymentProgressEvents(events));
  const resolvedStatus = $derived(status === "idle" ? undefined : status);
  const currentSection = $derived(sections.at(-1));
  let progressLogArea = $state<HTMLDivElement | undefined>();

  $effect(() => {
    const scrollKey = `${events.length}:${status}:${streamError}`;

    if (!progressLogArea || scrollKey.length === 0) {
      return;
    }

    void scrollProgressToBottom();
  });

  async function scrollProgressToBottom(): Promise<void> {
    await tick();

    if (!progressLogArea) {
      return;
    }

    progressLogArea.scrollTop = progressLogArea.scrollHeight;
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
        return "text-destructive";
      case "warn":
        return "text-amber-700 dark:text-amber-300";
      case "debug":
        return "text-muted-foreground";
      case "info":
        return "text-foreground";
    }
  }

  function timeLabel(timestamp: string): string {
    return timestamp.slice(11, 19) || "--:--:--";
  }
</script>

<section class={["console-panel overflow-hidden", className]}>
  <header class="border-b px-5 py-4">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div class="min-w-0 space-y-2">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-lg font-semibold">
            {title ?? $t(i18nKeys.console.deployments.progressTitle)}
          </h2>
          <Badge variant={progressStatusVariant(resolvedStatus)}>
            {progressStatusLabel(resolvedStatus)}
          </Badge>
        </div>
        <p class="max-w-3xl text-sm leading-6 text-muted-foreground">
          {description ?? $t(i18nKeys.console.deployments.progressDescription)}
        </p>
        <div class="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
          {#if requestId}
            <span>{$t(i18nKeys.console.deployments.progressRequestLabel)} {requestId}</span>
          {/if}
          {#if deploymentId}
            <span>
              {$t(i18nKeys.console.deployments.progressDeploymentLabel)} {deploymentId}
            </span>
          {/if}
          {#if traceLink}
            <span class="max-w-full truncate">{$t(i18nKeys.console.deployments.progressTraceLabel)} {traceLink}</span>
          {/if}
        </div>
      </div>

      <div class="flex shrink-0 flex-wrap gap-2">
        {#if traceLink}
          <Button type="button" size="sm" variant="outline" href={traceLink} target="_blank" rel="noreferrer">
            <ExternalLink class="size-4" />
            {$t(i18nKeys.console.deployments.progressTraceAction)}
          </Button>
        {/if}
        {#if deploymentId && onOpenDeployment}
          <Button type="button" size="sm" variant="outline" onclick={() => onOpenDeployment?.()}>
            {$t(i18nKeys.common.actions.viewDeployment)}
          </Button>
        {/if}
      </div>
    </div>
  </header>

  <div class="grid min-h-0 gap-0 xl:grid-cols-[22rem_minmax(0,1fr)]">
    <aside class="border-b bg-muted/10 p-5 xl:border-r xl:border-b-0">
      <div class="flex items-start gap-3">
        <div class="rounded-md border bg-background p-2 text-muted-foreground">
          <Radio class={["size-4", status === "running" ? "animate-pulse text-primary" : ""]} />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-semibold">
            {#if currentSection}
              {phaseLabel(currentSection.phase)}
            {:else}
              {$t(i18nKeys.console.deployments.progressWaiting)}
            {/if}
          </p>
          <p class="mt-1 text-sm leading-6 text-muted-foreground">
            {currentSection?.step?.label ?? $t(i18nKeys.console.deployments.progressStepFallback)}
          </p>
        </div>
      </div>

      <div class="mt-5 space-y-3">
        {#if sections.length === 0}
          <div class="space-y-2">
            <Skeleton class="h-8 w-full" />
            <Skeleton class="h-8 w-4/5" />
            <Skeleton class="h-8 w-3/5" />
          </div>
        {:else}
          {#each sections as section (section.phase)}
            <div class="grid grid-cols-[1rem_minmax(0,1fr)] gap-3">
              <span
                class={[
                  "mt-1 size-2 rounded-full",
                  section.status === "failed"
                    ? "bg-destructive"
                    : section.status === "succeeded"
                      ? "bg-emerald-600"
                      : "bg-primary",
                ]}
              ></span>
              <div class="min-w-0">
                <div class="flex min-w-0 items-center justify-between gap-2">
                  <p class="truncate text-sm font-medium">{phaseLabel(section.phase)}</p>
                  <Badge variant={progressStatusVariant(section.status)}>
                    {progressStatusLabel(section.status)}
                  </Badge>
                </div>
                <p class="mt-1 truncate text-xs text-muted-foreground">
                  [{section.step?.current ?? "-"} / {section.step?.total ?? "-"}]
                  {section.step?.label ?? $t(i18nKeys.console.deployments.progressStepFallback)}
                </p>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </aside>

    <div class="min-w-0 p-5">
      {#if streamError}
        <div class="mb-4 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {streamError}
        </div>
      {/if}

      <div class="mb-3 flex items-center gap-2 text-sm font-medium">
        <Rows3 class="size-4 text-muted-foreground" />
        {$t(i18nKeys.console.deployments.progressStatusLog)}
      </div>

      <div
        bind:this={progressLogArea}
        class="max-h-[42vh] min-h-56 overflow-auto rounded-md border bg-muted/20 p-3 font-mono text-xs"
      >
        {#if sections.length === 0}
          <p class="text-muted-foreground">{$t(i18nKeys.console.deployments.progressWaiting)}</p>
        {:else}
          <div class="space-y-4">
            {#each sections as section (section.phase)}
              <div class="space-y-2">
                <div class="flex flex-wrap items-center gap-2 text-muted-foreground">
                  <span>{phaseLabel(section.phase)}</span>
                  <span>·</span>
                  <span>{progressStatusLabel(section.status)}</span>
                </div>
                <div class="space-y-1">
                  {#each section.events as event, index (`${event.timestamp}-${section.phase}-${index}`)}
                    <div class="grid gap-2 leading-5 sm:grid-cols-[4.75rem_6rem_3.5rem_minmax(0,1fr)]">
                      <span class="text-muted-foreground">{timeLabel(event.timestamp)}</span>
                      <span class="text-primary">{progressSourceLabel(event)}</span>
                      <span class={levelClass(event.level)}>{event.level}</span>
                      <span class={["min-w-0 break-words", levelClass(event.level)]}>
                        {event.message}
                      </span>
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
</section>
