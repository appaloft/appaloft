<script lang="ts">
  import ConsoleExtensionPage from "$lib/components/console/ConsoleExtensionPage.svelte";
  import InstanceAccessGate from "$lib/components/console/InstanceAccessGate.svelte";
</script>

<InstanceAccessGate>
  <ConsoleExtensionPage settingsScope="instance" />
</InstanceAccessGate>
