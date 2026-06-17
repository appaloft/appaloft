<script lang="ts">
  import { ExternalLink, Rows3 } from "@lucide/svelte";
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

  type QuickDeployFeedback = {
    kind: "success" | "running" | "error";
    title: string;
    detail: string;
  } | null;

  type Props = {
    open: boolean;
    pending: boolean;
    deploymentEvents: DeploymentProgressEvent[];
    progressError?: string;
    feedback?: QuickDeployFeedback;
    deploymentId?: string;
    traceLink?: string;
    resourceHref?: string;
    accessUrl?: string;
    embedded?: boolean;
    onClose?: () => void;
    onOpenDeployment?: () => void;
  };

  let {
    open,
    pending,
    deploymentEvents,
    progressError = "",
    feedback = null,
    deploymentId = "",
    traceLink = "",
    resourceHref = "",
    accessUrl = "",
    embedded = false,
    onClose,
    onOpenDeployment,
  }: Props = $props();

  const sections = $derived(groupDeploymentProgressEvents(deploymentEvents));
  let progressLogArea = $state<HTMLDivElement | undefined>();

  $effect(() => {
    const scrollKey = `${deploymentEvents.length}:${deploymentPanelStatus()}:${progressError}`;

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

  function workflowStatusLabel(): string {
    const status = deploymentPanelStatus();

    if (status === "running") {
      return $t(i18nKeys.console.deployments.progressStatusRunning);
    }

    if (status === "succeeded") {
      return $t(i18nKeys.console.deployments.progressStatusSucceeded);
    }

    if (status === "failed") {
      return $t(i18nKeys.common.status.failed);
    }

    return $t(i18nKeys.console.deployments.progressStatusLog);
  }

  function workflowStatusVariant(): "default" | "secondary" | "outline" | "destructive" {
    const status = deploymentPanelStatus();

    if (status === "succeeded") {
      return "default";
    }

    if (status === "running") {
      return "secondary";
    }

    if (status === "failed") {
      return "destructive";
    }

    return "outline";
  }

  function deploymentEventStatus(): DeploymentProgressDialogStatus | undefined {
    const terminalEvent = [...deploymentEvents]
      .reverse()
      .find((event) => event.status === "failed" || event.status === "succeeded");

    if (terminalEvent?.status === "failed" || terminalEvent?.status === "succeeded") {
      return terminalEvent.status;
    }

    return deploymentEvents.length > 0 ? "running" : undefined;
  }

  function deploymentPanelStatus(): DeploymentProgressDialogStatus {
    const eventStatus = deploymentEventStatus();
    if (eventStatus) {
      return eventStatus;
    }

    if (deploymentId) {
      return progressError || feedback?.kind === "error" ? "failed" : "running";
    }

    if (pending) {
      return "running";
    }

    if (feedback?.kind === "running") {
      return "running";
    }

    if (feedback?.kind === "success") {
      return "succeeded";
    }

    if (feedback?.kind === "error" || progressError) {
      return "failed";
    }

    return "idle";
  }

  function resolvedDeploymentPanelStatus(): DeploymentProgressEvent["status"] | undefined {
    const status = deploymentPanelStatus();
    return status === "idle" ? undefined : status;
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
        return "text-amber-300";
      case "debug":
        return "text-zinc-500";
      case "info":
        return "text-zinc-200";
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

{#if open}
  <div
    class={[
      embedded
        ? "w-full"
        : "fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm",
    ]}
  >
    <div
      aria-labelledby="quick-deploy-progress-title"
      aria-modal="true"
      role="dialog"
      class={[
        "flex w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-background",
        embedded ? "mx-auto max-h-[78vh] shadow-none" : "max-h-[88vh] shadow-xl",
      ]}
    >
      <header class="border-b px-5 py-4">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0 flex-1 space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <h2 id="quick-deploy-progress-title" class="text-lg font-semibold">
                {$t(i18nKeys.console.quickDeploy.workflowProgressTitle)}
              </h2>
              <Badge variant={workflowStatusVariant()}>{workflowStatusLabel()}</Badge>
            </div>
            <p class="max-w-3xl text-sm leading-6 text-muted-foreground">
              {$t(i18nKeys.console.quickDeploy.workflowProgressDescription)}
            </p>
            <div class="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
              {#if deploymentId}
                <span>{$t(i18nKeys.console.deployments.progressDeploymentLabel)} {deploymentId}</span>
              {/if}
              {#if traceLink}
                <span class="max-w-full truncate">
                  {$t(i18nKeys.console.deployments.progressTraceLabel)} {traceLink}
                </span>
              {/if}
              {#if accessUrl && deploymentPanelStatus() === "succeeded"}
                <span class="max-w-full truncate">
                  {$t(i18nKeys.console.resources.accessUrlTitle)} {accessUrl}
                </span>
              {/if}
            </div>
          </div>

          <div class="flex shrink-0 flex-wrap gap-2 sm:ml-auto sm:justify-end">
            {#if resourceHref && deploymentPanelStatus() === "succeeded"}
              <Button type="button" size="sm" href={resourceHref}>
                <ExternalLink class="size-4" />
                {$t(i18nKeys.common.actions.openResource)}
              </Button>
            {/if}
            {#if accessUrl && deploymentPanelStatus() === "succeeded"}
              <Button
                type="button"
                size="sm"
                variant="outline"
                href={accessUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink class="size-4" />
                {$t(i18nKeys.console.resources.openGeneratedAccess)}
              </Button>
            {/if}
            {#if traceLink}
              <Button
                type="button"
                size="sm"
                variant="outline"
                href={traceLink}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink class="size-4" />
                {$t(i18nKeys.console.deployments.progressTraceAction)}
              </Button>
            {/if}
            {#if deploymentId && onOpenDeployment}
              <Button type="button" size="sm" variant="outline" onclick={() => onOpenDeployment?.()}>
                {$t(i18nKeys.common.actions.viewDeployment)}
              </Button>
            {/if}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onclick={() => onClose?.()}
            >
              {$t(i18nKeys.common.actions.close)}
            </Button>
          </div>
        </div>
      </header>

      <div class="min-h-0 flex-1 space-y-4 overflow-auto p-5">
        {#if progressError}
          <div class="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {progressError}
          </div>
        {/if}

        <section class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <Rows3 class="size-4 text-muted-foreground" />
              <h3 class="text-sm font-semibold">{$t(i18nKeys.console.deployments.progressStatusLog)}</h3>
              <Badge variant={progressStatusVariant(resolvedDeploymentPanelStatus())}>
                {progressStatusLabel(resolvedDeploymentPanelStatus())}
              </Badge>
            </div>
          </div>

          <div
            bind:this={progressLogArea}
            data-deployment-progress-terminal
            class="max-h-[50vh] min-h-72 overflow-auto rounded-md bg-zinc-950 p-4 font-mono text-xs text-zinc-100 shadow-inner ring-1 ring-zinc-800"
          >
            {#if sections.length === 0}
              <p class="text-zinc-400">{$t(i18nKeys.console.deployments.progressWaiting)}</p>
            {:else}
              <div class="space-y-4">
                {#each sections as section (section.phase)}
                  <div class="space-y-2">
                    <div class="flex flex-wrap items-center gap-2 text-zinc-400">
                      <span>{phaseLabel(section.phase)}</span>
                      <span>·</span>
                      <span>{progressStatusLabel(section.status)}</span>
                    </div>
                    <div class="space-y-1">
                      {#each section.events as event, index (`${event.timestamp}-${section.phase}-${index}`)}
                        <div class="grid gap-2 leading-5 sm:grid-cols-[4.75rem_6rem_3.5rem_minmax(0,1fr)]">
                          <span class="text-zinc-500">{timeLabel(event.timestamp)}</span>
                          <span class="text-sky-300">{progressSourceLabel(event)}</span>
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
        </section>
      </div>
    </div>
  </div>
{/if}
