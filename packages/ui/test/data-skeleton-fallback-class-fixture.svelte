<script lang="ts">
  import DataSkeleton from "../src/skeleton/data-skeleton.svelte";
</script>

<DataSkeleton
  name="ui-data-skeleton-fallback-class-test"
  loading={true}
  fallbackClass="custom-fallback-shape min-h-48 w-full"
>
  {#snippet capture()}
    <p>Capture placeholder</p>
  {/snippet}
</DataSkeleton>
