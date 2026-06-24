<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { AlertTriangle, ArrowUpRight, ChevronDown, ChevronUp } from "@lucide/svelte";
  import { createQuery, queryOptions } from "@tanstack/svelte-query";

  import { readErrorMessage, request } from "$lib/api/client";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import {
    findConsolePanelExtensionsByPlacement,
    readConsolePageExtensionMetadata,
    resolveConsolePageEndpoint,
  } from "$lib/console/console-page-extension";
  import { orpc } from "$lib/orpc";
  import { i18nKeys, t } from "$lib/i18n";
  import type { SystemPluginWebExtension } from "@appaloft/contracts";

  type ConsolePageDocument = {
    schemaVersion: "appaloft.console.extension-page/v1";
    title: string;
    description?: string;
    badge?: string;
    collapsedByDefault?: boolean;
    expandLabel?: string;
    collapseLabel?: string;
    actions?: ConsolePageAction[];
    sections: ConsolePageSection[];
  };

  type ConsolePageAction = {
    label: string;
    href: string;
    variant?: "primary" | "secondary";
    external?: boolean;
  };

  type ConsolePageSection = ConsolePagePanelGridSection | ConsolePageCalloutSection;

  type ConsolePagePanelGridSection = {
    kind: "panel-grid";
    title?: string;
    description?: string;
    items: ConsolePagePanelItem[];
  };

  type ConsolePagePanelItem = {
    title: string;
    description?: string;
    rows?: ConsolePageKeyValue[];
    actions?: ConsolePageRequestAction[];
    tone?: ConsolePageTone;
  };

  type ConsolePageRequestAction = {
    label: string;
    endpoint: string;
    method?: "POST";
    body?: Record<string, unknown>;
    variant?: "primary" | "secondary";
    disabled?: boolean;
    disabledReason?: string;
    redirectUrlField?: string;
    confirmation?: {
      message: string;
    };
  };

  type ConsolePageKeyValue = {
    label: string;
    value: string;
    tone?: ConsolePageTone;
  };

  type ConsolePageCalloutSection = {
    kind: "callouts";
    items: ConsolePageCallout[];
  };

  type ConsolePageCallout = {
    title: string;
    description?: string;
    tone?: ConsolePageTone;
  };

  type ConsolePageTone = "default" | "muted" | "positive" | "warning" | "danger";

  type SystemPluginWebExtensionsResponse = {
    items: SystemPluginWebExtension[];
  };
  type SystemPluginWebExtensionVisibilityResponse = {
    visible: boolean;
  };

  type ConsolePanelDocumentResult = {
    extension: SystemPluginWebExtension;
    document: ConsolePageDocument;
  };

  type ConsolePanelEndpoint = {
    extension: SystemPluginWebExtension;
    endpoint: string;
  };

  type Props = {
    placement: SystemPluginWebExtension["placement"];
    projectId?: string;
    environmentId?: string;
    resourceId?: string;
    deploymentId?: string;
    previewEnvironmentId?: string;
    class?: string;
  };

  let {
    placement,
    projectId = "",
    environmentId = "",
    resourceId = "",
    deploymentId = "",
    previewEnvironmentId = "",
    class: className = "",
  }: Props = $props();
  let pendingActionKey = $state<string | null>(null);
  let actionErrorMessage = $state("");
  let confirmationAction = $state<{
    action: ConsolePageRequestAction;
    item?: ConsolePagePanelItem;
  } | null>(null);
  let confirmationOpen = $state(false);
  let expandedPanelKeys = $state<Record<string, boolean>>({});

  const webExtensionsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["system-plugins", "web-extensions"],
      queryFn: () => request<SystemPluginWebExtensionsResponse>("/api/system-plugins/web-extensions"),
      enabled: browser,
      staleTime: 30_000,
    }),
  );
  const organizationContextQuery = createQuery(() =>
    orpc.organizations.currentContext.queryOptions({
      input: {},
      enabled: browser,
      retry: 0,
      staleTime: 30_000,
    }),
  );

  const currentOrganization = $derived(organizationContextQuery.data?.currentOrganization ?? null);
  const extensions = $derived(
    findConsolePanelExtensionsByPlacement(webExtensionsQuery.data?.items ?? [], placement),
  );
  const visibilityExtensionEndpoints = $derived.by(() =>
    extensions
      .map((extension) => {
        const endpoint = resolvePanelExtensionVisibilityEndpoint(extension);
        return endpoint ? { key: extension.key, endpoint } : null;
      })
      .filter((entry): entry is { key: string; endpoint: string } => entry !== null),
  );
  const extensionVisibilityQuery = createQuery(() =>
    queryOptions({
      queryKey: [
        "console-extension-panel-visibility",
        placement,
        projectId,
        environmentId,
        resourceId,
        deploymentId,
        previewEnvironmentId,
        currentOrganization?.organizationId ?? "",
        visibilityExtensionEndpoints
          .map((entry) => `${entry.key}:${entry.endpoint}`)
          .join("|"),
      ],
      queryFn: async () => {
        const entries = await Promise.all(
          visibilityExtensionEndpoints.map(async (entry) => {
            const result = await request<SystemPluginWebExtensionVisibilityResponse>(entry.endpoint);
            return [entry.key, result.visible === true] as const;
          }),
        );
        return Object.fromEntries(entries);
      },
      enabled:
        browser &&
        visibilityExtensionEndpoints.length > 0 &&
        !organizationContextQuery.isPending,
      staleTime: 30_000,
    }),
  );
  const extensionVisibility = $derived(extensionVisibilityQuery.data ?? {});
  const visibilityPending = $derived(
    visibilityExtensionEndpoints.length > 0 && extensionVisibilityQuery.isPending,
  );
  const visibleExtensions = $derived(extensions.filter(isPanelExtensionVisible));
  const endpointEntries = $derived<ConsolePanelEndpoint[]>(
    visibleExtensions
      .map((extension) => {
        const metadata = readConsolePageExtensionMetadata(extension);
        const endpoint = resolveConsolePageEndpoint(metadata, {
          pathname: page.url.pathname,
          query: page.url.searchParams.toString(),
          organization: currentOrganization,
          projectId,
          environmentId,
          resourceId,
          deploymentId,
          previewEnvironmentId,
        });

        return endpoint ? { extension, endpoint } : null;
      })
      .filter((entry): entry is ConsolePanelEndpoint => entry !== null),
  );
  const endpointKey = $derived(endpointEntries.map((entry) => entry.endpoint).join("\n"));
  const panelDocumentsQuery = createQuery(() =>
    queryOptions({
      queryKey: [
        "console-extension-panels",
        placement,
        projectId,
        environmentId,
        resourceId,
        deploymentId,
        previewEnvironmentId,
        endpointKey,
      ],
      queryFn: () =>
        Promise.all(
          endpointEntries.map(async ({ extension, endpoint }) => ({
            extension,
            document: await request<ConsolePageDocument>(endpoint),
          })),
        ),
      enabled:
        browser &&
        endpointEntries.length > 0 &&
        !organizationContextQuery.isPending &&
        !webExtensionsQuery.isPending &&
        !visibilityPending,
      placeholderData: (previousData) => previousData,
      staleTime: 15_000,
    }),
  );

  const panelResults = $derived<ConsolePanelDocumentResult[]>(panelDocumentsQuery.data ?? []);
  const visiblePanelResults = $derived(
    panelResults.filter(
      (result) => result.document.sections.length > 0 || (result.document.actions?.length ?? 0) > 0,
    ),
  );
  const loading = $derived(
    webExtensionsQuery.isPending ||
      organizationContextQuery.isPending ||
      visibilityPending ||
      (endpointEntries.length > 0 && panelDocumentsQuery.isPending && !panelDocumentsQuery.data),
  );
  const errorMessage = $derived(
    webExtensionsQuery.error
      ? readErrorMessage(webExtensionsQuery.error)
        : organizationContextQuery.error
          ? readErrorMessage(organizationContextQuery.error)
          : extensionVisibilityQuery.error
            ? readErrorMessage(extensionVisibilityQuery.error)
            : panelDocumentsQuery.error
              ? readErrorMessage(panelDocumentsQuery.error)
              : "",
  );

  function toneClass(tone: ConsolePageTone | undefined): string {
    if (tone === "positive") return "text-emerald-600 dark:text-emerald-400";
    if (tone === "warning") return "text-amber-600 dark:text-amber-400";
    if (tone === "danger") return "text-destructive";
    if (tone === "muted") return "text-muted-foreground";
    return "text-foreground";
  }

  function panelToneClass(tone: ConsolePageTone | undefined): string {
    if (tone === "warning") return "border-amber-200 bg-amber-50/60 dark:border-amber-400/30 dark:bg-amber-400/10";
    if (tone === "danger") return "border-destructive/30 bg-destructive/5";
    if (tone === "positive") return "border-emerald-200 bg-emerald-50/60 dark:border-emerald-400/30 dark:bg-emerald-400/10";
    return "";
  }

  function requestActionKey(action: ConsolePageRequestAction, item?: ConsolePagePanelItem): string {
    return `${item?.title ?? "panel"}:${action.method ?? "POST"}:${action.endpoint}:${action.label}`;
  }

  function panelKey(result: ConsolePanelDocumentResult): string {
    return result.extension.key;
  }

  function isPanelExpanded(result: ConsolePanelDocumentResult): boolean {
    const key = panelKey(result);
    return !result.document.collapsedByDefault || expandedPanelKeys[key] === true;
  }

  function isPanelExtensionVisible(extension: SystemPluginWebExtension): boolean {
    const endpoint = resolvePanelExtensionVisibilityEndpoint(extension);
    if (!endpoint) {
      return true;
    }
    return extensionVisibility[extension.key] === true;
  }

  function resolvePanelExtensionVisibilityEndpoint(
    extension: SystemPluginWebExtension,
  ): string | null {
    const endpoint = readVisibilityEndpoint(extension);
    if (!endpoint) {
      return null;
    }
    return endpoint
      .replaceAll("{pathname}", encodeURIComponent(page.url.pathname))
      .replaceAll("{query}", encodeURIComponent(page.url.searchParams.toString()))
      .replaceAll("{organizationId}", encodeURIComponent(currentOrganization?.organizationId ?? ""))
      .replaceAll("{organizationSlug}", encodeURIComponent(currentOrganization?.slug ?? ""))
      .replaceAll("{organizationName}", encodeURIComponent(currentOrganization?.name ?? ""))
      .replaceAll("{organizationRole}", encodeURIComponent(currentOrganization?.role ?? ""))
      .replaceAll("{projectId}", encodeURIComponent(projectId))
      .replaceAll("{environmentId}", encodeURIComponent(environmentId))
      .replaceAll("{resourceId}", encodeURIComponent(resourceId))
      .replaceAll("{deploymentId}", encodeURIComponent(deploymentId))
      .replaceAll("{previewEnvironmentId}", encodeURIComponent(previewEnvironmentId));
  }

  function readVisibilityEndpoint(extension: SystemPluginWebExtension): string | null {
    const metadata = extension.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return null;
    }
    const endpoint = metadata.visibilityEndpoint;
    return typeof endpoint === "string" && endpoint.length > 0 ? endpoint : null;
  }

  function togglePanel(result: ConsolePanelDocumentResult): void {
    const key = panelKey(result);
    expandedPanelKeys = {
      ...expandedPanelKeys,
      [key]: !isPanelExpanded(result),
    };
  }

  async function runRequestAction(
    action: ConsolePageRequestAction,
    item?: ConsolePagePanelItem,
    options: { confirmed?: boolean } = {},
  ): Promise<void> {
    if (action.disabled) {
      actionErrorMessage = action.disabledReason ?? "";
      return;
    }
    if (action.confirmation && !options.confirmed) {
      confirmationAction = { action, item };
      confirmationOpen = true;
      return;
    }

    const actionKey = requestActionKey(action, item);
    pendingActionKey = actionKey;
    actionErrorMessage = "";
    try {
      const response = await request<Record<string, unknown>>(action.endpoint, {
        method: action.method ?? "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action.body ?? {}),
      });
      if (response.accepted === false) {
        actionErrorMessage =
          typeof response.reason === "string"
            ? response.reason
            : $t(i18nKeys.errors.web.unknownRequestFailure);
        return;
      }

      const redirectUrlField = action.redirectUrlField ?? "url";
      const redirectUrl = response[redirectUrlField];
      if (typeof redirectUrl === "string" && redirectUrl.length > 0) {
        window.location.assign(redirectUrl);
        return;
      }

      await panelDocumentsQuery.refetch();
    } catch (error) {
      actionErrorMessage = readErrorMessage(error);
    } finally {
      pendingActionKey = null;
    }
  }

  function cancelRequestActionConfirmation(): void {
    confirmationOpen = false;
    confirmationAction = null;
  }

  function confirmRequestAction(): void {
    const entry = confirmationAction;
    if (!entry) {
      return;
    }
    confirmationOpen = false;
    confirmationAction = null;
    void runRequestAction(entry.action, entry.item, { confirmed: true });
  }
