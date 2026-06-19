<script lang="ts">
  import { Check, Copy, ExternalLink, LoaderCircle, Rows3 } from "@lucide/svelte";
  import type { DeploymentProgressEvent } from "@appaloft/contracts";
  import { onDestroy } from "svelte";

  import DeploymentProgressTerminal from "$lib/components/console/DeploymentProgressTerminal.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import {
    isTerminalDeploymentProgressEvent,
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

  let accessUrlCopyState = $state<"idle" | "copied" | "failed">("idle");
  let accessUrlCopyResetTimeout: ReturnType<typeof setTimeout> | undefined;
  const panelStatus = $derived(deploymentPanelStatus());
  const deploymentSucceeded = $derived(panelStatus === "succeeded");
  const resolvedAccessUrl = $derived(accessUrl || accessUrlFromDeploymentProgressEvents());
  const accessUrlCopyLabel = $derived(
    accessUrlCopyState === "copied"
      ? $t(i18nKeys.console.deployments.accessUrlCopied)
      : accessUrlCopyState === "failed"
        ? $t(i18nKeys.console.deployments.accessUrlCopyFailed)
        : $t(i18nKeys.console.deployments.copyAccessUrl),
  );
  const confettiPieces = Array.from({ length: 24 }, (_, index) => ({
    delay: `${(index % 8) * 0.07}s`,
    left: `${8 + ((index * 37) % 84)}%`,
    rotation: `${(index * 29) % 180}deg`,
    color: ["#4f7cff", "#35d39b", "#ffd166", "#ef476f", "#38bdf8"][index % 5],
  }));

  function workflowStatusLabel(): string {
    if (panelStatus === "running") {
      return $t(i18nKeys.console.deployments.progressStatusRunning);
    }

    if (panelStatus === "succeeded") {
      return $t(i18nKeys.console.deployments.progressStatusSucceeded);
    }

    if (panelStatus === "failed") {
      return $t(i18nKeys.common.status.failed);
    }

    return $t(i18nKeys.console.deployments.progressStatusLog);
  }

  function workflowStatusVariant(): "default" | "secondary" | "outline" | "destructive" {
    if (panelStatus === "succeeded") {
      return "default";
    }

    if (panelStatus === "running") {
      return "secondary";
    }

    if (panelStatus === "failed") {
      return "destructive";
    }

    return "outline";
  }

  function deploymentEventStatus(): DeploymentProgressDialogStatus | undefined {
    const terminalEvent = [...deploymentEvents]
      .reverse()
      .find((event) => event.status === "failed" || isTerminalDeploymentProgressEvent(event));

    if (terminalEvent?.status === "failed") {
      return "failed";
    }

    if (terminalEvent) {
      return "succeeded";
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
    return panelStatus === "idle" ? undefined : panelStatus;
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

  function accessUrlFromDeploymentProgressEvents(): string {
    const terminalAccessEvent = [...deploymentEvents]
      .reverse()
      .find((event) => event.phase === "verify" && /public route/i.test(event.message));
    const match = terminalAccessEvent?.message.match(/https?:\/\/\S+/i);

    return match?.[0]?.replace(/[),.;]+$/, "") ?? "";
  }

  function updateAccessUrlCopyState(state: typeof accessUrlCopyState): void {
    accessUrlCopyState = state;

    if (accessUrlCopyResetTimeout) {
      clearTimeout(accessUrlCopyResetTimeout);
    }

    accessUrlCopyResetTimeout = setTimeout(() => {
      accessUrlCopyState = "idle";
    }, 2200);
  }

  async function handleCopyAccessUrl(): Promise<void> {
    if (!resolvedAccessUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(resolvedAccessUrl);
      updateAccessUrlCopyState("copied");
    } catch {
      updateAccessUrlCopyState("failed");
    }
  }

  onDestroy(() => {
    if (accessUrlCopyResetTimeout) {
      clearTimeout(accessUrlCopyResetTimeout);
    }
  });
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
        "relative flex w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-background",
        embedded ? "mx-auto max-h-[78vh] shadow-none" : "max-h-[88vh] shadow-xl",
      ]}
    >
      {#if deploymentSucceeded}
        <div class="pointer-events-none absolute inset-x-0 top-0 h-28 overflow-hidden" aria-hidden="true">
          {#each confettiPieces as piece}
            <span
              class="quick-deploy-confetti"
              style={`--confetti-left: ${piece.left}; --confetti-delay: ${piece.delay}; --confetti-rotation: ${piece.rotation}; --confetti-color: ${piece.color};`}
            ></span>
          {/each}
        </div>
      {/if}
      <header class="relative border-b px-5 py-4 pr-20">
        <div class="flex items-start justify-between gap-4">
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
            </div>
          </div>

          <div class="flex shrink-0 flex-wrap justify-end gap-2 max-sm:pt-10 sm:ml-auto">
            {#if resourceHref && deploymentSucceeded}
              <Button type="button" size="sm" href={resourceHref}>
                <ExternalLink class="size-4" />
                {$t(i18nKeys.common.actions.openResource)}
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
            {#if deploymentId && onOpenDeployment && deploymentSucceeded}
              <Button type="button" size="sm" variant="outline" onclick={() => onOpenDeployment?.()}>
                {$t(i18nKeys.common.actions.viewDeployment)}
              </Button>
            {/if}
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          class="absolute right-5 top-4"
          onclick={() => onClose?.()}
        >
          {$t(i18nKeys.common.actions.close)}
        </Button>
      </header>

      <div class="min-h-0 flex-1 space-y-4 overflow-auto p-5">
        {#if progressError}
          <div class="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {progressError}
          </div>
        {/if}

        {#if deploymentSucceeded && resolvedAccessUrl}
          <section
            class="rounded-lg border border-primary/20 bg-primary/5 px-4 py-5 text-center shadow-sm"
            data-quick-deploy-success-access-url
          >
            <p class="text-xs font-semibold uppercase tracking-normal text-primary/80">
              {$t(i18nKeys.console.deployments.accessUrlTitle)}
            </p>
            <a
              href={resolvedAccessUrl}
              target="_blank"
              rel="noreferrer"
              class="mx-auto mt-2 block max-w-3xl break-all text-base font-semibold text-primary underline-offset-4 hover:underline sm:text-lg"
            >
              {resolvedAccessUrl}
            </a>
            <div class="mt-4 flex flex-wrap justify-center gap-2">
              <Button type="button" href={resolvedAccessUrl} target="_blank" rel="noreferrer">
                <ExternalLink class="size-4" />
                {$t(i18nKeys.console.deployments.openAccessUrl)}
              </Button>
              <Button type="button" variant="outline" onclick={handleCopyAccessUrl}>
                {#if accessUrlCopyState === "copied"}
                  <Check class="size-4" />
                {:else}
                  <Copy class="size-4" />
                {/if}
                {accessUrlCopyLabel}
              </Button>
            </div>
          </section>
        {/if}

        <section class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <Rows3 class="size-4 text-muted-foreground" />
              <h3 class="text-sm font-semibold">{$t(i18nKeys.console.deployments.progressStatusLog)}</h3>
              {#if panelStatus === "running"}
                <LoaderCircle class="size-4 animate-spin text-primary" />
              {/if}
              <Badge variant={progressStatusVariant(resolvedDeploymentPanelStatus())}>
                {progressStatusLabel(resolvedDeploymentPanelStatus())}
              </Badge>
            </div>
          </div>

          <DeploymentProgressTerminal events={deploymentEvents} status={panelStatus} />
        </section>
      </div>
    </div>
  </div>
{/if}

<style>
  .quick-deploy-confetti {
    position: absolute;
    top: -0.75rem;
    left: var(--confetti-left);
    width: 0.45rem;
    height: 0.7rem;
    border-radius: 0.125rem;
    background: var(--confetti-color);
    transform: rotate(var(--confetti-rotation));
    animation: quick-deploy-confetti-fall 1.45s ease-out var(--confetti-delay) both;
  }

  @keyframes quick-deploy-confetti-fall {
    0% {
      opacity: 0;
      transform: translate3d(0, -0.75rem, 0) rotate(var(--confetti-rotation)) scale(0.85);
    }

    15% {
      opacity: 1;
    }

    100% {
      opacity: 0;
      transform: translate3d(0, 7rem, 0) rotate(calc(var(--confetti-rotation) + 180deg)) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .quick-deploy-confetti {
      animation: none;
      display: none;
    }
  }
</style>
