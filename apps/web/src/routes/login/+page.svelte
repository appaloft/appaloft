<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { LogIn, ShieldCheck } from "@lucide/svelte";
  import { createQuery, queryOptions } from "@tanstack/svelte-query";
  import type { AuthSessionResponse } from "@appaloft/contracts";
  import appaloftIcon from "@appaloft/design/assets/appaloft-icon-light.svg";

  import { startGitHubSignIn } from "$lib/auth-social";
  import { Button } from "$lib/components/ui/button";
  import GitHubIcon from "$lib/components/console/GitHubIcon.svelte";
  import { Input } from "$lib/components/ui/input";
  import { buildApiUrl, request } from "$lib/api/client";
  import { i18nKeys, localeHeaders, t } from "$lib/i18n";

  let email = $state("");
  let password = $state("");
  let loginError = $state("");
  let submitting = $state(false);
  let socialSubmitting = $state(false);

  const canSubmit = $derived(email.trim().length > 0 && password.length > 0 && !submitting);
  const returnTo = $derived(page.url.searchParams.get("next") || "/");
  const authSessionQuery = createQuery(() =>
    queryOptions({
      queryKey: ["system", "auth-session", "login"],
      queryFn: () => request<AuthSessionResponse>("/api/auth/session"),
      enabled: browser,
      retry: 0,
    }),
  );
  const githubConfigured = $derived(
    Boolean(authSessionQuery.data?.providers.find((provider) => provider.key === "github")?.configured),
  );
  const requiresEmailOtpVerification = $derived(
    Boolean(
      authSessionQuery.data?.emailVerification.required &&
        authSessionQuery.data?.emailVerification.otpEnabled &&
        authSessionQuery.data?.emailVerification.verifyPagePath,
    ),
  );

  function errorMessageFromResponseBody(body: string): string {
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      return "";
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object") {
        const message = (parsed as Record<string, unknown>).message;
        if (typeof message === "string" && message.trim().length > 0) {
          return message.trim();
        }
      }
    } catch {
      return trimmed;
    }

    return trimmed;
  }

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
        throw new Error(errorMessageFromResponseBody(detail) || `${response.status}`);
      }

      if (browser) {
        await goto(returnTo);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : $t(i18nKeys.errors.web.unknownRequestFailure);
      if (requiresEmailOtpVerification && /email.*verif/i.test(message) && browser) {
        const verifyPath = authSessionQuery.data?.emailVerification.verifyPagePath ?? "/verify-email";
        await goto(
          `${verifyPath}?email=${encodeURIComponent(email)}&next=${encodeURIComponent(returnTo)}`,
        );
        return;
      }
      loginError = error instanceof Error ? error.message : $t(i18nKeys.errors.web.unknownRequestFailure);
    } finally {
      submitting = false;
    }
  }

  async function submitGitHubLogin(): Promise<void> {
    if (!githubConfigured || socialSubmitting) {
      return;
    }

    socialSubmitting = true;
    loginError = "";

    try {
      await startGitHubSignIn(returnTo);
    } catch (error) {
      loginError = error instanceof Error ? error.message : $t(i18nKeys.errors.web.unknownRequestFailure);
      socialSubmitting = false;
    }
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.authBootstrap.loginTitle)} · Appaloft</title>
</svelte:head>

<main class="min-h-screen bg-background p-4 text-foreground md:p-8">
  <div class="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-lg items-center justify-center md:min-h-[calc(100vh-4rem)]">
    <section class="console-panel w-full p-6 md:p-8">
      <div class="flex items-center gap-3.5">
        <div class="flex size-10 items-center justify-center rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30">
          <img src={appaloftIcon} alt={$t(i18nKeys.common.app.productName)} class="size-7" />
        </div>
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

      <div class="mt-7 grid gap-5">
        {#if loginError}
          <div class="rounded-[calc(var(--radius-lg)-2px)] border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p class="font-medium">{$t(i18nKeys.console.authBootstrap.loginFailed)}</p>
            <p class="mt-1.5 break-words text-muted-foreground">{loginError}</p>
          </div>
        {/if}

        {#if githubConfigured}
          <Button type="button" variant="outline" class="w-full justify-center" disabled={socialSubmitting} onclick={submitGitHubLogin}>
            <GitHubIcon class="size-4" />
            {socialSubmitting
              ? $t(i18nKeys.console.authBootstrap.githubSigningIn)
              : $t(i18nKeys.console.authBootstrap.signInWithGithub)}
          </Button>

          <div class="flex items-center gap-3 text-xs text-muted-foreground">
            <span class="h-px flex-1 bg-border"></span>
            <span>{$t(i18nKeys.console.authBootstrap.orContinueWithEmail)}</span>
            <span class="h-px flex-1 bg-border"></span>
          </div>
        {/if}

        <form class="grid gap-5" onsubmit={submitLogin}>
          <label class="appaloft-field-stack">
            <span class="appaloft-field-label">{$t(i18nKeys.console.authBootstrap.loginEmailLabel)}</span>
            <Input bind:value={email} type="email" autocomplete="email" required />
          </label>

          <label class="appaloft-field-stack">
            <span class="appaloft-field-label">{$t(i18nKeys.console.authBootstrap.loginPasswordLabel)}</span>
            <Input bind:value={password} type="password" autocomplete="current-password" required />
          </label>

          <div class="flex flex-wrap items-center gap-3 pt-1">
            <Button type="submit" disabled={!canSubmit}>
              <LogIn class="size-4" />
              {submitting
                ? $t(i18nKeys.console.authBootstrap.signingIn)
                : $t(i18nKeys.console.authBootstrap.signIn)}
            </Button>
            <p class="text-sm text-muted-foreground">
              {$t(i18nKeys.console.authSignup.signUpPrompt)}
              <a class="font-medium text-primary hover:underline" href={`/sign-up?next=${encodeURIComponent(returnTo)}`}>
                {$t(i18nKeys.console.authSignup.signUpLink)}
              </a>
            </p>
          </div>
        </form>
      </div>
    </section>
  </div>
</main>
