<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { KeyRound, MailCheck } from "@lucide/svelte";
  import { createQuery, queryOptions } from "@tanstack/svelte-query";
  import type { AuthSessionResponse } from "@appaloft/contracts";
  import appaloftIcon from "@appaloft/design/assets/appaloft-icon-light.svg";
  import { onMount } from "svelte";

  import { buildApiUrl, request } from "$lib/api/client";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { i18nKeys, localeHeaders, t } from "$lib/i18n";

  type PendingEmailVerification = {
    email?: string;
    next?: string;
    organizationName?: string;
    organizationSlug?: string;
  };

  let email = $state(page.url.searchParams.get("email") ?? "");
  let otp = $state("");
  let requestMessage = $state("");
  let requestError = $state("");
  let verifyError = $state("");
  let sending = $state(false);
  let verifying = $state(false);

  const returnTo = $derived(page.url.searchParams.get("next") || "/");
  const canSend = $derived(email.trim().length > 0 && !sending);
  const canVerify = $derived(email.trim().length > 0 && otp.trim().length > 0 && !verifying);
  const authSessionQuery = createQuery(() =>
    queryOptions({
      queryKey: ["system", "auth-session", "verify-email"],
      queryFn: () => request<AuthSessionResponse>("/api/auth/session"),
      enabled: browser,
      retry: 0,
    }),
  );
  const emailVerificationEnabled = $derived(
    Boolean(
      authSessionQuery.data?.emailVerification.required &&
        authSessionQuery.data?.emailVerification.otpEnabled,
    ),
  );

  function readPendingVerification(): PendingEmailVerification {
    if (!browser) {
      return {};
    }

    try {
      const parsed = JSON.parse(
        window.sessionStorage.getItem("appaloft.pending-email-verification") ?? "{}",
      ) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as PendingEmailVerification) : {};
    } catch {
      return {};
    }
  }

  function clearPendingVerification(): void {
    if (browser) {
      window.sessionStorage.removeItem("appaloft.pending-email-verification");
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

  async function sendCode(event?: SubmitEvent): Promise<void> {
    event?.preventDefault();
    if (!canSend) {
      return;
    }

    sending = true;
    requestError = "";
    requestMessage = "";

    try {
      await expectOk(
        await postJson("/api/auth/email-otp/send-verification-otp", {
          email,
          type: "email-verification",
        }),
      );
      requestMessage = $t(i18nKeys.console.authEmailVerification.requestSucceeded, { email });
    } catch (error) {
      requestError =
        error instanceof Error ? error.message : $t(i18nKeys.errors.web.unknownRequestFailure);
    } finally {
      sending = false;
    }
  }

  async function finishPendingOrganization(): Promise<void> {
    const pending = readPendingVerification();
    if (!pending.organizationName) {
      return;
    }

    await expectOk(
      await postJson("/api/auth/organization/create", {
        keepCurrentActiveOrganization: false,
        name: pending.organizationName,
        slug: pending.organizationSlug || "organization",
      }),
    );
  }

  async function verifyCode(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!canVerify) {
      return;
    }

    verifying = true;
    verifyError = "";

    try {
      await expectOk(
        await postJson("/api/auth/email-otp/verify-email", {
          email,
          otp,
        }),
      );
      await finishPendingOrganization();
      clearPendingVerification();

      if (browser) {
        await goto(returnTo);
      }
    } catch (error) {
      verifyError =
        error instanceof Error ? error.message : $t(i18nKeys.errors.web.unknownRequestFailure);
    } finally {
      verifying = false;
    }
  }

  onMount(() => {
    const pending = readPendingVerification();
    if (!email && pending.email) {
      email = pending.email;
    }
  });
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.authEmailVerification.introTitle)} · Appaloft</title>
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
          <MailCheck class="size-5 text-primary" />
          <h1 class="text-2xl font-semibold">
            {$t(i18nKeys.console.authEmailVerification.introTitle)}
          </h1>
        </div>
        <p class="text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.authEmailVerification.introBody)}
        </p>
      </div>

      <div class="mt-7 grid gap-5">
        {#if authSessionQuery.isLoading}
          <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-4 text-sm text-muted-foreground">
            {$t(i18nKeys.console.authEmailVerification.checking)}
          </div>
        {:else if !emailVerificationEnabled}
          <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-4 text-sm text-muted-foreground">
            {$t(i18nKeys.console.authEmailVerification.verificationDisabled)}
          </div>
          <Button type="button" onclick={() => goto(returnTo)}>
            {$t(i18nKeys.console.authEmailVerification.continueToConsole)}
          </Button>
        {:else}
          {#if requestMessage}
            <div class="rounded-[calc(var(--radius-lg)-2px)] border border-primary/30 bg-primary/5 p-4 text-sm">
              {requestMessage}
            </div>
          {/if}

          {#if requestError}
            <div class="rounded-[calc(var(--radius-lg)-2px)] border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p class="font-medium">{$t(i18nKeys.console.authEmailVerification.requestFailed)}</p>
              <p class="mt-1.5 break-words text-muted-foreground">{requestError}</p>
            </div>
          {/if}

          {#if verifyError}
            <div class="rounded-[calc(var(--radius-lg)-2px)] border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p class="font-medium">{$t(i18nKeys.console.authEmailVerification.verifyFailed)}</p>
              <p class="mt-1.5 break-words text-muted-foreground">{verifyError}</p>
            </div>
          {/if}

          <form class="grid gap-5" onsubmit={sendCode}>
            <label class="appaloft-field-stack">
              <span class="appaloft-field-label">{$t(i18nKeys.console.authEmailVerification.emailLabel)}</span>
              <Input bind:value={email} type="email" autocomplete="email" required />
            </label>

            <div class="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="outline" disabled={!canSend}>
                {sending
                  ? $t(i18nKeys.console.authEmailVerification.sendingCode)
                  : $t(i18nKeys.console.authEmailVerification.requestCode)}
              </Button>
              <a class="text-sm font-medium text-primary hover:underline" href={`/sign-up?next=${encodeURIComponent(returnTo)}`}>
                {$t(i18nKeys.console.authEmailVerification.changeEmail)}
              </a>
            </div>
          </form>

          <form class="grid gap-5 border-t pt-5" onsubmit={verifyCode}>
            <label class="appaloft-field-stack">
              <span class="appaloft-field-label">{$t(i18nKeys.console.authEmailVerification.codeLabel)}</span>
              <Input
                bind:value={otp}
                inputmode="numeric"
                autocomplete="one-time-code"
                placeholder={$t(i18nKeys.console.authEmailVerification.codePlaceholder)}
                required
              />
              <span class="text-xs text-muted-foreground">
                {$t(i18nKeys.console.authEmailVerification.codeHelp)}
              </span>
            </label>

            <Button type="submit" disabled={!canVerify}>
              <KeyRound class="size-4" />
              {verifying
                ? $t(i18nKeys.console.authEmailVerification.verifying)
                : $t(i18nKeys.console.authEmailVerification.verify)}
            </Button>
          </form>
        {/if}
      </div>
    </section>
  </div>
</main>
