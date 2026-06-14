<script lang="ts">
  import { CheckCircle2, Circle, ExternalLink, LoaderCircle, ShieldAlert } from "@lucide/svelte";
  import type { DeploymentProgressEvent, QuickDeployWorkflowStep } from "@appaloft/contracts";

  import OperationProgressPanel from "$lib/components/console/OperationProgressPanel.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import type { DeploymentProgressDialogStatus } from "$lib/console/deployment-progress";
  import { i18nKeys, t } from "$lib/i18n";

  type QuickDeployWorkflowStepStatus = "pending" | "running" | "succeeded" | "failed";
  type QuickDeployWorkflowProgressItem = {
    kind: QuickDeployWorkflowStep["kind"];
    status: QuickDeployWorkflowStepStatus;
  };
  type QuickDeployFeedback = {
    kind: "success" | "running" | "error";
    title: string;
    detail: string;
  } | null;

  type Props = {
    open: boolean;
    pending: boolean;
    progressItems: QuickDeployWorkflowProgressItem[];
    deploymentEvents: DeploymentProgressEvent[];
    progressError?: string;
    feedback?: QuickDeployFeedback;
    deploymentId?: string;
    traceLink?: string;
    onClose?: () => void;
    onOpenDeployment?: () => void;
  };

  let {
    open,
    pending,
    progressItems,
    deploymentEvents,
    progressError = "",
    feedback = null,
    deploymentId = "",
    traceLink = "",
    onClose,
    onOpenDeployment,
  }: Props = $props();

  function workflowStepLabel(kind: QuickDeployWorkflowStep["kind"]): string {
    switch (kind) {
      case "projects.create":
        return $t(i18nKeys.console.quickDeploy.workflowStepProjectsCreate);
      case "servers.register":
        return $t(i18nKeys.console.quickDeploy.workflowStepServersRegister);
      case "credentials.ssh.create":
        return $t(i18nKeys.console.quickDeploy.workflowStepSshCredentialCreate);
      case "servers.configureCredential":
        return $t(i18nKeys.console.quickDeploy.workflowStepServerCredentialConfigure);
      case "servers.prepareRuntime":
        return "初始化服务器运行时";
      case "servers.testConnectivity":
        return "验证部署连通性";
      case "environments.create":
        return $t(i18nKeys.console.quickDeploy.workflowStepEnvironmentsCreate);
      case "resources.create":
        return $t(i18nKeys.console.quickDeploy.workflowStepResourcesCreate);
      case "resources.configureSource":
        return $t(i18nKeys.console.resources.sourceProfileTitle);
      case "resources.configureAccess":
        return $t(i18nKeys.console.resources.accessProfileTitle);
      case "resources.configureNetwork":
        return $t(i18nKeys.console.resources.networkProfileTitle);
      case "resources.configureRuntime":
        return $t(i18nKeys.console.resources.runtimeProfileTitle);
      case "resources.configureHealth":
        return $t(i18nKeys.console.resources.healthPolicy);
      case "environments.setVariable":
        return $t(i18nKeys.console.quickDeploy.workflowStepEnvironmentVariableSet);
      case "dependencyResources.provision":
        return $t(i18nKeys.console.quickDeploy.workflowStepDependencyResourcesProvision);
      case "deployments.create":
        return $t(i18nKeys.console.quickDeploy.workflowStepDeploymentsCreate);
    }
  }

  function workflowStepStatusLabel(status: QuickDeployWorkflowStepStatus): string {
    switch (status) {
      case "pending":
        return $t(i18nKeys.console.quickDeploy.workflowStepPending);
      case "running":
        return $t(i18nKeys.console.quickDeploy.workflowStepRunning);
      case "succeeded":
        return $t(i18nKeys.console.quickDeploy.workflowStepSucceeded);
      case "failed":
        return $t(i18nKeys.console.quickDeploy.workflowStepFailed);
    }
  }

  function workflowStepStatusVariant(
    status: QuickDeployWorkflowStepStatus,
  ): "default" | "secondary" | "outline" | "destructive" {
    switch (status) {
      case "succeeded":
        return "default";
      case "failed":
        return "destructive";
      case "running":
        return "secondary";
      case "pending":
        return "outline";
    }
  }

  function workflowStatusLabel(): string {
    if (pending) {
      return $t(i18nKeys.console.deployments.progressStatusRunning);
    }

    if (feedback?.kind === "running") {
      return $t(i18nKeys.console.deployments.progressStatusRunning);
    }

    if (feedback?.kind === "success") {
      return $t(i18nKeys.console.deployments.progressStatusSucceeded);
    }

    if (feedback?.kind === "error" || progressError) {
      return $t(i18nKeys.common.status.failed);
    }

    return $t(i18nKeys.console.deployments.progressStatusLog);
  }

  function workflowStatusVariant(): "default" | "secondary" | "outline" | "destructive" {
    if (feedback?.kind === "success") {
      return "default";
    }

    if (feedback?.kind === "running") {
      return "secondary";
    }

    if (feedback?.kind === "error" || progressError) {
      return "destructive";
    }

    return pending ? "secondary" : "outline";
  }

  function deploymentPanelStatus(): DeploymentProgressDialogStatus {
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
</script>

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
    <div
      aria-labelledby="quick-deploy-progress-title"
      aria-modal="true"
      role="dialog"
      class="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border bg-background shadow-xl"
    >
      <header class="border-b px-5 py-4">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="min-w-0 space-y-2">
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

          <div class="flex shrink-0 flex-wrap gap-2">
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
        <section class="rounded-md border bg-muted/10 p-4">
          <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(14rem,18rem)]">
            <div class="console-record-list">
              {#if progressItems.length === 0}
                <div class="console-record-row flex items-center gap-2">
                  <LoaderCircle class="size-4 animate-spin text-primary" />
                  <span class="text-sm text-muted-foreground">
                    {$t(i18nKeys.console.deployments.progressWaiting)}
                  </span>
                </div>
              {:else}
                {#each progressItems as item (item.kind)}
                  <div class="console-record-row flex items-center justify-between gap-3">
                    <div class="flex min-w-0 items-center gap-2">
                      {#if item.status === "running"}
                        <LoaderCircle class="size-4 shrink-0 animate-spin text-primary" />
                      {:else if item.status === "succeeded"}
                        <CheckCircle2 class="size-4 shrink-0 text-emerald-600" />
                      {:else if item.status === "failed"}
                        <ShieldAlert class="size-4 shrink-0 text-destructive" />
                      {:else}
                        <Circle class="size-4 shrink-0 text-muted-foreground" />
                      {/if}
                      <span class="truncate text-sm font-medium">{workflowStepLabel(item.kind)}</span>
                    </div>
                    <Badge variant={workflowStepStatusVariant(item.status)}>
                      {workflowStepStatusLabel(item.status)}
                    </Badge>
                  </div>
                {/each}
              {/if}
            </div>

            <div class="space-y-3">
              {#if progressError}
                <div class="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {progressError}
                </div>
              {/if}

              {#if feedback}
                <div
                  class={[
                    "rounded-md border px-3 py-2 text-sm",
                    feedback.kind === "success"
                      ? "border-primary/25 bg-primary/5"
                      : feedback.kind === "running"
                        ? "border-border bg-background"
                        : "border-destructive/25 bg-destructive/5 text-destructive",
                  ]}
                >
                  <p class="font-medium">{feedback.title}</p>
                  <p class="mt-1 break-words text-xs text-muted-foreground">{feedback.detail}</p>
                </div>
              {/if}
            </div>
          </div>
        </section>

        <OperationProgressPanel
          status={deploymentPanelStatus()}
          events={deploymentEvents}
          streamError={progressError}
          {deploymentId}
          {traceLink}
          title={$t(i18nKeys.console.deployments.progressTitle)}
          description={$t(i18nKeys.console.deployments.progressDescription)}
          {onOpenDeployment}
        />
      </div>
    </div>
  </div>
{/if}
