<script lang="ts">
  import { AlertCircle, CheckCircle2, Plus } from "@lucide/svelte";
  import { createMutation } from "@tanstack/svelte-query";
  import type { CreateProjectResponse } from "@appaloft/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpc, orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type Feedback = {
    kind: "success" | "error";
    title: string;
    detail: string;
  };

  type Props = {
    panel?: boolean;
    showIntro?: boolean;
    idPrefix?: string;
    onCreated?: (project: CreateProjectResponse) => void;
  };

  let {
    panel = true,
    showIntro = true,
    idPrefix = "project-create",
    onCreated,
  }: Props = $props();

  let projectName = $state("");
  let projectDescription = $state("");
  let createProjectFeedback = $state<Feedback | null>(null);

  const canCreateProject = $derived(projectName.trim().length > 0);
  const formClass = $derived(panel ? "console-panel p-5" : "space-y-5");
  const fieldsClass = $derived(showIntro ? "mt-5 grid gap-4" : "grid gap-4");

  const createProjectMutation = createMutation(() => ({
    mutationFn: (input: { name: string; description?: string }) => orpcClient.projects.create(input),
    onSuccess: (result) => {
      createProjectFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.projects.createProjectSucceeded),
        detail: result.id,
      };
      projectName = "";
      projectDescription = "";
      void queryClient.invalidateQueries({ queryKey: orpc.projects.key({ type: "query" }) });
      onCreated?.(result);
    },
    onError: (error) => {
      createProjectFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.projects.createProjectFailed),
        detail: readErrorMessage(error),
      };
    },
  }));

  function submitProjectCreate(event: SubmitEvent): void {
    event.preventDefault();

    const name = projectName.trim();
    const description = projectDescription.trim();

    if (!name || createProjectMutation.isPending) {
      return;
    }

    createProjectFeedback = null;
    createProjectMutation.mutate({
      name,
      ...(description ? { description } : {}),
    });
  }
</script>

<form class={formClass} onsubmit={submitProjectCreate}>
  {#if showIntro}
    <div class="space-y-1.5">
      <h2 class="text-base font-semibold">
        {$t(i18nKeys.console.projects.createProjectTitle)}
      </h2>
      <p class="text-sm leading-6 text-muted-foreground">
        {$t(i18nKeys.console.projects.createProjectDescription)}
      </p>
    </div>
  {/if}

  <div class={fieldsClass}>
    <label class="console-field-stack" for={`${idPrefix}-name`}>
      <span class="console-field-label">
        {$t(i18nKeys.console.projects.createProjectNameLabel)}
      </span>
      <Input
        id={`${idPrefix}-name`}
        autocomplete="off"
        bind:value={projectName}
        placeholder={$t(i18nKeys.console.projects.createProjectNamePlaceholder)}
        disabled={createProjectMutation.isPending}
      />
    </label>

    <label class="console-field-stack" for={`${idPrefix}-description`}>
      <span class="console-field-label">
        {$t(i18nKeys.console.projects.createProjectDescriptionLabel)}
      </span>
      <Textarea
        id={`${idPrefix}-description`}
        bind:value={projectDescription}
        placeholder={$t(i18nKeys.console.projects.createProjectDescriptionPlaceholder)}
        disabled={createProjectMutation.isPending}
      />
    </label>
  </div>

  {#if createProjectFeedback}
    <div
      class={`mt-4 flex gap-2 rounded-md border p-3 text-sm ${
        createProjectFeedback.kind === "success"
          ? "border-chart-2/30 bg-chart-2/10 text-foreground"
          : "border-destructive/30 bg-destructive/10 text-foreground"
      }`}
    >
      {#if createProjectFeedback.kind === "success"}
        <CheckCircle2 class="mt-0.5 size-4 shrink-0 text-chart-2" />
      {:else}
        <AlertCircle class="mt-0.5 size-4 shrink-0 text-destructive" />
      {/if}
      <div class="min-w-0">
        <p class="font-medium">{createProjectFeedback.title}</p>
        <p class="mt-1 break-words text-xs leading-5 text-muted-foreground">
          {createProjectFeedback.detail}
        </p>
      </div>
    </div>
  {/if}

  <div class="console-action-row mt-5">
    <Button type="submit" disabled={!canCreateProject || createProjectMutation.isPending}>
      <Plus class="size-4" />
      {createProjectMutation.isPending
        ? $t(i18nKeys.console.projects.createProjectSubmitting)
        : $t(i18nKeys.console.projects.createProjectAction)}
    </Button>
  </div>
</form>
