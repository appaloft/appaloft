<script lang="ts">
  import BlueprintCatalogSelector from "$lib/components/console/BlueprintCatalogSelector.svelte";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
</script>

<svelte:head>
  <title>Marketplace · Appaloft</title>
</svelte:head>

<ConsoleShell title="Marketplace" description="选择 Blueprint 并进入部署流程。">
  <BlueprintCatalogSelector />
</ConsoleShell>
