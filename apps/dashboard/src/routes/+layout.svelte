<script lang="ts">
  import "./layout.css";

  let { children } = $props();
</script>

<svelte:head>
  <title>Appaloft Dashboard</title>
  <meta
    name="description"
    content="A contextual deployment workspace for Appaloft projects, resources, and deployments."
  />
</svelte:head>

{@render children()}
