<script lang="ts">
	import { QueryClientProvider } from '@tanstack/svelte-query';

	import './layout.css';
	import { queryClient } from '$lib/query-client';

	let { children } = $props();
</script>

<QueryClientProvider client={queryClient}>
	{@render children()}
</QueryClientProvider>
