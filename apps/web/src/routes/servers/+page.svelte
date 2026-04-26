<script lang="ts">
  import { browser } from "$app/environment";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";
  import { ArrowRight, KeyRound, Network, RotateCcw, Server, ShieldCheck, Trash2, TriangleAlert } from "@lucide/svelte";
  import type {
    ConfigureDefaultAccessDomainPolicyInput,
    DeleteSshCredentialInput,
    RotateSshCredentialInput,
    ServerSummary,
    SshCredentialSummary,
  } from "@appaloft/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { Textarea } from "$lib/components/ui/textarea";
  import { toDefaultAccessPolicyFormState } from "$lib/console/default-access-policy-form";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import { createConsoleQueries } from "$lib/console/queries";
  import {
    isSshCredentialDeleteConfirmationValid,
    resolveSshCredentialDeleteReadiness,
  } from "$lib/console/ssh-credential-delete";
  import {
    isSshCredentialRotateConfirmationValid,
    resolveSshCredentialRotateReadiness,
  } from "$lib/console/ssh-credential-rotation";
  import { formatTime } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  const { serversQuery, deploymentsQuery } = createConsoleQueries(browser);
  const sshCredentialsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["credentials", "ssh", "list"],
      queryFn: () => orpcClient.credentials.ssh.list({}),
      enabled: browser,
    }),
  );
  const systemDefaultAccessPolicyQuery = createQuery(() =>
    queryOptions({
      queryKey: ["default-access-domain-policies", "show", "system"],
      queryFn: () =>
        orpcClient.defaultAccessDomainPolicies.show({
          scopeKind: "system",
        }),
      enabled: browser,
      staleTime: 5_000,
    }),
  );
  const defaultAccessModes = ["disabled", "provider", "custom-template"] as const;

  const servers = $derived(serversQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const sshCredentials = $derived(sshCredentialsQuery.data?.items ?? []);
  const pageLoading = $derived(
    serversQuery.isPending ||
      deploymentsQuery.isPending ||
      systemDefaultAccessPolicyQuery.isPending,
  );
  const activeServers = $derived(
    servers.filter((server) => countServerDeployments(server) > 0).length,
  );
  let systemMode = $state<ConfigureDefaultAccessDomainPolicyInput["mode"]>("provider");
  let systemProviderKey = $state("sslip");
  let systemTemplateRef = $state("");
  let systemPolicyReadbackSource = $state("");
  let systemFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let credentialDeleteDialogOpen = $state(false);
  let selectedCredential = $state<SshCredentialSummary | null>(null);
  let credentialDeleteConfirmation = $state("");
  let credentialDeleteFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);
  let credentialRotateDialogOpen = $state(false);
  let credentialRotatePrivateKey = $state("");
  let credentialRotatePublicKey = $state("");
  let credentialRotateUsername = $state("");
  let credentialRotateConfirmation = $state("");
  let credentialRotateAcknowledgeServerUsage = $state(false);
  let credentialRotateFeedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);

  const selectedCredentialId = $derived(selectedCredential?.id ?? "");
  const selectedCredentialDetailQuery = createQuery(() =>
    queryOptions({
      queryKey: ["credentials", "ssh", "show", selectedCredentialId],
      queryFn: () =>
        orpcClient.credentials.ssh.show({
          credentialId: selectedCredentialId,
          includeUsage: true,
        }),
      enabled:
        browser &&
        (credentialDeleteDialogOpen || credentialRotateDialogOpen) &&
        selectedCredentialId.length > 0,
      staleTime: 0,
      retry: 0,
    }),
  );
  const selectedCredentialDeleteReadiness = $derived(
    resolveSshCredentialDeleteReadiness({
      detail: selectedCredentialDetailQuery.data,
      isPending: selectedCredentialDetailQuery.isPending,
      hasError: Boolean(selectedCredentialDetailQuery.error),
    }),
  );
  const selectedCredentialRotateReadiness = $derived(
    resolveSshCredentialRotateReadiness({
      detail: selectedCredentialDetailQuery.data,
      isPending: selectedCredentialDetailQuery.isPending,
      hasError: Boolean(selectedCredentialDetailQuery.error),
      acknowledgedServerUsage: credentialRotateAcknowledgeServerUsage,
    }),
  );
  const selectedCredentialUsage = $derived(selectedCredentialDetailQuery.data?.usage);
  const configureSystemDefaultAccessMutation = createMutation(() => ({
    mutationFn: (input: ConfigureDefaultAccessDomainPolicyInput) =>
      orpcClient.defaultAccessDomainPolicies.configure(input),
    onSuccess: (result) => {
      systemFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.servers.defaultAccessSaveSuccessTitle),
        detail: result.id,
      };
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
      void queryClient.invalidateQueries({ queryKey: ["default-access-domain-policies"] });
    },
    onError: (error) => {
      systemFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.servers.defaultAccessSaveErrorTitle),
        detail: readErrorMessage(error),
      };
    },
  }));
  const deleteSshCredentialMutation = createMutation(() => ({
    mutationFn: (input: DeleteSshCredentialInput) => orpcClient.credentials.ssh.delete(input),
    onSuccess: (result) => {
      credentialDeleteFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.servers.deleteCredentialSucceeded),
        detail: result.id,
      };
      credentialDeleteDialogOpen = false;
      void queryClient.invalidateQueries({ queryKey: ["credentials", "ssh"] });
      void queryClient.invalidateQueries({ queryKey: ["servers"] });
    },
    onError: (error) => {
      credentialDeleteFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.servers.deleteCredentialFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const rotateSshCredentialMutation = createMutation(() => ({
    mutationFn: (input: RotateSshCredentialInput) => orpcClient.credentials.ssh.rotate(input),
    onSuccess: (result) => {
      credentialRotateFeedback = {
        kind: "success",
        title: $t(i18nKeys.console.servers.rotateCredentialSucceeded),
        detail: result.credential.id,
      };
      credentialRotateDialogOpen = false;
      void queryClient.invalidateQueries({ queryKey: ["credentials", "ssh"] });
      void queryClient.invalidateQueries({ queryKey: ["servers"] });
    },
    onError: (error) => {
      credentialRotateFeedback = {
        kind: "error",
        title: $t(i18nKeys.console.servers.rotateCredentialFailed),
        detail: readErrorMessage(error),
      };
    },
  }));
  const canSubmitCredentialDelete = $derived(
    Boolean(selectedCredential) &&
      selectedCredentialDeleteReadiness.kind === "ready" &&
      isSshCredentialDeleteConfirmationValid(selectedCredentialId, credentialDeleteConfirmation) &&
      !deleteSshCredentialMutation.isPending,
  );
  const canSubmitCredentialRotate = $derived(
    Boolean(selectedCredential) &&
      credentialRotatePrivateKey.trim().length > 0 &&
      selectedCredentialRotateReadiness.kind === "ready" &&
      isSshCredentialRotateConfirmationValid(selectedCredentialId, credentialRotateConfirmation) &&
      !rotateSshCredentialMutation.isPending,
  );

  $effect(() => {
    const readback = systemDefaultAccessPolicyQuery.data;
    if (!readback) {
      return;
    }

    const policy = readback.policy;
    const source = policy ? `${policy.id}:${policy.updatedAt}` : "system:none";
    if (systemPolicyReadbackSource === source) {
      return;
    }

    const formState = toDefaultAccessPolicyFormState(policy);
    systemMode = formState.mode;
    systemProviderKey = formState.providerKey;
    systemTemplateRef = formState.templateRef;
    systemPolicyReadbackSource = source;
  });

  function countServerDeployments(server: ServerSummary): number {
    return deployments.filter((deployment) => deployment.serverId === server.id).length;
  }

  function submitSystemPolicy(event: SubmitEvent): void {
    event.preventDefault();

    configureSystemDefaultAccessMutation.mutate({
      scope: {
        kind: "system",
      },
      mode: systemMode,
      ...(systemMode !== "disabled" && systemProviderKey.trim()
        ? { providerKey: systemProviderKey.trim() }
        : {}),
      ...(systemMode === "custom-template" && systemTemplateRef.trim()
        ? { templateRef: systemTemplateRef.trim() }
        : {}),
    });
  }

  function openCredentialDeleteDialog(credential: SshCredentialSummary): void {
    selectedCredential = credential;
    credentialDeleteConfirmation = "";
    credentialDeleteFeedback = null;
    credentialDeleteDialogOpen = true;
    void queryClient.invalidateQueries({ queryKey: ["credentials", "ssh", "show", credential.id] });
  }

  function openCredentialRotateDialog(credential: SshCredentialSummary): void {
    selectedCredential = credential;
    credentialRotatePrivateKey = "";
    credentialRotatePublicKey = "";
    credentialRotateUsername = credential.username ?? "";
    credentialRotateConfirmation = "";
    credentialRotateAcknowledgeServerUsage = false;
    credentialRotateFeedback = null;
    credentialRotateDialogOpen = true;
    void queryClient.invalidateQueries({ queryKey: ["credentials", "ssh", "show", credential.id] });
  }

  function submitCredentialDelete(event: SubmitEvent): void {
    event.preventDefault();

    if (!selectedCredential || !canSubmitCredentialDelete) {
      return;
    }

    credentialDeleteFeedback = null;
    deleteSshCredentialMutation.mutate({
      credentialId: selectedCredential.id,
      confirmation: {
        credentialId: credentialDeleteConfirmation.trim(),
      },
    });
  }

  function submitCredentialRotate(event: SubmitEvent): void {
    event.preventDefault();

    if (!selectedCredential || !canSubmitCredentialRotate) {
      return;
    }

    credentialRotateFeedback = null;
    rotateSshCredentialMutation.mutate({
      credentialId: selectedCredential.id,
      privateKey: credentialRotatePrivateKey.trim(),
      ...(credentialRotatePublicKey.trim()
        ? { publicKey: credentialRotatePublicKey.trim() }
        : {}),
      ...(credentialRotateUsername.trim() ? { username: credentialRotateUsername.trim() } : {}),
      confirmation: {
        credentialId: credentialRotateConfirmation.trim(),
        ...(credentialRotateAcknowledgeServerUsage
          ? { acknowledgeServerUsage: credentialRotateAcknowledgeServerUsage }
          : {}),
      },
    });
  }

  $effect(() => {
    if (credentialDeleteDialogOpen || credentialRotateDialogOpen) {
      return;
    }

    selectedCredential = null;
    credentialDeleteConfirmation = "";
    credentialRotatePrivateKey = "";
    credentialRotatePublicKey = "";
    credentialRotateUsername = "";
    credentialRotateConfirmation = "";
    credentialRotateAcknowledgeServerUsage = false;
  });
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.servers.pageTitle)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={$t(i18nKeys.console.servers.pageTitle)}
  description={$t(i18nKeys.console.servers.description)}
>
  {#if pageLoading}
    <div class="space-y-5">
      <section class="space-y-3">
        <Skeleton class="h-5 w-36" />
        <Skeleton class="h-4 w-80" />
      </section>
      <div class="space-y-3">
        {#each Array.from({ length: 4 }) as _, index (index)}
          <Skeleton class="h-12 w-full" />
        {/each}
      </div>
    </div>
  {:else}
    {#if servers.length === 0}
      <section class="space-y-5 py-2">
        <Badge class="w-fit" variant="outline">{$t(i18nKeys.common.domain.servers)}</Badge>
        <div class="max-w-2xl space-y-3">
          <h1 class="text-2xl font-semibold md:text-3xl">
            {$t(i18nKeys.console.servers.emptyTitle)}
          </h1>
          <p class="text-sm leading-6 text-muted-foreground">
            {$t(i18nKeys.console.servers.emptyBody)}
          </p>
        </div>
        <div class="mt-6 flex flex-wrap gap-2">
          <Button href="/servers/new">
            {$t(i18nKeys.common.actions.createServer)}
          </Button>
          <Button href="/projects" variant="outline">
            {$t(i18nKeys.common.actions.viewProjects)}
          </Button>
          <Button href="/deployments" variant="outline">
            {$t(i18nKeys.common.actions.viewDeployments)}
          </Button>
        </div>
      </section>
    {:else}
      <div class="space-y-8">
        <section class="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div class="max-w-2xl space-y-2">
            <Badge class="w-fit" variant="outline">{$t(i18nKeys.common.domain.servers)}</Badge>
            <h1 class="text-2xl font-semibold">{$t(i18nKeys.console.servers.focusTitle)}</h1>
            <p class="text-sm leading-6 text-muted-foreground">
              {$t(i18nKeys.console.servers.focusDescription)}
            </p>
          </div>
          <div class="space-y-3 md:min-w-80">
            <Button class="w-full" href="/servers/new">
              {$t(i18nKeys.common.actions.createServer)}
            </Button>
            <div class="grid grid-cols-3 divide-x border-y text-center">
              <div class="px-3 py-3">
                <p class="text-xl font-semibold">{servers.length}</p>
                <p class="mt-1 text-xs text-muted-foreground">
                  {$t(i18nKeys.common.domain.servers)}
                </p>
              </div>
              <div class="px-3 py-3">
                <p class="text-xl font-semibold">{activeServers}</p>
                <p class="mt-1 text-xs text-muted-foreground">
                  {$t(i18nKeys.common.status.connected)}
                </p>
              </div>
              <div class="px-3 py-3">
                <p class="text-xl font-semibold">{deployments.length}</p>
                <p class="mt-1 text-xs text-muted-foreground">
                  {$t(i18nKeys.common.domain.deployments)}
                </p>
              </div>
            </div>
          </div>
        </section>

      <section class="space-y-4 border-y py-6">
        <div class="max-w-3xl space-y-1">
          <div class="flex items-center gap-2">
            <h2 class="text-lg font-semibold">
              {$t(i18nKeys.console.servers.defaultAccessSystemTitle)}
            </h2>
            <DocsHelpLink
              href={webDocsHrefs.defaultAccessPolicy}
              ariaLabel={$t(i18nKeys.common.actions.openDocs)}
            />
          </div>
          <p class="text-sm text-muted-foreground">
            {$t(i18nKeys.console.servers.defaultAccessSystemDescription)}
          </p>
        </div>

        <form
          id="servers-default-access-policy-form"
          class="grid gap-4 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]"
          onsubmit={submitSystemPolicy}
        >
          <label class="space-y-1.5 text-sm font-medium">
            <span class="inline-flex items-center gap-1.5">
              {$t(i18nKeys.console.servers.defaultAccessModeLabel)}
              <DocsHelpLink
                href={webDocsHrefs.defaultAccessPolicy}
                ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                className="size-5"
              />
            </span>
            <Select.Root bind:value={systemMode} type="single">
              <Select.Trigger class="w-full">
                {systemMode === "disabled"
                  ? $t(i18nKeys.console.servers.defaultAccessDisabledOption)
                  : systemMode === "custom-template"
                    ? $t(i18nKeys.console.servers.defaultAccessCustomTemplateOption)
                    : $t(i18nKeys.console.servers.defaultAccessProviderOption)}
              </Select.Trigger>
              <Select.Content>
                {#each defaultAccessModes as mode (mode)}
                  <Select.Item value={mode}>
                    {mode === "disabled"
                      ? $t(i18nKeys.console.servers.defaultAccessDisabledOption)
                      : mode === "custom-template"
                        ? $t(i18nKeys.console.servers.defaultAccessCustomTemplateOption)
                        : $t(i18nKeys.console.servers.defaultAccessProviderOption)}
                  </Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </label>

          <div class="grid gap-4 md:grid-cols-2">
            {#if systemMode !== "disabled"}
              <label class="space-y-1.5 text-sm font-medium">
                <span class="inline-flex items-center gap-1.5">
                  {$t(i18nKeys.console.servers.defaultAccessProviderKeyLabel)}
                  <DocsHelpLink
                    href={webDocsHrefs.defaultAccessPolicy}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                    className="size-5"
                  />
                </span>
                <Input
                  id="servers-default-access-provider-key-input"
                  bind:value={systemProviderKey}
                  autocomplete="off"
                  placeholder={$t(i18nKeys.console.servers.defaultAccessProviderKeyPlaceholder)}
                />
              </label>
            {/if}

            {#if systemMode === "custom-template"}
              <label class="space-y-1.5 text-sm font-medium">
                <span class="inline-flex items-center gap-1.5">
                  {$t(i18nKeys.console.servers.defaultAccessTemplateRefLabel)}
                  <DocsHelpLink
                    href={webDocsHrefs.defaultAccessPolicy}
                    ariaLabel={$t(i18nKeys.common.actions.openDocs)}
                    className="size-5"
                  />
                </span>
                <Input
                  id="servers-default-access-template-ref-input"
                  bind:value={systemTemplateRef}
                  autocomplete="off"
                  placeholder={$t(i18nKeys.console.servers.defaultAccessTemplateRefPlaceholder)}
                />
              </label>
            {/if}
          </div>

          <div class="flex items-end">
            <Button
              class="w-full sm:w-auto"
              disabled={configureSystemDefaultAccessMutation.isPending}
              type="submit"
            >
              {configureSystemDefaultAccessMutation.isPending
                ? $t(i18nKeys.common.actions.saving)
                : $t(i18nKeys.common.actions.save)}
            </Button>
          </div>
        </form>

        {#if systemFeedback}
          <div
            class={`rounded-md border p-3 text-sm ${systemFeedback.kind === "error" ? "border-destructive/30 text-destructive" : "border-border text-foreground"}`}
          >
            <p class="font-medium">{systemFeedback.title}</p>
            <p class="mt-1 text-muted-foreground">{systemFeedback.detail}</p>
          </div>
        {/if}
      </section>

      <section class="space-y-3">
        <div>
          <h2 class="text-lg font-semibold">{$t(i18nKeys.console.servers.listTitle)}</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            {$t(i18nKeys.console.servers.listDescription)}
          </p>
        </div>

        <div class="divide-y border-y">
          {#each servers as server (server.id)}
            <a
              href={`/servers/${server.id}`}
              class="group grid gap-3 py-4 transition-colors hover:bg-muted/35 sm:grid-cols-[minmax(0,1fr)_32rem_auto] sm:px-3"
            >
              <div class="min-w-0 space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <Server class="size-4 text-muted-foreground" />
                  <h3 class="truncate text-base font-semibold">{server.name}</h3>
                  <Badge variant="outline">{server.providerKey}</Badge>
                </div>
                <p class="truncate text-sm text-muted-foreground">
                  {server.host}:{server.port}
                </p>
              </div>

              <div class="grid gap-1 text-sm text-muted-foreground sm:grid-cols-3">
                <span class="inline-flex items-center gap-2">
                  <Network class="size-3.5" />
                  {server.providerKey}
                </span>
                <span class="inline-flex items-center gap-2">
                  <ShieldCheck class="size-3.5" />
                  {countServerDeployments(server)} {$t(i18nKeys.common.domain.deployments)}
                </span>
                <span class="truncate">{formatTime(server.createdAt)}</span>
              </div>

              <span
                class="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground"
              >
                {$t(i18nKeys.common.actions.viewDetails)}
                <ArrowRight class="size-4" />
              </span>
            </a>
          {/each}
        </div>
      </section>
      </div>
    {/if}

    <section class="mt-8 space-y-4 border-y py-6">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="max-w-3xl space-y-1">
          <div class="flex items-center gap-2">
            <h2 class="text-lg font-semibold">
              {$t(i18nKeys.console.servers.savedCredentialLibraryTitle)}
            </h2>
            <DocsHelpLink
              href={webDocsHrefs.serverSshCredential}
              ariaLabel={$t(i18nKeys.common.actions.openDocs)}
            />
          </div>
          <p class="text-sm text-muted-foreground">
            {$t(i18nKeys.console.servers.savedCredentialLibraryDescription)}
          </p>
        </div>
        <Badge variant="outline">
          {$t(i18nKeys.console.servers.savedCredentialLibraryCount, {
            count: sshCredentials.length,
          })}
        </Badge>
      </div>

      {#if sshCredentialsQuery.isPending}
        <div class="space-y-3">
          {#each Array.from({ length: 2 }) as _, index (index)}
            <Skeleton class="h-16 w-full" />
          {/each}
        </div>
      {:else if sshCredentials.length === 0}
        <div class="border-y py-4">
          <p class="text-sm font-medium">
            {$t(i18nKeys.console.servers.savedCredentialLibraryEmptyTitle)}
          </p>
          <p class="mt-1 text-sm text-muted-foreground">
            {$t(i18nKeys.console.servers.savedCredentialLibraryEmptyBody)}
          </p>
        </div>
      {:else}
        <div class="divide-y border-y">
          {#each sshCredentials as credential (credential.id)}
            <div class="grid gap-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-3">
              <div class="min-w-0 space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <KeyRound class="size-4 text-muted-foreground" />
                  <h3 class="truncate text-sm font-semibold">{credential.name}</h3>
                  <Badge variant="secondary">{credential.kind}</Badge>
                </div>
                <p class="truncate text-sm text-muted-foreground">{credential.id}</p>
                <div class="flex flex-wrap gap-2 pt-1">
                  <Badge variant={credential.privateKeyConfigured ? "secondary" : "outline"}>
                    {$t(i18nKeys.console.servers.credentialPrivateKeyConfigured)}
                  </Badge>
                  <Badge variant={credential.publicKeyConfigured ? "secondary" : "outline"}>
                    {$t(i18nKeys.console.servers.credentialPublicKeyConfigured)}
                  </Badge>
                  {#if credential.username}
                    <Badge variant="outline">{credential.username}</Badge>
                  {/if}
                </div>
              </div>
              <div class="flex flex-wrap justify-start gap-2 sm:justify-end">
                <Button
                  variant="outline"
                  onclick={() => openCredentialRotateDialog(credential)}
                  aria-label={$t(i18nKeys.console.servers.rotateCredentialActionAria, {
                    name: credential.name,
                  })}
                >
                  <RotateCcw class="size-4" />
                  {$t(i18nKeys.console.servers.rotateCredentialAction)}
                </Button>
                <Button
                  variant="destructive"
                  onclick={() => openCredentialDeleteDialog(credential)}
                  aria-label={$t(i18nKeys.console.servers.deleteCredentialActionAria, {
                    name: credential.name,
                  })}
                >
                  <Trash2 class="size-4" />
                  {$t(i18nKeys.console.servers.deleteCredentialAction)}
                </Button>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      {#if credentialDeleteFeedback}
        <div
          class={`rounded-md border p-3 text-sm ${credentialDeleteFeedback.kind === "error" ? "border-destructive/30 text-destructive" : "border-border text-foreground"}`}
        >
          <p class="font-medium">{credentialDeleteFeedback.title}</p>
          <p class="mt-1 text-muted-foreground">{credentialDeleteFeedback.detail}</p>
        </div>
      {/if}

      {#if credentialRotateFeedback}
        <div
          class={`rounded-md border p-3 text-sm ${credentialRotateFeedback.kind === "error" ? "border-destructive/30 text-destructive" : "border-border text-foreground"}`}
        >
          <p class="font-medium">{credentialRotateFeedback.title}</p>
          <p class="mt-1 text-muted-foreground">{credentialRotateFeedback.detail}</p>
        </div>
      {/if}
    </section>

    <Dialog.Root bind:open={credentialDeleteDialogOpen}>
      {#if selectedCredential}
        <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
          <form onsubmit={submitCredentialDelete}>
            <Dialog.Header>
              <Dialog.Title>
                {$t(i18nKeys.console.servers.deleteCredentialDialogTitle)}
              </Dialog.Title>
              <Dialog.Description>
                {$t(i18nKeys.console.servers.deleteCredentialDialogDescription, {
                  id: selectedCredential.id,
                })}
              </Dialog.Description>
            </Dialog.Header>

            <div class="space-y-4 px-5 py-4">
              <div
                class={`rounded-md border p-3 text-sm ${selectedCredentialDeleteReadiness.kind === "ready" ? "border-border" : "border-destructive/30"}`}
              >
                {#if selectedCredentialDeleteReadiness.kind === "loading"}
                  <p class="font-medium">
                    {$t(i18nKeys.console.servers.deleteCredentialUsageChecking)}
                  </p>
                {:else if selectedCredentialDeleteReadiness.kind === "ready"}
                  <p class="font-medium">
                    {$t(i18nKeys.console.servers.deleteCredentialUsageReady)}
                  </p>
                {:else if selectedCredentialDeleteReadiness.kind === "in-use"}
                  <div class="flex items-start gap-2 text-destructive">
                    <TriangleAlert class="mt-0.5 size-4" />
                    <div>
                      <p class="font-medium">
                        {$t(i18nKeys.console.servers.deleteCredentialUsageInUse, {
                          total: selectedCredentialDeleteReadiness.totalServers,
                          active: selectedCredentialDeleteReadiness.activeServers,
                          inactive: selectedCredentialDeleteReadiness.inactiveServers,
                        })}
                      </p>
                    </div>
                  </div>
                {:else}
                  <div class="flex items-start gap-2 text-destructive">
                    <TriangleAlert class="mt-0.5 size-4" />
                    <p class="font-medium">
                      {$t(i18nKeys.console.servers.deleteCredentialUsageUnavailable)}
                    </p>
                  </div>
                {/if}
              </div>

              <label class="space-y-1.5 text-sm font-medium">
                <span>
                  {$t(i18nKeys.console.servers.deleteCredentialConfirmationLabel)}
                </span>
                <Input
                  bind:value={credentialDeleteConfirmation}
                  autocomplete="off"
                  aria-invalid={!isSshCredentialDeleteConfirmationValid(
                    selectedCredential.id,
                    credentialDeleteConfirmation,
                  )}
                  placeholder={selectedCredential.id}
                />
              </label>

              {#if credentialDeleteConfirmation.length > 0 && !isSshCredentialDeleteConfirmationValid(selectedCredential.id, credentialDeleteConfirmation)}
                <p class="text-sm text-destructive">
                  {$t(i18nKeys.console.servers.deleteCredentialConfirmMismatch)}
                </p>
              {/if}
            </div>

            <Dialog.Footer class="border-t p-5">
              <Button
                type="button"
                variant="outline"
                onclick={() => {
                  credentialDeleteDialogOpen = false;
                }}
              >
                {$t(i18nKeys.common.actions.close)}
              </Button>
              <Button type="submit" variant="destructive" disabled={!canSubmitCredentialDelete}>
                <Trash2 class="size-4" />
                {deleteSshCredentialMutation.isPending
                  ? $t(i18nKeys.console.servers.deleteCredentialDeleting)
                  : $t(i18nKeys.console.servers.deleteCredentialAction)}
              </Button>
            </Dialog.Footer>
          </form>
        </Dialog.Content>
      {/if}
    </Dialog.Root>

    <Dialog.Root bind:open={credentialRotateDialogOpen}>
      {#if selectedCredential}
        <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
          <form onsubmit={submitCredentialRotate}>
            <Dialog.Header>
              <Dialog.Title>
                {$t(i18nKeys.console.servers.rotateCredentialDialogTitle)}
              </Dialog.Title>
              <Dialog.Description>
                {$t(i18nKeys.console.servers.rotateCredentialDialogDescription, {
                  id: selectedCredential.id,
                })}
              </Dialog.Description>
            </Dialog.Header>

            <div class="space-y-4 px-5 py-4">
              <div
                class={`rounded-md border p-3 text-sm ${selectedCredentialRotateReadiness.kind === "usage-unavailable" ? "border-destructive/30" : "border-border"}`}
              >
                {#if selectedCredentialRotateReadiness.kind === "loading"}
                  <p class="font-medium">
                    {$t(i18nKeys.console.servers.rotateCredentialUsageChecking)}
                  </p>
                {:else if selectedCredentialRotateReadiness.kind === "usage-unavailable"}
                  <div class="flex items-start gap-2 text-destructive">
                    <TriangleAlert class="mt-0.5 size-4" />
                    <p class="font-medium">
                      {$t(i18nKeys.console.servers.rotateCredentialUsageUnavailable)}
                    </p>
                  </div>
                {:else if selectedCredentialRotateReadiness.kind === "requires-acknowledgement"}
                  <div class="flex items-start gap-2">
                    <TriangleAlert class="mt-0.5 size-4 text-muted-foreground" />
                    <p class="font-medium">
                      {$t(i18nKeys.console.servers.rotateCredentialUsageRequiresAcknowledgement, {
                        total: selectedCredentialRotateReadiness.totalServers,
                        active: selectedCredentialRotateReadiness.activeServers,
                        inactive: selectedCredentialRotateReadiness.inactiveServers,
                      })}
                    </p>
                  </div>
                {:else}
                  <p class="font-medium">
                    {selectedCredentialRotateReadiness.requiresAcknowledgement && selectedCredentialUsage
                      ? $t(i18nKeys.console.servers.rotateCredentialUsageRequiresAcknowledgement, {
                          total: selectedCredentialUsage.totalServers,
                          active: selectedCredentialUsage.activeServers,
                          inactive: selectedCredentialUsage.inactiveServers,
                        })
                      : $t(i18nKeys.console.servers.rotateCredentialUsageReady)}
                  </p>
                {/if}
              </div>

              {#if selectedCredentialUsage && selectedCredentialUsage.totalServers > 0}
                <label class="flex items-start gap-2 text-sm font-medium">
                  <input
                    bind:checked={credentialRotateAcknowledgeServerUsage}
                    class="mt-1 size-4"
                    type="checkbox"
                  />
                  <span>{$t(i18nKeys.console.servers.rotateCredentialAcknowledgeLabel)}</span>
                </label>
              {/if}

              <label class="space-y-1.5 text-sm font-medium">
                <span>{$t(i18nKeys.console.servers.rotateCredentialPrivateKeyLabel)}</span>
                <Textarea
                  bind:value={credentialRotatePrivateKey}
                  autocomplete="off"
                  placeholder={$t(i18nKeys.console.servers.rotateCredentialPrivateKeyPlaceholder)}
                  rows={7}
                />
              </label>

              <div class="grid gap-4 md:grid-cols-2">
                <label class="space-y-1.5 text-sm font-medium">
                  <span>{$t(i18nKeys.console.servers.rotateCredentialPublicKeyLabel)}</span>
                  <Input
                    bind:value={credentialRotatePublicKey}
                    autocomplete="off"
                    placeholder={$t(i18nKeys.console.servers.rotateCredentialPublicKeyPlaceholder)}
                  />
                </label>

                <label class="space-y-1.5 text-sm font-medium">
                  <span>{$t(i18nKeys.console.servers.rotateCredentialUsernameLabel)}</span>
                  <Input
                    bind:value={credentialRotateUsername}
                    autocomplete="off"
                    placeholder={$t(i18nKeys.console.servers.rotateCredentialUsernamePlaceholder)}
                  />
                </label>
              </div>

              <label class="space-y-1.5 text-sm font-medium">
                <span>
                  {$t(i18nKeys.console.servers.rotateCredentialConfirmationLabel)}
                </span>
                <Input
                  bind:value={credentialRotateConfirmation}
                  autocomplete="off"
                  aria-invalid={!isSshCredentialRotateConfirmationValid(
                    selectedCredential.id,
                    credentialRotateConfirmation,
                  )}
                  placeholder={selectedCredential.id}
                />
              </label>

              {#if credentialRotateConfirmation.length > 0 && !isSshCredentialRotateConfirmationValid(selectedCredential.id, credentialRotateConfirmation)}
                <p class="text-sm text-destructive">
                  {$t(i18nKeys.console.servers.rotateCredentialConfirmMismatch)}
                </p>
              {/if}

              <p class="text-sm text-muted-foreground">
                {$t(i18nKeys.console.servers.rotateCredentialTestHint)}
              </p>
            </div>

            <Dialog.Footer class="border-t p-5">
              <Button
                type="button"
                variant="outline"
                onclick={() => {
                  credentialRotateDialogOpen = false;
                }}
              >
                {$t(i18nKeys.common.actions.close)}
              </Button>
              <Button type="submit" disabled={!canSubmitCredentialRotate}>
                <RotateCcw class="size-4" />
                {rotateSshCredentialMutation.isPending
                  ? $t(i18nKeys.console.servers.rotateCredentialRotating)
                  : $t(i18nKeys.console.servers.rotateCredentialAction)}
              </Button>
            </Dialog.Footer>
          </form>
        </Dialog.Content>
      {/if}
    </Dialog.Root>
  {/if}
</ConsoleShell>
