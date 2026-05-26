<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Building2, UserPlus } from "@lucide/svelte";
  import { createQuery, queryOptions } from "@tanstack/svelte-query";
  import type { AuthSessionResponse } from "@appaloft/contracts";
  import appaloftIcon from "@appaloft/design/assets/appaloft-icon-light.svg";

  import { startGitHubSignIn } from "$lib/auth-social";
  import { buildApiUrl, request } from "$lib/api/client";
  import { Button } from "$lib/components/ui/button";
  import GitHubIcon from "$lib/components/console/GitHubIcon.svelte";
  import { Input } from "$lib/components/ui/input";
  import { readSessionIdentity } from "$lib/console/utils";
  import { i18nKeys, localeHeaders, t } from "$lib/i18n";

  let displayName = $state("");
  let email = $state("");
  let organizationName = $state("");
  let organizationSlug = $state("");
  let password = $state("");
  let signupError = $state("");
  let submitting = $state(false);
  let socialSubmitting = $state(false);

  const returnTo = $derived(page.url.searchParams.get("next") || "/");
  const authSessionQuery = createQuery(() =>
    queryOptions({
      queryKey: ["system", "auth-session", "sign-up"],
      queryFn: () => request<AuthSessionResponse>("/api/auth/session"),
      enabled: browser,
      retry: 0,
    }),
  );
  const authIdentity = $derived(readSessionIdentity(authSessionQuery.data?.session));
  const githubConfigured = $derived(
    Boolean(authSessionQuery.data?.providers.find((provider) => provider.key === "github")?.configured),
  );
  const resolvedOrganizationSlug = $derived(
    organizationSlug.trim() || slugify(organizationName) || "organization",
  );
  const canSubmit = $derived(
    (Boolean(authIdentity) || (displayName.trim().length > 0 && email.trim().length > 0)) &&
      organizationName.trim().length > 0 &&
      (Boolean(authIdentity) || password.length > 0) &&
      !submitting,
  );

  function slugify(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
  }

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

  async function postJson(path: string, body: Record<string, unknown>): Promise<Response> {
    return fetch(buildApiUrl(path), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...localeHeaders(),
      },
      body: JSON.stringify(body),
    });
  }

  async function expectOk(response: Response): Promise<void> {
    if (response.ok) {
      return;
    }

    const detail = (await response.text().catch(() => "")).trim();
    throw new Error(errorMessageFromResponseBody(detail) || `${response.status}`);
  }

  async function submitSignup(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    submitting = true;
    signupError = "";

    try {
      if (!authIdentity) {
        await expectOk(
          await postJson("/api/auth/sign-up/email", {
            callbackURL: returnTo,
            email,
            name: displayName,
            password,
            rememberMe: true,
          }),
        );
      }

      await expectOk(
        await postJson("/api/auth/organization/create", {
          keepCurrentActiveOrganization: false,
          name: organizationName,
          slug: resolvedOrganizationSlug,
        }),
      );

      if (browser) {
        await goto(returnTo);
      }
    } catch (error) {
      signupError =
        error instanceof Error ? error.message : $t(i18nKeys.errors.web.unknownRequestFailure);
    } finally {
      submitting = false;
    }
  }

  async function submitGitHubSignup(): Promise<void> {
    if (!githubConfigured || socialSubmitting || !browser) {
      return;
    }

    socialSubmitting = true;
    signupError = "";

    try {
      const callbackURL = new URL(
        `/sign-up?next=${encodeURIComponent(returnTo)}&social=github`,
        window.location.origin,
      ).toString();
      await startGitHubSignIn(callbackURL);
    } catch (error) {
      signupError =
        error instanceof Error ? error.message : $t(i18nKeys.errors.web.unknownRequestFailure);
      socialSubmitting = false;
    }
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.authSignup.introTitle)} · Appaloft</title>
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
          <UserPlus class="size-5 text-primary" />
          <h1 class="text-2xl font-semibold">
            {$t(i18nKeys.console.authSignup.introTitle)}
          </h1>
        </div>
        <p class="text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.authSignup.introBody)}
        </p>
      </div>

      <div class="mt-7 grid gap-5">
        {#if signupError}
          <div class="rounded-[calc(var(--radius-lg)-2px)] border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p class="font-medium">{$t(i18nKeys.console.authSignup.createFailed)}</p>
            <p class="mt-1.5 break-words text-muted-foreground">{signupError}</p>
          </div>
        {/if}

        {#if githubConfigured && !authIdentity}
          <Button type="button" variant="outline" class="w-full justify-center" disabled={socialSubmitting} onclick={submitGitHubSignup}>
            <GitHubIcon class="size-4" />
            {socialSubmitting
              ? $t(i18nKeys.console.authBootstrap.githubSigningIn)
              : $t(i18nKeys.console.authSignup.signUpWithGithub)}
          </Button>

          <div class="flex items-center gap-3 text-xs text-muted-foreground">
            <span class="h-px flex-1 bg-border"></span>
            <span>{$t(i18nKeys.console.authBootstrap.orContinueWithEmail)}</span>
            <span class="h-px flex-1 bg-border"></span>
          </div>
        {/if}

        {#if authIdentity}
          <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-4 text-sm">
            <p class="font-medium">{$t(i18nKeys.console.authSignup.githubAccountReady)}</p>
            <p class="mt-1.5 text-muted-foreground">
              {$t(i18nKeys.console.authSignup.githubAccountReadyBody, { identity: authIdentity })}
            </p>
          </div>
        {/if}

        <form class="grid gap-5" onsubmit={submitSignup}>
          {#if !authIdentity}
            <label class="appaloft-field-stack">
              <span class="appaloft-field-label">{$t(i18nKeys.console.authSignup.displayNameLabel)}</span>
              <Input
                bind:value={displayName}
                autocomplete="name"
                placeholder={$t(i18nKeys.console.authSignup.displayNamePlaceholder)}
                required
              />
            </label>

            <label class="appaloft-field-stack">
              <span class="appaloft-field-label">{$t(i18nKeys.console.authSignup.emailLabel)}</span>
              <Input
                bind:value={email}
                type="email"
                autocomplete="email"
                placeholder={$t(i18nKeys.console.authSignup.emailPlaceholder)}
                required
              />
            </label>

            <label class="appaloft-field-stack">
              <span class="appaloft-field-label">{$t(i18nKeys.console.authSignup.passwordLabel)}</span>
              <Input
                bind:value={password}
                type="password"
                autocomplete="new-password"
                placeholder={$t(i18nKeys.console.authSignup.passwordPlaceholder)}
                required
              />
            </label>
          {/if}

          <div class="grid gap-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <label class="appaloft-field-stack">
              <span class="appaloft-field-label">
                {$t(i18nKeys.console.authSignup.organizationNameLabel)}
              </span>
              <Input
                bind:value={organizationName}
                autocomplete="organization"
                placeholder={$t(i18nKeys.console.authSignup.organizationNamePlaceholder)}
                required
              />
            </label>

            <label class="appaloft-field-stack">
              <span class="appaloft-field-label">
                {$t(i18nKeys.console.authSignup.organizationSlugLabel)}
              </span>
              <Input
                bind:value={organizationSlug}
                placeholder={$t(i18nKeys.console.authSignup.organizationSlugPlaceholder)}
              />
            </label>
          </div>

          <div class="flex flex-wrap items-center gap-3 pt-1">
            <Button type="submit" disabled={!canSubmit}>
              <Building2 class="size-4" />
              {submitting
                ? $t(i18nKeys.console.authSignup.creatingAccount)
                : $t(i18nKeys.console.authSignup.createAccount)}
            </Button>
            <p class="text-sm text-muted-foreground">
              {$t(i18nKeys.console.authSignup.loginPrompt)}
              <a class="font-medium text-primary hover:underline" href={`/login?next=${encodeURIComponent(returnTo)}`}>
                {$t(i18nKeys.console.authSignup.loginLink)}
              </a>
            </p>
          </div>
        </form>
      </div>
    </section>
  </div>
</main>
