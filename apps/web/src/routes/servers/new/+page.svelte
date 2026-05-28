<script lang="ts">
  import { ArrowLeft, Server } from "@lucide/svelte";

  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import ServerCreateForm from "$lib/components/console/ServerCreateForm.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { i18nKeys, t } from "$lib/i18n";
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.servers.createTitle)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={$t(i18nKeys.console.servers.createTitle)}
  description={$t(i18nKeys.console.servers.createDescription)}
>
  <section class="space-y-5">
    <div class="console-owner-header sm:flex-row sm:items-start sm:justify-between">
      <div class="max-w-3xl space-y-3">
        <Badge class="console-page-kicker" variant="outline">
          <Server class="size-3.5" />
          {$t(i18nKeys.common.domain.servers)}
        </Badge>
        <div class="space-y-2">
          <h1 class="text-2xl font-semibold md:text-3xl">
            {$t(i18nKeys.console.servers.createFormTitle)}
          </h1>
          <p class="text-sm leading-6 text-muted-foreground">
            {$t(i18nKeys.console.servers.createFormDescription)}
          </p>
        </div>
      </div>
      <Button href="/servers" variant="outline">
        <ArrowLeft class="size-4" />
        {$t(i18nKeys.common.actions.backToServers)}
      </Button>
    </div>

    <ServerCreateForm showSuccessLink />
  </section>
</ConsoleShell>
