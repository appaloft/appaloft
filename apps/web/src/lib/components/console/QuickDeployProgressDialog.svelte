<script lang="ts">
  import { CheckCircle2, LoaderCircle, ShieldCheck } from "@lucide/svelte";
  import type { DeploymentProgressEvent, QuickDeployWorkflowStep } from "@yundu/contracts";
  import { tick } from "svelte";

  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import {
    groupDeploymentProgressEvents,
    progressSourceLabel,
  } from "$lib/console/deployment-progress";
  import { i18nKeys, t } from "$lib/i18n";

  type QuickDeployWorkflowStepStatus = "pending" | "running" | "succeeded" | "failed";
  type QuickDeployWorkflowProgressItem = {
    kind: QuickDeployWorkflowStep["kind"];
    status: QuickDeployWorkflowStepStatus;
  };
  type QuickDeployFeedback = {
    kind: "success" | "error";
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
    onClose,
    onOpenDeployment,
  }: Props = $props();

  const deploymentSections = $derived(groupDeploymentProgressEvents(deploymentEvents));
  let progressScrollArea = $state<HTMLDivElement | undefined>();

  $effect(() => {
    const scrollKey = [
      progressItems.length,
      deploymentEvents.length,
      progressError,
      feedback?.detail ?? "",
    ].join(":");

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
      case "environments.create":
        return $t(i18nKeys.console.quickDeploy.workflowStepEnvironmentsCreate);
      case "resources.create":
        return $t(i18nKeys.console.quickDeploy.workflowStepResourcesCreate);
      case "environments.setVariable":
        return $t(i18nKeys.console.quickDeploy.workflowStepEnvironmentVariableSet);
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

  function workflowStatusLabel(): string {
    if (pending) {
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

    if (feedback?.kind === "error" || progressError) {
      return "destructive";
    }

    return pending ? "secondary" : "outline";
  }

  function deploymentProgressPhaseLabel(phase: DeploymentProgressEvent["phase"]): string {
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

  function deploymentProgressStatusLabel(status?: DeploymentProgressEvent["status"]): string {
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

  function deploymentProgressLevelClass(level: DeploymentProgressEvent["level"]): string {
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

  function deploymentProgressTimeLabel(timestamp: string): string {
    return timestamp.slice(11, 19) || "--:--:--";
  }
</script>

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
    <div
      aria-labelledby="quick-deploy-progress-title"
      aria-modal="true"
      role="dialog"
      class="flex max-h-[86vh] w-full max-w-4xl flex-col rounded-lg border bg-background shadow-lg"
    >
      <header class="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <h2 id="quick-deploy-progress-title" class="text-lg font-semibold">
              {$t(i18nKeys.console.quickDeploy.workflowProgressTitle)}
            </h2>
            <Badge variant={workflowStatusVariant()}>{workflowStatusLabel()}</Badge>
          </div>
          <p class="text-sm text-muted-foreground">
            {$t(i18nKeys.console.quickDeploy.workflowProgressDescription)}
          </p>
          {#if deploymentId}
            <p class="font-mono text-xs text-muted-foreground">
              {$t(i18nKeys.console.deployments.progressDeploymentLabel)} {deploymentId}
            </p>
          {/if}
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
            disabled={pending}
            onclick={() => onClose?.()}
          >
            {$t(i18nKeys.common.actions.close)}
          </Button>
        </div>
      </header>

      <div class="min-h-0 flex-1 overflow-hidden p-5">
        <div
          bind:this={progressScrollArea}
          class="max-h-[62vh] min-h-72 overflow-auto rounded-md border border-zinc-800 bg-zinc-950 px-4 py-3 text-xs text-zinc-200 shadow-inner"
        >
          {#if progressItems.length === 0 && deploymentSections.length === 0}
            <p class="font-mono text-zinc-500">
              {$t(i18nKeys.console.deployments.progressWaiting)}
            </p>
          {:else}
            <div class="space-y-2">
              {#each progressItems as item (item.kind)}
                <div class="flex items-center justify-between gap-3 rounded-md border border-zinc-800/80 bg-zinc-900/50 px-3 py-2">
                  <span class="flex min-w-0 items-center gap-2">
                    {#if item.status === "running"}
                      <LoaderCircle class="size-3.5 shrink-0 animate-spin text-emerald-300" />
                    {:else if item.status === "succeeded"}
                      <CheckCircle2 class="size-3.5 shrink-0 text-emerald-300" />
                    {:else if item.status === "failed"}
                      <ShieldCheck class="size-3.5 shrink-0 text-red-300" />
                    {:else}
                      <span class="size-3.5 shrink-0 rounded-full border border-zinc-600"></span>
                    {/if}
                    <span class="truncate text-zinc-200">{workflowStepLabel(item.kind)}</span>
                  </span>
                  <span
                    class={`shrink-0 ${
                      item.status === "failed"
                        ? "text-red-300"
                        : item.status === "succeeded"
                          ? "text-emerald-300"
                          : "text-zinc-400"
                    }`}
                  >
                    {workflowStepStatusLabel(item.status)}
                  </span>
                </div>
              {/each}
            </div>

            {#if deploymentSections.length > 0}
              <div class="mt-4 space-y-4 font-mono">
                {#each deploymentSections as section (section.phase)}
                  <div class="border-t border-zinc-800/80 pt-3 first:border-t-0 first:pt-0">
                    <div class="flex flex-wrap items-center gap-2 text-zinc-400">
                      <span class="text-emerald-300">
                        [{section.step?.current ?? "-"} / {section.step?.total ?? "-"}]
                      </span>
                      <span>{deploymentProgressPhaseLabel(section.phase)}</span>
                      <span class="text-zinc-600">·</span>
                      <span>{section.step?.label ?? $t(i18nKeys.console.deployments.progressStepFallback)}</span>
                      {#if section.status}
                        <span class="text-zinc-600">·</span>
                        <span>{deploymentProgressStatusLabel(section.status)}</span>
                      {/if}
                    </div>

                    <div class="mt-2 space-y-1">
                      {#each section.events as event, index (`${event.timestamp}-${section.phase}-${index}`)}
                        <div class="grid grid-cols-[4rem_4.75rem_minmax(0,1fr)] gap-2 leading-5">
                          <span class="text-zinc-600">{deploymentProgressTimeLabel(event.timestamp)}</span>
                          <span class="text-zinc-400">{progressSourceLabel(event)}</span>
                          <span class={`min-w-0 break-words ${deploymentProgressLevelClass(event.level)}`}>
                            {event.message}
                          </span>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          {/if}

          {#if progressError}
            <p class="mt-3 border-t border-red-900/60 pt-3 text-red-300">{progressError}</p>
          {/if}

          {#if feedback}
            <div
              class={`mt-3 border-t pt-3 ${
                feedback.kind === "success" ? "border-emerald-900/60" : "border-red-900/60"
              }`}
            >
              <p
                class={`font-medium ${
                  feedback.kind === "success" ? "text-emerald-300" : "text-red-300"
                }`}
              >
                {feedback.title}
              </p>
              <p class="mt-1 break-words text-zinc-400">{feedback.detail}</p>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
