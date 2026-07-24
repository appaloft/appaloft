<script lang="ts">
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";
  import { CheckCircle2, GitPullRequest, Play, RotateCcw, Square } from "@lucide/svelte";

  import { readErrorMessage } from "$lib/api/client";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { createBrowserWorkspaceTasks } from "$lib/console/workspace-task-client";
  import { i18nKeys, t } from "$lib/i18n";
  import { queryClient } from "$lib/query-client";

  type TaskResult = Awaited<ReturnType<ReturnType<typeof createBrowserWorkspaceTasks>["show"]>>;

  let {
    workspaceId,
    runtimeId,
  }: {
    workspaceId: string;
    runtimeId: string;
  } = $props();

  const tasks = $derived(createBrowserWorkspaceTasks(workspaceId, runtimeId));
  let prompt = $state("");
  let checkArgv = $state('["bun","test"]');
  let previewArgv = $state("");
  let previewPort = $state("3000");
  let immutableReview = $state(false);
  let deliveryBranch = $state("");
  let commitMessage = $state("");
  let pullRequestTitle = $state("");
  let selectedTaskRunId = $state("");

  const taskListQuery = createQuery(() =>
    queryOptions({
      queryKey: ["agent-task-runs", workspaceId, runtimeId],
      queryFn: () => tasks.list(),
      refetchInterval: (query) => {
        const items = (query.state.data?.items ?? []) as readonly TaskResult[];
        return items.some((item) => ["running", "finalizing", "delivering"].includes(item.status))
          ? 2_000
          : false;
      },
    }),
  );

  const taskRuns = $derived((taskListQuery.data?.items ?? []) as readonly TaskResult[]);
  const selectedTask = $derived(
    taskRuns.find((task) => task.taskRunId === selectedTaskRunId) ?? taskRuns[0],
  );
  const taskEventsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["agent-task-run-events", selectedTask?.runId],
      enabled: Boolean(selectedTask?.runId),
      queryFn: () => tasks.events(selectedTask?.runId ?? "", { limit: 500 }),
      refetchInterval:
        selectedTask &&
        ["running", "finalizing", "delivering"].includes(selectedTask.status)
          ? 1_000
          : false,
    }),
  );
  const taskEvents = $derived(taskEventsQuery.data?.items ?? []);

  function parseArgv(value: string, required: boolean): string[] | undefined {
    if (!value.trim() && !required) return undefined;
    const parsed = JSON.parse(value) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      !parsed.every((item) => typeof item === "string" && item.length > 0)
    ) {
      throw new Error("agent_task_argv_invalid");
    }
    return parsed;
  }

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({
      queryKey: ["agent-task-runs", workspaceId, runtimeId],
    });
  }

  const runMutation = createMutation(() => ({
    mutationFn: async () => {
      const check = parseArgv(checkArgv, false);
      const preview = parseArgv(previewArgv, false);
      return tasks.run({
        task: prompt,
        checks: check ? [{ name: "workspace-check", argv: check, required: true }] : [],
        ...(preview
          ? {
              preview: {
                startArgv: preview,
                port: Number(previewPort),
                visibility: "private",
                expiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
              },
            }
          : {}),
        immutableReview,
      });
    },
    onSuccess: async (result) => {
      prompt = "";
      selectedTaskRunId = result.taskRunId;
      await refresh();
    },
  }));

  const actionMutation = createMutation(() => ({
    mutationFn: async (input: { action: "resume" | "cancel" | "approve"; taskRunId: string }) => {
      if (input.action === "resume") return tasks.resume(input.taskRunId);
      if (input.action === "cancel") return tasks.cancel(input.taskRunId);
      return tasks.approve(input.taskRunId);
    },
    onSuccess: refresh,
  }));

  const deliverMutation = createMutation(() => ({
    mutationFn: (taskRunId: string) =>
      tasks.deliver(taskRunId, {
        branch: deliveryBranch,
        commitMessage,
        pullRequest: pullRequestTitle.trim()
          ? { provider: "github", title: pullRequestTitle.trim() }
          : undefined,
      }),
    onSuccess: refresh,
  }));
</script>