</script>

{#if loading}
  <div class={["space-y-3", className]} data-console-extension-panel-host={placement}>
    <Skeleton class="h-28 w-full" />
  </div>
{:else if errorMessage}
  <section
    class={["console-panel space-y-3 border-destructive/25 bg-destructive/5 p-5", className]}
    data-console-extension-panel-host={placement}
  >
    <h2 class="flex items-center gap-2 text-base font-semibold text-destructive">
      <AlertTriangle class="size-4" />
      {$t(i18nKeys.errors.web.unknownRequestFailure)}
    </h2>
    <p class="text-sm text-muted-foreground">{errorMessage}</p>
  </section>
{:else if visiblePanelResults.length > 0}
  <div class={["space-y-4", className]} data-console-extension-panel-host={placement}>
    {#if actionErrorMessage}
      <section class="console-panel border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
        {actionErrorMessage}
      </section>
    {/if}
    {#each visiblePanelResults as result (result.extension.key)}
      {@const document = result.document}
      <section class="console-panel space-y-4 p-5" data-console-extension-panel>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0 space-y-1">
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <h2 class="truncate text-base font-semibold">{document.title}</h2>
              {#if document.badge}
                <Badge variant="outline">{document.badge}</Badge>
              {/if}
            </div>
            {#if document.description}
              <p class="text-sm leading-6 text-muted-foreground">{document.description}</p>
            {/if}
          </div>
          {#if document.actions?.length || document.collapsedByDefault}
            <div class="flex shrink-0 flex-wrap gap-2">
              {#each document.actions ?? [] as action (action.href)}
                <Button
                  href={action.href}
                  target={action.external ? "_blank" : undefined}
                  rel={action.external ? "noreferrer" : undefined}
                  variant={action.variant === "primary" ? "default" : "outline"}
                  size="sm"
                >
                  {action.label}
                  {#if action.external}
                    <ArrowUpRight class="size-4" />
                  {/if}
                </Button>
              {/each}
              {#if document.collapsedByDefault && document.sections.length > 0}
                {@const expanded = isPanelExpanded(result)}
                <Button type="button" variant="outline" size="sm" onclick={() => togglePanel(result)}>
                  {expanded
                    ? (document.collapseLabel ?? $t(i18nKeys.common.actions.close))
                    : (document.expandLabel ?? $t(i18nKeys.common.actions.view))}
                  {#if expanded}
                    <ChevronUp class="size-4" />
                  {:else}
                    <ChevronDown class="size-4" />
                  {/if}
                </Button>
              {/if}
            </div>
          {/if}
        </div>

        {#if isPanelExpanded(result)}
          {#each document.sections as section, sectionIndex (`${section.kind}-${sectionIndex}`)}
            {#if section.kind === "callouts"}
              <div class="space-y-2">
                {#each section.items as item (item.title)}
                  <article class={["rounded-md border px-3 py-2", panelToneClass(item.tone)]}>
                    <p class={["text-sm font-medium", toneClass(item.tone)]}>{item.title}</p>
                    {#if item.description}
                      <p class="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</p>
                    {/if}
                  </article>
                {/each}
              </div>
            {:else if section.kind === "panel-grid"}
              <div class="space-y-3">
                {#if section.title || section.description}
                  <div class="space-y-1">
                    {#if section.title}
                      <h3 class="text-sm font-semibold">{section.title}</h3>
                    {/if}
                    {#if section.description}
                      <p class="text-sm leading-6 text-muted-foreground">{section.description}</p>
                    {/if}
                  </div>
                {/if}
                <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {#each section.items as item (item.title)}
                    <article class={["rounded-md border bg-background p-4", panelToneClass(item.tone)]}>
                      <h4 class="text-sm font-semibold">{item.title}</h4>
                      {#if item.description}
                        <p class="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</p>
                      {/if}
                      {#if item.rows?.length}
                        <dl class="mt-3 space-y-2">
                          {#each item.rows as row (row.label)}
                            <div class="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                              <dt class="text-xs text-muted-foreground">{row.label}</dt>
                              <dd class={["break-all text-sm font-medium", toneClass(row.tone)]}>{row.value}</dd>
                            </div>
                          {/each}
                        </dl>
                      {/if}
                      {#if item.actions?.length}
                        <div class="mt-4 flex flex-wrap gap-2">
                          {#each item.actions as action (requestActionKey(action, item))}
                            <Button
                              type="button"
                              variant={action.variant === "primary" ? "default" : "outline"}
                              size="sm"
                              disabled={Boolean(action.disabled) ||
                                pendingActionKey === requestActionKey(action, item)}
                              onclick={() => runRequestAction(action, item)}
                            >
                              {pendingActionKey === requestActionKey(action, item)
                                ? $t(i18nKeys.common.status.loading)
                                : action.label}
                            </Button>
                          {/each}
                        </div>
                        {#each item.actions as action (requestActionKey(action, item))}
                          {#if action.disabled && action.disabledReason}
                            <p class="mt-2 text-xs text-muted-foreground">{action.disabledReason}</p>
                          {/if}
                        {/each}
                      {/if}
                    </article>
                  {/each}
                </div>
              </div>
            {/if}
          {/each}
        {/if}
      </section>
    {/each}
  </div>
{/if}

<Dialog.Root bind:open={confirmationOpen}>
  <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-md">
    {#if confirmationAction?.action.confirmation}
      <Dialog.Header>
        <Dialog.Title>{confirmationAction.action.label}</Dialog.Title>
        <Dialog.Description>
          {confirmationAction.action.confirmation.message}
        </Dialog.Description>
      </Dialog.Header>
      <div class="flex justify-end gap-2 px-5 pb-5 sm:px-8 sm:pb-8">
        <Button type="button" variant="outline" onclick={cancelRequestActionConfirmation}>
          {$t(i18nKeys.common.actions.cancel)}
        </Button>
        <Button type="button" onclick={confirmRequestAction}>
          {confirmationAction.action.label}
        </Button>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
