<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { KeyRound, MailCheck, ShieldCheck } from "@lucide/svelte";
  import { createQuery, queryOptions } from "@tanstack/svelte-query";
  import type { AuthSessionResponse } from "@appaloft/contracts";
  import { onDestroy, onMount } from "svelte";

  import { buildApiUrl, request } from "$lib/api/client";
  import SettingsShell from "$lib/components/console/SettingsShell.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import * as InputOTP from "$lib/components/ui/input-otp";
  import { REGEXP_ONLY_DIGITS } from "$lib/components/ui/input-otp";
  import { accountSettingsItems } from "$lib/console/settings-nav";
  import { i18nKeys, localeHeaders, t } from "$lib/i18n";
  import { queryClient } from "$lib/query-client";

  let currentPassword = $state("");
  let emailOtp = $state("");
  let feedback = $state("");
  let newEmail = $state("");
  let newPassword = $state("");
  let operationError = $state("");
  let passwordDialogOpen = $state(false);
  let emailDialogOpen = $state(false);
  let passwordSubmitting = $state(false);
  let requestEmailSubmitting = $state(false);
  let verifyEmailSubmitting = $state(false);
  let emailChangeStep = $state<"request" | "verify">("request");
  let now = $state(Date.now());
  let emailRequestAvailableAt = $state(0);
  let timer: number | undefined;

  type AccountSecuritySection = "password" | "email";

  const authSessionQuery = createQuery(() =>
    queryOptions({
      queryKey: ["system", "auth-session", "account-security"],
      queryFn: () => request<AuthSessionResponse>("/api/auth/session"),
      enabled: browser,
      retry: 0,
    }),
  );
  const accountSecurity = $derived(authSessionQuery.data?.accountSecurity);
  const emailVerification = $derived(authSessionQuery.data?.emailVerification);
  const passwordState = $derived(accountSecurity?.passwordState ?? "unknown");
  const accountSecurityEnabled = $derived(Boolean(accountSecurity?.enabled));
  const changeEmail = $derived(emailVerification?.changeEmail);
  const changeEmailEnabled = $derived(Boolean(changeEmail?.enabled));
  const changePasswordPath = $derived(
    accountSecurity?.changePasswordPath ?? "/api/auth/change-password",
  );
  const setPasswordPath = $derived(accountSecurity?.setPasswordPath ?? "/api/auth/set-password");
  const requestEmailChangePath = $derived(
    changeEmail?.requestPath ?? "/api/auth/email-otp/request-email-change",
  );
  const verifyEmailChangePath = $derived(
    changeEmail?.verifyPath ?? "/api/auth/email-otp/change-email",
  );
  const otpLength = $derived(emailVerification?.otpLength ?? 6);
  const normalizedNewEmail = $derived(newEmail.trim().toLowerCase());
  const emailRequestRemainingSeconds = $derived(
    Math.max(0, Math.ceil((emailRequestAvailableAt - now) / 1000)),
  );
  const canSubmitPassword = $derived(
    accountSecurityEnabled &&
      newPassword.length > 0 &&
      !passwordSubmitting &&
      (passwordState === "not-set" || currentPassword.length > 0),
  );
  const canRequestEmailChange = $derived(
    accountSecurityEnabled &&
      changeEmailEnabled &&
      normalizedNewEmail.length > 0 &&
      !requestEmailSubmitting &&
      emailRequestRemainingSeconds === 0,
  );
  const canVerifyEmailChange = $derived(
    accountSecurityEnabled &&
      changeEmailEnabled &&
      normalizedNewEmail.length > 0 &&
      emailOtp.trim().length === otpLength &&
      !verifyEmailSubmitting,
  );
  const activeSection = $derived(parseAccountSecuritySection(page.url.searchParams.get("section")));

  function parseAccountSecuritySection(value: string | null): AccountSecuritySection {
    return value === "email" ? "email" : "password";
  }

  function accountSecuritySectionHref(section: AccountSecuritySection): string {
    const params = new URLSearchParams(page.url.searchParams);

    if (section === "password") {
      params.delete("section");
    } else {
      params.set("section", section);
    }

    const search = params.toString();
    return `${page.url.pathname}${search ? `?${search}` : ""}`;
  }

  function selectAccountSecuritySection(section: AccountSecuritySection, event: MouseEvent): void {
    event.preventDefault();
    void goto(accountSecuritySectionHref(section), { noScroll: true, keepFocus: true });
  }

  function emailChangeCooldownStorageKey(emailAddress = normalizedNewEmail): string {
    return `appaloft.email-change-request-at:${emailAddress}`;
  }

  function restoreEmailChangeCooldown(emailAddress = normalizedNewEmail): void {
    if (!browser || !emailAddress) {
      emailRequestAvailableAt = 0;
      return;
    }

    const storedValue = window.sessionStorage.getItem(emailChangeCooldownStorageKey(emailAddress));
    const storedTimestamp = storedValue ? Number.parseInt(storedValue, 10) : 0;
    emailRequestAvailableAt =
      Number.isFinite(storedTimestamp) && storedTimestamp > Date.now() ? storedTimestamp : 0;
  }

  function startEmailChangeCooldown(): void {
    emailRequestAvailableAt =
      Date.now() + (changeEmail?.cooldownSeconds ?? emailVerification?.cooldownSeconds ?? 60) * 1000;
    if (browser && normalizedNewEmail) {
      window.sessionStorage.setItem(
        emailChangeCooldownStorageKey(normalizedNewEmail),
        String(emailRequestAvailableAt),
      );
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

  async function submitPassword(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!canSubmitPassword) {
      return;
    }

    passwordSubmitting = true;
    feedback = "";
    operationError = "";

    try {
      if (passwordState === "not-set") {
        await expectOk(
          await postJson(setPasswordPath, {
            newPassword,
          }),
        );
        feedback = $t(i18nKeys.console.authAccountSecurity.passwordSet);
      } else {
        await expectOk(
          await postJson(changePasswordPath, {
            currentPassword,
            newPassword,
            revokeOtherSessions: false,
          }),
        );
        feedback = $t(i18nKeys.console.authAccountSecurity.passwordChanged);
      }

      currentPassword = "";
      newPassword = "";
      passwordDialogOpen = false;
      void queryClient.invalidateQueries({ queryKey: ["system", "auth-session"] });
    } catch (error) {
      operationError =
        error instanceof Error ? error.message : $t(i18nKeys.errors.web.unknownRequestFailure);
    } finally {
      passwordSubmitting = false;
    }
  }

  async function requestEmailChange(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!canRequestEmailChange) {
      return;
    }

    requestEmailSubmitting = true;
    feedback = "";
    operationError = "";

    try {
      await expectOk(
        await postJson(requestEmailChangePath, {
          newEmail,
        }),
      );
      startEmailChangeCooldown();
      feedback = $t(i18nKeys.console.authAccountSecurity.emailChangeRequested, { email: newEmail });
      emailOtp = "";
      emailChangeStep = "verify";
    } catch (error) {
      operationError =
        error instanceof Error ? error.message : $t(i18nKeys.errors.web.unknownRequestFailure);
    } finally {
      requestEmailSubmitting = false;
    }
  }

  async function verifyEmailChange(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!canVerifyEmailChange) {
      return;
    }

    verifyEmailSubmitting = true;
    feedback = "";
    operationError = "";

    try {
      await expectOk(
        await postJson(verifyEmailChangePath, {
          newEmail,
          otp: emailOtp,
        }),
      );
      feedback = $t(i18nKeys.console.authAccountSecurity.emailChangeSucceeded, {
        email: newEmail,
      });
      emailOtp = "";
      newEmail = "";
      emailDialogOpen = false;
      void queryClient.invalidateQueries({ queryKey: ["system", "auth-session"] });
    } catch (error) {
      operationError =
        error instanceof Error ? error.message : $t(i18nKeys.errors.web.unknownRequestFailure);
    } finally {
      verifyEmailSubmitting = false;
    }
  }

  onMount(() => {
    restoreEmailChangeCooldown();
    timer = window.setInterval(() => {
      now = Date.now();
    }, 1000);
  });

  onDestroy(() => {
    if (timer) {
      window.clearInterval(timer);
    }
  });

  function openPasswordDialog(): void {
    currentPassword = "";
    newPassword = "";
    operationError = "";
    feedback = "";
    passwordDialogOpen = true;
  }

  function openEmailDialog(): void {
    operationError = "";
    feedback = "";
    emailOtp = "";
    newEmail = "";
    restoreEmailChangeCooldown();
    emailChangeStep = "request";
    emailDialogOpen = true;
  }

  function editRequestedEmail(): void {
    feedback = "";
    operationError = "";
    emailOtp = "";
    emailChangeStep = "request";
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.authAccountSecurity.introTitle)} · Appaloft</title>
</svelte:head>

