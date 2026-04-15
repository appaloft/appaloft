<script lang="ts">
  import { LoaderCircle } from "@lucide/svelte";
  import type { TestServerConnectivityResponse } from "@yundu/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import type { ProviderSummary } from "$lib/console/queries";
  import {
    activeServerPrivateKeyInputMode,
    canTestServerRegistrationDraft,
    createDraftServerConnectivityInput,
    createServerRegistrationDraft,
    fallbackServerProviderOptions,
    parseServerRegistrationPort,
    type DraftServerConnectivityInput,
    type ServerRegistrationDraft,
  } from "$lib/console/server-registration";
  import { i18nKeys, t } from "$lib/i18n";
  import type { SshCredentialSummary } from "@yundu/contracts";

  type Props = {
    draft?: ServerRegistrationDraft;
    providers?: ProviderSummary[];
    sshCredentials?: SshCredentialSummary[];
    connectivityResult?: TestServerConnectivityResponse | null;
    connectivityError?: string;
    testPending?: boolean;
    disabled?: boolean;
    idPrefix?: string;
    testConnectivity?: (
      input: DraftServerConnectivityInput,
    ) => Promise<TestServerConnectivityResponse>;
  };

  let {
    draft = $bindable(createServerRegistrationDraft()),
    providers = [],
    sshCredentials = [],
    connectivityResult = $bindable<TestServerConnectivityResponse | null>(null),
    connectivityError = $bindable(""),
    testPending = $bindable(false),
    disabled = false,
    idPrefix = "server",
    testConnectivity,
  }: Props = $props();

  const providerOptions = $derived(
    providers.length > 0 ? providers : fallbackServerProviderOptions,
  );
  const activePrivateKeyInputMode = $derived(
    activeServerPrivateKeyInputMode(draft, sshCredentials),
  );
  const canTestConnectivity = $derived(canTestServerRegistrationDraft(draft, sshCredentials));

  function connectivityLabel(status: TestServerConnectivityResponse["status"]): string {
    switch (status) {
      case "healthy":
        return $t(i18nKeys.common.status.healthy);
      case "degraded":
        return $t(i18nKeys.common.status.degraded);
      case "unreachable":
        return $t(i18nKeys.common.status.unreachable);
    }
  }

  function connectivityVariant(
    status: TestServerConnectivityResponse["status"],
  ): "default" | "secondary" | "outline" | "destructive" {
    switch (status) {
      case "healthy":
        return "default";
      case "degraded":
        return "secondary";
      case "unreachable":
        return "destructive";
    }
  }

  function checkLabel(status: TestServerConnectivityResponse["checks"][number]["status"]): string {
    switch (status) {
      case "passed":
        return $t(i18nKeys.common.status.passed);
      case "failed":
        return $t(i18nKeys.common.status.failed);
      case "skipped":
        return $t(i18nKeys.common.status.skipped);
    }
  }

  function checkVariant(
    status: TestServerConnectivityResponse["checks"][number]["status"],
  ): "default" | "secondary" | "outline" | "destructive" {
    switch (status) {
      case "passed":
        return "default";
      case "failed":
        return "destructive";
      case "skipped":
        return "outline";
    }
  }

  async function importPrivateKeyFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    draft.credentialPrivateKeyImportError = null;

    try {
      const privateKey = (await file.text()).trim();

      if (!privateKey) {
        throw new Error($t(i18nKeys.console.serverForm.privateKeyFileEmpty));
      }

      draft.credentialPrivateKey = privateKey;
      draft.credentialPrivateKeyFileName = file.name;
      draft.selectedSshCredentialId = "";
      draft.privateKeyInputMode = "file";
      draft.sshCredentialName = draft.sshCredentialName.trim() || file.name;
    } catch (error) {
      draft.credentialPrivateKeyFileName = "";
      draft.credentialPrivateKeyImportError =
        error instanceof Error
          ? error.message
          : $t(i18nKeys.console.serverForm.privateKeyFileReadFailed);
    } finally {
      input.value = "";
    }
  }

  async function handleTestConnectivity(): Promise<void> {
    connectivityResult = null;
    connectivityError = "";

    if (!testConnectivity) {
      return;
    }

    if (!draft.host.trim()) {
      connectivityError = $t(i18nKeys.console.serverForm.hostRequired);
      return;
    }

    if (!parseServerRegistrationPort(draft)) {
      connectivityError = $t(i18nKeys.console.serverForm.portInvalid);
      return;
    }

    const input = createDraftServerConnectivityInput(draft, sshCredentials);

    if (!input) {
      connectivityError = $t(i18nKeys.console.serverForm.hostRequired);
      return;
    }

    if (draft.providerKey === "generic-ssh" && !input.server.credential) {
      connectivityError = $t(i18nKeys.console.serverForm.credentialRequired);
      return;
    }

    testPending = true;

    try {
      connectivityResult = await testConnectivity(input);
      connectivityError = "";
    } catch (error) {
      connectivityError = readErrorMessage(error);
    } finally {
      testPending = false;
    }
  }
