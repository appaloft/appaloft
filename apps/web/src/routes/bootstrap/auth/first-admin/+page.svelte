<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { CheckCircle2, KeyRound, ShieldCheck } from "@lucide/svelte";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";
  import appaloftIcon from "@appaloft/design/assets/appaloft-icon-light.svg";

  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import { readErrorMessage } from "$lib/api/client";
  import { queryClient } from "$lib/query-client";
  import { orpc, orpcClient } from "$lib/orpc";
  import { i18nKeys, t } from "$lib/i18n";

  let email = $state("");
  let displayName = $state("");
  let password = $state("");
  let organizationName = $state("");
  let organizationSlug = $state("");
  let feedback = $state<{ kind: "error" | "success"; title: string; detail?: string } | null>(
    null,
  );
  let createdResult = $state<Awaited<ReturnType<typeof orpcClient.auth.bootstrapFirstAdmin>> | null>(
    null,
  );

  const statusQuery = createQuery(() =>
    orpc.auth.bootstrapStatus.queryOptions({
      input: {},
      enabled: browser,
      retry: 0,
    }),
  );
  const bootstrapMutation = createMutation(() => ({
    mutationFn: () =>
      orpcClient.auth.bootstrapFirstAdmin({
        email,
        displayName,
        ...(password.trim() ? { password } : {}),
        ...(organizationName.trim() ? { organizationName } : {}),
        ...(organizationSlug.trim() ? { organizationSlug } : {}),
      }),
    onSuccess: (result) => {
      createdResult = result;
      password = "";
      feedback = {
        kind: "success",
        title: $t(i18nKeys.console.authBootstrap.bootstrapSucceeded),
        detail: result.email,
      };
      void queryClient.invalidateQueries({
        queryKey: orpc.auth.bootstrapStatus.key({ input: {} }),
      });
    },
    onError: (error) => {
      feedback = {
        kind: "error",
        title: $t(i18nKeys.console.authBootstrap.bootstrapFailed),
        detail: readErrorMessage(error),
      };
    },
  }));

  const status = $derived(statusQuery.data ?? null);
  const loginUrl = $derived(createdResult?.loginUrl ?? status?.loginUrl ?? "/login");
  const setupComplete = $derived(Boolean(createdResult) || status?.bootstrapRequired === false);
  const canSubmit = $derived(
    email.trim().length > 0 &&
      displayName.trim().length > 0 &&
      !bootstrapMutation.isPending &&
      status?.bootstrapRequired === true,
  );

  $effect(() => {
    if (browser && !createdResult && status?.bootstrapRequired === false) {
      void goto(loginUrl);
    }
  });

  function submitFirstAdmin(event: SubmitEvent): void {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    bootstrapMutation.mutate();
  }

  function openLogin(): void {
    if (!browser) {
      return;
    }

    const url = new URL(loginUrl, window.location.origin);
    const currentIsLocal =
      window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const targetIsLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";

    if (url.origin === window.location.origin || (currentIsLocal && targetIsLocal)) {
      window.location.assign(`${window.location.origin}${url.pathname}${url.search}${url.hash}`);
      return;
    }

    window.location.assign(url.toString());
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.authBootstrap.setupPageTitle)} · Appaloft</title>
</svelte:head>

