<script lang="ts">
  import { Button } from "@appaloft/ui/button";
  import { ArrowRight, CheckCircle2, KeyRound, LoaderCircle, ShieldCheck, Sparkles } from "@lucide/svelte";
  import { onMount } from "svelte";

  import { authErrorMessage, safeDashboardReturnPath } from "$lib/auth";
  import { dashboardClient } from "$lib/data-client";
  import type { DashboardRoute } from "$lib/navigation";

  type AuthRoute = Extract<DashboardRoute, { kind: "auth" }>;
  type BootstrapStatus = Awaited<ReturnType<typeof dashboardClient.auth.bootstrapStatus>>;
  type BootstrapResult = Awaited<ReturnType<typeof dashboardClient.auth.bootstrapFirstAdmin>>;
  type PublicAuthProvider = { key: string; title: string; configured: boolean };

  let { route }: { route: AuthRoute } = $props();
  let email = $state("");
  let password = $state("");
  let displayName = $state("");
  let organizationName = $state("");
  let organizationSlug = $state("");
  let loading = $state(true);
  let submitting = $state(false);
  let error = $state("");
  let status = $state<BootstrapStatus | null>(null);
  let created = $state<BootstrapResult | null>(null);

  const returnTo = $derived(safeDashboardReturnPath(route.next));
  const publicProviders = $derived.by(() => {
    if (typeof window === "undefined") return [] as PublicAuthProvider[];
    const runtime = window as typeof window & {
      __APPALOFT_PUBLIC_CONFIG__?: { auth?: { providers?: PublicAuthProvider[] } };
    };
    return (runtime.__APPALOFT_PUBLIC_CONFIG__?.auth?.providers ?? []).filter(
      (provider) => provider.configured,
    );
  });
  const localPasswordEnabled = $derived(
    status?.loginMethods.some(
      (method) => method.key === "local-password" && method.enabled && method.configured,
    ) ?? true,
  );
  const canSubmit = $derived(
    route.destination === "login"
      ? email.trim().length > 0 && password.length > 0 && !submitting
      : email.trim().length > 0 && displayName.trim().length > 0 && !submitting,
  );

  onMount(async () => {
    try {
      status = await dashboardClient.auth.bootstrapStatus({});
      if (route.destination === "login" && status.bootstrapRequired) {
        window.location.replace("/bootstrap/auth/first-admin");
        return;
      }
      if (route.destination === "first-admin" && !status.bootstrapRequired) {
        window.location.replace(status.loginUrl || "/login");
        return;
      }
    } catch (cause) {
      error = authErrorMessage(cause);
    } finally {
      loading = false;
    }
  });

  async function submitLogin(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!canSubmit) return;
    submitting = true;
    error = "";
    try {
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, callbackURL: returnTo }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string; code?: string } | null;
        throw new Error(body?.message || body?.code || `Sign in failed (${response.status})`);
      }
      window.location.assign(returnTo);
    } catch (cause) {
      error = authErrorMessage(cause);
      submitting = false;
    }
  }

  async function submitFirstAdmin(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!canSubmit) return;
    submitting = true;
    error = "";
    try {
      created = await dashboardClient.auth.bootstrapFirstAdmin({
        email: email.trim(),
        displayName: displayName.trim(),
        ...(password.trim() ? { password } : {}),
        ...(organizationName.trim() ? { organizationName: organizationName.trim() } : {}),
        ...(organizationSlug.trim() ? { organizationSlug: organizationSlug.trim() } : {}),
      });
      password = "";
    } catch (cause) {
      error = authErrorMessage(cause);
    } finally {
      submitting = false;
    }
  }

  async function signInWithProvider(provider: PublicAuthProvider): Promise<void> {
    submitting = true;
    error = "";
    try {
      const response = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: provider.key,
          callbackURL: new URL(returnTo, window.location.origin).toString(),
          disableRedirect: true,
        }),
      });
      const body = (await response.json().catch(() => null)) as { url?: string; data?: { url?: string }; message?: string } | null;
      if (!response.ok) throw new Error(body?.message || `${provider.title} sign in failed`);
      const redirect = body?.url || body?.data?.url;
      if (!redirect) throw new Error(`${provider.title} did not return an authorization URL`);
      window.location.assign(redirect);
    } catch (cause) {
      error = authErrorMessage(cause);
      submitting = false;
    }
  }

  function openLogin(): void {
    window.location.assign(created?.loginUrl || "/login");
  }
</script>

<svelte:head>
  <title>{route.destination === "login" ? "Sign in" : "Create first administrator"} · Appaloft</title>
</svelte:head>

