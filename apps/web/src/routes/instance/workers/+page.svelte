<script lang="ts">
  import InstanceAccessGate from "$lib/components/console/InstanceAccessGate.svelte";

  import InstanceWorkersRoute from "./InstanceWorkersRoute.svelte";
</script>

<InstanceAccessGate>
  <InstanceWorkersRoute />
</InstanceAccessGate>
