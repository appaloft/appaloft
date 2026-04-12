<script lang="ts">
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import QuickDeploySheet from "$lib/components/console/QuickDeploySheet.svelte";
</script>

<svelte:head>
  <title>New Deployment · Yundu</title>
</svelte:head>

<ConsoleShell title="新部署" description="选择 source、项目、服务器和环境">
  <QuickDeploySheet />
</ConsoleShell>
