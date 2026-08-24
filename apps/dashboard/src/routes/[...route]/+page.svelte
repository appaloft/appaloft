<script lang="ts">
  import { page } from "$app/state";

  import DashboardShell from "$lib/components/DashboardShell.svelte";
  import { parseDashboardRoute } from "$lib/navigation";

  const route = $derived(parseDashboardRoute(page.url));
</script>

<DashboardShell {route} />
