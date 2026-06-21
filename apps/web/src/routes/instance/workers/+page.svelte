<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { createQuery, queryOptions } from "@tanstack/svelte-query";
  import type { SystemPluginWebExtension } from "@appaloft/contracts";

  import { request } from "$lib/api/client";
  import ConsoleExtensionPage from "$lib/components/console/ConsoleExtensionPage.svelte";
  import { findConsolePageExtensionByPath } from "$lib/console/console-page-extension";
  import InstancePage from "../+page.svelte";

  type SystemPluginWebExtensionsResponse = {
    items: SystemPluginWebExtension[];
  };

  const webExtensionsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["system-plugins", "web-extensions"],
      queryFn: () =>
        request<SystemPluginWebExtensionsResponse>("/api/system-plugins/web-extensions"),
      enabled: browser,
      staleTime: 30_000,
    }),
  );
  const routeExtension = $derived(
    findConsolePageExtensionByPath(webExtensionsQuery.data?.items ?? [], page.url.pathname),
  );
  const waitingForExtensions = $derived(browser && webExtensionsQuery.isPending);
</script>

{#if routeExtension}
  <ConsoleExtensionPage settingsScope="instance" />
{:else if !waitingForExtensions}
  <InstancePage section="workers" />
{/if}
