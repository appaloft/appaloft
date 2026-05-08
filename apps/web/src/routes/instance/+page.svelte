<script lang="ts">
  import { browser } from "$app/environment";
  import { ClipboardList, GitBranch, Globe2, Network } from "@lucide/svelte";

  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { i18nKeys, t } from "$lib/i18n";

  const currentOrigin = $derived(browser ? window.location.origin : "http://SERVER_IP:3721");
  const domainInstallCommand =
    "curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- --domain console.example.com";
  const directInstallCommand = "curl -fsSL https://appaloft.com/install.sh | sudo sh";
  const rerunCommand =
    "curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- --domain new-console.example.com";
  const actionSnippet = $derived(`control-plane-mode: self-hosted
control-plane-url: ${currentOrigin}
server-config-deploy: true`);
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.instance.pageTitle)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={$t(i18nKeys.console.instance.pageTitle)}
  description={$t(i18nKeys.console.instance.pageDescription)}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.home), href: "/" },
    { label: $t(i18nKeys.console.instance.pageTitle) },
  ]}
>
  <div class="space-y-8">
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
</ConsoleShell>
