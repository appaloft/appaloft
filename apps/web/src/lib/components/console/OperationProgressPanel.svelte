<script lang="ts">
  import { ExternalLink, LoaderCircle, Rows3 } from "@lucide/svelte";
  import type { DeploymentProgressEvent } from "@appaloft/contracts";

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

  const resolvedStatus = $derived(status === "idle" ? undefined : status);

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

  <div class="min-h-0">
    <div class="min-w-0 p-5">
      {#if streamError}
        <div class="mb-4 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {streamError}
        </div>
      {/if}

      <div class="mb-3 flex items-center gap-2 text-sm font-medium">
        <Rows3 class="size-4 text-muted-foreground" />
        {$t(i18nKeys.console.deployments.progressStatusLog)}
        {#if status === "running"}
          <LoaderCircle class="size-4 animate-spin text-primary" />
        {/if}
      </div>

      <DeploymentProgressTerminal {events} {status} />
    </div>
  </div>
</section>
