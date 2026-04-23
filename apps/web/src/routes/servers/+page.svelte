<script lang="ts">
  import { browser } from "$app/environment";
  import { createMutation } from "@tanstack/svelte-query";
  import { ArrowRight, Network, Server, ShieldCheck } from "@lucide/svelte";
  import type {
    ConfigureDefaultAccessDomainPolicyInput,
    ServerSummary,
  } from "@appaloft/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import { createConsoleQueries } from "$lib/console/queries";
  import { formatTime } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  const { serversQuery, deploymentsQuery } = createConsoleQueries(browser);
  const defaultAccessModes = ["disabled", "provider", "custom-template"] as const;

  const servers = $derived(serversQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const pageLoading = $derived(serversQuery.isPending || deploymentsQuery.isPending);
  const activeServers = $derived(
    servers.filter((server) => countServerDeployments(server) > 0).length,
  );
  let systemMode = $state<ConfigureDefaultAccessDomainPolicyInput["mode"]>("provider");
  let systemProviderKey = $state("sslip");
  let systemTemplateRef = $state("");
  let systemFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);

  const configureSystemDefaultAccessMutation = createMutation(() => ({
    mutationFn: (input: ConfigureDefaultAccessDomainPolicyInput) =>
      orpcClient.defaultAccessDomainPolicies.configure(input),
    onSuccess: (result) => {
      systemFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.servers.defaultAccessSaveSuccessTitle),
        detail: result.id,
      };
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
    onError: (error) => {
      systemFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.servers.defaultAccessSaveErrorTitle),
        detail: readErrorMessage(error),
      };
    },
  }));

  function countServerDeployments(server: ServerSummary): number {
    return deployments.filter((deployment) => deployment.serverId === server.id).length;
  }

  function submitSystemPolicy(event: SubmitEvent): void {
    event.preventDefault();

    configureSystemDefaultAccessMutation.mutate({
      scope: {
        kind: "system",
      },
      mode: systemMode,
      ...(systemMode !== "disabled" && systemProviderKey.trim()
        ? { providerKey: systemProviderKey.trim() }
        : {}),
      ...(systemMode === "custom-template" && systemTemplateRef.trim()
        ? { templateRef: systemTemplateRef.trim() }
        : {}),
    });
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.servers.pageTitle)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={$t(i18nKeys.console.servers.pageTitle)}
  description={$t(i18nKeys.console.servers.description)}
