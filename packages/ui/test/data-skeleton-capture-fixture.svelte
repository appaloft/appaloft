<script lang="ts">
  import DataSkeleton from "../src/skeleton/data-skeleton.svelte";
</script>

<DataSkeleton name="ui-data-skeleton-fallback-test" loading={true}>
  {#snippet capture()}
    <p style="color: rgb(82, 96, 113)">Capture placeholder</p>
  {/snippet}

  <p>Loaded value</p>
</DataSkeleton>
