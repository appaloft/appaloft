<script lang="ts">
  import { browser } from "$app/environment";
  import { LoaderCircle, TriangleAlert } from "@lucide/svelte";
  import type { Component } from "svelte";

  import {
    activeScopedExtensions,
    isConsoleExtensionPageDocumentV1,
    type ConsoleExtensionPageDocumentV1,
  } from "$lib/extensions";
  import { dashboardClient } from "$lib/data-client";
  import type { DashboardRoute } from "$lib/navigation";
  import type { SystemPluginWebExtension } from "@appaloft/contracts";

  let { route }: { route: DashboardRoute } = $props();

  type ExtensionResponse = { items?: SystemPluginWebExtension[] };
  type LoadedDocument = {
    key: string;
    document: ConsoleExtensionPageDocumentV1;
  };

  let loading = $state(false);
  let failed = $state(false);
  let documents = $state<LoadedDocument[]>([]);
  let Renderer = $state<Component<{ document: ConsoleExtensionPageDocumentV1 }> | null>(null);
  let requestVersion = 0;

  let extensionsPromise: Promise<SystemPluginWebExtension[]> | undefined;
  const visibilityCache = new Map<string, Promise<boolean>>();
  let organizationContextPromise:
    | Promise<{ organizationId: string; organizationRole: string } | null>
    | undefined;

  function loadOrganizationContext(): Promise<{
    organizationId: string;
    organizationRole: string;
  } | null> {
    organizationContextPromise ??= dashboardClient.organizations
      .currentContext({})
      .then((context) => ({
        organizationId: context.currentOrganization.organizationId,
        organizationRole: context.currentOrganization.role,
      }))
      .catch(() => null);
    return organizationContextPromise;
  }

  function loadExtensions(): Promise<SystemPluginWebExtension[]> {
    extensionsPromise ??= fetch("/api/system-plugins/web-extensions", {
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Extension registry returned ${response.status}`);
        const payload = (await response.json()) as ExtensionResponse;
        return Array.isArray(payload.items) ? payload.items : [];
      })
      .catch(() => []);
    return extensionsPromise;
  }

  function loadVisibility(endpoint: string | undefined, extensionKey: string): Promise<boolean> {
    if (!endpoint) return Promise.resolve(true);
    const cacheKey = `${extensionKey}:${endpoint}`;
    const cached = visibilityCache.get(cacheKey);
    if (cached) return cached;
    const pending = fetch(endpoint, { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) return false;
        const payload = (await response.json()) as Record<string, unknown>;
        return payload.visible === true || payload[extensionKey] === true;
      })
      .catch(() => false);
    visibilityCache.set(cacheKey, pending);
    return pending;
  }

  async function load(): Promise<void> {
    if (!browser) return;
    const version = ++requestVersion;
    loading = true;
    failed = false;
    try {
      const extensions = await loadExtensions();
      let contributions = activeScopedExtensions(extensions, route);
      const requiresOrganizationContext = contributions.some((contribution) =>
        JSON.stringify(contribution).includes("{organization"),
      );
      if (requiresOrganizationContext) {
        const organizationContext = await loadOrganizationContext();
        if (organizationContext) {
          contributions = activeScopedExtensions(extensions, route, organizationContext);
        }
      }
      const visible = (
        await Promise.all(
          contributions.map(async (contribution) => ({
            contribution,
            visible: await loadVisibility(
              contribution.visibilityEndpoint,
              contribution.extension.key,
            ),
          })),
        )
      ).filter(({ visible }) => visible);
      const loaded = await Promise.all(
        visible
          .filter(({ contribution }) => Boolean(contribution.pageEndpoint))
          .map(async ({ contribution }) => {
            const response = await fetch(contribution.pageEndpoint ?? "/", {
              credentials: "same-origin",
            });
            if (!response.ok) throw new Error(`Extension page returned ${response.status}`);
            return {
              key: contribution.navigation.key,
              document: await response.json(),
            };
          }),
      );
      if (version !== requestVersion) return;
      documents = loaded.filter(
        (item): item is LoadedDocument => isConsoleExtensionPageDocumentV1(item.document),
      );
      if (documents.length && !Renderer) {
        Renderer = (await import("./ExtensionPageRenderer.svelte")).default;
      }
    } catch {
      if (version === requestVersion) {
        documents = [];
        failed = true;
      }
    } finally {
      if (version === requestVersion) loading = false;
    }
  }

  $effect(() => {
    route;
    void load();
    return () => {
      requestVersion += 1;
    };
  });
</script>

{#if loading && documents.length === 0}
  <div class="mt-4 flex items-center gap-2 rounded-[12px] border border-divider bg-surface p-4 text-xs text-muted-foreground">
    <LoaderCircle class="size-4 animate-spin" />
    Loading extensions
  </div>
{:else if failed}
  <div class="mt-4 flex items-center gap-2 rounded-[12px] border border-destructive/20 bg-destructive/[0.04] p-4 text-xs text-muted-foreground">
    <TriangleAlert class="size-4 text-destructive" />
    Extension content is unavailable.
  </div>
{:else if Renderer}
  <div class="mt-4 space-y-4" data-scoped-extensions>
    {#each documents as item (item.key)}
      <Renderer document={item.document} />
    {/each}
  </div>
{/if}