>
  {#if pageLoading}
    <div class="space-y-5">
      <section class="space-y-3">
        <Skeleton class="h-5 w-36" />
        <Skeleton class="h-4 w-80" />
      </section>
      <div class="space-y-3">
        {#each Array.from({ length: 4 }) as _, index (index)}
          <Skeleton class="h-12 w-full" />
        {/each}
      </div>
    </div>
  {:else if servers.length === 0}
    <section class="space-y-5 py-2">
      <Badge class="w-fit" variant="outline">{$t(i18nKeys.common.domain.servers)}</Badge>
      <div class="max-w-2xl space-y-3">
        <h1 class="text-2xl font-semibold md:text-3xl">
          {$t(i18nKeys.console.servers.emptyTitle)}
        </h1>
        <p class="text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.servers.emptyBody)}
        </p>
      </div>
      <div class="mt-6 flex flex-wrap gap-2">
        <Button href="/servers/new">
          {$t(i18nKeys.common.actions.createServer)}
        </Button>
        <Button href="/projects" variant="outline">
          {$t(i18nKeys.common.actions.viewProjects)}
        </Button>
        <Button href="/deployments" variant="outline">
          {$t(i18nKeys.common.actions.viewDeployments)}
        </Button>
      </div>
    </section>
  {:else}
    <div class="space-y-8">
      <section class="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div class="max-w-2xl space-y-2">
          <Badge class="w-fit" variant="outline">{$t(i18nKeys.common.domain.servers)}</Badge>
          <h1 class="text-2xl font-semibold">{$t(i18nKeys.console.servers.focusTitle)}</h1>
          <p class="text-sm leading-6 text-muted-foreground">
            {$t(i18nKeys.console.servers.focusDescription)}
          </p>
        </div>
        <div class="space-y-3 md:min-w-80">
          <Button class="w-full" href="/servers/new">
            {$t(i18nKeys.common.actions.createServer)}
          </Button>
          <div class="grid grid-cols-3 divide-x border-y text-center">
            <div class="px-3 py-3">
              <p class="text-xl font-semibold">{servers.length}</p>
              <p class="mt-1 text-xs text-muted-foreground">{$t(i18nKeys.common.domain.servers)}</p>
            </div>
            <div class="px-3 py-3">
              <p class="text-xl font-semibold">{activeServers}</p>
              <p class="mt-1 text-xs text-muted-foreground">{$t(i18nKeys.common.status.connected)}</p>
            </div>
            <div class="px-3 py-3">
              <p class="text-xl font-semibold">{deployments.length}</p>
              <p class="mt-1 text-xs text-muted-foreground">
                {$t(i18nKeys.common.domain.deployments)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section class="space-y-4 border-y py-6">
        <div class="max-w-3xl space-y-1">
          <div class="flex items-center gap-2">
            <h2 class="text-lg font-semibold">
              {$t(i18nKeys.console.servers.defaultAccessSystemTitle)}
            </h2>
            <DocsHelpLink
              href={webDocsHrefs.defaultAccessPolicy}
              ariaLabel={$t(i18nKeys.common.actions.openDocs)}
            />
          </div>
          <p class="text-sm text-muted-foreground">
            {$t(i18nKeys.console.servers.defaultAccessSystemDescription)}
          </p>
        </div>

        <form
          class="grid gap-4 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]"
          onsubmit={submitSystemPolicy}
        >
          <label class="space-y-1.5 text-sm font-medium">
            <span class="inline-flex items-center gap-1.5">
              {$t(i18nKeys.console.servers.defaultAccessModeLabel)}
              <DocsHelpLink
                href={webDocsHrefs.defaultAccessPolicy}
                ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                className="size-5"
              />
            </span>
            <Select.Root bind:value={systemMode} type="single">
              <Select.Trigger class="w-full">
                {systemMode === "disabled"
                  ? $t(i18nKeys.console.servers.defaultAccessDisabledOption)
                  : systemMode === "custom-template"
                    ? $t(i18nKeys.console.servers.defaultAccessCustomTemplateOption)
                    : $t(i18nKeys.console.servers.defaultAccessProviderOption)}
              </Select.Trigger>
              <Select.Content>
                {#each defaultAccessModes as mode (mode)}
                  <Select.Item value={mode}>
                    {mode === "disabled"
                      ? $t(i18nKeys.console.servers.defaultAccessDisabledOption)
                      : mode === "custom-template"
                        ? $t(i18nKeys.console.servers.defaultAccessCustomTemplateOption)
                        : $t(i18nKeys.console.servers.defaultAccessProviderOption)}
                  </Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </label>

          <div class="grid gap-4 md:grid-cols-2">
            {#if systemMode !== "disabled"}
              <label class="space-y-1.5 text-sm font-medium">
                <span class="inline-flex items-center gap-1.5">
                  {$t(i18nKeys.console.servers.defaultAccessProviderKeyLabel)}
                  <DocsHelpLink
                    href={webDocsHrefs.defaultAccessPolicy}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                    className="size-5"
                  />
                </span>
                <Input
                  bind:value={systemProviderKey}
                  autocomplete="off"
                  placeholder={$t(i18nKeys.console.servers.defaultAccessProviderKeyPlaceholder)}
                />
              </label>
            {/if}

            {#if systemMode === "custom-template"}
              <label class="space-y-1.5 text-sm font-medium">
                <span class="inline-flex items-center gap-1.5">
                  {$t(i18nKeys.console.servers.defaultAccessTemplateRefLabel)}
                  <DocsHelpLink
                    href={webDocsHrefs.defaultAccessPolicy}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                    className="size-5"
                  />
                </span>
                <Input
                  bind:value={systemTemplateRef}
                  autocomplete="off"
                  placeholder={$t(i18nKeys.console.servers.defaultAccessTemplateRefPlaceholder)}
                />
              </label>
            {/if}
          </div>

          <div class="flex items-end">
            <Button class="w-full sm:w-auto" disabled={configureSystemDefaultAccessMutation.isPending}>
              {configureSystemDefaultAccessMutation.isPending
                ? $t(i18nKeys.common.actions.saving)
                : $t(i18nKeys.common.actions.save)}
            </Button>
          </div>
        </form>

        {#if systemFeedback}
          <div
            class={`rounded-md border p-3 text-sm ${systemFeedback.kind === "error" ? "border-destructive/30 text-destructive" : "border-border text-foreground"}`}
          >
            <p class="font-medium">{systemFeedback.title}</p>
            <p class="mt-1 text-muted-foreground">{systemFeedback.detail}</p>
          </div>
        {/if}
      </section>

      <section class="space-y-3">
        <div>
          <h2 class="text-lg font-semibold">{$t(i18nKeys.console.servers.listTitle)}</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            {$t(i18nKeys.console.servers.listDescription)}
          </p>
        </div>

        <div class="divide-y border-y">
          {#each servers as server (server.id)}
            <a
              href={`/servers/${server.id}`}
              class="group grid gap-3 py-4 transition-colors hover:bg-muted/35 sm:grid-cols-[minmax(0,1fr)_32rem_auto] sm:px-3"
            >
              <div class="min-w-0 space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <Server class="size-4 text-muted-foreground" />
                  <h3 class="truncate text-base font-semibold">{server.name}</h3>
                  <Badge variant="outline">{server.providerKey}</Badge>
                </div>
                <p class="truncate text-sm text-muted-foreground">
                  {server.host}:{server.port}
                </p>
              </div>

              <div class="grid gap-1 text-sm text-muted-foreground sm:grid-cols-3">
                <span class="inline-flex items-center gap-2">
                  <Network class="size-3.5" />
                  {server.providerKey}
                </span>
                <span class="inline-flex items-center gap-2">
                  <ShieldCheck class="size-3.5" />
                  {countServerDeployments(server)} {$t(i18nKeys.common.domain.deployments)}
                </span>
                <span class="truncate">{formatTime(server.createdAt)}</span>
              </div>

              <span
                class="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground"
              >
                {$t(i18nKeys.common.actions.viewDetails)}
                <ArrowRight class="size-4" />
              </span>
            </a>
          {/each}
        </div>
      </section>
    </div>
  {/if}
</ConsoleShell>
