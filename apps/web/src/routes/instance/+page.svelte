<script lang="ts">
  import { browser } from "$app/environment";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";
  import type {
    InstanceUpgradeApplyResponse,
    InstanceUpgradeCheckResponse,
    InstanceUpgradeCheckStatus,
  } from "@appaloft/contracts";
  import { ClipboardList, Download, GitBranch, Globe2, Network, RefreshCw } from "@lucide/svelte";

  import { readErrorMessage, request } from "$lib/api/client";
  import ManagementShell from "$lib/components/console/ManagementShell.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { i18nKeys, t } from "$lib/i18n";
  import { queryClient } from "$lib/query-client";

  type UpgradeFeedback = {
    kind: "success" | "error";
    title: string;
    detail: string;
  };

  const currentOrigin = $derived(browser ? window.location.origin : "http://SERVER_IP:3721");
  let upgradeFeedback = $state<UpgradeFeedback | null>(null);
  const instanceUpgradeQuery = createQuery(() =>
    queryOptions({
      queryKey: ["instance-upgrade", "check"],
      queryFn: () => request<InstanceUpgradeCheckResponse>("/api/instance-upgrade/check"),
      enabled: browser,
      staleTime: 60_000,
      retry: 0,
    }),
  );
  const applyUpgradeMutation = createMutation(() => ({
    mutationFn: () =>
      request<InstanceUpgradeApplyResponse>("/api/instance-upgrade/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          ...(instanceUpgradeQuery.data?.targetVersion
            ? { targetVersion: instanceUpgradeQuery.data.targetVersion }
            : {}),
        }),
      }),
    onSuccess: (result) => {
      upgradeFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.instance.upgradeSucceededTitle),
        detail: `${$t(i18nKeys.console.instance.targetVersionLabel)} ${result.targetVersion}`,
      };
      void queryClient.invalidateQueries({ queryKey: ["instance-upgrade"] });
    },
    onError: (error) => {
      upgradeFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.instance.upgradeFailedTitle),
        detail: readErrorMessage(error),
      };
    },
  }));
  const domainInstallCommand =
    "curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- --domain console.example.com";
  const directInstallCommand = "curl -fsSL https://appaloft.com/install.sh | sudo sh";
  const rerunCommand =
    "curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- --domain new-console.example.com";
  const fallbackUpgradeCommand = "curl -fsSL https://appaloft.com/install.sh | sudo sh";
  const upgradeStatus = $derived(instanceUpgradeQuery.data?.checkStatus ?? "unknown");
  const upgradeCommand = $derived(
    instanceUpgradeQuery.data?.upgradeCommand ?? fallbackUpgradeCommand,
  );
  const canApplyUpgrade = $derived(
    Boolean(
      instanceUpgradeQuery.data?.applySupported &&
        instanceUpgradeQuery.data.updateAvailable &&
        !applyUpgradeMutation.isPending,
    ),
  );
  const actionSnippet = $derived(`control-plane-mode: self-hosted
control-plane-url: ${currentOrigin}
server-config-deploy: true`);

  function statusLabelKey(status: InstanceUpgradeCheckStatus) {
    if (status === "available") {
      return i18nKeys.console.instance.updateAvailableBadge;
    }

    if (status === "current") {
      return i18nKeys.console.instance.upToDateBadge;
    }

    return i18nKeys.console.instance.unknownUpdateBadge;
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.instance.pageTitle)} · Appaloft</title>
</svelte:head>

<ManagementShell
  title={$t(i18nKeys.console.instance.pageTitle)}
  description={$t(i18nKeys.console.instance.pageDescription)}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.home), href: "/" },
    { label: $t(i18nKeys.console.instance.pageTitle) },
  ]}
