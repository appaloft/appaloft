<script lang="ts">
  import "reflect-metadata";
  import { QueryClientProvider } from "@tanstack/svelte-query";

  import "./layout.css";
  import ConsoleModalInteractionHost from "$lib/components/console/ConsoleModalInteractionHost.svelte";
  import { queryClient } from "$lib/query-client";

  let { children } = $props();
</script>

<QueryClientProvider client={queryClient}>
  {@render children()}
  <ConsoleModalInteractionHost />
</QueryClientProvider>
