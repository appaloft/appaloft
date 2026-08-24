<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { LoaderCircle } from "@lucide/svelte";
  import type { AuthSessionResponse } from "@appaloft/contracts";
  import { onMount } from "svelte";

  import { dashboardAuthRedirect } from "$lib/auth";
  import AuthSurface from "$lib/components/AuthSurface.svelte";
  import DashboardShell from "$lib/components/DashboardShell.svelte";
  import { parseDashboardRoute } from "$lib/navigation";

  const route = $derived(parseDashboardRoute(page.url));
  let authReady = $state(false);
  let authFailed = $state(false);

  onMount(async () => {
    if (route.kind === "auth") {
      authReady = true;
      return;
    }
    try {
      const response = await fetch("/api/auth/session", { credentials: "same-origin" });
      if (!response.ok) throw new Error(`Authentication status returned ${response.status}`);
      const status = (await response.json()) as AuthSessionResponse;
      const redirect = dashboardAuthRedirect({
        currentPath: `${location.pathname}${location.search}${location.hash}`,
        loginRequired: status.loginRequired,
        hasSession: Boolean(status.session),
      });
      if (redirect) {
        location.replace(redirect);
        return;
      }
      authReady = true;
    } catch {
      authFailed = true;
    }
  });
</script>

{#if route.kind === "auth"}
  <AuthSurface {route} />
{:else if !browser || (!authReady && !authFailed)}
  <main class="grid min-h-svh place-items-center bg-background text-foreground">
    <LoaderCircle class="size-6 animate-spin text-primary" aria-label="Checking authentication" />
  </main>
{:else if authFailed}
  <main class="grid min-h-svh place-items-center bg-background px-6 text-foreground">
    <section class="max-w-md rounded-[18px] border border-destructive/20 bg-surface p-6 text-center">
      <h1 class="text-lg font-semibold">Authentication is unavailable</h1>
      <p class="mt-2 text-sm text-muted-foreground">The Dashboard could not verify this session.</p>
      <button class="mt-5 rounded-[10px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" onclick={() => location.reload()}>Retry</button>
    </section>
  </main>
{:else}
  <DashboardShell {route} />
{/if}
