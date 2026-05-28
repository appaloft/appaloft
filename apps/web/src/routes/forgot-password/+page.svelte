<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { ArrowLeft, Mail } from "@lucide/svelte";
  import { createQuery, queryOptions } from "@tanstack/svelte-query";
  import type { AuthSessionResponse } from "@appaloft/contracts";
  import appaloftIcon from "@appaloft/design/assets/appaloft-icon-light.svg";
  import { onDestroy, onMount } from "svelte";

  import { buildApiUrl, request } from "$lib/api/client";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { i18nKeys, localeHeaders, t } from "$lib/i18n";

  let email = $state(page.url.searchParams.get("email") ?? "");
  let requestError = $state("");
  let requestMessage = $state("");
  let sending = $state(false);
  let now = $state(Date.now());
  let resendAvailableAt = $state(0);
  let timer: number | undefined;

  const returnTo = $derived(page.url.searchParams.get("next") || "/");
  const authSessionQuery = createQuery(() =>
    queryOptions({
      queryKey: ["system", "auth-session", "forgot-password"],
      queryFn: () => request<AuthSessionResponse>("/api/auth/session"),
      enabled: browser,
      retry: 0,
    }),
  );
  const accountRecovery = $derived(authSessionQuery.data?.accountRecovery);
  const recoveryEnabled = $derived(Boolean(accountRecovery?.enabled));
  const requestPath = $derived(accountRecovery?.requestPath ?? "/api/auth/request-password-reset");
  const cooldownSeconds = $derived(accountRecovery?.cooldownSeconds ?? 60);
  const normalizedEmail = $derived(email.trim().toLowerCase());
  const resendRemainingSeconds = $derived(
    Math.max(0, Math.ceil((resendAvailableAt - now) / 1000)),
  );
  const canSend = $derived(
    recoveryEnabled && normalizedEmail.length > 0 && !sending && resendRemainingSeconds === 0,
  );

  function cooldownStorageKey(emailAddress = normalizedEmail): string {
    return `appaloft.account-recovery-request-at:${emailAddress}`;
  }

  function restoreCooldown(emailAddress = normalizedEmail): void {
    if (!browser || !emailAddress) {
      resendAvailableAt = 0;
      return;
    }

    const storedValue = window.sessionStorage.getItem(cooldownStorageKey(emailAddress));
    const storedTimestamp = storedValue ? Number.parseInt(storedValue, 10) : 0;
    resendAvailableAt =
      Number.isFinite(storedTimestamp) && storedTimestamp > Date.now() ? storedTimestamp : 0;
  }

  function startCooldown(): void {
    resendAvailableAt = Date.now() + cooldownSeconds * 1000;
    if (browser && normalizedEmail) {
      window.sessionStorage.setItem(cooldownStorageKey(normalizedEmail), String(resendAvailableAt));
    }
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

  async function expectOk(response: Response): Promise<void> {
    if (response.ok) {
      return;
    }

    const detail = (await response.text().catch(() => "")).trim();
    throw new Error(errorMessageFromResponseBody(detail) || `${response.status}`);
  }

  async function requestReset(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!canSend) {
      return;
    }

    sending = true;
    requestError = "";
    requestMessage = "";

    try {
      await expectOk(
        await fetch(buildApiUrl(requestPath), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...localeHeaders(),
          },
          body: JSON.stringify({
            email,
            redirectTo: `/reset-password?next=${encodeURIComponent(returnTo)}`,
          }),
        }),
      );
      startCooldown();
      requestMessage = $t(i18nKeys.console.authAccountRecovery.requestSucceeded, { email });
    } catch (error) {
      requestError =
        error instanceof Error ? error.message : $t(i18nKeys.errors.web.unknownRequestFailure);
    } finally {
      sending = false;
    }
  }

  onMount(() => {
    restoreCooldown();
    timer = window.setInterval(() => {
      now = Date.now();
    }, 1000);
  });

  onDestroy(() => {
    if (timer) {
      window.clearInterval(timer);
    }
  });
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.authAccountRecovery.forgotIntroTitle)} · Appaloft</title>
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
          <Mail class="size-5 text-primary" />
          <h1 class="text-2xl font-semibold">
            {$t(i18nKeys.console.authAccountRecovery.forgotIntroTitle)}
          </h1>
        </div>
        <p class="text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.authAccountRecovery.forgotIntroBody)}
        </p>
      </div>

      <div class="mt-7 grid gap-5">
        {#if authSessionQuery.isLoading}
          <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-4 text-sm text-muted-foreground">
            {$t(i18nKeys.console.authAccountRecovery.checking)}
          </div>
        {:else if !recoveryEnabled}
          <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-4 text-sm text-muted-foreground">
            {$t(i18nKeys.console.authAccountRecovery.forgotDisabled)}
          </div>
          <Button href={`/login?next=${encodeURIComponent(returnTo)}`} variant="outline">
            <ArrowLeft class="size-4" />
            {$t(i18nKeys.console.authAccountRecovery.backToLogin)}
          </Button>
        {:else}
          {#if requestMessage}
            <div class="rounded-[calc(var(--radius-lg)-2px)] border border-primary/30 bg-primary/5 p-4 text-sm">
              {requestMessage}
            </div>
          {/if}

          {#if requestError}
            <div class="rounded-[calc(var(--radius-lg)-2px)] border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p class="font-medium">{$t(i18nKeys.console.authAccountRecovery.requestFailed)}</p>
              <p class="mt-1.5 break-words text-muted-foreground">{requestError}</p>
            </div>
          {/if}

          <form class="grid gap-5" onsubmit={requestReset}>
            <label class="appaloft-field-stack">
              <span class="appaloft-field-label">{$t(i18nKeys.console.authAccountRecovery.emailLabel)}</span>
              <Input
                bind:value={email}
                type="email"
                autocomplete="email"
                required
                oninput={() => restoreCooldown()}
              />
            </label>

            <div class="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={!canSend}>
                {#if sending}
                  {$t(i18nKeys.console.authAccountRecovery.requestingReset)}
                {:else if resendRemainingSeconds > 0}
                  {$t(i18nKeys.console.authAccountRecovery.requestCoolingDown, {
                    seconds: resendRemainingSeconds,
                  })}
                {:else}
                  {$t(i18nKeys.console.authAccountRecovery.requestReset)}
                {/if}
              </Button>
              <a class="text-sm font-medium text-primary hover:underline" href={`/login?next=${encodeURIComponent(returnTo)}`}>
                {$t(i18nKeys.console.authAccountRecovery.backToLogin)}
              </a>
            </div>
          </form>
        {/if}
      </div>
    </section>
  </div>
</main>
