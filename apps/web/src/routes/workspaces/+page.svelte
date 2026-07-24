<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { Bot, Plus, TerminalSquare } from "@lucide/svelte";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";

  import { readErrorMessage } from "$lib/api/client";
  import { capabilities, capabilityKey } from "$lib/capabilities";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Select from "$lib/components/ui/select";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type HarnessDescriptor = {
    key: string;
    harnessTemplateId: string;
    sandboxTemplateId?: string;
    version: string;
    capabilities: {
      taskMode: boolean;
      interactive: boolean;
      nativeSession: boolean;
      persistentPaths: readonly string[];
    };
  };
  type SandboxTemplateDescriptor = {
    templateId: string;
    minimumIsolation: "container-trusted" | "gvisor" | "kata" | "microvm";
  };
  type SandboxDescriptor = {
    sandboxId: string;
    status: string;
    createdAt?: string;
    expiresAt?: string;
  };
  type RuntimeDescriptor = {
    runtimeId: string;
    harnessKey: string;
    status: string;
  };
  type WorkspaceDescriptor = {
    sandbox: SandboxDescriptor;
    runtimes: RuntimeDescriptor[];
  };
  type WorkspaceCollaborationDescriptor = {
    collaborationId: string;
    name: string;
    status: string;
    participants: readonly unknown[];
    lanes: readonly unknown[];
  };

  let createOpen = $state(false);
  let collaborationCreateOpen = $state(false);
  let selectedHarnessKey = $state("opencode");
  let repository = $state("");
  let repositoryRef = $state("");
  let branch = $state("");
  let collaborationName = $state("");
  let collaborationWorkspaceId = $state("");
  const collaborationCreateCapability = {
    operationKey: "workspace-collaborations.create",
  } as const;

  $effect(() => {
    if (browser) {
      void capabilities.fetch([collaborationCreateCapability]);
    }
  });

  const catalogQuery = createQuery(() =>
    queryOptions({
      queryKey: ["agent-workspace-catalog"],
      enabled: browser,
      queryFn: async () => {
        const [harnesses, templates] = await Promise.all([
          orpcClient.sandboxes.agents.harnesses.list({}),
          orpcClient.sandboxTemplates.list({ limit: 100, offset: 0 }),
        ]);
        return {
          harnesses: harnesses as unknown as readonly HarnessDescriptor[],
          templates: (templates as unknown as { items: readonly SandboxTemplateDescriptor[] })
            .items,
        };
      },
    }),
  );

  const workspacesQuery = createQuery(() =>
    queryOptions({
      queryKey: ["agent-workspaces"],
      enabled: browser,
      queryFn: async () => {
        const sandboxes = (await orpcClient.sandboxes.list({
          limit: 100,
          offset: 0,
        })) as unknown as { items: readonly SandboxDescriptor[] };
        const workspaces = await Promise.all(
          sandboxes.items.map(async (sandbox) => ({
            sandbox,
            runtimes: (
              (await orpcClient.sandboxes.agents.runtimes.list({
                sandboxId: sandbox.sandboxId,
              })) as { items: RuntimeDescriptor[] }
            ).items,
          })),
        );
        return workspaces.filter((workspace) => workspace.runtimes.length > 0);
      },
    }),
  );

  const collaborationsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["workspace-collaborations"],
      enabled: browser,
      queryFn: async () =>
        (
          (await orpcClient.workspaceCollaborations.list({})) as {
            items: WorkspaceCollaborationDescriptor[];
          }
        ).items,
    }),
  );

  const selectedHarness = $derived(
    catalogQuery.data?.harnesses.find((harness) => harness.key === selectedHarnessKey),
  );

  function validateGitRef(value: string): string {
    const normalized = value.trim();
    if (
      normalized.startsWith("-") ||
      normalized.includes("..") ||
      normalized.includes("@{") ||
      /[\s~^:?*[\\\x00-\x1f\x7f]/u.test(normalized)
    ) {
      throw new Error("agent_workspace_git_ref_invalid");
    }
    return normalized;
  }

  function repositoryNetworkPolicy(value: string) {
    const normalized = value.trim();
    let url: URL;
    try {
      url = new URL(normalized);
    } catch {
      throw new Error("agent_workspace_repository_invalid");
    }
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname === "/" ||
      url.search ||
      url.hash
    ) {
      throw new Error("agent_workspace_repository_invalid");
    }
    const host = url.hostname.toLowerCase();
    return {
      mode: "allowlist" as const,
      rules: [
        { kind: "domain" as const, value: host, ports: [443] },
        ...(host === "github.com"
          ? [{ kind: "domain" as const, value: "api.github.com", ports: [443] }]
          : []),
      ],
    };
  }

  function assertSuccessfulExec(result: unknown): void {
    const frames =
      result && typeof result === "object" && "mode" in result && result.mode === "foreground"
        ? (result as unknown as { frames: { kind: string; exitCode?: number }[] }).frames
        : [];
    const exit = frames.findLast((frame) => frame.kind === "exit");
    if (!exit || exit.exitCode !== 0) {
      throw new Error("agent_workspace_source_materialization_failed");
    }
  }

  const createWorkspaceMutation = createMutation(() => ({
    mutationFn: async () => {
      const harness = selectedHarness;
      if (!harness?.sandboxTemplateId) {
        throw new Error("agent_workspace_harness_template_unavailable");
      }
      const template = catalogQuery.data?.templates.find(
        (candidate) => candidate.templateId === harness.sandboxTemplateId,
      );
      const normalizedRepository = repository.trim();
      const normalizedRef = repositoryRef.trim() ? validateGitRef(repositoryRef) : "";
      const normalizedBranch = branch.trim() ? validateGitRef(branch) : "";
      const sandbox = (await orpcClient.sandboxes.create({
        source: { kind: "template", templateId: harness.sandboxTemplateId },
        requestedIsolation: template?.minimumIsolation ?? "container-trusted",
        limits: {
          cpuMillis: 2_000,
          memoryBytes: 4 * 1024 * 1024 * 1024,
          diskBytes: 20 * 1024 * 1024 * 1024,
          maxProcesses: 256,
        },
        networkPolicy: normalizedRepository
          ? repositoryNetworkPolicy(normalizedRepository)
          : { mode: "deny", rules: [] },
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
      })) as SandboxDescriptor;

      if (normalizedRepository) {
        const cloned = await orpcClient.sandboxes.exec({
          sandboxId: sandbox.sandboxId,
          argv: [
            "git",
            "clone",
            ...(normalizedRef ? ["--branch", normalizedRef] : []),
            "--",
            normalizedRepository,
            ".",
          ],
        });
        assertSuccessfulExec(cloned);
        if (normalizedBranch) {
          assertSuccessfulExec(
            await orpcClient.sandboxes.exec({
              sandboxId: sandbox.sandboxId,
              argv: ["git", "switch", "-c", normalizedBranch],
            }),
          );
        }
      }

      await orpcClient.sandboxes.agents.runtimes.create({
        sandboxId: sandbox.sandboxId,
        harnessKey: harness.key,
        harnessTemplateId: harness.harnessTemplateId,
        idempotencyKey: crypto.randomUUID(),
      });
      return sandbox.sandboxId;
    },
    onSuccess: async (workspaceId) => {
      createOpen = false;
      await queryClient.invalidateQueries({ queryKey: ["agent-workspaces"] });
      await goto(`/workspaces/${encodeURIComponent(workspaceId)}`);
    },
  }));

  const createCollaborationMutation = createMutation(() => ({
    mutationFn: async () =>
      (await orpcClient.workspaceCollaborations.create({
        name: collaborationName,
        workspaceId: collaborationWorkspaceId,
        lanePurpose: "builder",
        laneLabel: "Builder",
      })) as WorkspaceCollaborationDescriptor,
    onSuccess: async (collaboration) => {
      collaborationCreateOpen = false;
      collaborationName = "";
      await queryClient.invalidateQueries({ queryKey: ["workspace-collaborations"] });
      await goto(
        `/workspace-collaborations/${encodeURIComponent(collaboration.collaborationId)}`,
      );
    },
  }));

  const workspaces = $derived(workspacesQuery.data ?? []);
  const collaborations = $derived(collaborationsQuery.data ?? []);
  const canCreateCollaboration = $derived(
    $capabilities.capabilities[capabilityKey(collaborationCreateCapability)]?.allowed === true,
  );
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.agentWorkspaces.pageTitle)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={$t(i18nKeys.console.agentWorkspaces.pageTitle)}
  description={$t(i18nKeys.console.agentWorkspaces.pageDescription)}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.home), href: "/" },
    { label: $t(i18nKeys.console.agentWorkspaces.pageTitle) },
  ]}
