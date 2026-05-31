<script lang="ts">
  import { browser } from "$app/environment";
  import { CheckCircle2, LoaderCircle } from "@lucide/svelte";
  import { createQuery, queryOptions } from "@tanstack/svelte-query";
  import type { RegisterServerResponse, TestServerConnectivityResponse } from "@appaloft/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import ServerRegistrationForm from "$lib/components/console/ServerRegistrationForm.svelte";
  import { Button } from "$lib/components/ui/button";
  import {
    createQuickDeployServerCredential,
    createRegisterServerInput,
    createServerRegistrationDraft,
    isServerRegistrationDraftComplete,
    type DraftServerConnectivityInput,
  } from "$lib/console/server-registration";
  import { defaultConsoleListLimit } from "$lib/console/queries";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  type Props = {
    idPrefix?: string;
    showSuccessLink?: boolean;
    onCreated?: (server: RegisterServerResponse) => void;
  };

  let {
    idPrefix = "create-server",
    showSuccessLink = false,
    onCreated,
  }: Props = $props();

  let draft = $state(createServerRegistrationDraft());
  let connectivityResult = $state<TestServerConnectivityResponse | null>(null);
  let connectivityError = $state("");
  let testPending = $state(false);
  let submitPending = $state(false);
  let submitError = $state("");
  let createdServerId = $state("");

  const providersQuery = createQuery(() =>
    queryOptions({
      queryKey: ["providers"],
      queryFn: () => orpcClient.providers.list(),
      enabled: browser,
    }),
  );
  const sshCredentialsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["credentials", "ssh", { limit: defaultConsoleListLimit }],
      queryFn: () => orpcClient.credentials.ssh.list({ limit: defaultConsoleListLimit }),
      enabled: browser,
    }),
  );

  const providers = $derived(providersQuery.data?.items ?? []);
  const sshCredentials = $derived(sshCredentialsQuery.data?.items ?? []);

  function testDraftServerConnectivity(input: DraftServerConnectivityInput) {
    return orpcClient.servers.testDraftConnectivity(input);
  }

  async function handleCreateServer(): Promise<void> {
    submitError = "";
    createdServerId = "";

    const registerInput = createRegisterServerInput(draft);
    if (!registerInput) {
      submitError = $t(i18nKeys.console.servers.createValidationError);
      return;
    }

    if (!isServerRegistrationDraftComplete(draft, sshCredentials)) {
      submitError = $t(i18nKeys.console.servers.createCredentialValidationError);
      return;
    }

    submitPending = true;

    try {
      const createdServer = await orpcClient.servers.create(registerInput);
      const credential = createQuickDeployServerCredential(draft, sshCredentials);

      if (credential?.mode === "create-ssh-and-configure") {
        const createdCredential = await orpcClient.credentials.ssh.create(credential.input);
        await orpcClient.servers.configureCredential({
          serverId: createdServer.id,
          credential: {
            kind: "stored-ssh-private-key",
            credentialId: createdCredential.id,
            ...(credential.input.username ? { username: credential.input.username } : {}),
          },
        });
      } else if (credential) {
        await orpcClient.servers.configureCredential({
          serverId: createdServer.id,
          credential: credential.credential,
        });
      }

      createdServerId = createdServer.id;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["servers"] }),
        queryClient.invalidateQueries({ queryKey: ["credentials", "ssh"] }),
      ]);
      onCreated?.(createdServer);
    } catch (error) {
      submitError = readErrorMessage(error);
    } finally {
      submitPending = false;
    }
  }
</script>

<form
  class="space-y-6"
  onsubmit={(event) => {
    event.preventDefault();
    void handleCreateServer();
  }}
>
  <ServerRegistrationForm
    bind:draft
    bind:connectivityResult
    bind:connectivityError
    bind:testPending
    {providers}
    {sshCredentials}
    disabled={submitPending}
    {idPrefix}
    testConnectivity={testDraftServerConnectivity}
  />

  {#if submitError}
    <div class="rounded-md border border-destructive/30 px-3 py-2 text-sm text-destructive">
      <p class="font-medium">{$t(i18nKeys.console.servers.createErrorTitle)}</p>
      <p class="mt-1 text-xs leading-5">{submitError}</p>
    </div>
  {:else if createdServerId}
    <div class="console-subtle-panel px-3 py-2 text-sm">
      <div class="flex items-start gap-2">
        <CheckCircle2 class="mt-0.5 size-4 text-primary" />
        <div>
          <p class="font-medium">{$t(i18nKeys.console.servers.createSuccessTitle)}</p>
          <p class="mt-1 text-xs leading-5 text-muted-foreground">
            {$t(i18nKeys.console.servers.createSuccessDescription)}
          </p>
        </div>
      </div>
    </div>
  {/if}

  <div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
    {#if showSuccessLink && createdServerId}
      <Button href={`/servers/${createdServerId}`} variant="outline">
        {$t(i18nKeys.common.actions.viewDetails)}
      </Button>
    {/if}
    <Button type="submit" disabled={submitPending || testPending}>
      {#if submitPending}
        <LoaderCircle class="size-4 animate-spin" />
        {$t(i18nKeys.common.actions.creating)}
      {:else}
        {$t(i18nKeys.common.actions.createServer)}
      {/if}
    </Button>
  </div>
</form>
