<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { LogIn, ShieldCheck } from "@lucide/svelte";
  import appaloftIcon from "@appaloft/design/assets/appaloft-icon-light.svg";

  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { buildApiUrl } from "$lib/api/client";
  import { i18nKeys, localeHeaders, t } from "$lib/i18n";

  let email = $state("");
  let password = $state("");
  let loginError = $state("");
  let submitting = $state(false);

  const canSubmit = $derived(email.trim().length > 0 && password.length > 0 && !submitting);
  const returnTo = $derived(page.url.searchParams.get("next") || "/");

  async function submitLogin(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    submitting = true;
    loginError = "";

    try {
      const response = await fetch(buildApiUrl("/api/auth/sign-in/email"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...localeHeaders(),
        },
        body: JSON.stringify({
          email,
          password,
          callbackURL: returnTo,
        }),
      });

      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).trim();
        throw new Error(detail || `${response.status}`);
      }

      if (browser) {
        await goto(returnTo);
      }
    } catch (error) {
      loginError = error instanceof Error ? error.message : $t(i18nKeys.errors.web.unknownRequestFailure);
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.authBootstrap.loginTitle)} · Appaloft</title>
</svelte:head>

<main class="min-h-screen bg-background p-4 text-foreground md:p-8">
  <div class="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-md items-center justify-center md:min-h-[calc(100vh-4rem)]">
    <section class="w-full rounded-lg border bg-card p-6 shadow-sm">
      <div class="flex items-center gap-3">
        <img src={appaloftIcon} alt={$t(i18nKeys.common.app.productName)} class="size-8" />
        <div>
          <p class="text-sm font-medium">{$t(i18nKeys.common.app.productName)}</p>
          <p class="text-xs text-muted-foreground">
            {$t(i18nKeys.common.app.consoleSubtitle)}
          </p>
        </div>
      </div>

      <div class="mt-8 space-y-2">
        <div class="flex items-center gap-2">
          <ShieldCheck class="size-5 text-primary" />
          <h1 class="text-2xl font-semibold tracking-tight">
            {$t(i18nKeys.console.authBootstrap.loginTitle)}
          </h1>
        </div>
        <p class="text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.authBootstrap.loginBody)}
        </p>
      </div>

      <form class="mt-6 space-y-4" onsubmit={submitLogin}>
        {#if loginError}
          <div class="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p class="font-medium">{$t(i18nKeys.console.authBootstrap.loginFailed)}</p>
            <p class="mt-1 text-muted-foreground">{loginError}</p>
          </div>
        {/if}

        <label class="space-y-1.5 text-sm font-medium">
          <span>{$t(i18nKeys.console.authBootstrap.loginEmailLabel)}</span>
          <Input bind:value={email} type="email" autocomplete="email" required />
        </label>

        <label class="space-y-1.5 text-sm font-medium">
          <span>{$t(i18nKeys.console.authBootstrap.loginPasswordLabel)}</span>
          <Input bind:value={password} type="password" autocomplete="current-password" required />
        </label>

        <div class="flex flex-wrap gap-2">
          <Button type="submit" disabled={!canSubmit}>
            <LogIn class="size-4" />
            {submitting
              ? $t(i18nKeys.console.authBootstrap.signingIn)
              : $t(i18nKeys.console.authBootstrap.signIn)}
          </Button>
          <Button href="/bootstrap/auth/first-admin" variant="outline">
            {$t(i18nKeys.console.authBootstrap.createAdmin)}
          </Button>
        </div>
      </form>
    </section>
  </div>
</main>