>
  <div class="space-y-6 p-4 md:p-6" data-agent-workspaces>
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="space-y-1">
        <h1 class="text-2xl font-semibold">{$t(i18nKeys.console.agentWorkspaces.pageTitle)}</h1>
        <p class="text-sm text-muted-foreground">
          {$t(i18nKeys.console.agentWorkspaces.persistentData)}
        </p>
      </div>
      <Button onclick={() => (createOpen = true)}>
        <Plus class="size-4" />
        {$t(i18nKeys.console.agentWorkspaces.create)}
      </Button>
    </div>

    {#if workspacesQuery.isPending}
      <div class="grid gap-3 md:grid-cols-2">
        {#each [1, 2] as item (item)}
          <div class="h-36 animate-pulse rounded-xl border bg-muted/40"></div>
        {/each}
      </div>
    {:else if workspacesQuery.error}
      <p class="text-sm text-destructive">{readErrorMessage(workspacesQuery.error)}</p>
    {:else if workspaces.length === 0}
      <section class="rounded-xl border border-dashed p-8 text-center">
        <Bot class="mx-auto size-8 text-muted-foreground" />
        <h2 class="mt-4 text-lg font-semibold">
          {$t(i18nKeys.console.agentWorkspaces.emptyTitle)}
        </h2>
        <p class="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          {$t(i18nKeys.console.agentWorkspaces.emptyBody)}
        </p>
      </section>
    {:else}
      <div class="grid gap-3 md:grid-cols-2">
        {#each workspaces as workspace (workspace.sandbox.sandboxId)}
          <article class="rounded-xl border bg-card p-5 shadow-sm">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate font-mono text-sm font-medium">
                  {workspace.sandbox.sandboxId}
                </p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline">{workspace.sandbox.status}</Badge>
                  {#each workspace.runtimes as runtime (runtime.runtimeId)}
                    <Badge>{runtime.harnessKey}</Badge>
                  {/each}
                </div>
              </div>
              <TerminalSquare class="size-5 text-muted-foreground" />
            </div>
            <Button
              class="mt-5 w-full"
              variant="outline"
              href={`/workspaces/${encodeURIComponent(workspace.sandbox.sandboxId)}`}
            >
              {$t(i18nKeys.console.agentWorkspaces.open)}
            </Button>
          </article>
        {/each}
      </div>
    {/if}

    <section class="space-y-4 border-t pt-6" data-workspace-collaborations>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="text-xl font-semibold">
            {$t(i18nKeys.console.workspaceCollaborations.pageTitle)}
          </h2>
          <p class="mt-1 max-w-3xl text-sm text-muted-foreground">
            {$t(i18nKeys.console.workspaceCollaborations.pageDescription)}
          </p>
        </div>
        <Button
          variant="outline"
          disabled={workspaces.length === 0 || !canCreateCollaboration}
          onclick={() => {
            collaborationWorkspaceId ||= workspaces[0]?.sandbox.sandboxId ?? "";
            collaborationCreateOpen = true;
          }}
        >
          <Plus class="size-4" />
          {$t(i18nKeys.console.workspaceCollaborations.create)}
        </Button>
      </div>

      {#if collaborationsQuery.isPending}
        <div class="h-28 animate-pulse rounded-xl border bg-muted/40"></div>
      {:else if collaborationsQuery.error}
        <p class="text-sm text-destructive">{readErrorMessage(collaborationsQuery.error)}</p>
      {:else if collaborations.length === 0}
        <div class="rounded-xl border border-dashed p-6">
          <h3 class="font-semibold">
            {$t(i18nKeys.console.workspaceCollaborations.emptyTitle)}
          </h3>
          <p class="mt-1 text-sm text-muted-foreground">
            {$t(i18nKeys.console.workspaceCollaborations.emptyBody)}
          </p>
        </div>
      {:else}
        <div class="grid gap-3 md:grid-cols-2">
          {#each collaborations as collaboration (collaboration.collaborationId)}
            <article class="rounded-xl border bg-card p-5">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h3 class="font-semibold">{collaboration.name}</h3>
                  <p class="mt-1 font-mono text-xs text-muted-foreground">
                    {collaboration.collaborationId}
                  </p>
                </div>
                <Badge variant="outline">{collaboration.status}</Badge>
              </div>
              <div class="mt-3 flex gap-2 text-xs text-muted-foreground">
                <span>
                  {$t(i18nKeys.console.workspaceCollaborations.lanes)}:
                  {collaboration.lanes.length}
                </span>
                <span>
                  {$t(i18nKeys.console.workspaceCollaborations.participants)}:
                  {collaboration.participants.length}
                </span>
              </div>
              <Button
                class="mt-4 w-full"
                variant="outline"
                href={`/workspace-collaborations/${encodeURIComponent(collaboration.collaborationId)}`}
              >
                {$t(i18nKeys.console.workspaceCollaborations.open)}
              </Button>
            </article>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</ConsoleShell>

<Dialog.Root bind:open={createOpen}>
  <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="sm:max-w-xl">
    <Dialog.Header>
      <Dialog.Title>{$t(i18nKeys.console.agentWorkspaces.createTitle)}</Dialog.Title>
      <Dialog.Description>
        {$t(i18nKeys.console.agentWorkspaces.createDescription)}
      </Dialog.Description>
    </Dialog.Header>
    <form
      class="space-y-4"
      onsubmit={(event) => {
        event.preventDefault();
        createWorkspaceMutation.mutate();
      }}
    >
      <label class="grid gap-1.5 text-sm">
        <span class="font-medium">{$t(i18nKeys.console.agentWorkspaces.harness)}</span>
        <Select.Root bind:value={selectedHarnessKey} type="single">
          <Select.Trigger class="w-full">
            {selectedHarness?.key ?? selectedHarnessKey}
          </Select.Trigger>
          <Select.Content>
            {#each catalogQuery.data?.harnesses ?? [] as harness (harness.key)}
              <Select.Item value={harness.key}>{harness.key}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </label>
      <label class="grid gap-1.5 text-sm">
        <span class="font-medium">{$t(i18nKeys.console.agentWorkspaces.repository)}</span>
        <input
          class="h-10 rounded-md border bg-background px-3"
          bind:value={repository}
          placeholder={$t(i18nKeys.console.agentWorkspaces.repositoryPlaceholder)}
        />
      </label>
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="grid gap-1.5 text-sm">
          <span class="font-medium">{$t(i18nKeys.console.agentWorkspaces.ref)}</span>
          <input class="h-10 rounded-md border bg-background px-3" bind:value={repositoryRef} />
        </label>
        <label class="grid gap-1.5 text-sm">
          <span class="font-medium">{$t(i18nKeys.console.agentWorkspaces.branch)}</span>
          <input
            class="h-10 rounded-md border bg-background px-3"
            bind:value={branch}
            placeholder={$t(i18nKeys.console.agentWorkspaces.branchPlaceholder)}
          />
        </label>
      </div>
      {#if createWorkspaceMutation.error}
        <p class="text-sm text-destructive">
          {readErrorMessage(createWorkspaceMutation.error)}
        </p>
      {/if}
      <Dialog.Footer>
        <Button type="submit" disabled={!selectedHarness || createWorkspaceMutation.isPending}>
          {createWorkspaceMutation.isPending
            ? $t(i18nKeys.console.agentWorkspaces.creating)
            : $t(i18nKeys.console.agentWorkspaces.create)}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={collaborationCreateOpen}>
  <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{$t(i18nKeys.console.workspaceCollaborations.createTitle)}</Dialog.Title>
      <Dialog.Description>
        {$t(i18nKeys.console.workspaceCollaborations.pageDescription)}
      </Dialog.Description>
    </Dialog.Header>
    <form
      class="space-y-4"
      onsubmit={(event) => {
        event.preventDefault();
        createCollaborationMutation.mutate();
      }}
    >
      <label class="grid gap-1.5 text-sm">
        <span class="font-medium">{$t(i18nKeys.console.workspaceCollaborations.name)}</span>
        <input
          class="h-10 rounded-md border bg-background px-3"
          required
          bind:value={collaborationName}
        />
      </label>
      <label class="grid gap-1.5 text-sm">
        <span class="font-medium">
          {$t(i18nKeys.console.workspaceCollaborations.initialWorkspace)}
        </span>
        <Select.Root bind:value={collaborationWorkspaceId} type="single">
          <Select.Trigger class="w-full">{collaborationWorkspaceId}</Select.Trigger>
          <Select.Content>
            {#each workspaces as workspace (workspace.sandbox.sandboxId)}
              <Select.Item value={workspace.sandbox.sandboxId}>
                {workspace.sandbox.sandboxId}
              </Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </label>
      {#if createCollaborationMutation.error}
        <p class="text-sm text-destructive">
          {readErrorMessage(createCollaborationMutation.error)}
        </p>
      {/if}
      <Dialog.Footer>
        <Button
          type="submit"
          disabled={!collaborationName.trim() ||
            !collaborationWorkspaceId ||
            !canCreateCollaboration ||
            createCollaborationMutation.isPending}
        >
          {$t(i18nKeys.console.workspaceCollaborations.create)}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