<SettingsShell
  title={$t(i18nKeys.console.authAccountSecurity.introTitle)}
  description={$t(i18nKeys.console.authAccountSecurity.introBody)}
  groupLabel={$t(i18nKeys.console.accountSettings.introTitle)}
  activePath="/account/security"
  items={accountSettingsItems()}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.workspace), href: "/" },
    { label: $t(i18nKeys.console.accountSettings.introTitle), href: "/account/profile" },
    { label: $t(i18nKeys.console.authAccountSecurity.introTitle) },
  ]}
>
  <div class="console-subnav-layout">
    <aside class="console-subnav">
      <p class="console-subnav-kicker">
        {$t(i18nKeys.console.authAccountSecurity.introTitle)}
      </p>
      <nav class="console-subnav-list" aria-label={$t(i18nKeys.console.authAccountSecurity.introTitle)}>
        <a
          href={accountSecuritySectionHref("password")}
          onclick={(event) => selectAccountSecuritySection("password", event)}
          aria-current={activeSection === "password" ? "page" : undefined}
          class="console-subnav-item"
        >
          <KeyRound class="console-subnav-item-icon" />
          <span class="console-subnav-item-title">
            {passwordState === "not-set"
              ? $t(i18nKeys.console.authAccountSecurity.setPasswordTitle)
              : $t(i18nKeys.console.authAccountSecurity.changePasswordTitle)}
          </span>
        </a>

        <a
          href={accountSecuritySectionHref("email")}
          onclick={(event) => selectAccountSecuritySection("email", event)}
          aria-current={activeSection === "email" ? "page" : undefined}
          class="console-subnav-item"
        >
          <MailCheck class="console-subnav-item-icon" />
          <span class="console-subnav-item-title">
            {$t(i18nKeys.console.authAccountSecurity.changeEmailTitle)}
          </span>
        </a>
      </nav>
    </aside>

    <div class="console-subnav-content">
      {#if feedback && !passwordDialogOpen && !emailDialogOpen}
        <div class="rounded-[calc(var(--radius-lg)-2px)] border border-primary/30 bg-primary/5 p-4 text-sm">
          {feedback}
        </div>
      {/if}

      {#if activeSection === "password"}
        <section class="console-panel space-y-5 p-5" data-account-security-password-summary>
          <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div class="flex items-start gap-3">
              <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-2">
                <KeyRound class="size-5 text-primary" />
              </div>
              <div class="min-w-0 space-y-1">
                <h2 class="text-base font-semibold">
                  {passwordState === "not-set"
                    ? $t(i18nKeys.console.authAccountSecurity.setPasswordTitle)
                    : $t(i18nKeys.console.authAccountSecurity.changePasswordTitle)}
                </h2>
                <p class="text-sm leading-6 text-muted-foreground">
                  {passwordState === "not-set"
                    ? $t(i18nKeys.console.authAccountSecurity.passwordNotSetBody)
                    : $t(i18nKeys.console.authAccountSecurity.changePasswordBody)}
                </p>
              </div>
            </div>
            <Button
              type="button"
              class="w-fit shrink-0"
              disabled={authSessionQuery.isPending || !accountSecurityEnabled}
              onclick={openPasswordDialog}
            >
              <ShieldCheck class="size-4" />
              {passwordState === "not-set"
                ? $t(i18nKeys.console.authAccountSecurity.setPassword)
                : $t(i18nKeys.console.authAccountSecurity.updatePassword)}
            </Button>
          </div>

          {#if authSessionQuery.isLoading}
            <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-4 text-sm text-muted-foreground">
              {$t(i18nKeys.console.authAccountSecurity.checking)}
            </div>
          {:else if !accountSecurityEnabled}
            <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-4 text-sm text-muted-foreground">
              {$t(i18nKeys.console.authAccountSecurity.securityDisabled)}
            </div>
          {:else}
            <dl class="grid gap-4 sm:grid-cols-2">
              <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/20 p-4">
                <dt class="text-xs font-medium text-muted-foreground">
                  {$t(i18nKeys.common.domain.status)}
                </dt>
                <dd class="mt-2">
                  <Badge variant={passwordState === "set" ? "outline" : "secondary"}>
                    {#if passwordState === "set"}
                      {$t(i18nKeys.common.status.configured)}
                    {:else if passwordState === "not-set"}
                      {$t(i18nKeys.common.status.notConfigured)}
                    {:else}
                      {$t(i18nKeys.common.status.unknown)}
                    {/if}
                  </Badge>
                </dd>
              </div>
              <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/20 p-4">
                <dt class="text-xs font-medium text-muted-foreground">
                  {$t(i18nKeys.common.domain.source)}
                </dt>
                <dd class="mt-1 text-sm font-medium">
                  {$t(i18nKeys.console.authAccountSecurity.introTitle)}
                </dd>
              </div>
            </dl>
          {/if}
        </section>
      {:else}
        <section class="console-panel space-y-5 p-5" data-account-security-email-summary>
          <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div class="flex items-start gap-3">
              <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-2">
                <MailCheck class="size-5 text-primary" />
              </div>
              <div class="min-w-0 space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="text-base font-semibold">
                    {$t(i18nKeys.console.authAccountSecurity.changeEmailTitle)}
                  </h2>
                  <Badge variant={changeEmailEnabled ? "outline" : "secondary"}>
                    {changeEmailEnabled
                      ? $t(i18nKeys.common.status.configured)
                      : $t(i18nKeys.common.status.notConfigured)}
                  </Badge>
                </div>
                <p class="text-sm leading-6 text-muted-foreground">
                  {$t(i18nKeys.console.authAccountSecurity.changeEmailBody)}
                </p>
              </div>
            </div>
            <Button
              type="button"
              class="w-fit shrink-0"
              disabled={authSessionQuery.isPending || !changeEmailEnabled}
              onclick={openEmailDialog}
            >
              <MailCheck class="size-4" />
              {$t(i18nKeys.console.authAccountSecurity.changeEmail)}
            </Button>
          </div>

          {#if authSessionQuery.isLoading}
            <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-4 text-sm text-muted-foreground">
              {$t(i18nKeys.console.authAccountSecurity.checking)}
            </div>
          {:else if !changeEmailEnabled}
            <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-4 text-sm text-muted-foreground">
              {$t(i18nKeys.console.authAccountSecurity.changeEmailDisabled)}
            </div>
          {:else}
            <dl class="grid gap-4 sm:grid-cols-3">
              <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/20 p-4">
                <dt class="text-xs font-medium text-muted-foreground">
                  {$t(i18nKeys.common.domain.status)}
                </dt>
                <dd class="mt-2">
                  <Badge variant="outline">{$t(i18nKeys.common.status.configured)}</Badge>
                </dd>
              </div>
              <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/20 p-4">
                <dt class="text-xs font-medium text-muted-foreground">
                  {$t(i18nKeys.console.authAccountSecurity.codeLabel)}
                </dt>
                <dd class="mt-1 text-sm font-medium">{otpLength}</dd>
              </div>
              <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/20 p-4">
                <dt class="text-xs font-medium text-muted-foreground">
                  {$t(i18nKeys.common.domain.source)}
                </dt>
                <dd class="mt-1 text-sm font-medium">
                  {$t(i18nKeys.console.authAccountSecurity.introTitle)}
                </dd>
              </div>
            </dl>
          {/if}
        </section>
      {/if}
    </div>
  </div>

  <Dialog.Root bind:open={passwordDialogOpen}>
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
      <Dialog.Header>
        <Dialog.Title>
          {passwordState === "not-set"
            ? $t(i18nKeys.console.authAccountSecurity.setPasswordTitle)
            : $t(i18nKeys.console.authAccountSecurity.changePasswordTitle)}
        </Dialog.Title>
        <Dialog.Description>
          {passwordState === "not-set"
            ? $t(i18nKeys.console.authAccountSecurity.passwordNotSetBody)
            : $t(i18nKeys.console.authAccountSecurity.changePasswordBody)}
        </Dialog.Description>
      </Dialog.Header>

      <form class="grid gap-4 px-5 pb-5" onsubmit={submitPassword} data-account-security-password-dialog>
        {#if passwordState !== "not-set"}
          <label class="appaloft-field-stack">
            <span class="appaloft-field-label">
              {$t(i18nKeys.console.authAccountSecurity.currentPasswordLabel)}
            </span>
            <Input bind:value={currentPassword} type="password" autocomplete="current-password" required />
          </label>
        {/if}

        <label class="appaloft-field-stack">
          <span class="appaloft-field-label">
            {$t(i18nKeys.console.authAccountSecurity.newPasswordLabel)}
          </span>
          <Input bind:value={newPassword} type="password" autocomplete="new-password" required />
        </label>

        {#if operationError}
          <div class="rounded-[calc(var(--radius-lg)-2px)] border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p class="font-medium">{$t(i18nKeys.console.authAccountSecurity.operationFailed)}</p>
            <p class="mt-1.5 break-words text-muted-foreground">{operationError}</p>
          </div>
        {/if}

        <Dialog.Footer class="border-t pt-5">
          <Button type="button" variant="outline" onclick={() => (passwordDialogOpen = false)}>
            {$t(i18nKeys.common.actions.cancel)}
          </Button>
          <Button type="submit" disabled={!canSubmitPassword}>
            <ShieldCheck class="size-4" />
            {#if passwordSubmitting}
              {$t(i18nKeys.console.authAccountSecurity.updatingPassword)}
            {:else if passwordState === "not-set"}
              {$t(i18nKeys.console.authAccountSecurity.setPassword)}
            {:else}
              {$t(i18nKeys.console.authAccountSecurity.updatePassword)}
            {/if}
          </Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  </Dialog.Root>

  <Dialog.Root bind:open={emailDialogOpen}>
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
      <Dialog.Header>
        <Dialog.Title>{$t(i18nKeys.console.authAccountSecurity.changeEmailTitle)}</Dialog.Title>
        <Dialog.Description>{$t(i18nKeys.console.authAccountSecurity.changeEmailBody)}</Dialog.Description>
      </Dialog.Header>

      <div class="grid gap-4 px-5 pb-5" data-account-security-email-dialog>
        {#if feedback}
          <div class="rounded-[calc(var(--radius-lg)-2px)] border border-primary/30 bg-primary/5 p-4 text-sm">
            {feedback}
          </div>
        {/if}

        {#if operationError}
          <div class="rounded-[calc(var(--radius-lg)-2px)] border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p class="font-medium">{$t(i18nKeys.console.authAccountSecurity.operationFailed)}</p>
            <p class="mt-1.5 break-words text-muted-foreground">{operationError}</p>
          </div>
        {/if}

        {#if emailChangeStep === "request"}
          <form class="grid gap-4" onsubmit={requestEmailChange} data-account-security-email-request-form>
            <label class="appaloft-field-stack">
              <span class="appaloft-field-label">
                {$t(i18nKeys.console.authAccountSecurity.newEmailLabel)}
              </span>
              <Input
                bind:value={newEmail}
                type="email"
                autocomplete="email"
                required
                oninput={() => restoreEmailChangeCooldown()}
              />
            </label>

            <Dialog.Footer class="border-t pt-5">
              <Button type="button" variant="outline" onclick={() => (emailDialogOpen = false)}>
                {$t(i18nKeys.common.actions.cancel)}
              </Button>
              <Button type="submit" disabled={!canRequestEmailChange}>
                {#if requestEmailSubmitting}
                  {$t(i18nKeys.console.authAccountSecurity.requestingCode)}
                {:else if emailRequestRemainingSeconds > 0}
                  {$t(i18nKeys.console.authAccountSecurity.requestCoolingDown, {
                    seconds: emailRequestRemainingSeconds,
                  })}
                {:else}
                  {$t(i18nKeys.console.authAccountSecurity.requestCode)}
                {/if}
              </Button>
            </Dialog.Footer>
          </form>
        {:else}
          <form class="grid gap-4" onsubmit={verifyEmailChange} data-account-security-email-verify-form>
            <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-3 text-sm">
              <p class="text-xs text-muted-foreground">
                {$t(i18nKeys.console.authAccountSecurity.newEmailLabel)}
              </p>
              <p class="mt-1 break-all font-medium">{normalizedNewEmail}</p>
            </div>

            <label class="appaloft-field-stack">
              <span class="appaloft-field-label">
                {$t(i18nKeys.console.authAccountSecurity.codeLabel)}
              </span>
              <InputOTP.Root
                bind:value={emailOtp}
                maxlength={otpLength}
                pattern={REGEXP_ONLY_DIGITS}
                inputmode="numeric"
                autocomplete="one-time-code"
                pasteTransformer={(text) => text.replace(/\D/g, "").slice(0, otpLength)}
                aria-label={$t(i18nKeys.console.authAccountSecurity.codeLabel)}
                required
              >
                {#snippet children({ cells })}
                  <InputOTP.Group>
                    {#each cells as cell}
                      <InputOTP.Slot {cell} />
                    {/each}
                  </InputOTP.Group>
                {/snippet}
              </InputOTP.Root>
            </label>

            <Dialog.Footer class="border-t pt-5">
              <Button type="button" variant="outline" onclick={editRequestedEmail}>
                {$t(i18nKeys.console.authEmailVerification.changeEmail)}
              </Button>
              <Button type="button" variant="outline" onclick={() => (emailDialogOpen = false)}>
                {$t(i18nKeys.common.actions.cancel)}
              </Button>
              <Button type="submit" disabled={!canVerifyEmailChange}>
                {verifyEmailSubmitting
                  ? $t(i18nKeys.console.authAccountSecurity.verifyingEmailChange)
                  : $t(i18nKeys.console.authAccountSecurity.verifyEmailChange)}
              </Button>
            </Dialog.Footer>
          </form>
        {/if}
      </div>
    </Dialog.Content>
  </Dialog.Root>
</SettingsShell>
