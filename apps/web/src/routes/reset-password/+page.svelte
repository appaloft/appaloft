<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { ArrowLeft, KeyRound } from "@lucide/svelte";
  import { createQuery, queryOptions } from "@tanstack/svelte-query";
  import type { AuthSessionResponse } from "@appaloft/contracts";
  import appaloftIcon from "@appaloft/design/assets/appaloft-icon-light.svg";

  import { buildApiUrl, request } from "$lib/api/client";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { i18nKeys, localeHeaders, t } from "$lib/i18n";

  let password = $state("");
  let resetError = $state("");
  let resetMessage = $state("");
  let resetting = $state(false);

  const returnTo = $derived(page.url.searchParams.get("next") || "/");
  const token = $derived(page.url.searchParams.get("token") ?? "");
  const authSessionQuery = createQuery(() =>
    queryOptions({
      queryKey: ["system", "auth-session", "reset-password"],
      queryFn: () => request<AuthSessionResponse>("/api/auth/session"),
      enabled: browser,
      retry: 0,
    }),
  );
  const accountRecovery = $derived(authSessionQuery.data?.accountRecovery);
  const recoveryEnabled = $derived(Boolean(accountRecovery?.enabled));
  const resetPath = $derived(accountRecovery?.resetPath ?? "/api/auth/reset-password");
  const canReset = $derived(recoveryEnabled && token.length > 0 && password.length > 0 && !resetting);

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

  async function expectOk(response: Response): Promise<void> {
    if (response.ok) {
      return;
    }

    const detail = (await response.text().catch(() => "")).trim();
    throw new Error(errorMessageFromResponseBody(detail) || `${response.status}`);
  }

  async function resetPassword(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!canReset) {
      return;
    }

    resetting = true;
    resetError = "";
    resetMessage = "";

    try {
      await expectOk(
        await fetch(buildApiUrl(resetPath), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...localeHeaders(),
          },
          body: JSON.stringify({
            newPassword: password,
            token,
          }),
        }),
      );
      password = "";
      resetMessage = $t(i18nKeys.console.authAccountRecovery.resetSucceeded);
    } catch (error) {
      resetError =
        error instanceof Error ? error.message : $t(i18nKeys.errors.web.unknownRequestFailure);
    } finally {
      resetting = false;
    }
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.authAccountRecovery.resetIntroTitle)} · Appaloft</title>
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
          <KeyRound class="size-5 text-primary" />
          <h1 class="text-2xl font-semibold">
            {$t(i18nKeys.console.authAccountRecovery.resetIntroTitle)}
          </h1>
        </div>
        <p class="text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.authAccountRecovery.resetIntroBody)}
        </p>
      </div>

      <div class="mt-7 grid gap-5">
        {#if authSessionQuery.isLoading}
          <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-4 text-sm text-muted-foreground">
            {$t(i18nKeys.console.authAccountRecovery.checking)}
          </div>
        {:else if !recoveryEnabled}
          <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-4 text-sm text-muted-foreground">
            {$t(i18nKeys.console.authAccountRecovery.resetDisabled)}
          </div>
          <Button href={`/login?next=${encodeURIComponent(returnTo)}`} variant="outline">
            <ArrowLeft class="size-4" />
            {$t(i18nKeys.console.authAccountRecovery.backToLogin)}
          </Button>
        {:else if !token}
          <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-4 text-sm text-muted-foreground">
            {$t(i18nKeys.console.authAccountRecovery.tokenMissing)}
          </div>
          <Button href={`/forgot-password?next=${encodeURIComponent(returnTo)}`} variant="outline">
            {$t(i18nKeys.console.authAccountRecovery.requestReset)}
          </Button>
        {:else}
          {#if resetMessage}
            <div class="rounded-[calc(var(--radius-lg)-2px)] border border-primary/30 bg-primary/5 p-4 text-sm">
              {resetMessage}
            </div>
          {/if}

          {#if resetError}
            <div class="rounded-[calc(var(--radius-lg)-2px)] border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p class="font-medium">{$t(i18nKeys.console.authAccountRecovery.resetFailed)}</p>
              <p class="mt-1.5 break-words text-muted-foreground">{resetError}</p>
            </div>
          {/if}

          <form class="grid gap-5" onsubmit={resetPassword}>
            <label class="appaloft-field-stack">
              <span class="appaloft-field-label">{$t(i18nKeys.console.authAccountRecovery.newPasswordLabel)}</span>
              <Input
                bind:value={password}
                type="password"
                autocomplete="new-password"
                placeholder={$t(i18nKeys.console.authAccountRecovery.newPasswordPlaceholder)}
                required
              />
            </label>

            <div class="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={!canReset}>
                <KeyRound class="size-4" />
                {resetting
                  ? $t(i18nKeys.console.authAccountRecovery.resettingPassword)
                  : $t(i18nKeys.console.authAccountRecovery.resetPassword)}
              </Button>
              {#if resetMessage}
                <Button type="button" variant="outline" onclick={() => goto(`/login?next=${encodeURIComponent(returnTo)}`)}>
                  {$t(i18nKeys.console.authBootstrap.signIn)}
                </Button>
              {/if}
            </div>
          </form>
        {/if}
      </div>
    </section>
  </div>
</main>
