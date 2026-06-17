<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { AlertTriangle, ArrowUpRight } from "@lucide/svelte";
  import { createQuery, queryOptions } from "@tanstack/svelte-query";

  import { readErrorMessage, request } from "$lib/api/client";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
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
    tone?: ConsolePageTone;
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
  const endpointEntries = $derived<ConsolePanelEndpoint[]>(
    extensions
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
        !webExtensionsQuery.isPending,
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
      (endpointEntries.length > 0 && panelDocumentsQuery.isPending && !panelDocumentsQuery.data),
  );
  const errorMessage = $derived(
    webExtensionsQuery.error
      ? readErrorMessage(webExtensionsQuery.error)
      : organizationContextQuery.error
        ? readErrorMessage(organizationContextQuery.error)
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
          {#if document.actions?.length}
            <div class="flex shrink-0 flex-wrap gap-2">
              {#each document.actions as action (action.href)}
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
            </div>
          {/if}
        </div>

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
                  </article>
                {/each}
              </div>
            </div>
          {/if}
        {/each}
      </section>
    {/each}
  </div>
{/if}