<main data-dashboard-auth={route.destination} class="relative min-h-svh overflow-hidden bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8">
  <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,color-mix(in_oklch,var(--primary)_20%,transparent),transparent_34%),radial-gradient(circle_at_78%_72%,color-mix(in_oklch,var(--accent)_14%,transparent),transparent_32%)]"></div>
  <div class="relative mx-auto grid min-h-[calc(100svh-4rem)] w-full max-w-5xl items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">
    <section class="hidden px-5 lg:block">
      <div class="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"><Sparkles class="size-3.5" />Appaloft Cloud</div>
      <h1 class="mt-7 max-w-lg font-serif text-5xl font-semibold leading-[1.06] tracking-[-0.035em]">A calmer control plane for everything you ship.</h1>
      <p class="mt-5 max-w-md text-base leading-7 text-muted-foreground">Projects stay simple at the Workspace level. Deployment detail appears only when you enter its owner context.</p>
      <div class="mt-9 grid max-w-md gap-3 text-sm">
        <div class="flex items-start gap-3 rounded-[14px] border border-divider bg-surface-raised/70 p-4 shadow-[var(--shadow-card)]"><ShieldCheck class="mt-0.5 size-4 text-primary" /><span>Tenant-scoped access and explicit ownership at every level.</span></div>
        <div class="flex items-start gap-3 rounded-[14px] border border-divider bg-surface-raised/70 p-4 shadow-[var(--shadow-card)]"><KeyRound class="mt-0.5 size-4 text-primary" /><span>Local password remains available without requiring an OAuth provider.</span></div>
      </div>
    </section>

    <section class="rounded-[22px] border border-divider bg-surface-overlay/90 p-6 shadow-[var(--shadow-overlay)] backdrop-blur-xl sm:p-8" aria-labelledby="auth-title">
      <a class="inline-flex items-center gap-2 text-sm font-semibold" href="/projects"><span class="grid size-9 place-items-center rounded-[11px] bg-primary text-primary-foreground shadow-[var(--shadow-primary)]">A</span>Appaloft</a>

      {#if loading}
        <div class="grid min-h-72 place-items-center"><LoaderCircle class="size-6 animate-spin text-primary" aria-label="Loading authentication status" /></div>
      {:else if route.destination === "first-admin" && created}
        <div class="mt-10">
          <CheckCircle2 class="size-9 text-primary" />
          <h2 id="auth-title" class="mt-5 text-3xl font-semibold tracking-tight">Your control plane is ready</h2>
          <p class="mt-3 text-sm leading-6 text-muted-foreground">The first administrator and Workspace organization have been created for {created.email}.</p>
          {#if created.generatedPassword}
            <div class="mt-6 rounded-[14px] border border-primary/25 bg-primary/8 p-4"><p class="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Save this generated password now</p><code class="mt-3 block break-all rounded-[10px] bg-background p-3 text-sm">{created.generatedPassword}</code></div>
          {/if}
          <Button class="mt-7 h-11 rounded-[11px]" onclick={openLogin}>Continue to sign in <ArrowRight class="size-4" /></Button>
        </div>
      {:else}
        <div class="mt-9">
          <p class="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{route.destination === "login" ? "Welcome back" : "Self-hosted setup"}</p>
          <h2 id="auth-title" class="mt-2 text-3xl font-semibold tracking-tight">{route.destination === "login" ? "Sign in to your Workspace" : "Create the first administrator"}</h2>
          <p class="mt-3 text-sm leading-6 text-muted-foreground">{route.destination === "login" ? "Continue to the project and deployment context you were working in." : "This one-time step establishes the owner account and initial organization."}</p>
        </div>

        {#if error}<div role="alert" class="mt-6 rounded-[12px] border border-destructive/25 bg-destructive/8 p-3 text-sm text-destructive">{error}</div>{/if}

        {#if route.destination === "login"}
          {#if publicProviders.length > 0}
            <div class="mt-7 grid gap-2 sm:grid-cols-2">{#each publicProviders as provider}<Button type="button" variant="outline" class="h-11 rounded-[11px]" disabled={submitting} onclick={() => signInWithProvider(provider)}>Continue with {provider.title}</Button>{/each}</div>
            {#if localPasswordEnabled}<div class="my-6 flex items-center gap-3 text-xs text-muted-foreground"><span class="h-px flex-1 bg-divider"></span><span>or use email</span><span class="h-px flex-1 bg-divider"></span></div>{/if}
          {/if}
          {#if localPasswordEnabled}
            <form class="mt-7 grid gap-5" onsubmit={submitLogin}>
              <label class="grid gap-2 text-sm font-medium">Email<input class="h-11 rounded-[11px] border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring" bind:value={email} type="email" autocomplete="email" required /></label>
              <label class="grid gap-2 text-sm font-medium">Password<input class="h-11 rounded-[11px] border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring" bind:value={password} type="password" autocomplete="current-password" required /></label>
              <Button class="mt-1 h-11 rounded-[11px]" type="submit" disabled={!canSubmit}>{submitting ? "Signing in…" : "Sign in"}<ArrowRight class="size-4" /></Button>
            </form>
          {:else if publicProviders.length === 0}
            <p class="mt-7 rounded-[12px] border border-divider bg-surface p-4 text-sm text-muted-foreground">No login method is currently enabled. Configure local password or an OAuth provider, then reload this page.</p>
          {/if}
        {:else}
          <form class="mt-7 grid gap-5" onsubmit={submitFirstAdmin}>
            <div class="grid gap-4 sm:grid-cols-2"><label class="grid gap-2 text-sm font-medium">Email<input class="h-11 rounded-[11px] border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring" bind:value={email} type="email" autocomplete="email" required /></label><label class="grid gap-2 text-sm font-medium">Display name<input class="h-11 rounded-[11px] border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring" bind:value={displayName} autocomplete="name" required /></label></div>
            <label class="grid gap-2 text-sm font-medium">Password <span class="text-xs font-normal text-muted-foreground">Leave blank to generate one.</span><input class="h-11 rounded-[11px] border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring" bind:value={password} type="password" autocomplete="new-password" /></label>
            <div class="grid gap-4 sm:grid-cols-2"><label class="grid gap-2 text-sm font-medium">Organization name<input class="h-11 rounded-[11px] border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring" bind:value={organizationName} placeholder="My Workspace" /></label><label class="grid gap-2 text-sm font-medium">Organization slug<input class="h-11 rounded-[11px] border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring" bind:value={organizationSlug} placeholder="my-workspace" /></label></div>
            <Button class="mt-1 h-11 rounded-[11px]" type="submit" disabled={!canSubmit}>{submitting ? "Creating administrator…" : "Create administrator"}<ArrowRight class="size-4" /></Button>
          </form>
        {/if}
      {/if}
    </section>
  </div>
</main>
