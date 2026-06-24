<script lang="ts">
  import { Check, Copy, ExternalLink, LoaderCircle, Rows3 } from "@lucide/svelte";
  import type { DeploymentProgressEvent } from "@appaloft/contracts";
  import { onDestroy } from "svelte";

  import DeploymentProgressTerminal from "$lib/components/console/DeploymentProgressTerminal.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import {
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
    accessUrl?: string;
    title?: string;
    description?: string;
    onClose?: () => void;
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
    accessUrl = "",
    title,
    description,
    onClose,
    onOpenDeployment,
    class: className = "",
  }: Props = $props();

  let accessUrlCopyState = $state<"idle" | "copied" | "failed">("idle");
  let accessUrlCopyResetTimeout: ReturnType<typeof setTimeout> | undefined;

  const resolvedStatus = $derived(status === "idle" ? undefined : status);
  const deploymentSucceeded = $derived(status === "succeeded");
  const resolvedAccessUrl = $derived(accessUrl);
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

<section class={["console-panel relative flex flex-col overflow-hidden", className]}>
  {#if deploymentSucceeded}
    <div class="pointer-events-none absolute inset-x-0 top-0 h-28 overflow-hidden" aria-hidden="true">
      {#each confettiPieces as piece}
        <span
          class="deployment-progress-confetti"
          style={`--confetti-left: ${piece.left}; --confetti-delay: ${piece.delay}; --confetti-rotation: ${piece.rotation}; --confetti-color: ${piece.color};`}
        ></span>
      {/each}
    </div>
  {/if}

  <header class="relative shrink-0 border-b px-5 py-4">
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
        {#if onClose}
          <Button type="button" size="sm" variant="outline" onclick={() => onClose?.()}>
            {$t(i18nKeys.common.actions.close)}
          </Button>
        {/if}
      </div>
    </div>
  </header>

  <div class="min-h-0 flex-1 overflow-auto">
    <div class="min-w-0 p-5">
      {#if streamError}
        <div class="mb-4 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {streamError}
        </div>
      {/if}

      {#if deploymentSucceeded}
        <section
          class="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-5 text-center shadow-sm"
          data-deployment-progress-success-access-url
        >
          <p class="text-sm font-semibold text-foreground">
            {$t(i18nKeys.console.deployments.progressCompletionTitle)}
          </p>
          <p class="mt-1 text-sm text-muted-foreground">
            {$t(i18nKeys.console.deployments.progressCompletionDescription)}
          </p>
          {#if resolvedAccessUrl}
            <a
              href={resolvedAccessUrl}
              target="_blank"
              rel="noreferrer"
              class="mx-auto mt-3 block max-w-3xl break-all text-base font-semibold text-primary underline-offset-4 hover:underline sm:text-lg"
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
          {/if}
        </section>
      {/if}

      <div class="mb-3 flex items-center gap-2 text-sm font-medium">
        <Rows3 class="size-4 text-muted-foreground" />
        {$t(i18nKeys.console.deployments.progressStatusLog)}
        {#if status === "running"}
          <LoaderCircle class="deployment-progress-spinner size-4 text-primary" />
        {/if}
      </div>

      <DeploymentProgressTerminal {events} {status} />
    </div>
  </div>
</section>

<style>
  :global(.deployment-progress-spinner) {
    animation: deployment-progress-spin 0.9s linear infinite;
    transform-box: fill-box;
    transform-origin: center;
  }

  .deployment-progress-confetti {
    position: absolute;
    top: -0.75rem;
    left: var(--confetti-left);
    width: 0.45rem;
    height: 0.7rem;
    border-radius: 0.125rem;
    background: var(--confetti-color);
    transform: rotate(var(--confetti-rotation));
    animation: deployment-progress-confetti-fall 1.45s ease-out var(--confetti-delay) both;
  }

  @keyframes deployment-progress-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes deployment-progress-confetti-fall {
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
    :global(.deployment-progress-spinner),
    .deployment-progress-confetti {
      animation: none;
    }

    .deployment-progress-confetti {
      display: none;
    }
  }
</style>
