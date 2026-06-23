<script lang="ts">
  import { page } from "$app/state";

  import ConsoleExtensionPage from "$lib/components/console/ConsoleExtensionPage.svelte";

  const resourceId = $derived(page.params.resourceId ?? "");
</script>

<ConsoleExtensionPage {resourceId} />
