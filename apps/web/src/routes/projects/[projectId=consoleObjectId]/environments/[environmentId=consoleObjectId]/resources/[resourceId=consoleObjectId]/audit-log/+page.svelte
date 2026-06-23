<script lang="ts">
  import { page } from "$app/state";

  import ConsoleExtensionPage from "$lib/components/console/ConsoleExtensionPage.svelte";

  const projectId = $derived(page.params.projectId ?? "");
  const environmentId = $derived(page.params.environmentId ?? "");
  const resourceId = $derived(page.params.resourceId ?? "");
</script>

<ConsoleExtensionPage {projectId} {environmentId} {resourceId} />
