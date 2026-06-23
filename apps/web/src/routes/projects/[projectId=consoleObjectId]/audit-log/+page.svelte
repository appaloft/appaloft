<script lang="ts">
  import { page } from "$app/state";

  import ConsoleExtensionPage from "$lib/components/console/ConsoleExtensionPage.svelte";

  const projectId = $derived(page.params.projectId ?? "");
</script>

<ConsoleExtensionPage {projectId} />
