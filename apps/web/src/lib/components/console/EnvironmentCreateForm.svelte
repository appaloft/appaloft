<script lang="ts">
  import { AlertCircle, CheckCircle2, Plus } from "@lucide/svelte";
  import { createMutation } from "@tanstack/svelte-query";
  import type { CreateEnvironmentResponse } from "@appaloft/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { environmentKinds, type EnvironmentKind } from "$lib/console/environment-form";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpc, orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type Feedback = {
    kind: "success" | "error";
    title: string;
    detail: string;
  };

  type Props = {
    projectId: string;
    panel?: boolean;
    showIntro?: boolean;
    idPrefix?: string;
    onCreated?: (environment: CreateEnvironmentResponse) => void;
  };

  let {
    projectId,
    panel = true,
    showIntro = true,
    idPrefix = "environment-create",
    onCreated,
  }: Props = $props();

  let environmentName = $state("production");
  let environmentKind = $state<EnvironmentKind>("production");
  let createEnvironmentFeedback = $state<Feedback | null>(null);

  const canCreateEnvironment = $derived(projectId.length > 0 && environmentName.trim().length > 0);
  const formClass = $derived(panel ? "console-panel p-5" : "space-y-5");
  const fieldsClass = $derived(showIntro ? "mt-5 grid gap-4" : "grid gap-4");

  const createEnvironmentMutation = createMutation(() => ({
    mutationFn: (input: { projectId: string; name: string; kind: EnvironmentKind }) =>
      orpcClient.environments.create(input),
    onSuccess: (result) => {
      createEnvironmentFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.projects.environmentCreateSucceeded),
        detail: result.id,
      };
      void queryClient.invalidateQueries({ queryKey: orpc.environments.key({ type: "query" }) });
      onCreated?.(result);
    },
    onError: (error) => {
      createEnvironmentFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.projects.environmentCreateFailed),
        detail: readErrorMessage(error),
      };
    },
  }));

  function submitEnvironmentCreate(event: SubmitEvent): void {
    event.preventDefault();

    const name = environmentName.trim();

    if (!projectId || !name || createEnvironmentMutation.isPending) {
      return;
    }

    createEnvironmentFeedback = null;
    createEnvironmentMutation.mutate({
      projectId,
      name,
      kind: environmentKind,
    });
  }
</script>

<form class={formClass} onsubmit={submitEnvironmentCreate}>
  {#if showIntro}
    <div class="space-y-1.5">
      <h2 class="text-base font-semibold">
        {$t(i18nKeys.console.projects.environmentCreateTitle)}
      </h2>
      <p class="text-sm leading-6 text-muted-foreground">
        {$t(i18nKeys.console.projects.environmentCreateDescription)}
      </p>
    </div>
  {/if}

  <div class={fieldsClass}>
    <label class="console-field-stack" for={`${idPrefix}-name`}>
      <span class="console-field-label">
        {$t(i18nKeys.console.projects.environmentCreateNameLabel)}
      </span>
      <Input
        id={`${idPrefix}-name`}
        autocomplete="off"
        bind:value={environmentName}
        placeholder={$t(i18nKeys.console.projects.environmentCreateNamePlaceholder)}
        disabled={createEnvironmentMutation.isPending}
      />
    </label>

    <fieldset class="space-y-2">
      <legend class="console-field-label">
        {$t(i18nKeys.console.quickDeploy.environmentKind)}
      </legend>
      <div class="grid gap-2 sm:grid-cols-2">
        {#each environmentKinds as kind (kind)}
          <Button
            size="sm"
            variant={environmentKind === kind ? "selected" : "outline"}
            disabled={createEnvironmentMutation.isPending}
            aria-pressed={environmentKind === kind}
            onclick={() => {
              environmentKind = kind;
            }}
          >
            {kind}
          </Button>
        {/each}
      </div>
    </fieldset>
  </div>

  {#if createEnvironmentFeedback}
    <div
      class={`mt-4 flex gap-2 rounded-md border p-3 text-sm ${
        createEnvironmentFeedback.kind === "success"
          ? "border-chart-2/30 bg-chart-2/10 text-foreground"
          : "border-destructive/30 bg-destructive/10 text-foreground"
      }`}
    >
      {#if createEnvironmentFeedback.kind === "success"}
        <CheckCircle2 class="mt-0.5 size-4 shrink-0 text-chart-2" />
      {:else}
        <AlertCircle class="mt-0.5 size-4 shrink-0 text-destructive" />
      {/if}
      <div class="min-w-0">
        <p class="font-medium">{createEnvironmentFeedback.title}</p>
        <p class="mt-1 break-words text-xs leading-5 text-muted-foreground">
          {createEnvironmentFeedback.detail}
        </p>
      </div>
    </div>
  {/if}

  <div class="console-action-row mt-5">
    <Button
      type="submit"
      disabled={!canCreateEnvironment || createEnvironmentMutation.isPending}
    >
      <Plus class="size-4" />
      {createEnvironmentMutation.isPending
        ? $t(i18nKeys.common.actions.creating)
        : $t(i18nKeys.console.projects.environmentCreateAction)}
    </Button>
  </div>
</form>
