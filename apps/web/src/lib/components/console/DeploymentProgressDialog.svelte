<script lang="ts">
  import type { DeploymentProgressEvent } from "@appaloft/contracts";

  import OperationProgressPanel from "$lib/components/console/OperationProgressPanel.svelte";
  import { Button } from "$lib/components/ui/button";
  import { type DeploymentProgressDialogStatus } from "$lib/console/deployment-progress";
  import { i18nKeys, t } from "$lib/i18n";

  type Props = {
    open: boolean;
    status: DeploymentProgressDialogStatus;
    events: DeploymentProgressEvent[];
    streamError?: string;
    requestId?: string;
    deploymentId?: string;
    traceLink?: string;
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
    traceLink = "",
    title,
    description,
    onClose,
    onOpenDeployment,
  }: Props = $props();
</script>

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
    <div
      aria-label={title ?? $t(i18nKeys.console.deployments.progressTitle)}
      aria-modal="true"
      role="dialog"
      class="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border bg-background shadow-lg"
    >
      <div class="flex items-center justify-end border-b px-5 py-3">
        <div class="flex gap-2">
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
      </div>
      <div class="min-h-0 flex-1 overflow-auto p-5">
        <OperationProgressPanel
          {status}
          {events}
          {streamError}
          {requestId}
          {deploymentId}
          {traceLink}
          {title}
          {description}
          {onOpenDeployment}
        />
      </div>
    </div>
  </div>
{/if}
