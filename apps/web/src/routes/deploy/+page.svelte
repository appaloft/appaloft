<script lang="ts">
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import QuickDeploySheet from "$lib/components/console/QuickDeploySheet.svelte";
  import { i18nKeys, t } from "$lib/i18n";
</script>

<svelte:head>
  <title>{$t(i18nKeys.common.actions.newDeployment)} · Yundu</title>
</svelte:head>

<ConsoleShell title={$t(i18nKeys.common.actions.newDeployment)} description={$t(i18nKeys.console.deployments.description)}>
  <QuickDeploySheet />
</ConsoleShell>
