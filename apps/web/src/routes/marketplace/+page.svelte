<script lang="ts">
  import BlueprintCatalogSelector from "$lib/components/console/BlueprintCatalogSelector.svelte";
  import ConsoleResourceCanvas from "$lib/components/console/ConsoleResourceCanvas.svelte";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
</script>

<svelte:head>
  <title>应用市场 · Appaloft</title>
</svelte:head>

<ConsoleShell title="应用市场" description="选择 Blueprint 并进入部署流程。">
  <ConsoleResourceCanvas class="max-w-7xl" data-marketplace-catalog-display-surface>
    <BlueprintCatalogSelector />
  </ConsoleResourceCanvas>
</ConsoleShell>