<main class="min-h-screen bg-background p-4 text-foreground md:p-8">
  <div class="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-5xl items-center justify-center md:min-h-[calc(100vh-4rem)]">
    <section class="grid w-full overflow-hidden rounded-lg border bg-card shadow-sm lg:grid-cols-[0.9fr_1.1fr]">
      <div class="border-b bg-muted/35 p-6 lg:border-r lg:border-b-0 lg:p-8">
        <div class="flex items-center gap-3">
          <img src={appaloftIcon} alt={$t(i18nKeys.common.app.productName)} class="size-8" />
          <div>
            <p class="text-sm font-medium">{$t(i18nKeys.common.app.productName)}</p>
            <p class="text-xs text-muted-foreground">
              {$t(i18nKeys.console.authBootstrap.introKicker)}
            </p>
          </div>
        </div>

        <div class="mt-10 space-y-4">
          <Badge variant="outline" class="w-fit">
            {setupComplete
              ? $t(i18nKeys.console.authBootstrap.statusComplete)
              : $t(i18nKeys.console.authBootstrap.statusRequired)}
          </Badge>
          <div class="space-y-3">
            <h1 class="max-w-md text-3xl font-semibold tracking-tight">
              {$t(i18nKeys.console.authBootstrap.introTitle)}
            </h1>
            <p class="max-w-md text-sm leading-6 text-muted-foreground">
              {$t(i18nKeys.console.authBootstrap.introBody)}
            </p>
          </div>
        </div>

        <div class="mt-8 grid gap-3">
          <div class="rounded-md border bg-background/70 p-4">
            <div class="flex items-start gap-3">
              <KeyRound class="mt-0.5 size-4 text-primary" />
              <div>
                <p class="text-sm font-medium">
                  {$t(i18nKeys.console.authBootstrap.localPasswordBadge)}
                </p>
                <p class="mt-1 text-sm leading-6 text-muted-foreground">
                  {$t(i18nKeys.console.authBootstrap.passwordHint)}
                </p>
              </div>
            </div>
          </div>
          <div class="rounded-md border bg-background/70 p-4">
            <div class="flex items-start gap-3">
              <ShieldCheck class="mt-0.5 size-4 text-primary" />
              <div>
                <p class="text-sm font-medium">
                  {$t(i18nKeys.console.authBootstrap.oauthOptionalTitle)}
                </p>
                <p class="mt-1 text-sm leading-6 text-muted-foreground">
                  {$t(i18nKeys.console.authBootstrap.oauthOptionalBody)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="p-6 lg:p-8">
        {#if statusQuery.isPending}
          <div class="console-panel p-5">
            <p class="text-sm text-muted-foreground">
              {$t(i18nKeys.console.authBootstrap.loadingStatus)}
            </p>
          </div>
        {:else if setupComplete}
          <div class="space-y-5">
            <div class="console-panel p-5">
              <div class="flex items-start gap-3">
                <CheckCircle2 class="mt-0.5 size-5 text-primary" />
                <div>
                  <h2 class="text-lg font-semibold">
                    {$t(i18nKeys.console.authBootstrap.completedTitle)}
                  </h2>
                  <p class="mt-2 text-sm leading-6 text-muted-foreground">
                    {createdResult
                      ? $t(i18nKeys.console.authBootstrap.completedDescription)
                      : $t(i18nKeys.console.authBootstrap.alreadyConfiguredBody)}
                  </p>
                </div>
              </div>
            </div>

            {#if createdResult?.generatedPassword}
              <div class="rounded-md border border-primary/30 bg-primary/5 p-4">
                <p class="text-sm font-semibold">
                  {$t(i18nKeys.console.authBootstrap.generatedPasswordTitle)}
                </p>
                <p class="mt-1 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.authBootstrap.generatedPasswordBody)}
                </p>
                <pre class="mt-3 overflow-x-auto rounded-md border bg-background p-3 text-sm">{createdResult.generatedPassword}</pre>
              </div>
            {/if}

            <div class="flex flex-wrap gap-2">
              <Button onclick={openLogin}>{$t(i18nKeys.console.authBootstrap.loginAction)}</Button>
              <Button href={webDocsHrefs.firstAdminBootstrap} target="_blank" variant="outline">
                {$t(i18nKeys.console.authBootstrap.docsLink)}
              </Button>
            </div>
          </div>
        {:else}
          <form class="space-y-5" onsubmit={submitFirstAdmin}>
            <div class="flex items-center justify-between gap-4">
              <div>
                <h2 class="text-lg font-semibold">
                  {$t(i18nKeys.console.authBootstrap.setupPageTitle)}
                </h2>
                <p class="mt-1 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.authBootstrap.setupPageDescription)}
                </p>
              </div>
              <DocsHelpLink
                href={webDocsHrefs.firstAdminBootstrap}
                ariaLabel={$t(i18nKeys.common.actions.openDocs)}
              />
            </div>

            {#if feedback}
              <div
                class={[
                  "rounded-md border p-3 text-sm",
                  feedback.kind === "error"
                    ? "border-destructive/30 bg-destructive/5"
                    : "border-primary/30 bg-primary/5",
                ]}
              >
                <p class="font-medium">{feedback.title}</p>
                {#if feedback.detail}
                  <p class="mt-1 text-muted-foreground">{feedback.detail}</p>
                {/if}
              </div>
            {/if}

            <div class="grid gap-4 sm:grid-cols-2">
              <label class="appaloft-field-stack">
                <span class="appaloft-field-label">
                  {$t(i18nKeys.console.authBootstrap.emailLabel)}
                </span>
                <Input
                  bind:value={email}
                  type="email"
                  autocomplete="email"
                  required
                  placeholder={$t(i18nKeys.console.authBootstrap.emailPlaceholder)}
                />
              </label>
              <label class="appaloft-field-stack">
                <span class="appaloft-field-label">
                  {$t(i18nKeys.console.authBootstrap.displayNameLabel)}
                </span>
                <Input
                  bind:value={displayName}
                  autocomplete="name"
                  required
                  placeholder={$t(i18nKeys.console.authBootstrap.displayNamePlaceholder)}
                />
              </label>
            </div>

            <label class="appaloft-field-stack">
              <span class="appaloft-field-label">
                {$t(i18nKeys.console.authBootstrap.passwordLabel)}
              </span>
              <Input
                bind:value={password}
                type="password"
                autocomplete="new-password"
                placeholder={$t(i18nKeys.console.authBootstrap.passwordPlaceholder)}
              />
              <span class="appaloft-field-help block text-xs font-normal leading-5 text-muted-foreground">
                {$t(i18nKeys.console.authBootstrap.passwordHint)}
              </span>
            </label>

            <div class="grid gap-4 sm:grid-cols-2">
              <label class="appaloft-field-stack">
                <span class="appaloft-field-label">
                  {$t(i18nKeys.console.authBootstrap.organizationNameLabel)}
                </span>
                <Input
                  bind:value={organizationName}
                  placeholder={$t(i18nKeys.console.authBootstrap.organizationNamePlaceholder)}
                />
              </label>
              <label class="appaloft-field-stack">
                <span class="appaloft-field-label">
                  {$t(i18nKeys.console.authBootstrap.organizationSlugLabel)}
                </span>
                <Input
                  bind:value={organizationSlug}
                  placeholder={$t(i18nKeys.console.authBootstrap.organizationSlugPlaceholder)}
                />
              </label>
            </div>

            <Button type="submit" disabled={!canSubmit}>
              {bootstrapMutation.isPending
                ? $t(i18nKeys.console.authBootstrap.creatingAdmin)
                : $t(i18nKeys.console.authBootstrap.createAdmin)}
            </Button>
          </form>
        {/if}
      </div>
    </section>
  </div>
</main>
