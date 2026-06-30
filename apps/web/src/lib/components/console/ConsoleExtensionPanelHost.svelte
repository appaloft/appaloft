<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import {
    AlertTriangle,
    ArrowUpRight,
    ChevronDown,
    ChevronUp,
    Copy,
    LoaderCircle,
  } from "@lucide/svelte";
  import { createQuery, queryOptions } from "@tanstack/svelte-query";

  import { readErrorMessage, request } from "$lib/api/client";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import {
    createLocalizedConsolePageEndpoint,
    findConsolePanelExtensionsByPlacement,
    readConsolePageExtensionMetadata,
    resolveConsolePageEndpoint,
  } from "$lib/console/console-page-extension";
  import { orpc } from "$lib/orpc";
  import { i18nKeys, locale, t } from "$lib/i18n";
  import type { SystemPluginWebExtension } from "@appaloft/contracts";

  type ConsolePageDocument = {
    schemaVersion: "appaloft.console.extension-page/v1";
    title: string;
    description?: string;
    badge?: string;
    chrome?: "panel" | "none";
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

  type ConsolePageSection =
    | ConsolePagePanelGridSection
    | ConsolePageDialogPanelGridSection
    | ConsolePageEnvironmentCopyDialogSection
    | ConsolePageCalloutSection;

  type ConsolePagePanelGridSection = {
    kind: "panel-grid";
    title?: string;
    description?: string;
    items: ConsolePagePanelItem[];
  };

  type ConsolePageDialogPanelGridSection = {
    kind: "dialog-panel-grid";
    title: string;
    description?: string;
    triggerLabel: string;
    dialogTitle?: string;
    dialogDescription?: string;
    items: ConsolePagePanelItem[];
  };

  type ConsolePageEnvironmentCopyDialogSection = {
    kind: "environment-copy-dialog";
    title: string;
    description?: string;
    entryLayout?: "button-only" | "panel";
    triggerLabel: string;
    dialogTitle?: string;
    dialogDescription?: string;
    sourceLabel?: string;
    sourceValue?: string;
    targetNameLabel: string;
    targetNamePlaceholder?: string;
    defaultTargetName: string;
    summaryTitle: string;
    summaryDescription?: string;
    summaryRows: ConsolePageKeyValue[];
    advancedTitle: string;
    advancedDescription?: string;
    advancedToggleLabel: string;
    sharedSourceLabel: string;
    sharedSourceDescription: string;
    sharedSourceAckLabel: string;
    databaseRestoreLabel: string;
    databaseRestoreDescription: string;
    databaseBackupLabel: string;
    databaseBackupPlaceholder?: string;
    domainRebindLabel: string;
    domainRebindDescription: string;
    domainTargetHostLabel: string;
    domainTargetHostPlaceholder?: string;
    storageRestoreLabel: string;
    storageRestoreDescription: string;
    storageBackupLabel: string;
    storageBackupPlaceholder?: string;
    storageImportLabel: string;
    storageImportDescription: string;
    storageArtifactLabel: string;
    storageArtifactPlaceholder?: string;
    submitLabel: string;
    cancelLabel?: string;
    applyAction: ConsolePageRequestAction;
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
    presentation?: "panel" | "actions";
    projectId?: string;
    environmentId?: string;
    environmentName?: string;
    resourceId?: string;
    deploymentId?: string;
    previewEnvironmentId?: string;
    class?: string;
  };

  let {
    placement,
    presentation = "panel",
    projectId = "",
    environmentId = "",
    environmentName = "",
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
  let selectedDialogPanelSection = $state<ConsolePageDialogPanelGridSection | null>(null);
  let dialogPanelOpen = $state(false);
  let selectedEnvironmentCopySection = $state<ConsolePageEnvironmentCopyDialogSection | null>(null);
  let environmentCopyDialogOpen = $state(false);
  let environmentCopyTargetName = $state("");
  let environmentCopyAdvancedOpen = $state(false);
  let environmentCopyReuseSource = $state(false);
  let environmentCopySharedSourceAck = $state(false);
  let environmentCopyRestoreDatabase = $state(false);
  let environmentCopyDatabaseBackupId = $state("");
  let environmentCopyRebindDomain = $state(false);
  let environmentCopyDomainTargetHost = $state("");
  let environmentCopyRestoreStorage = $state(false);
  let environmentCopyStorageBackupId = $state("");
  let environmentCopyImportStorage = $state(false);
  let environmentCopyStorageArtifactRef = $state("");

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
        environmentName,
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
          environmentName,
          resourceId,
          deploymentId,
          previewEnvironmentId,
        });

        const localizedEndpoint = createLocalizedConsolePageEndpoint(endpoint, $locale);

        return localizedEndpoint ? { extension, endpoint: localizedEndpoint } : null;
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
        environmentName,
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
    panelResults.filter((result) => {
      if (presentation === "actions") {
        return result.document.sections.some((section) => section.kind === "environment-copy-dialog");
      }
      if (result.document.chrome === "none") {
        return false;
      }
      return result.document.sections.length > 0 || (result.document.actions?.length ?? 0) > 0;
    }),
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
    const resolved = endpoint
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
    return createLocalizedConsolePageEndpoint(resolved, $locale);
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

  function openDialogPanel(section: ConsolePageDialogPanelGridSection): void {
    selectedDialogPanelSection = section;
    dialogPanelOpen = true;
  }

  function openEnvironmentCopyDialog(section: ConsolePageEnvironmentCopyDialogSection): void {
    selectedEnvironmentCopySection = section;
    environmentCopyTargetName = section.defaultTargetName;
    environmentCopyAdvancedOpen = false;
    environmentCopyReuseSource = false;
    environmentCopySharedSourceAck = false;
    environmentCopyRestoreDatabase = false;
    environmentCopyDatabaseBackupId = "";
    environmentCopyRebindDomain = false;
    environmentCopyDomainTargetHost = "";
    environmentCopyRestoreStorage = false;
    environmentCopyStorageBackupId = "";
    environmentCopyImportStorage = false;
    environmentCopyStorageArtifactRef = "";
    actionErrorMessage = "";
    environmentCopyDialogOpen = true;
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

  function environmentCopyActionKey(section: ConsolePageEnvironmentCopyDialogSection): string {
    return `environment-copy:${section.applyAction.method ?? "POST"}:${section.applyAction.endpoint}`;
  }

  function environmentCopySubmitDisabled(section: ConsolePageEnvironmentCopyDialogSection): boolean {
    if (!environmentCopyTargetName.trim()) return true;
    if (environmentCopyReuseSource && !environmentCopySharedSourceAck) return true;
    if (environmentCopyRestoreDatabase && !environmentCopyDatabaseBackupId.trim()) return true;
    if (environmentCopyRebindDomain && !environmentCopyDomainTargetHost.trim()) return true;
    if (environmentCopyRestoreStorage && !environmentCopyStorageBackupId.trim()) return true;
    if (environmentCopyImportStorage && !environmentCopyStorageArtifactRef.trim()) return true;
    return pendingActionKey === environmentCopyActionKey(section);
  }

  function environmentCopyHasAdvancedSelection(): boolean {
    return (
      environmentCopyReuseSource ||
      environmentCopyRestoreDatabase ||
      environmentCopyRebindDomain ||
      environmentCopyRestoreStorage ||
      environmentCopyImportStorage
    );
  }

  function environmentCopySummaryRows(
    section: ConsolePageEnvironmentCopyDialogSection,
  ): ConsolePageKeyValue[] {
    return section.summaryRows.map((row) => {
      const label = row.label.toLowerCase();
      if (label.includes("depend") || row.label.includes("依赖")) {
        return environmentCopyReuseSource
          ? { ...row, value: section.sharedSourceLabel, tone: "warning" }
          : row;
      }
      if (label.includes("database") || row.label.includes("数据库")) {
        return environmentCopyRestoreDatabase
          ? {
              ...row,
              value: environmentCopyDatabaseBackupId.trim()
                ? `${section.databaseRestoreLabel}: ${environmentCopyDatabaseBackupId.trim()}`
                : section.databaseRestoreLabel,
              tone: "warning",
            }
          : row;
      }
      if (label.includes("domain") || row.label.includes("域名")) {
        return environmentCopyRebindDomain
          ? {
              ...row,
              value: environmentCopyDomainTargetHost.trim()
                ? `${section.domainRebindLabel}: ${environmentCopyDomainTargetHost.trim()}`
                : section.domainRebindLabel,
              tone: "warning",
            }
          : row;
      }
      if (label.includes("storage") || row.label.includes("存储")) {
        if (environmentCopyRestoreStorage) {
          return {
            ...row,
            value: environmentCopyStorageBackupId.trim()
              ? `${section.storageRestoreLabel}: ${environmentCopyStorageBackupId.trim()}`
              : section.storageRestoreLabel,
            tone: "warning",
          };
        }
        if (environmentCopyImportStorage) {
          return {
            ...row,
            value: environmentCopyStorageArtifactRef.trim()
              ? `${section.storageImportLabel}: ${environmentCopyStorageArtifactRef.trim()}`
              : section.storageImportLabel,
            tone: "warning",
          };
        }
      }
      return row;
    });
  }

  function environmentCopyBody(section: ConsolePageEnvironmentCopyDialogSection): Record<string, unknown> {
    return {
      ...(section.applyAction.body ?? {}),
      targetName: environmentCopyTargetName.trim(),
      dependencyPolicy: environmentCopyReuseSource ? "reuse-source" : "create-new-managed",
      acknowledgeSharedSource: environmentCopyReuseSource && environmentCopySharedSourceAck,
      databaseDataPolicy: environmentCopyRestoreDatabase ? "restore" : "empty",
      ...(environmentCopyRestoreDatabase
        ? { databaseBackupId: environmentCopyDatabaseBackupId.trim() }
        : {}),
      domainPolicy: environmentCopyRebindDomain ? "rebind" : "generated-route",
      ...(environmentCopyRebindDomain ? { targetHost: environmentCopyDomainTargetHost.trim() } : {}),
      storagePolicy: environmentCopyImportStorage
        ? "import"
        : environmentCopyRestoreStorage
          ? "restore"
          : "empty-volume",
      ...(environmentCopyRestoreStorage
        ? { storageBackupId: environmentCopyStorageBackupId.trim() }
        : {}),
      ...(environmentCopyImportStorage
        ? { storageArtifactRef: environmentCopyStorageArtifactRef.trim() }
        : {}),
    };
  }

  async function submitEnvironmentCopy(section: ConsolePageEnvironmentCopyDialogSection): Promise<void> {
    if (environmentCopySubmitDisabled(section)) return;

    const actionKey = environmentCopyActionKey(section);
    pendingActionKey = actionKey;
    actionErrorMessage = "";
    try {
      const response = await request<Record<string, unknown>>(section.applyAction.endpoint, {
        method: section.applyAction.method ?? "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(environmentCopyBody(section)),
      });
      if (response.accepted === false) {
        actionErrorMessage =
          typeof response.reason === "string"
            ? response.reason
            : $t(i18nKeys.errors.web.unknownRequestFailure);
        return;
      }

      const redirectUrlField = section.applyAction.redirectUrlField ?? "url";
      const redirectUrl = response[redirectUrlField];
      if (typeof redirectUrl === "string" && redirectUrl.length > 0) {
        window.location.assign(redirectUrl);
        return;
      }

      environmentCopyDialogOpen = false;
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

{#if loading && presentation === "panel"}
  <div class={["space-y-3", className]} data-console-extension-panel-host={placement}>
    <Skeleton class="h-28 w-full" />
  </div>
{:else if errorMessage && presentation === "panel"}
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
  {#if presentation === "actions"}
    <div class={["flex flex-wrap items-center gap-1", className]} data-console-extension-panel-host={placement}>
      {#each visiblePanelResults as result (result.extension.key)}
        {#each result.document.sections as section, sectionIndex (`${section.kind}-${sectionIndex}`)}
          {#if section.kind === "environment-copy-dialog"}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onclick={() => openEnvironmentCopyDialog(section)}
            >
              <Copy class="size-4" />
              {section.triggerLabel}
            </Button>
          {/if}
        {/each}
      {/each}
    </div>
  {:else}
  <div class={["space-y-4", className]} data-console-extension-panel-host={placement}>
    {#if actionErrorMessage}
      <section class="console-panel border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
        {actionErrorMessage}
      </section>
    {/if}
    {#each visiblePanelResults as result (result.extension.key)}
      {@const document = result.document}
      {#if document.chrome === "none"}
        <div class="flex flex-wrap gap-2" data-console-extension-panel>
          {#each document.sections as section, sectionIndex (`${section.kind}-${sectionIndex}`)}
            {#if section.kind === "environment-copy-dialog"}
              <Button type="button" size="sm" onclick={() => openEnvironmentCopyDialog(section)}>
                {section.triggerLabel}
              </Button>
            {/if}
          {/each}
        </div>
      {:else}
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
            {:else if section.kind === "dialog-panel-grid"}
              <div class="flex flex-col gap-3 rounded-md border bg-background p-4 sm:flex-row sm:items-start sm:justify-between">
                <div class="min-w-0 space-y-1">
                  <h3 class="text-sm font-semibold">{section.title}</h3>
                  {#if section.description}
                    <p class="text-sm leading-6 text-muted-foreground">{section.description}</p>
                  {/if}
                </div>
                <Button type="button" class="shrink-0" size="sm" onclick={() => openDialogPanel(section)}>
                  {section.triggerLabel}
                </Button>
              </div>
            {:else if section.kind === "environment-copy-dialog"}
              {#if section.entryLayout === "button-only"}
                <Button type="button" size="sm" onclick={() => openEnvironmentCopyDialog(section)}>
                  {section.triggerLabel}
                </Button>
              {:else}
                <div
                  class="flex flex-col gap-3 rounded-md border bg-background p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div class="min-w-0 space-y-1">
                    <h3 class="text-sm font-semibold">{section.title}</h3>
                    {#if section.description}
                      <p class="text-sm leading-6 text-muted-foreground">{section.description}</p>
                    {/if}
                  </div>
                  <Button
                    type="button"
                    class="shrink-0"
                    size="sm"
                    onclick={() => openEnvironmentCopyDialog(section)}
                  >
                    {section.triggerLabel}
                  </Button>
                </div>
              {/if}
            {/if}
          {/each}
        {/if}
        </section>
      {/if}
    {/each}
  </div>
  {/if}
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

<Dialog.Root bind:open={environmentCopyDialogOpen}>
  <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-3xl">
    {#if selectedEnvironmentCopySection}
      {@const section = selectedEnvironmentCopySection}
      <Dialog.Header>
        <Dialog.Title>{section.dialogTitle ?? section.title}</Dialog.Title>
        {#if section.dialogDescription || section.description}
          <Dialog.Description>
            {section.dialogDescription ?? section.description}
          </Dialog.Description>
        {/if}
      </Dialog.Header>
      <form
        class="max-h-[76vh] space-y-4 overflow-y-auto px-5 pb-5 sm:px-8 sm:pb-8"
        onsubmit={(event) => {
          event.preventDefault();
          void submitEnvironmentCopy(section);
        }}
      >
        {#if actionErrorMessage}
          <div class="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
            {actionErrorMessage}
          </div>
        {/if}
        <label class="grid gap-1.5 text-sm" for="environment-copy-target-name">
          <span class="font-medium">{section.targetNameLabel}</span>
          <input
            id="environment-copy-target-name"
            class="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none ring-ring transition focus-visible:ring-2"
            value={environmentCopyTargetName}
            placeholder={section.targetNamePlaceholder}
            disabled={pendingActionKey === environmentCopyActionKey(section)}
            oninput={(event) => {
              environmentCopyTargetName = event.currentTarget.value;
            }}
          />
        </label>

        <section
          class={[
            "rounded-md border p-4",
            environmentCopyHasAdvancedSelection()
              ? "border-amber-200 bg-amber-50/60 dark:border-amber-400/30 dark:bg-amber-400/10"
              : "bg-muted/20",
          ]}
        >
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0 space-y-1">
              <h3 class="text-sm font-semibold">{section.summaryTitle}</h3>
              {#if section.summaryDescription}
                <p class="text-sm leading-6 text-muted-foreground">{section.summaryDescription}</p>
              {/if}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="shrink-0"
              onclick={() => {
                environmentCopyAdvancedOpen = !environmentCopyAdvancedOpen;
              }}
            >
              {section.advancedToggleLabel}
              {#if environmentCopyAdvancedOpen}
                <ChevronUp class="size-4" />
              {:else}
                <ChevronDown class="size-4" />
              {/if}
            </Button>
          </div>
          <dl class="mt-4 divide-y border-y">
            {#each environmentCopySummaryRows(section) as row (row.label)}
              <div class="grid gap-1 py-2.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-3">
                <dt class="text-xs text-muted-foreground">{row.label}</dt>
                <dd class={["text-sm font-medium", toneClass(row.tone)]}>{row.value}</dd>
              </div>
            {/each}
          </dl>
        </section>

        {#if environmentCopyAdvancedOpen}
          <section class="space-y-3">
            <div>
              <h3 class="text-sm font-semibold">{section.advancedTitle}</h3>
              {#if section.advancedDescription}
                <p class="mt-1 text-sm leading-6 text-muted-foreground">{section.advancedDescription}</p>
              {/if}
            </div>

            <div class="divide-y rounded-md border bg-background">
              <div
                class={[
                  "p-3",
                  environmentCopyReuseSource
                    ? "bg-amber-50/60 dark:bg-amber-400/10"
                    : "",
                ]}
              >
                <label class="flex items-start gap-3 text-sm">
                  <input
                    class="mt-0.5 size-4"
                    type="checkbox"
                    checked={environmentCopyReuseSource}
                    oninput={(event) => {
                      environmentCopyReuseSource = event.currentTarget.checked;
                      if (!environmentCopyReuseSource) environmentCopySharedSourceAck = false;
                    }}
                  />
                  <span class="min-w-0">
                    <span class="block font-medium">{section.sharedSourceLabel}</span>
                    <span class="mt-1 block leading-6 text-muted-foreground">
                      {section.sharedSourceDescription}
                    </span>
                  </span>
                </label>
                {#if environmentCopyReuseSource}
                  <label class="mt-3 ml-7 flex items-start gap-3 text-sm">
                    <input
                      class="mt-0.5 size-4"
                      type="checkbox"
                      checked={environmentCopySharedSourceAck}
                      oninput={(event) => {
                        environmentCopySharedSourceAck = event.currentTarget.checked;
                      }}
                    />
                    <span class="leading-6 text-muted-foreground">{section.sharedSourceAckLabel}</span>
                  </label>
                {/if}
              </div>

              <div
                class={[
                  "p-3",
                  environmentCopyRestoreDatabase
                    ? "bg-amber-50/60 dark:bg-amber-400/10"
                    : "",
                ]}
              >
                <label class="flex items-start gap-3 text-sm">
                  <input
                    class="mt-0.5 size-4"
                    type="checkbox"
                    checked={environmentCopyRestoreDatabase}
                    oninput={(event) => {
                      environmentCopyRestoreDatabase = event.currentTarget.checked;
                    }}
                  />
                  <span class="min-w-0">
                    <span class="block font-medium">{section.databaseRestoreLabel}</span>
                    <span class="mt-1 block leading-6 text-muted-foreground">
                      {section.databaseRestoreDescription}
                    </span>
                  </span>
                </label>
                {#if environmentCopyRestoreDatabase}
                  <label class="mt-3 ml-7 grid gap-1.5 text-sm" for="environment-copy-database-backup">
                    <span class="font-medium">{section.databaseBackupLabel}</span>
                    <input
                      id="environment-copy-database-backup"
                      class="h-9 rounded-md border bg-background px-3 text-sm outline-none ring-ring transition focus-visible:ring-2"
                      value={environmentCopyDatabaseBackupId}
                      placeholder={section.databaseBackupPlaceholder}
                      oninput={(event) => {
                        environmentCopyDatabaseBackupId = event.currentTarget.value;
                      }}
                    />
                  </label>
                {/if}
              </div>

              <div
                class={[
                  "p-3",
                  environmentCopyRebindDomain
                    ? "bg-amber-50/60 dark:bg-amber-400/10"
                    : "",
                ]}
              >
                <label class="flex items-start gap-3 text-sm">
                  <input
                    class="mt-0.5 size-4"
                    type="checkbox"
                    checked={environmentCopyRebindDomain}
                    oninput={(event) => {
                      environmentCopyRebindDomain = event.currentTarget.checked;
                    }}
                  />
                  <span class="min-w-0">
                    <span class="block font-medium">{section.domainRebindLabel}</span>
                    <span class="mt-1 block leading-6 text-muted-foreground">
                      {section.domainRebindDescription}
                    </span>
                  </span>
                </label>
                {#if environmentCopyRebindDomain}
                  <label class="mt-3 ml-7 grid gap-1.5 text-sm" for="environment-copy-domain-host">
                    <span class="font-medium">{section.domainTargetHostLabel}</span>
                    <input
                      id="environment-copy-domain-host"
                      class="h-9 rounded-md border bg-background px-3 text-sm outline-none ring-ring transition focus-visible:ring-2"
                      value={environmentCopyDomainTargetHost}
                      placeholder={section.domainTargetHostPlaceholder}
                      oninput={(event) => {
                        environmentCopyDomainTargetHost = event.currentTarget.value;
                      }}
                    />
                  </label>
                {/if}
              </div>

              <div
                class={[
                  "p-3",
                  environmentCopyRestoreStorage
                    ? "bg-amber-50/60 dark:bg-amber-400/10"
                    : "",
                ]}
              >
                <label class="flex items-start gap-3 text-sm">
                  <input
                    class="mt-0.5 size-4"
                    type="checkbox"
                    checked={environmentCopyRestoreStorage}
                    disabled={environmentCopyImportStorage}
                    oninput={(event) => {
                      environmentCopyRestoreStorage = event.currentTarget.checked;
                    }}
                  />
                  <span class="min-w-0">
                    <span class="block font-medium">{section.storageRestoreLabel}</span>
                    <span class="mt-1 block leading-6 text-muted-foreground">
                      {section.storageRestoreDescription}
                    </span>
                  </span>
                </label>
                {#if environmentCopyRestoreStorage}
                  <label class="mt-3 ml-7 grid gap-1.5 text-sm" for="environment-copy-storage-backup">
                    <span class="font-medium">{section.storageBackupLabel}</span>
                    <input
                      id="environment-copy-storage-backup"
                      class="h-9 rounded-md border bg-background px-3 text-sm outline-none ring-ring transition focus-visible:ring-2"
                      value={environmentCopyStorageBackupId}
                      placeholder={section.storageBackupPlaceholder}
                      oninput={(event) => {
                        environmentCopyStorageBackupId = event.currentTarget.value;
                      }}
                    />
                  </label>
                {/if}
              </div>

              <div
                class={[
                  "p-3",
                  environmentCopyImportStorage
                    ? "bg-amber-50/60 dark:bg-amber-400/10"
                    : "",
                ]}
              >
                <label class="flex items-start gap-3 text-sm">
                  <input
                    class="mt-0.5 size-4"
                    type="checkbox"
                    checked={environmentCopyImportStorage}
                    disabled={environmentCopyRestoreStorage}
                    oninput={(event) => {
                      environmentCopyImportStorage = event.currentTarget.checked;
                    }}
                  />
                  <span class="min-w-0">
                    <span class="block font-medium">{section.storageImportLabel}</span>
                    <span class="mt-1 block leading-6 text-muted-foreground">
                      {section.storageImportDescription}
                    </span>
                  </span>
                </label>
                {#if environmentCopyImportStorage}
                  <label class="mt-3 ml-7 grid gap-1.5 text-sm" for="environment-copy-storage-artifact">
                    <span class="font-medium">{section.storageArtifactLabel}</span>
                    <input
                      id="environment-copy-storage-artifact"
                      class="h-9 rounded-md border bg-background px-3 text-sm outline-none ring-ring transition focus-visible:ring-2"
                      value={environmentCopyStorageArtifactRef}
                      placeholder={section.storageArtifactPlaceholder}
                      oninput={(event) => {
                        environmentCopyStorageArtifactRef = event.currentTarget.value;
                      }}
                    />
                  </label>
                {/if}
              </div>
            </div>
          </section>
        {/if}

        <div class="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onclick={() => (environmentCopyDialogOpen = false)}>
            {section.cancelLabel ?? $t(i18nKeys.common.actions.cancel)}
          </Button>
          <Button type="submit" disabled={environmentCopySubmitDisabled(section)}>
            {#if pendingActionKey === environmentCopyActionKey(section)}
              <LoaderCircle class="size-4 animate-spin" />
              {$t(i18nKeys.common.status.loading)}
            {:else}
              {section.submitLabel}
            {/if}
          </Button>
        </div>
      </form>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={dialogPanelOpen}>
  <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-5xl">
    {#if selectedDialogPanelSection}
      <Dialog.Header>
        <Dialog.Title>
          {selectedDialogPanelSection.dialogTitle ?? selectedDialogPanelSection.title}
        </Dialog.Title>
        {#if selectedDialogPanelSection.dialogDescription || selectedDialogPanelSection.description}
          <Dialog.Description>
            {selectedDialogPanelSection.dialogDescription ?? selectedDialogPanelSection.description}
          </Dialog.Description>
        {/if}
      </Dialog.Header>
      {#if actionErrorMessage}
        <div
          class="mx-5 mt-5 rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive sm:mx-8"
        >
          {actionErrorMessage}
        </div>
      {/if}
      <div class="grid max-h-[70vh] gap-3 overflow-y-auto px-5 pb-5 sm:px-8 sm:pb-8 md:grid-cols-2 xl:grid-cols-3">
        {#each selectedDialogPanelSection.items as item (item.title)}
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
    {/if}
  </Dialog.Content>
</Dialog.Root>
