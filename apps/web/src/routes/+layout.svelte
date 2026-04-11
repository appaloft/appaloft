<script lang="ts">
	import { QueryClientProvider } from '@tanstack/svelte-query';

	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { queryClient } from '$lib/query-client';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<QueryClientProvider client={queryClient}>
	{@render children()}
</QueryClientProvider>
