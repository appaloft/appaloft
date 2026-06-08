<script lang="ts">
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import { i18nKeys, t } from "$lib/i18n";
</script>

<svelte:head>
  <title>{$t(i18nKeys.common.actions.quickDeploy)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={$t(i18nKeys.common.actions.quickDeploy)}
  description={$t(i18nKeys.console.deployments.description)}
>
  <div class="sr-only">{$t(i18nKeys.common.actions.quickDeploy)}</div>
</ConsoleShell>
