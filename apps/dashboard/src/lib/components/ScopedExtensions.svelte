<script lang="ts">
  import { browser } from "$app/environment";
  import { LoaderCircle, TriangleAlert } from "@lucide/svelte";
  import type { Component } from "svelte";

  import {
    activeScopedExtensions,
    isConsoleExtensionPageDocumentV1,
    type ActiveScopedExtension,
    type ConsoleExtensionPageDocumentV1,
  } from "$lib/extensions";
  import { dashboardClient } from "$lib/data-client";
  import { dashboardI18n as i18n } from "$lib/i18n.svelte";
  import type { DashboardRoute } from "$lib/navigation";
  import type { SystemPluginWebExtension } from "@appaloft/contracts";

  let { route }: { route: DashboardRoute } = $props();

  type ExtensionResponse = { items?: SystemPluginWebExtension[] };
  let loading = $state(false);
  let failed = $state(false);
  let items = $state<ActiveScopedExtension[]>([]);
  let activeKey = $state("");
  let document = $state<ConsoleExtensionPageDocumentV1>();
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

  function extensionLabel(item: ActiveScopedExtension): string {
    return item.extension.localizations?.[i18n.locale]?.title ?? item.extension.title;
  }

  async function loadDocument(item: ActiveScopedExtension, version: number): Promise<void> {
    const response = await fetch(item.pageEndpoint ?? "/", { credentials: "same-origin" });
    if (!response.ok) throw new Error(`Extension page returned ${response.status}`);
    const payload: unknown = await response.json();
    if (!isConsoleExtensionPageDocumentV1(payload)) {
      throw new Error("Extension page returned an unsupported document");
    }
    if (version !== requestVersion || activeKey !== item.navigation.key) return;
    document = payload;
    if (!Renderer) Renderer = (await import("./ExtensionPageRenderer.svelte")).default;
  }

  async function select(item: ActiveScopedExtension): Promise<void> {
    const version = ++requestVersion;
    activeKey = item.navigation.key;
    document = undefined;
    loading = true;
    failed = false;
    try {
      await loadDocument(item, version);
    } catch {
      if (version === requestVersion) failed = true;
    } finally {
      if (version === requestVersion) loading = false;
    }
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
      if (version !== requestVersion) return;
      items = visible
        .map(({ contribution }) => contribution)
        .filter((contribution) => Boolean(contribution.pageEndpoint));
      const selected = items.find((item) => item.navigation.key === activeKey) ?? items[0];
      activeKey = selected?.navigation.key ?? "";
      document = undefined;
      if (selected) {
        await loadDocument(selected, version);
      }
    } catch {
      if (version === requestVersion) {
        items = [];
        document = undefined;
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

{#if loading && items.length === 0}
  <div class="mt-4 flex items-center gap-2 rounded-[12px] border border-divider bg-surface p-4 text-xs text-muted-foreground">
    <LoaderCircle class="size-4 animate-spin" />
    Loading extensions
  </div>
{:else if failed}
  <div class="mt-4 flex items-center gap-2 rounded-[12px] border border-destructive/20 bg-destructive/[0.04] p-4 text-xs text-muted-foreground">
    <TriangleAlert class="size-4 text-destructive" />
    Extension content is unavailable.
  </div>
{:else if items.length > 0}
  <div class="mt-4" data-scoped-extensions>
    {#if items.length > 1}
      <section class="mb-4 rounded-[16px] border border-divider bg-surface p-2 sm:flex sm:items-center sm:gap-2" aria-label={i18n.locale === "zh-CN" ? "Cloud 设置分类" : "Cloud settings sections"}>
        <p class="px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground sm:mr-auto">{i18n.locale === "zh-CN" ? "Cloud 设置" : "Cloud settings"}</p>
        <div class="flex gap-1 overflow-x-auto pb-1 sm:pb-0">
          {#each items as item (item.navigation.key)}
            <button
              type="button"
              data-scoped-extension={item.navigation.key}
              class={`shrink-0 rounded-[9px] px-3 py-2 text-xs font-medium transition-colors ${activeKey === item.navigation.key ? "bg-surface-selected text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              aria-pressed={activeKey === item.navigation.key}
              onclick={() => void select(item)}
            >{extensionLabel(item)}</button>
          {/each}
        </div>
      </section>
    {/if}
    {#if loading}
      <div class="flex min-h-40 items-center justify-center rounded-[16px] border border-divider bg-surface text-xs text-muted-foreground"><LoaderCircle class="mr-2 size-4 animate-spin" />{i18n.locale === "zh-CN" ? "加载 Cloud 设置…" : "Loading Cloud settings…"}</div>
    {:else if Renderer && document}
      <Renderer {document} />
    {/if}
  </div>
{/if}
