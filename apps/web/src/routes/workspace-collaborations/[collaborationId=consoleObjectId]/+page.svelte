<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { ExternalLink, GitBranch, Plus, RadioTower, Users } from "@lucide/svelte";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";

  import { readErrorMessage } from "$lib/api/client";
  import {
    capabilities,
    capabilityKey,
    type CapabilityQuery,
  } from "$lib/capabilities";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import TerminalSessionPanel from "$lib/components/console/TerminalSessionPanel.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Select from "$lib/components/ui/select";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type Participant = {
    participantId: string;
    subject: { kind: "user"; subjectId: string } | { kind: "agent-runtime"; runtimeId: string };
    role: "owner" | "editor" | "reviewer" | "viewer";
  };
  type WriterLease = {
    holderParticipantId: string;
    generation: number;
    expiresAt: string;
  };
  type Lane = {
    laneId: string;
    workspaceId: string;
    purpose: "builder" | "reviewer" | "tester" | "custom";
    label: string;
    branch?: string;
    writerLease?: WriterLease;
  };
  type Handoff = {
    handoffId: string;
    sourceLaneId: string;
    targetLaneId: string;
    artifactId: string;
    expectedDigest: string;
    status: "offered" | "accepted" | "rejected";
  };
  type Collaboration = {
    collaborationId: string;
    name: string;
    status: "active" | "closed";
    revision: number;
    participants: Participant[];
    lanes: Lane[];
    handoffs: Handoff[];
  };
  type Runtime = {
    runtimeId: string;
    harnessKey: string;
    capabilities?: { nativeSession?: boolean };
  };
  type PortExposure = {
    exposureId: string;
    port: number;
    visibility: string;
    url: string;
    expiresAt: string;
  };
  type LaneSurface = {
    runtimes: Runtime[];
    ports: PortExposure[];
  };
  type TerminalAttachmentGrant = {
    access: "observe" | "write";
    transport: { kind: "websocket"; path: string };
  };

  const collaborationId = $derived(page.params.collaborationId ?? "");
  const capabilityQueries: CapabilityQuery[] = [
    { operationKey: "workspace-collaborations.participants.add" },
    { operationKey: "workspace-collaborations.lanes.add" },
    { operationKey: "workspace-collaborations.writer-leases.acquire" },
    { operationKey: "workspace-collaborations.writer-leases.release" },
    { operationKey: "workspace-collaborations.writer-leases.transfer" },
    { operationKey: "workspace-collaborations.handoffs.offer" },
    { operationKey: "workspace-collaborations.handoffs.resolve" },
    { operationKey: "workspace-collaborations.lanes.terminal-access.issue" },
    { operationKey: "workspace-collaborations.lanes.native-attach.issue" },
  ];

  let participantKind = $state<"user" | "agent-runtime">("user");
  let participantSubjectId = $state("");
  let participantWorkspaceId = $state("");
  let participantRole = $state<Participant["role"]>("reviewer");
  let laneWorkspaceId = $state("");
  let lanePurpose = $state<Lane["purpose"]>("reviewer");
  let laneLabel = $state("");
  let laneBranch = $state("");
  let terminalModes = $state<Record<string, "observe" | "write">>({});
  let transferTargets = $state<Record<string, string>>({});
  let nativeAttachCommands = $state<Record<string, string>>({});
  let handoffSourceLaneId = $state("");
  let handoffTargetLaneId = $state("");
  let handoffArtifactId = $state("");
  let handoffDigest = $state("");

  $effect(() => {
    if (browser && collaborationId) {
      void capabilities.fetch(capabilityQueries);
    }
  });

  function can(operationKey: string): boolean {
    return (
      $capabilities.capabilities[capabilityKey({ operationKey })]?.allowed === true
    );
  }

  const collaborationQuery = createQuery(() =>
    queryOptions({
      queryKey: ["workspace-collaboration", collaborationId],
      enabled: browser && Boolean(collaborationId),
      queryFn: async () => {
        const collaboration = (await orpcClient.workspaceCollaborations.show({
          collaborationId,
        })) as Collaboration;
        const laneEntries = await Promise.all(
          collaboration.lanes.map(async (lane) => {
            const [runtimes, ports] = await Promise.all([
              orpcClient.sandboxes.agents.runtimes.list({ sandboxId: lane.workspaceId }),
              orpcClient.sandboxes.ports
                .list({ sandboxId: lane.workspaceId })
                .catch(() => [] as PortExposure[]),
            ]);
            return [
              lane.laneId,
              {
                runtimes: (runtimes as { items: Runtime[] }).items,
                ports: ports as PortExposure[],
              },
            ] as const;
          }),
        );
        return {
          collaboration,
          laneSurfaces: Object.fromEntries(laneEntries) as Record<string, LaneSurface>,
        };
      },
    }),
  );

  const collaboration = $derived(collaborationQuery.data?.collaboration);
  const laneSurfaces = $derived(collaborationQuery.data?.laneSurfaces ?? {});

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({
      queryKey: ["workspace-collaboration", collaborationId],
    });
    await queryClient.invalidateQueries({ queryKey: ["workspace-collaborations"] });
  }

  const addParticipantMutation = createMutation(() => ({
    mutationFn: async () =>
      orpcClient.workspaceCollaborations.participants.add({
        collaborationId,
        subject:
          participantKind === "user"
            ? { kind: "user", subjectId: participantSubjectId }
            : {
                kind: "agent-runtime",
                runtimeId: participantSubjectId,
                workspaceId: participantWorkspaceId,
              },
        role: participantRole,
      }),
    onSuccess: async () => {
      participantSubjectId = "";
      participantWorkspaceId = "";
      await refresh();
    },
  }));

  const addLaneMutation = createMutation(() => ({
    mutationFn: async () =>
      orpcClient.workspaceCollaborations.lanes.add({
        collaborationId,
        workspaceId: laneWorkspaceId,
        purpose: lanePurpose,
        label: laneLabel,
        ...(laneBranch.trim() ? { branch: laneBranch.trim() } : {}),
      }),
    onSuccess: async () => {
      laneWorkspaceId = "";
      laneLabel = "";
      laneBranch = "";
      await refresh();
    },
  }));

  const writerMutation = createMutation(() => ({
    mutationFn: async (input: {
      action: "acquire" | "release" | "transfer";
      lane: Lane;
    }) => {
      const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
      if (input.action === "acquire") {
        return orpcClient.workspaceCollaborations.writerLeases.acquire({
          collaborationId,
          laneId: input.lane.laneId,
          expiresAt,
        });
      }
      if (!input.lane.writerLease) {
        throw new Error("workspace_collaboration_writer_lease_missing");
      }
      if (input.action === "release") {
        return orpcClient.workspaceCollaborations.writerLeases.release({
          collaborationId,
          laneId: input.lane.laneId,
          expectedGeneration: input.lane.writerLease.generation,
        });
      }
      return orpcClient.workspaceCollaborations.writerLeases.transfer({
        collaborationId,
        laneId: input.lane.laneId,
        expectedGeneration: input.lane.writerLease.generation,
        toParticipantId: transferTargets[input.lane.laneId] ?? "",
        expiresAt,
      });
    },
    onSuccess: refresh,
  }));

  const nativeAttachMutation = createMutation(() => ({
    mutationFn: async (input: { lane: Lane; runtimeId: string }) => {
      if (!input.lane.writerLease) {
        throw new Error("workspace_collaboration_writer_lease_missing");
      }
      return (await orpcClient.workspaceCollaborations.lanes.nativeAttach.issue({
        collaborationId,
        laneId: input.lane.laneId,
        runtimeId: input.runtimeId,
        expectedGeneration: input.lane.writerLease.generation,
        expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      })) as { clientCommand: string[] };
    },
    onSuccess: (result, input) => {
      nativeAttachCommands[input.lane.laneId] = result.clientCommand.join(" ");
    },
  }));

  const offerHandoffMutation = createMutation(() => ({
    mutationFn: async () =>
      orpcClient.workspaceCollaborations.handoffs.offer({
        collaborationId,
        sourceLaneId: handoffSourceLaneId,
        targetLaneId: handoffTargetLaneId,
        artifactId: handoffArtifactId,
        expectedDigest: handoffDigest,
      }),
    onSuccess: async () => {
      handoffArtifactId = "";
      handoffDigest = "";
      await refresh();
    },
  }));

  const resolveHandoffMutation = createMutation(() => ({
    mutationFn: async (input: { handoffId: string; decision: "accept" | "reject" }) =>
      orpcClient.workspaceCollaborations.handoffs.resolve({
        collaborationId,
        ...input,
      }),
    onSuccess: refresh,
  }));

  async function issueTerminalAccess(
    lane: Lane,
    sessionId: string,
  ): Promise<TerminalAttachmentGrant> {
    const access = terminalModes[lane.laneId] ?? "observe";
    return (await orpcClient.workspaceCollaborations.lanes.terminalAccess.issue({
      collaborationId,
      laneId: lane.laneId,
      sessionId,
      access,
      ...(access === "write" && lane.writerLease
        ? { expectedGeneration: lane.writerLease.generation }
        : {}),
    })) as TerminalAttachmentGrant;
  }
