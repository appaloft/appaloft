<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { ExternalLink, Link2, Pause, Play, Power, RadioTower } from "@lucide/svelte";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";

  import { readErrorMessage } from "$lib/api/client";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import TerminalSessionPanel from "$lib/components/console/TerminalSessionPanel.svelte";
  import WorkspaceTaskPanel from "$lib/components/console/WorkspaceTaskPanel.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type SandboxDescriptor = {
    sandboxId: string;
    status: string;
    expiresAt?: string;
  };
  type RuntimeDescriptor = {
    runtimeId: string;
    harnessKey: string;
    status: string;
    interaction?: {
      transport: "managed-terminal" | "native-attach";
      serverPort?: number;
      command: readonly string[];
    };
    capabilities: {
      taskMode: boolean;
      interactive: boolean;
      nativeSession: boolean;
      persistentPaths: readonly string[];
    };
  };
  type PortExposure = {
    exposureId: string;
    port: number;
    visibility: string;
    url: string;
    expiresAt: string;
  };

  const workspaceId = $derived(page.params.workspaceId ?? "");
  let previewPort = $state("3000");
  let nativeAttachCommand = $state("");
  let deleteOpen = $state(false);

  const workspaceQuery = createQuery(() =>
    queryOptions({
      queryKey: ["agent-workspace", workspaceId],
      enabled: browser,
      queryFn: async () => {
        const sandbox = (await orpcClient.sandboxes.show({
          sandboxId: workspaceId,
        })) as SandboxDescriptor;
        const [runtimes, ports] = await Promise.all([
          orpcClient.sandboxes.agents.runtimes.list({ sandboxId: workspaceId }),
          sandbox.status === "ready"
            ? orpcClient.sandboxes.ports.list({ sandboxId: workspaceId })
            : Promise.resolve([]),
        ]);
        return {
          sandbox,
          runtimes: (runtimes as { items: RuntimeDescriptor[] }).items,
          ports: ports as PortExposure[],
        };
      },
    }),
  );

  const sandbox = $derived(workspaceQuery.data?.sandbox);
  const runtimes = $derived(workspaceQuery.data?.runtimes ?? []);
  const ports = $derived(workspaceQuery.data?.ports ?? []);
  const workspaceReady = $derived(sandbox?.status === "ready");
  const taskRuntime = $derived(
    workspaceReady
      ? runtimes.find(
          (runtime) => runtime.capabilities.taskMode && runtime.status !== "terminated",
        )
      : undefined,
  );
  const nativeRuntime = $derived(
    workspaceReady
      ? runtimes.find(
          (runtime) =>
            runtime.interaction?.transport === "native-attach" &&
            runtime.interaction.serverPort &&
            runtime.capabilities.nativeSession,
        )
      : undefined,
  );

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ["agent-workspace", workspaceId] });
    await queryClient.invalidateQueries({ queryKey: ["agent-workspaces"] });
  }

  const lifecycleMutation = createMutation(() => ({
    mutationFn: async (action: "pause" | "resume" | "terminate") => {
      if (action === "pause") return orpcClient.sandboxes.pause({ sandboxId: workspaceId });
      if (action === "resume") return orpcClient.sandboxes.resume({ sandboxId: workspaceId });
      await Promise.all(
        runtimes
          .filter((runtime) => runtime.status !== "terminated")
          .map((runtime) =>
            orpcClient.sandboxes.agents.runtimes.terminate({
              sandboxId: workspaceId,
              runtimeId: runtime.runtimeId,
            }),
          ),
      );
      return orpcClient.sandboxes.terminate({ sandboxId: workspaceId });
    },
    onSuccess: async (_result, action) => {
      if (action === "terminate") {
        deleteOpen = false;
        await queryClient.invalidateQueries({ queryKey: ["agent-workspaces"] });
        await goto("/workspaces");
        return;
      }
      await refresh();
    },
  }));

  const exposeMutation = createMutation(() => ({
    mutationFn: (port: number) =>
      orpcClient.sandboxes.ports.expose({
        sandboxId: workspaceId,
        port,
        visibility: "private",
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
      }) as Promise<PortExposure>,
    onSuccess: refresh,
  }));

  const attachMutation = createMutation(() => ({
    mutationFn: async () => {
      if (!nativeRuntime) {
        throw new Error("agent_workspace_native_attach_unavailable");
      }
      const attach = await orpcClient.sandboxes.agents.runtimes.attach({
        sandboxId: workspaceId,
        runtimeId: nativeRuntime.runtimeId,
        expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      });
      return (attach as { clientCommand: string[] }).clientCommand.join(" ");
    },
    onSuccess: async (command) => {
      nativeAttachCommand = command;
      await navigator.clipboard?.writeText(command);
      await refresh();
    },
  }));
</script>

<svelte:head>
  <title>{workspaceId} · {$t(i18nKeys.console.agentWorkspaces.pageTitle)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={workspaceId}
  description={$t(i18nKeys.console.agentWorkspaces.pageDescription)}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.home), href: "/" },
    {
      label: $t(i18nKeys.console.agentWorkspaces.pageTitle),
      href: "/workspaces",
    },
    { label: workspaceId },
  ]}