<section class="space-y-5 rounded-xl border bg-card p-5" data-agent-task-panel>
  <div>
    <h2 class="text-lg font-semibold">{$t(i18nKeys.console.agentWorkspaces.tasksTitle)}</h2>
    <p class="mt-1 text-sm text-muted-foreground">
      {$t(i18nKeys.console.agentWorkspaces.tasksDescription)}
    </p>
  </div>

  <div class="space-y-3">
    <textarea
      class="min-h-28 w-full rounded-md border bg-background p-3 text-sm"
      bind:value={prompt}
      required
      placeholder={$t(i18nKeys.console.agentWorkspaces.taskPrompt)}
    ></textarea>
    <div class="grid gap-3 md:grid-cols-2">
      <label class="grid gap-1.5 text-sm">
        <span class="font-medium">{$t(i18nKeys.console.agentWorkspaces.checks)}</span>
        <input class="h-10 rounded-md border bg-background px-3 font-mono" bind:value={checkArgv} />
      </label>
      <label class="grid gap-1.5 text-sm">
        <span class="font-medium">{$t(i18nKeys.console.agentWorkspaces.previewCommand)}</span>
        <input class="h-10 rounded-md border bg-background px-3 font-mono" bind:value={previewArgv} />
      </label>
    </div>
    {#if previewArgv.trim()}
      <label class="grid max-w-48 gap-1.5 text-sm">
        <span class="font-medium">{$t(i18nKeys.console.agentWorkspaces.previewPort)}</span>
        <input
          class="h-10 rounded-md border bg-background px-3"
          type="number"
          min="1"
          max="65535"
          bind:value={previewPort}
        />
      </label>
    {/if}
    <label class="flex items-center gap-2 text-sm">
      <input type="checkbox" bind:checked={immutableReview} />
      {$t(i18nKeys.console.agentWorkspaces.immutableReview)}
    </label>
    {#if runMutation.error}
      <p class="text-sm text-destructive">{readErrorMessage(runMutation.error)}</p>
    {/if}
    <Button type="button" disabled={runMutation.isPending || !prompt.trim()} onclick={() => runMutation.mutate()}>
      <Play class="size-4" />
      {runMutation.isPending
        ? $t(i18nKeys.console.agentWorkspaces.taskRunning)
        : $t(i18nKeys.console.agentWorkspaces.taskRun)}
    </Button>
  </div>

  {#if taskListQuery.error}
    <p class="text-sm text-destructive">{readErrorMessage(taskListQuery.error)}</p>
  {:else if taskRuns.length === 0}
    <p class="text-sm text-muted-foreground">
      {$t(i18nKeys.console.agentWorkspaces.taskEmpty)}
    </p>
  {:else}
    <div class="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <div class="space-y-2">
        {#each taskRuns as task (task.taskRunId)}
          <button
            class={[
              "w-full rounded-md border p-3 text-left text-sm",
              selectedTask?.taskRunId === task.taskRunId ? "border-primary bg-primary/5" : "",
            ]}
            type="button"
            onclick={() => (selectedTaskRunId = task.taskRunId)}
          >
            <span class="block truncate font-mono">{task.taskRunId}</span>
            <Badge class="mt-2" variant="outline">{task.status}</Badge>
          </button>
        {/each}
      </div>

      {#if selectedTask}
        <div class="min-w-0 space-y-4">
          <div class="flex flex-wrap gap-2">
            <Badge>{selectedTask.status}</Badge>
            <Button
              size="sm"
              variant="outline"
              onclick={() =>
                actionMutation.mutate({
                  action: "resume",
                  taskRunId: selectedTask.taskRunId,
                })}
            >
              <RotateCcw class="size-4" />
              {$t(i18nKeys.console.agentWorkspaces.resume)}
            </Button>
            {#if ["running", "finalizing"].includes(selectedTask.status)}
              <Button
                size="sm"
                variant="outline"
                onclick={() =>
                  actionMutation.mutate({
                    action: "cancel",
                    taskRunId: selectedTask.taskRunId,
                  })}
              >
                <Square class="size-4" />
                {$t(i18nKeys.console.agentWorkspaces.cancel)}
              </Button>
            {/if}
            {#if selectedTask.status === "awaiting-approval"}
              <Button
                size="sm"
                onclick={() =>
                  actionMutation.mutate({
                    action: "approve",
                    taskRunId: selectedTask.taskRunId,
                  })}
              >
                <CheckCircle2 class="size-4" />
                {$t(i18nKeys.console.agentWorkspaces.approve)}
              </Button>
            {/if}
          </div>

          <div class="space-y-2">
            <h3 class="text-sm font-semibold">
              {$t(i18nKeys.console.agentWorkspaces.liveActivity)}
            </h3>
            {#if taskEventsQuery.error}
              <p class="text-sm text-destructive">
                {readErrorMessage(taskEventsQuery.error)}
              </p>
            {:else if taskEvents.length === 0}
              <p class="text-sm text-muted-foreground">
                {$t(i18nKeys.console.agentWorkspaces.liveActivityEmpty)}
              </p>
            {:else}
              <ol
                class="max-h-80 space-y-2 overflow-auto rounded-md border bg-muted/30 p-3"
                data-agent-task-events
              >
                {#each taskEvents as event (event.eventId)}
                  <li class="grid gap-1 text-xs">
                    <div class="flex items-center justify-between gap-3">
                      <span class="font-medium">{event.type}</span>
                      <span class="font-mono text-muted-foreground">#{event.sequence}</span>
                    </div>
                    <pre class="overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(event.data, null, 2)}</pre>
                  </li>
                {/each}
              </ol>
            {/if}
          </div>

          {#if selectedTask.checks.length > 0}
            <div class="space-y-2">
              <h3 class="text-sm font-semibold">
                {$t(i18nKeys.console.agentWorkspaces.checks)}
              </h3>
              {#each selectedTask.checks as check (check.name)}
                <div class="rounded-md border p-3 text-sm">
                  <div class="flex items-center justify-between gap-3">
                    <span class="font-medium">{check.name}</span>
                    <Badge variant={check.status === "passed" ? "default" : "destructive"}>
                      {check.status}
                    </Badge>
                  </div>
                  {#if check.output}
                    <pre class="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">{check.output}</pre>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}

          {#if selectedTask.changes}
            <details class="rounded-md border p-3">
              <summary class="cursor-pointer text-sm font-semibold">
                {$t(i18nKeys.console.agentWorkspaces.viewChanges)}
              </summary>
              <pre class="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs">{selectedTask.changes.status}

{selectedTask.changes.stat}

{selectedTask.changes.patch}</pre>
            </details>
          {/if}

          {#if selectedTask.developmentPreview}
            <a
              class="block truncate text-sm text-primary underline"
              href={selectedTask.developmentPreview.url}
              target="_blank"
              rel="noreferrer"
            >
              {$t(i18nKeys.console.agentWorkspaces.developmentPreview)}
            </a>
          {/if}

          {#if selectedTask.status === "approved"}
            <div class="grid gap-3 rounded-md border p-3">
              <div class="grid gap-3 md:grid-cols-2">
                <input
                  class="h-10 rounded-md border bg-background px-3 text-sm"
                  bind:value={deliveryBranch}
                  required
                  placeholder={$t(i18nKeys.console.agentWorkspaces.deliveryBranch)}
                />
                <input
                  class="h-10 rounded-md border bg-background px-3 text-sm"
                  bind:value={commitMessage}
                  required
                  placeholder={$t(i18nKeys.console.agentWorkspaces.commitMessage)}
                />
              </div>
              <input
                class="h-10 rounded-md border bg-background px-3 text-sm"
                bind:value={pullRequestTitle}
                placeholder={$t(i18nKeys.console.agentWorkspaces.pullRequestTitle)}
              />
              <Button
                type="button"
                disabled={deliverMutation.isPending || !deliveryBranch.trim() || !commitMessage.trim()}
                onclick={() => deliverMutation.mutate(selectedTask.taskRunId)}
              >
                <GitPullRequest class="size-4" />
                {$t(i18nKeys.console.agentWorkspaces.deliver)}
              </Button>
            </div>
          {/if}

          {#if selectedTask.delivery?.pullRequestUrl}
            <a
              class="text-sm text-primary underline"
              href={selectedTask.delivery.pullRequestUrl}
              target="_blank"
              rel="noreferrer"
            >
              {selectedTask.delivery.pullRequestUrl}
            </a>
          {/if}

          {#if actionMutation.error || deliverMutation.error}
            <p class="text-sm text-destructive">
              {readErrorMessage(actionMutation.error ?? deliverMutation.error)}
            </p>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</section>
