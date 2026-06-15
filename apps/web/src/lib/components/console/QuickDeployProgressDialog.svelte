<script lang="ts">
  import { CheckCircle2, Circle, ExternalLink, LoaderCircle, Rows3, ShieldAlert } from "@lucide/svelte";
  import type { DeploymentProgressEvent, QuickDeployWorkflowStep } from "@appaloft/contracts";
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
    embedded?: boolean;
    onClose?: () => void;
    onOpenResource?: () => void;
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
    embedded = false,
    onClose,
    onOpenResource,
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
            {#if onOpenResource && deploymentPanelStatus() === "succeeded"}
              <Button type="button" size="sm" onclick={() => onOpenResource?.()}>
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

        {#if feedback}
          <section
            class={[
              "rounded-md px-4 py-3 text-sm",
              feedback.kind === "success"
                ? "bg-primary/5"
                : feedback.kind === "running"
                  ? "bg-muted/40"
                  : "bg-destructive/5 text-destructive",
            ]}
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0">
                <p class="font-medium">{feedback.title}</p>
                <p class="mt-1 break-words text-xs text-muted-foreground">{feedback.detail}</p>
              </div>
              {#if onOpenResource && deploymentPanelStatus() === "succeeded"}
                <Button type="button" size="sm" onclick={() => onOpenResource?.()} class="shrink-0">
                  <ExternalLink class="size-4" />
                  {$t(i18nKeys.common.actions.openResource)}
                </Button>
              {/if}
            </div>
          </section>
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

          {#if progressItems.length > 0}
            <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {#each progressItems as item (item.kind)}
                <div class="flex min-w-0 items-center gap-2 rounded-md bg-muted/30 px-3 py-2">
                  {#if item.status === "running"}
                    <LoaderCircle class="size-4 shrink-0 animate-spin text-primary" />
                  {:else if item.status === "succeeded"}
                    <CheckCircle2 class="size-4 shrink-0 text-emerald-600" />
                  {:else if item.status === "failed"}
                    <ShieldAlert class="size-4 shrink-0 text-destructive" />
                  {:else}
                    <Circle class="size-4 shrink-0 text-muted-foreground" />
                  {/if}
                  <span class="min-w-0 flex-1 truncate text-sm font-medium">
                    {workflowStepLabel(item.kind)}
                  </span>
                  <Badge variant={workflowStepStatusVariant(item.status)}>
                    {workflowStepStatusLabel(item.status)}
                  </Badge>
                </div>
              {/each}
            </div>
          {/if}

          <div
            bind:this={progressLogArea}
            class="max-h-[46vh] min-h-72 overflow-auto rounded-md bg-muted/20 p-3 font-mono text-xs"
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
        </section>
      </div>
    </div>
  </div>
{/if}
