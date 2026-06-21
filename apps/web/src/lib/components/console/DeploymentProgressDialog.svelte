<script lang="ts">
  import type { DeploymentProgressEvent } from "@appaloft/contracts";

  import OperationProgressPanel from "$lib/components/console/OperationProgressPanel.svelte";
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
      class="w-full max-w-5xl"
    >
      <OperationProgressPanel
        {status}
        {events}
        {streamError}
        {requestId}
        {deploymentId}
        {traceLink}
        {title}
        {description}
        {onClose}
        {onOpenDeployment}
        class="max-h-[86vh] shadow-lg"
      />
    </div>
  </div>
{/if}
