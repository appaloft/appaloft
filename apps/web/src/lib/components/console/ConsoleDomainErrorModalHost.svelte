<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";

  import {
    apiDomainErrorEventType,
    type ApiDomainErrorEventDetail,
  } from "$lib/api/client";
  import {
    findConsoleDomainErrorModalExtension,
    readConsoleDomainErrorModalExtensionMetadata,
    resolveConsoleDomainErrorModalEndpoint,
  } from "$lib/console/console-page-extension";
  import ConsoleExtensionPage from "$lib/components/console/ConsoleExtensionPage.svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import { i18nKeys, t } from "$lib/i18n";
  import type { SystemPluginWebExtension } from "@appaloft/contracts";

  type OrganizationContext = {
    organizationId?: string;
    slug?: string;
    name?: string;
    role?: string;
  } | null;

  type Props = {
    extensions: readonly SystemPluginWebExtension[];
    organization: OrganizationContext;
  };

  let { extensions, organization }: Props = $props();
  let modalOpen = $state(false);
  let modalEndpoint = $state<string | null>(null);
  let modalTitle = $state("");
  let modalDescription = $state("");

  function handleDomainError(event: Event): void {
    const detail = (event as CustomEvent<ApiDomainErrorEventDetail>).detail;
    if (!detail?.error?.code) {
      return;
    }

    const extension = findConsoleDomainErrorModalExtension(extensions, detail.error.code);
    const metadata = readConsoleDomainErrorModalExtensionMetadata(extension);
    const endpoint = resolveConsoleDomainErrorModalEndpoint(metadata, {
      pathname: page.url.pathname,
      query: page.url.searchParams.toString(),
      organization,
      error: {
        code: detail.error.code,
        message: detail.error.message,
        status: detail.status,
        requestPath: detail.path,
      },
    });
    if (!extension || !endpoint) {
      return;
    }

    modalTitle = extension.title;
    modalDescription = extension.description ?? detail.error.message;
    modalEndpoint = endpoint;
    modalOpen = true;
  }

  $effect(() => {
    if (!browser) {
      return;
    }

    window.addEventListener(apiDomainErrorEventType, handleDomainError);

    return () => {
      window.removeEventListener(apiDomainErrorEventType, handleDomainError);
    };
  });
</script>

<Dialog.Root bind:open={modalOpen}>
  <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-6xl">
    <Dialog.Header>
      <Dialog.Title>{modalTitle}</Dialog.Title>
      {#if modalDescription}
        <Dialog.Description>{modalDescription}</Dialog.Description>
      {/if}
    </Dialog.Header>
    <div class="max-h-[calc(100vh-12rem)] overflow-y-auto px-0 pb-5">
      {#if modalEndpoint}
        <ConsoleExtensionPage embedded pageEndpointOverride={modalEndpoint} />
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