>
  <div class="space-y-8">
    <section class="rounded-lg border bg-card p-5">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <Badge variant={upgradeStatus === "available" ? "default" : "outline"}>
              {$t(statusLabelKey(upgradeStatus))}
            </Badge>
            <h2 class="text-lg font-semibold">{$t(i18nKeys.console.instance.updatesTitle)}</h2>
          </div>
          <p class="mt-3 text-sm leading-6 text-muted-foreground">
            {$t(i18nKeys.console.instance.updatesBody)}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={instanceUpgradeQuery.isFetching}
            onclick={() => {
              upgradeFeedback = null;
              void instanceUpgradeQuery.refetch();
            }}
          >
            <RefreshCw class="mr-2 size-4" />
            {instanceUpgradeQuery.isFetching
              ? $t(i18nKeys.console.instance.checkingForUpdates)
              : $t(i18nKeys.console.instance.checkForUpdates)}
          </Button>
          <Button
            type="button"
            disabled={!canApplyUpgrade}
            onclick={() => applyUpgradeMutation.mutate()}
          >
            <Download class="mr-2 size-4" />
            {applyUpgradeMutation.isPending
              ? $t(i18nKeys.console.instance.applyingUpgrade)
              : $t(i18nKeys.console.instance.applyUpgrade)}
          </Button>
        </div>
      </div>

      <div class="mt-5 grid gap-4 md:grid-cols-3">
        <div>
          <p class="text-xs uppercase text-muted-foreground">
            {$t(i18nKeys.console.instance.currentVersionLabel)}
          </p>
          <p class="mt-1 font-mono text-sm">{instanceUpgradeQuery.data?.currentVersion ?? "-"}</p>
        </div>
        <div>
          <p class="text-xs uppercase text-muted-foreground">
            {$t(i18nKeys.console.instance.latestVersionLabel)}
          </p>
          <p class="mt-1 font-mono text-sm">{instanceUpgradeQuery.data?.latestVersion ?? "-"}</p>
        </div>
        <div>
          <p class="text-xs uppercase text-muted-foreground">
            {$t(i18nKeys.console.instance.targetVersionLabel)}
          </p>
          <p class="mt-1 font-mono text-sm">{instanceUpgradeQuery.data?.targetVersion ?? "-"}</p>
        </div>
      </div>

      {#if instanceUpgradeQuery.error}
        <p class="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {readErrorMessage(instanceUpgradeQuery.error)}
        </p>
      {/if}

      {#if upgradeFeedback}
        <p
          class={`mt-4 rounded-md border p-3 text-sm ${
            upgradeFeedback.kind === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          <span class="font-medium">{upgradeFeedback.title}</span>
          <span class="ml-2">{upgradeFeedback.detail}</span>
        </p>
      {/if}

      {#if instanceUpgradeQuery.data?.applyUnsupportedReason}
        <p class="mt-4 text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.instance.applyUnsupported)}
        </p>
      {/if}

      <div class="mt-4">
        <p class="text-sm font-medium">{$t(i18nKeys.console.instance.upgradeCommandTitle)}</p>
        <pre class="mt-2 overflow-x-auto rounded-md border bg-muted p-3 text-xs"><code>{upgradeCommand}</code></pre>
      </div>
    </section>

    <section class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div class="rounded-lg border bg-card p-5">
        <div class="flex items-center gap-3">
          <Globe2 class="size-5 text-primary" />
          <div>
            <p class="text-sm font-medium">{$t(i18nKeys.console.instance.currentOriginLabel)}</p>
            <p class="mt-1 break-all font-mono text-sm text-muted-foreground">{currentOrigin}</p>
          </div>
        </div>
      </div>
      <div class="rounded-lg border bg-card p-5">
        <div class="flex items-center gap-3">
          <Network class="size-5 text-primary" />
          <div>
            <p class="text-sm font-medium">{$t(i18nKeys.console.instance.proxyTitle)}</p>
            <p class="mt-1 text-sm leading-6 text-muted-foreground">
              {$t(i18nKeys.console.instance.proxyBody)}
            </p>
          </div>
        </div>
      </div>
    </section>

    <section class="grid gap-5 lg:grid-cols-2">
      <div class="rounded-lg border bg-card p-5">
        <div class="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{$t(i18nKeys.console.instance.domainRouteBadge)}</Badge>
          <h2 class="text-lg font-semibold">{$t(i18nKeys.console.instance.domainInstallTitle)}</h2>
        </div>
        <p class="mt-3 text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.instance.domainInstallBody)}
        </p>
        <pre class="mt-4 overflow-x-auto rounded-md border bg-muted p-3 text-xs"><code>{domainInstallCommand}</code></pre>
      </div>

      <div class="rounded-lg border bg-card p-5">
        <div class="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{$t(i18nKeys.console.instance.fallbackRouteBadge)}</Badge>
          <h2 class="text-lg font-semibold">{$t(i18nKeys.console.instance.directInstallTitle)}</h2>
        </div>
        <p class="mt-3 text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.instance.directInstallBody)}
        </p>
        <pre class="mt-4 overflow-x-auto rounded-md border bg-muted p-3 text-xs"><code>{directInstallCommand}</code></pre>
      </div>
    </section>

    <section class="grid gap-5 lg:grid-cols-2">
      <div class="rounded-lg border bg-card p-5">
        <div class="flex items-center gap-3">
          <ClipboardList class="size-5 text-primary" />
          <h2 class="text-lg font-semibold">{$t(i18nKeys.console.instance.rerunTitle)}</h2>
        </div>
        <p class="mt-3 text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.instance.rerunBody)}
        </p>
        <pre class="mt-4 overflow-x-auto rounded-md border bg-muted p-3 text-xs"><code>{rerunCommand}</code></pre>
      </div>

      <div class="rounded-lg border bg-card p-5">
        <div class="flex items-center gap-3">
          <GitBranch class="size-5 text-primary" />
          <h2 class="text-lg font-semibold">
            {$t(i18nKeys.console.instance.actionControlPlaneTitle)}
          </h2>
        </div>
        <p class="mt-3 text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.instance.actionControlPlaneBody)}
        </p>
        <pre class="mt-4 overflow-x-auto rounded-md border bg-muted p-3 text-xs"><code>{actionSnippet}</code></pre>
      </div>
    </section>
  </div>
</ManagementShell>
