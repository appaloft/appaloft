<script lang="ts">
  import { page } from "$app/state";

  import AuthSurface from "$lib/components/AuthSurface.svelte";
  import DashboardShell from "$lib/components/DashboardShell.svelte";
  import { parseDashboardRoute } from "$lib/navigation";

  const route = $derived(parseDashboardRoute(page.url));
</script>

{#if route.kind === "auth"}
  <AuthSurface {route} />
{:else}
  <DashboardShell {route} />
{/if}