>
  <div class="space-y-6 p-4 md:p-6" data-agent-workspace-detail>
    {#if workspaceQuery.isPending}
      <div class="h-48 animate-pulse rounded-xl border bg-muted/40"></div>
    {:else if workspaceQuery.error}
      <p class="text-sm text-destructive">{readErrorMessage(workspaceQuery.error)}</p>
    {:else if sandbox}
      <section class="rounded-xl border bg-card p-5">
        <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="font-mono text-lg font-semibold">{sandbox.sandboxId}</h1>
              <Badge>{sandbox.status}</Badge>
            </div>
            <p class="mt-2 text-sm text-muted-foreground">
              {$t(i18nKeys.console.agentWorkspaces.persistentData)}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={lifecycleMutation.isPending || sandbox.status !== "ready"}
              onclick={() => lifecycleMutation.mutate("pause")}
            >
              <Pause class="size-4" />
              {$t(i18nKeys.console.agentWorkspaces.pause)}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={lifecycleMutation.isPending || sandbox.status !== "paused"}
              onclick={() => lifecycleMutation.mutate("resume")}
            >
              <Play class="size-4" />
              {$t(i18nKeys.console.agentWorkspaces.resume)}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={lifecycleMutation.isPending || sandbox.status === "terminated"}
              onclick={() => (deleteOpen = true)}
            >
              <Power class="size-4" />
              {$t(i18nKeys.console.agentWorkspaces.delete)}
            </Button>
          </div>
        </div>
        {#if lifecycleMutation.error}
          <p class="mt-3 text-sm text-destructive">
            {readErrorMessage(lifecycleMutation.error)}
          </p>
        {/if}
      </section>

      <section class="grid gap-4 lg:grid-cols-2">
        {#each runtimes as runtime (runtime.runtimeId)}
          <article class="rounded-xl border bg-card p-5">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="font-semibold">{runtime.harnessKey}</h2>
                <p class="font-mono text-xs text-muted-foreground">{runtime.runtimeId}</p>
              </div>
              <Badge variant="outline">{runtime.status}</Badge>
            </div>
            <div class="mt-4 flex flex-wrap gap-2">
              {#if runtime.capabilities.taskMode}
                <Badge>{$t(i18nKeys.console.agentWorkspaces.taskMode)}</Badge>
              {/if}
              {#if runtime.capabilities.nativeSession}
                <Badge variant="secondary">
                  {$t(i18nKeys.console.agentWorkspaces.nativeSession)}
                </Badge>
              {/if}
            </div>
            <p class="mt-3 break-all text-xs text-muted-foreground">
              {runtime.capabilities.persistentPaths.join(" · ")}
            </p>
          </article>
        {/each}
      </section>

      {#if nativeRuntime}
        <section class="rounded-xl border bg-card p-5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="font-semibold">
                {$t(i18nKeys.console.agentWorkspaces.attach)}
              </h2>
              <p class="mt-1 text-sm text-muted-foreground">
                {$t(i18nKeys.console.agentWorkspaces.nativeSession)}
              </p>
            </div>
            <Button
              variant="outline"
              disabled={attachMutation.isPending || !workspaceReady}
              onclick={() => attachMutation.mutate()}
            >
              <RadioTower class="size-4" />
              {$t(i18nKeys.console.agentWorkspaces.attach)}
            </Button>
          </div>
          {#if nativeAttachCommand}
            <code class="mt-3 block overflow-auto rounded-md bg-muted p-3 text-xs">
              {nativeAttachCommand}
            </code>
          {/if}
        </section>
      {/if}

      {#if workspaceReady}
        <TerminalSessionPanel
          scope={{ kind: "sandbox", sandboxId: workspaceId }}
          title={$t(i18nKeys.console.agentWorkspaces.terminalTitle)}
          description={$t(i18nKeys.console.agentWorkspaces.terminalDescription)}
          autoOpen={false}
        />
      {/if}

      <section class="rounded-xl border bg-card p-5">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <label class="grid gap-1.5 text-sm">
            <span class="font-medium">
              {$t(i18nKeys.console.agentWorkspaces.previewPort)}
            </span>
            <input
              class="h-10 w-40 rounded-md border bg-background px-3"
              type="number"
              min="1"
              max="65535"
              bind:value={previewPort}
            />
          </label>
          <Button
            variant="outline"
            disabled={exposeMutation.isPending || !workspaceReady}
            onclick={() => exposeMutation.mutate(Number(previewPort))}
          >
            <Link2 class="size-4" />
            {$t(i18nKeys.console.agentWorkspaces.developmentPreview)}
          </Button>
        </div>
        <div class="mt-4 space-y-2">
          {#each ports as exposure (exposure.exposureId)}
            <a
              class="flex items-center gap-2 truncate text-sm text-primary underline"
              href={exposure.url}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink class="size-4 shrink-0" />
              {exposure.port} · {exposure.url}
            </a>
          {/each}
        </div>
        {#if exposeMutation.error || attachMutation.error}
          <p class="mt-3 text-sm text-destructive">
            {readErrorMessage(exposeMutation.error ?? attachMutation.error)}
          </p>
        {/if}
      </section>

      {#if taskRuntime}
        <WorkspaceTaskPanel workspaceId={workspaceId} runtimeId={taskRuntime.runtimeId} />
      {:else}
        <p class="text-sm text-muted-foreground">
          {$t(i18nKeys.console.agentWorkspaces.noRuntime)}
        </p>
      {/if}
    {/if}
  </div>
</ConsoleShell>

<Dialog.Root bind:open={deleteOpen}>
  <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>
        {$t(i18nKeys.console.agentWorkspaces.deleteDialogTitle)}
      </Dialog.Title>
      <Dialog.Description>
        {$t(i18nKeys.console.agentWorkspaces.deleteDialogDescription)}
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Button type="button" variant="outline" onclick={() => (deleteOpen = false)}>
        {$t(i18nKeys.common.actions.cancel)}
      </Button>
      <Button
        type="button"
        variant="destructive"
        disabled={lifecycleMutation.isPending}
        onclick={() => lifecycleMutation.mutate("terminate")}
      >
        <Power class="size-4" />
        {$t(i18nKeys.console.agentWorkspaces.delete)}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