</script>

<div class="space-y-3">
  <div class="grid gap-3 sm:grid-cols-2">
    <div class="space-y-2">
      <label class="text-xs font-medium text-muted-foreground" for={`${idPrefix}-name`}>
        {$t(i18nKeys.common.domain.name)}
      </label>
      <Input
        id={`${idPrefix}-name`}
        bind:value={draft.name}
        disabled={disabled}
        placeholder="edge-1"
      />
    </div>
    <div class="space-y-2">
      <label class="text-xs font-medium text-muted-foreground" for={`${idPrefix}-port`}>
        {$t(i18nKeys.console.serverForm.sshPort)}
      </label>
      <Input
        id={`${idPrefix}-port`}
        bind:value={draft.port}
        disabled={disabled}
        placeholder="22"
      />
    </div>
  </div>
  <div class="space-y-2">
    <label class="text-xs font-medium text-muted-foreground" for={`${idPrefix}-host`}>
      {$t(i18nKeys.common.domain.host)}
    </label>
    <Input
      id={`${idPrefix}-host`}
      bind:value={draft.host}
      disabled={disabled}
      placeholder="203.0.113.10"
    />
  </div>
  <div class="space-y-2">
    <p class="text-xs font-medium text-muted-foreground">{$t(i18nKeys.common.domain.provider)}</p>
    <div class="grid gap-2">
      {#each providerOptions as provider (provider.key)}
        <Button
          class="justify-start"
          size="sm"
          disabled={disabled}
          variant={draft.providerKey === provider.key ? "selected" : "outline"}
          onclick={() => {
            draft.providerKey = provider.key;
          }}
        >
          {provider.title}
        </Button>
      {/each}
    </div>
  </div>
  {#if draft.providerKey === "generic-ssh"}
    <div class="space-y-3 bg-muted/20 px-3 py-3">
      <div class="space-y-1">
        <p class="text-sm font-medium">{$t(i18nKeys.console.serverForm.sshCredentialTitle)}</p>
        <p class="text-xs leading-5 text-muted-foreground">
          {$t(i18nKeys.console.serverForm.sshCredentialDescription)}
        </p>
      </div>
      <div class="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          size="sm"
          disabled={disabled}
          variant={draft.credentialKind === "local-ssh-agent" ? "selected" : "outline"}
          onclick={() => {
            draft.credentialKind = "local-ssh-agent";
          }}
        >
          {$t(i18nKeys.console.serverForm.localSshAgent)}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={disabled}
          variant={draft.credentialKind === "ssh-private-key" ? "selected" : "outline"}
          onclick={() => {
            draft.credentialKind = "ssh-private-key";
            if (draft.privateKeyInputMode === "saved" && sshCredentials.length === 0) {
              draft.privateKeyInputMode = "file";
            }
          }}
        >
          {$t(i18nKeys.console.serverForm.sshPrivateKey)}
        </Button>
      </div>
      <div class="space-y-2">
        <label class="text-xs font-medium text-muted-foreground" for={`${idPrefix}-ssh-username`}>
          {$t(i18nKeys.console.serverForm.sshUsername)}
        </label>
        <Input
          id={`${idPrefix}-ssh-username`}
          bind:value={draft.credentialUsername}
          disabled={disabled}
          placeholder="root / ubuntu"
        />
        <p class="text-xs leading-5 text-muted-foreground">
          {$t(i18nKeys.console.serverForm.sshUsernameHint)}
        </p>
      </div>
      {#if draft.credentialKind === "local-ssh-agent"}
        <div class="space-y-1 bg-muted/25 px-3 py-2 text-xs leading-5 text-muted-foreground">
          <p>{$t(i18nKeys.console.serverForm.localSshAgentDescriptionOne)}</p>
          <p>{$t(i18nKeys.console.serverForm.localSshAgentDescriptionTwo)}</p>
        </div>
      {:else}
        <div class="space-y-2">
          <p class="text-xs font-medium text-muted-foreground">
            {$t(i18nKeys.console.serverForm.privateKeySource)}
          </p>
          <div class="grid gap-2 sm:grid-cols-3">
            <Button
              type="button"
              size="sm"
              disabled={disabled || sshCredentials.length === 0}
              variant={activePrivateKeyInputMode === "saved" ? "selected" : "outline"}
              class="h-auto flex-col items-start gap-0.5 px-3 py-2 text-left"
              onclick={() => {
                draft.privateKeyInputMode = "saved";
                draft.credentialPrivateKey = "";
                draft.credentialPrivateKeyFileName = "";
                draft.credentialPrivateKeyImportError = null;
              }}
            >
              <span>{$t(i18nKeys.console.serverForm.savedCredential)}</span>
              <span class="text-[0.7rem] font-normal opacity-75">
                {sshCredentials.length > 0
                  ? $t(i18nKeys.console.serverForm.savedCredentialAvailable, {
                      count: sshCredentials.length,
                    })
                  : $t(i18nKeys.console.serverForm.savedCredentialUnavailable)}
              </span>
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={disabled}
              variant={activePrivateKeyInputMode === "file" ? "selected" : "outline"}
              class="h-auto flex-col items-start gap-0.5 px-3 py-2 text-left"
              onclick={() => {
                draft.privateKeyInputMode = "file";
                draft.selectedSshCredentialId = "";
                draft.credentialPrivateKey = "";
                draft.credentialPrivateKeyFileName = "";
                draft.credentialPrivateKeyImportError = null;
              }}
            >
              <span>{$t(i18nKeys.console.serverForm.choosePrivateKeyFile)}</span>
              <span class="text-[0.7rem] font-normal opacity-75">
                {$t(i18nKeys.console.serverForm.privateKeyFileKind)}
              </span>
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={disabled}
              variant={activePrivateKeyInputMode === "paste" ? "selected" : "outline"}
              class="h-auto flex-col items-start gap-0.5 px-3 py-2 text-left"
              onclick={() => {
                draft.privateKeyInputMode = "paste";
                draft.selectedSshCredentialId = "";
                draft.credentialPrivateKeyFileName = "";
                draft.credentialPrivateKeyImportError = null;
              }}
            >
              <span>{$t(i18nKeys.console.serverForm.pastePrivateKey)}</span>
              <span class="text-[0.7rem] font-normal opacity-75">
                {$t(i18nKeys.console.serverForm.manualInput)}
              </span>
            </Button>
          </div>
        </div>

        {#if activePrivateKeyInputMode === "saved"}
          <div class="space-y-2">
            <p class="text-xs font-medium text-muted-foreground">
              {$t(i18nKeys.console.serverForm.selectCredential)}
            </p>
            <div class="grid gap-2">
              {#each sshCredentials as credential (credential.id)}
                <Button
                  type="button"
                  size="sm"
                  disabled={disabled}
                  variant={draft.selectedSshCredentialId === credential.id ? "selected" : "outline"}
                  class="justify-start"
                  onclick={() => {
                    draft.selectedSshCredentialId = credential.id;
                    draft.credentialPrivateKey = "";
                    draft.credentialPrivateKeyFileName = "";
                    draft.credentialPrivateKeyImportError = null;
                  }}
                >
                  {credential.name}{credential.username ? ` · ${credential.username}` : ""}
                </Button>
              {/each}
            </div>
          </div>
        {:else if activePrivateKeyInputMode === "file"}
          <div class="space-y-2">
            <label
              class="text-xs font-medium text-muted-foreground"
              for={`${idPrefix}-ssh-private-key-file`}
            >
              {$t(i18nKeys.console.serverForm.privateKeyFile)}
            </label>
            <Input
              id={`${idPrefix}-ssh-private-key-file`}
              type="file"
              disabled={disabled}
              onchange={importPrivateKeyFile}
            />
            {#if draft.credentialPrivateKeyFileName}
              <p class="text-xs text-muted-foreground">
                {$t(i18nKeys.console.serverForm.privateKeyFileSelected, {
                  fileName: draft.credentialPrivateKeyFileName,
                })}
              </p>
            {:else if draft.credentialPrivateKeyImportError}
              <p class="text-xs text-destructive">{draft.credentialPrivateKeyImportError}</p>
            {:else}
              <p class="text-xs leading-5 text-muted-foreground">
                {$t(i18nKeys.console.serverForm.privateKeyFileHint)}
              </p>
            {/if}
          </div>
        {:else}
          <div class="space-y-2">
            <label
              class="text-xs font-medium text-muted-foreground"
              for={`${idPrefix}-ssh-private-key`}
            >
              {$t(i18nKeys.console.serverForm.privateKeyContent)}
            </label>
            <Textarea
              id={`${idPrefix}-ssh-private-key`}
              class="font-mono text-xs"
              bind:value={draft.credentialPrivateKey}
              disabled={disabled}
              oninput={() => {
                draft.selectedSshCredentialId = "";
                draft.credentialPrivateKeyFileName = "";
                draft.privateKeyInputMode = "paste";
              }}
              placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"}
              rows={6}
            />
          </div>
        {/if}

        {#if activePrivateKeyInputMode === "file" || activePrivateKeyInputMode === "paste"}
          <div class="space-y-2">
            <label
              class="text-xs font-medium text-muted-foreground"
              for={`${idPrefix}-ssh-credential-name`}
            >
              {$t(i18nKeys.console.serverForm.sshCredentialName)}
            </label>
            <Input
              id={`${idPrefix}-ssh-credential-name`}
              bind:value={draft.sshCredentialName}
              disabled={disabled}
              placeholder={draft.credentialPrivateKeyFileName || `${draft.name || "server"} SSH key`}
            />
            <p class="text-xs leading-5 text-muted-foreground">
              {$t(i18nKeys.console.serverForm.sshCredentialNameHint)}
            </p>
          </div>
          <div class="space-y-2">
            <label
              class="text-xs font-medium text-muted-foreground"
              for={`${idPrefix}-ssh-public-key`}
            >
              {$t(i18nKeys.console.serverForm.sshPublicKey)}
            </label>
            <Textarea
              id={`${idPrefix}-ssh-public-key`}
              class="font-mono text-xs"
              bind:value={draft.credentialPublicKey}
              disabled={disabled}
              placeholder="ssh-ed25519 AAAA..."
              rows={3}
            />
            <p class="text-xs leading-5 text-muted-foreground">
              {$t(i18nKeys.console.serverForm.sshPublicKeyHint)}
            </p>
          </div>
        {/if}
      {/if}
      <div class="space-y-2 border-t pt-3">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="space-y-1">
            <p class="text-xs font-medium text-muted-foreground">
              {$t(i18nKeys.console.serverForm.connectivityDraftTitle)}
            </p>
            <p class="text-xs leading-5 text-muted-foreground">
              {$t(i18nKeys.console.serverForm.connectivityDraftDescription)}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || !canTestConnectivity || testPending || !testConnectivity}
            onclick={handleTestConnectivity}
          >
            {#if testPending}
              <LoaderCircle class="size-3 animate-spin" />
              {$t(i18nKeys.console.serverForm.connectivityTestPending)}
            {:else}
              {$t(i18nKeys.common.actions.testConnectivity)}
            {/if}
          </Button>
        </div>
        {#if connectivityError}
          <div class="rounded-md border border-destructive/30 px-3 py-2 text-xs text-destructive">
            {connectivityError}
          </div>
        {:else if connectivityResult}
          <div class="space-y-2 bg-muted/25 px-3 py-2">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-xs font-medium">{$t(i18nKeys.console.serverForm.connectivityResultTitle)}</p>
              <Badge variant={connectivityVariant(connectivityResult.status)}>
                {connectivityLabel(connectivityResult.status)}
              </Badge>
            </div>
            <div class="space-y-2">
              {#each connectivityResult.checks as check (check.name)}
                <div class="flex flex-col gap-1 border-t pt-2 first:border-t-0 first:pt-0">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <span class="text-xs font-medium">{check.name}</span>
                    <Badge variant={checkVariant(check.status)}>
                      {checkLabel(check.status)}
                    </Badge>
                  </div>
                  <p class="text-xs leading-5 text-muted-foreground">{check.message}</p>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
