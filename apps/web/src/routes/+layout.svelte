<script lang="ts">
  import "reflect-metadata";
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { QueryClientProvider } from "@tanstack/svelte-query";

  import "./layout.css";
  import { request } from "$lib/api/client";
  import { queryClient } from "$lib/query-client";

  let { children } = $props();
  let bootstrapStatus = $state<{ pathname: string; bootstrapRequired: boolean } | null>(null);

  const pathname = $derived(page.url.pathname);

  $effect(() => {
    if (!browser) {
      return;
    }

    const checkedPathname = pathname;
    bootstrapStatus = null;
    let cancelled = false;
    void request<{ bootstrapRequired: boolean }>("/api/bootstrap/auth/status")
      .then((status) => {
        if (!cancelled) {
          bootstrapStatus = {
            pathname: checkedPathname,
            bootstrapRequired: status.bootstrapRequired,
          };
        }
      })
      .catch(() => {
        if (!cancelled) {
          bootstrapStatus = null;
        }
      });

    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    if (!browser || !bootstrapStatus?.bootstrapRequired || bootstrapStatus.pathname !== pathname) {
      return;
    }

    if (pathname === "/bootstrap/auth/first-admin" || pathname === "/login") {
      return;
    }

    void goto("/bootstrap/auth/first-admin", { replaceState: true });
  });
</script>

<QueryClientProvider client={queryClient}>
  {@render children()}
</QueryClientProvider>