</script>

<svelte:head>
  <title>
    {collaboration?.name ?? collaborationId} ·
    {$t(i18nKeys.console.workspaceCollaborations.pageTitle)} · Appaloft
  </title>
</svelte:head>

<ConsoleShell
  title={collaboration?.name ?? $t(i18nKeys.console.workspaceCollaborations.pageTitle)}
  description={$t(i18nKeys.console.workspaceCollaborations.pageDescription)}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.home), href: "/" },
    { label: $t(i18nKeys.console.agentWorkspaces.pageTitle), href: "/workspaces" },
    { label: collaboration?.name ?? collaborationId },
  ]}
>
  <div class="space-y-6 p-4 md:p-6" data-workspace-collaboration>
    {#if collaborationQuery.isPending}
      <div class="h-40 animate-pulse rounded-xl border bg-muted/40"></div>
    {:else if collaborationQuery.error}
      <p class="text-sm text-destructive">{readErrorMessage(collaborationQuery.error)}</p>
    {:else if collaboration}
      <header class="rounded-xl border bg-card p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 class="text-2xl font-semibold">{collaboration.name}</h1>
            <p class="mt-1 font-mono text-xs text-muted-foreground">{collaborationId}</p>
          </div>
          <div class="flex gap-2">
            <Badge variant="outline">{collaboration.status}</Badge>
            <Badge variant="secondary">r{collaboration.revision}</Badge>
          </div>
        </div>
      </header>

      <section class="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div class="rounded-xl border bg-card p-5">
          <div class="flex items-center gap-2">
            <Users class="size-5 text-muted-foreground" />
            <h2 class="text-lg font-semibold">
              {$t(i18nKeys.console.workspaceCollaborations.participants)}
            </h2>
          </div>
          <div class="mt-4 grid gap-2 sm:grid-cols-2">
            {#each collaboration.participants as participant (participant.participantId)}
              <div class="rounded-lg border p-3">
                <div class="flex items-center justify-between gap-2">
                  <span class="font-mono text-xs">{participant.participantId}</span>
                  <Badge>{participant.role}</Badge>
                </div>
                <p class="mt-2 truncate text-sm text-muted-foreground">
                  {participant.subject.kind === "user"
                    ? participant.subject.subjectId
                    : participant.subject.runtimeId}
                </p>
              </div>
            {/each}
          </div>
        </div>

        <div class="rounded-xl border bg-card p-5">
          <h2 class="font-semibold">
            {$t(i18nKeys.console.workspaceCollaborations.addParticipant)}
          </h2>
          <div class="mt-4 space-y-3">
            <Select.Root bind:value={participantKind} type="single">
              <Select.Trigger class="w-full">{participantKind}</Select.Trigger>
              <Select.Content>
                <Select.Item value="user">user</Select.Item>
                <Select.Item value="agent-runtime">agent-runtime</Select.Item>
              </Select.Content>
            </Select.Root>
            <input
              class="h-10 w-full rounded-md border bg-background px-3 text-sm"
              required
              bind:value={participantSubjectId}
              placeholder={$t(i18nKeys.console.workspaceCollaborations.subjectId)}
            />
            {#if participantKind === "agent-runtime"}
              <input
                class="h-10 w-full rounded-md border bg-background px-3 text-sm"
                required
                bind:value={participantWorkspaceId}
                placeholder={$t(i18nKeys.console.workspaceCollaborations.workspaceId)}
              />
            {/if}
            <Select.Root bind:value={participantRole} type="single">
              <Select.Trigger class="w-full">{participantRole}</Select.Trigger>
              <Select.Content>
                {#each ["owner", "editor", "reviewer", "viewer"] as role (role)}
                  <Select.Item value={role}>{role}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
            <Button
              class="w-full"
              type="button"
              disabled={!can("workspace-collaborations.participants.add") ||
                addParticipantMutation.isPending}
              onclick={() => addParticipantMutation.mutate()}
            >
              <Plus class="size-4" />
              {$t(i18nKeys.console.workspaceCollaborations.addParticipant)}
            </Button>
          </div>
        </div>
      </section>

      <section class="space-y-4">
        <div>
          <h2 class="text-xl font-semibold">
            {$t(i18nKeys.console.workspaceCollaborations.lanes)}
          </h2>
        </div>
        <div class="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-5">
          <input
            class="h-10 rounded-md border bg-background px-3 text-sm"
            required
            bind:value={laneWorkspaceId}
            placeholder={$t(i18nKeys.console.workspaceCollaborations.workspaceId)}
          />
          <input
            class="h-10 rounded-md border bg-background px-3 text-sm"
            required
            bind:value={laneLabel}
            placeholder={$t(i18nKeys.console.workspaceCollaborations.laneLabel)}
          />
          <Select.Root bind:value={lanePurpose} type="single">
            <Select.Trigger class="w-full">{lanePurpose}</Select.Trigger>
            <Select.Content>
              {#each ["builder", "reviewer", "tester", "custom"] as purpose (purpose)}
                <Select.Item value={purpose}>{purpose}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          <input
            class="h-10 rounded-md border bg-background px-3 text-sm"
            bind:value={laneBranch}
            placeholder={$t(i18nKeys.console.workspaceCollaborations.branch)}
          />
          <Button
            type="button"
            disabled={!can("workspace-collaborations.lanes.add") || addLaneMutation.isPending}
            onclick={() => addLaneMutation.mutate()}
          >
            <Plus class="size-4" />
            {$t(i18nKeys.console.workspaceCollaborations.addLane)}
          </Button>
        </div>

        {#each collaboration.lanes as lane (lane.laneId)}
          {@const surface = laneSurfaces[lane.laneId]}
          {@const nativeRuntime = surface?.runtimes.find((runtime) => runtime.capabilities?.nativeSession)}
          <article class="space-y-4 rounded-xl border bg-card p-5" data-collaboration-lane={lane.laneId}>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="flex items-center gap-2">
                  <GitBranch class="size-4 text-muted-foreground" />
                  <h3 class="font-semibold">{lane.label}</h3>
                  <Badge variant="outline">{lane.purpose}</Badge>
                </div>
                <p class="mt-2 font-mono text-xs text-muted-foreground">
                  {lane.workspaceId}{lane.branch ? ` · ${lane.branch}` : ""}
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                {#if lane.writerLease}
                  <Badge>
                    {$t(i18nKeys.console.workspaceCollaborations.writerLease)}:
                    {lane.writerLease.holderParticipantId} · g{lane.writerLease.generation}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!can("workspace-collaborations.writer-leases.release") ||
                      writerMutation.isPending}
                    onclick={() => writerMutation.mutate({ action: "release", lane })}
                  >
                    {$t(i18nKeys.console.workspaceCollaborations.releaseWriter)}
                  </Button>
                {:else}
                  <Button
                    size="sm"
                    disabled={!can("workspace-collaborations.writer-leases.acquire") ||
                      writerMutation.isPending}
                    onclick={() => writerMutation.mutate({ action: "acquire", lane })}
                  >
                    {$t(i18nKeys.console.workspaceCollaborations.acquireWriter)}
                  </Button>
                {/if}
              </div>
            </div>

            {#if lane.writerLease}
              <div class="flex flex-col gap-2 sm:flex-row">
                <Select.Root bind:value={transferTargets[lane.laneId]} type="single">
                  <Select.Trigger class="sm:w-72">
                    {transferTargets[lane.laneId] ??
                      $t(i18nKeys.console.workspaceCollaborations.transferTo)}
                  </Select.Trigger>
                  <Select.Content>
                    {#each collaboration.participants as participant (participant.participantId)}
                      <Select.Item value={participant.participantId}>
                        {participant.participantId} · {participant.role}
                      </Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
                <Button
                  variant="outline"
                  disabled={!transferTargets[lane.laneId] ||
                    !can("workspace-collaborations.writer-leases.transfer") ||
                    writerMutation.isPending}
                  onclick={() => writerMutation.mutate({ action: "transfer", lane })}
                >
                  {$t(i18nKeys.console.workspaceCollaborations.transferWriter)}
                </Button>
              </div>
            {/if}

            <div class="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
              <div class="space-y-3">
                <div class="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={(terminalModes[lane.laneId] ?? "observe") === "observe"
                      ? "default"
                      : "outline"}
                    onclick={() => (terminalModes[lane.laneId] = "observe")}
                  >
                    {$t(i18nKeys.console.workspaceCollaborations.observerTerminal)}
                  </Button>
                  <Button
                    size="sm"
                    variant={terminalModes[lane.laneId] === "write" ? "default" : "outline"}
                    disabled={!lane.writerLease}
                    onclick={() => (terminalModes[lane.laneId] = "write")}
                  >
                    {$t(i18nKeys.console.workspaceCollaborations.interactiveTerminal)}
                  </Button>
                </div>
                <TerminalSessionPanel
                  scope={{ kind: "sandbox", sandboxId: lane.workspaceId }}
                  autoOpen={false}
                  disabled={!can("workspace-collaborations.lanes.terminal-access.issue")}
                  issueAttachmentAccess={(sessionId) => issueTerminalAccess(lane, sessionId)}
                  title={(terminalModes[lane.laneId] ?? "observe") === "observe"
                    ? $t(i18nKeys.console.workspaceCollaborations.observerTerminal)
                    : $t(i18nKeys.console.workspaceCollaborations.interactiveTerminal)}
                />
              </div>

              <aside class="space-y-4">
                <div class="rounded-lg border p-4">
                  <div class="flex items-center gap-2">
                    <RadioTower class="size-4 text-muted-foreground" />
                    <h4 class="font-semibold">
                      {$t(i18nKeys.console.workspaceCollaborations.preview)}
                    </h4>
                  </div>
                  {#if (surface?.ports.length ?? 0) === 0}
                    <p class="mt-2 text-sm text-muted-foreground">
                      {$t(i18nKeys.console.workspaceCollaborations.noPreview)}
                    </p>
                  {:else}
                    <div class="mt-3 space-y-2">
                      {#each surface?.ports ?? [] as port (port.exposureId)}
                        <a
                          class="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted"
                          href={port.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <span>:{port.port} · {port.visibility}</span>
                          <ExternalLink class="size-4" />
                        </a>
                      {/each}
                    </div>
                  {/if}
                </div>

                {#if nativeRuntime}
                  <Button
                    class="w-full"
                    variant="outline"
                    disabled={!lane.writerLease ||
                      !can("workspace-collaborations.lanes.native-attach.issue") ||
                      nativeAttachMutation.isPending}
                    onclick={() =>
                      nativeAttachMutation.mutate({
                        lane,
                        runtimeId: nativeRuntime.runtimeId,
                      })}
                  >
                    {$t(i18nKeys.console.workspaceCollaborations.nativeAttach)}
                  </Button>
                {/if}
                {#if nativeAttachCommands[lane.laneId]}
                  <div class="rounded-lg border bg-muted/30 p-3">
                    <p class="text-xs font-medium text-muted-foreground">
                      {$t(i18nKeys.console.workspaceCollaborations.nativeAttachCommand)}
                    </p>
                    <code class="mt-2 block break-all text-xs">
                      {nativeAttachCommands[lane.laneId]}
                    </code>
                  </div>
                {/if}
              </aside>
            </div>
          </article>
        {/each}
      </section>

      <section class="space-y-4 rounded-xl border bg-card p-5">
        <h2 class="text-xl font-semibold">
          {$t(i18nKeys.console.workspaceCollaborations.handoffs)}
        </h2>
        {#if collaboration.lanes.length > 1}
          <div class="grid gap-3 md:grid-cols-5">
            <Select.Root bind:value={handoffSourceLaneId} type="single">
              <Select.Trigger class="w-full">
                {handoffSourceLaneId ||
                  $t(i18nKeys.console.workspaceCollaborations.sourceLane)}
              </Select.Trigger>
              <Select.Content>
                {#each collaboration.lanes as lane (lane.laneId)}
                  <Select.Item value={lane.laneId}>{lane.label}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
            <Select.Root bind:value={handoffTargetLaneId} type="single">
              <Select.Trigger class="w-full">
                {handoffTargetLaneId ||
                  $t(i18nKeys.console.workspaceCollaborations.targetLane)}
              </Select.Trigger>
              <Select.Content>
                {#each collaboration.lanes as lane (lane.laneId)}
                  <Select.Item value={lane.laneId}>{lane.label}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
            <input
              class="h-10 rounded-md border bg-background px-3 text-sm"
              required
              bind:value={handoffArtifactId}
              placeholder={$t(i18nKeys.console.workspaceCollaborations.artifactId)}
            />
            <input
              class="h-10 rounded-md border bg-background px-3 text-sm"
              required
              bind:value={handoffDigest}
              placeholder={$t(i18nKeys.console.workspaceCollaborations.digest)}
            />
            <Button
              type="button"
              disabled={!can("workspace-collaborations.handoffs.offer") ||
                offerHandoffMutation.isPending}
              onclick={() => offerHandoffMutation.mutate()}
            >
              {$t(i18nKeys.console.workspaceCollaborations.offerHandoff)}
            </Button>
          </div>
        {/if}

        {#if collaboration.handoffs.length === 0}
          <p class="text-sm text-muted-foreground">
            {$t(i18nKeys.console.workspaceCollaborations.noHandoffs)}
          </p>
        {:else}
          <div class="space-y-2">
            {#each collaboration.handoffs as handoff (handoff.handoffId)}
              <div class="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div class="flex flex-wrap items-center gap-2">
                    <code class="text-xs">{handoff.artifactId}</code>
                    <Badge variant="outline">{handoff.status}</Badge>
                  </div>
                  <p class="mt-2 text-xs text-muted-foreground">
                    {handoff.sourceLaneId} → {handoff.targetLaneId}
                  </p>
                </div>
                {#if handoff.status === "offered"}
                  <div class="flex gap-2">
                    <Button
                      size="sm"
                      disabled={!can("workspace-collaborations.handoffs.resolve")}
                      onclick={() =>
                        resolveHandoffMutation.mutate({
                          handoffId: handoff.handoffId,
                          decision: "accept",
                        })}
                    >
                      {$t(i18nKeys.console.workspaceCollaborations.accept)}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!can("workspace-collaborations.handoffs.resolve")}
                      onclick={() =>
                        resolveHandoffMutation.mutate({
                          handoffId: handoff.handoffId,
                          decision: "reject",
                        })}
                    >
                      {$t(i18nKeys.console.workspaceCollaborations.reject)}
                    </Button>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </section>

      {#if addParticipantMutation.error ||
        addLaneMutation.error ||
        writerMutation.error ||
        nativeAttachMutation.error ||
        offerHandoffMutation.error ||
        resolveHandoffMutation.error}
        <p class="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {readErrorMessage(
            addParticipantMutation.error ??
              addLaneMutation.error ??
              writerMutation.error ??
              nativeAttachMutation.error ??
              offerHandoffMutation.error ??
              resolveHandoffMutation.error,
          )}
        </p>
      {/if}
    {/if}
  </div>
</ConsoleShell>
