<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import {
    Activity,
    AlertTriangle,
    ArrowUpRight,
    CreditCard,
    FileText,
    WalletCards,
  } from "@lucide/svelte";
  import { createQuery, queryOptions } from "@tanstack/svelte-query";
  import type { Component } from "svelte";

  import { readErrorMessage, request } from "$lib/api/client";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import * as Table from "$lib/components/ui/table";
  import {
    findConsolePageExtensionByPath,
    readConsolePageExtensionMetadata,
    resolveConsolePageEndpoint,
  } from "$lib/console/console-page-extension";
  import ConsoleResourceCanvas from "$lib/components/console/ConsoleResourceCanvas.svelte";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import SettingsShell from "$lib/components/console/SettingsShell.svelte";
  import { organizationSettingsItems } from "$lib/console/settings-nav";
  import { orpcClient } from "$lib/orpc";
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

  type ConsolePageSection =
    | ConsolePageSummaryGridSection
    | ConsolePagePanelGridSection
    | ConsolePageTableSection
    | ConsolePageCalloutSection;

  type ConsolePageSummaryGridSection = {
    kind: "summary-grid";
    items: ConsolePageSummaryItem[];
  };

  type ConsolePageSummaryItem = {
    label: string;
    value: string;
    description?: string;
    trend?: string;
    href?: string;
    tone?: ConsolePageTone;
    icon?: ConsolePageIcon;
  };

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
  };

  type ConsolePageKeyValue = {
    label: string;
    value: string;
    tone?: ConsolePageTone;
  };

  type ConsolePageTableSection = {
    kind: "table";
    title: string;
    description?: string;
    columns: ConsolePageTableColumn[];
    rows: ConsolePageTableRow[];
    filters?: ConsolePageTableFilterGroup[];
    pagination?: ConsolePageTablePagination;
    emptyLabel?: string;
    height?: "default" | "tall";
  };

  type ConsolePageTablePagination = {
    label: string;
    previousLabel: string;
    nextLabel: string;
    previousHref?: string;
    nextHref?: string;
  };

  type ConsolePageTableFilterGroup = {
    label: string;
    items: ConsolePageFilterLink[];
  };

  type ConsolePageFilterLink = {
    label: string;
    href: string;
    active?: boolean;
  };

  type ConsolePageTableColumn = {
    key: string;
    label: string;
    align?: "left" | "right";
  };

  type ConsolePageTableCell = {
    text: string;
    tone?: ConsolePageTone;
  };

  type ConsolePageTableRow = Record<string, string | number | ConsolePageTableCell>;

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
  type ConsolePageIcon = "activity" | "card" | "file" | "wallet";

  type SystemPluginWebExtensionsResponse = {
    items: SystemPluginWebExtension[];
  };
  type Props = {
    settingsScope?: "organization" | null;
  };

  let { settingsScope = null }: Props = $props();
  let pendingActionKey = $state<string | null>(null);
  let actionErrorMessage = $state("");

  const webExtensionsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["system-plugins", "web-extensions"],
      queryFn: () => request<SystemPluginWebExtensionsResponse>("/api/system-plugins/web-extensions"),
      enabled: browser,
      staleTime: 30_000,
    }),
  );
  const organizationContextQuery = createQuery(() =>
    queryOptions({
      queryKey: ["organizations", "current-context"],
      queryFn: () => orpcClient.organizations.currentContext({}),
      enabled: browser,
      retry: 0,
    }),
  );

  const pathname = $derived(page.url.pathname);
  const extension = $derived.by(() =>
    findConsolePageExtensionByPath(webExtensionsQuery.data?.items ?? [], pathname),
  );
  const metadata = $derived(readConsolePageExtensionMetadata(extension));
  const currentOrganization = $derived(organizationContextQuery.data?.currentOrganization ?? null);
  const pageEndpoint = $derived(
    resolveConsolePageEndpoint(metadata, {
      pathname,
      query: page.url.searchParams.toString(),
      organization: currentOrganization,
    }),
  );
  const pageDocumentQuery = createQuery(() =>
    queryOptions({
      queryKey: ["console-extension-page", pageEndpoint],
      queryFn: () => request<ConsolePageDocument>(pageEndpoint ?? "/"),
      enabled: browser && Boolean(pageEndpoint),
      staleTime: 15_000,
    }),
  );

  const pageDocument = $derived(pageDocumentQuery.data ?? null);
  const shellTitle = $derived(
    pageDocument?.title ?? extension?.title ?? $t(i18nKeys.console.nav.extensions),
  );
  const shellDescription = $derived(
    pageDocument?.description ??
      extension?.description ??
      $t(i18nKeys.common.status.loading),
  );
  const loading = $derived(
    webExtensionsQuery.isPending ||
      organizationContextQuery.isPending ||
      (Boolean(pageEndpoint) && pageDocumentQuery.isPending),
  );
  const errorMessage = $derived(
    webExtensionsQuery.error
      ? readErrorMessage(webExtensionsQuery.error)
      : organizationContextQuery.error
        ? readErrorMessage(organizationContextQuery.error)
        : pageDocumentQuery.error
          ? readErrorMessage(pageDocumentQuery.error)
          : "",
  );

  function iconComponent(icon: ConsolePageIcon | undefined): Component {
    if (icon === "activity") return Activity;
    if (icon === "card") return CreditCard;
    if (icon === "file") return FileText;
    return WalletCards;
  }

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
    return "";
  }

  function readTableCell(row: ConsolePageTableRow, key: string): ConsolePageTableCell {
    const value = row[key];
    if (value && typeof value === "object") {
      return value;
    }

    return { text: String(value ?? "") };
  }

  function tableSectionClass(section: ConsolePageTableSection): string {
    return section.height === "tall" ? "min-h-[520px]" : "";
  }

  function requestActionKey(action: ConsolePageRequestAction): string {
    return `${action.method ?? "POST"}:${action.endpoint}:${action.label}`;
  }

  async function runRequestAction(action: ConsolePageRequestAction): Promise<void> {
    if (action.disabled) {
      actionErrorMessage = action.disabledReason ?? "";
      return;
    }

    const actionKey = requestActionKey(action);
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

      actionErrorMessage = $t(i18nKeys.errors.web.unknownRequestFailure);
    } catch (error) {
      actionErrorMessage = readErrorMessage(error);
    } finally {
      pendingActionKey = null;
    }
  }
</script>

<svelte:head>
  <title>{shellTitle} · Appaloft</title>
</svelte:head>

{#snippet content()}
  <ConsoleResourceCanvas class="max-w-6xl">
    {#if loading}
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {#each Array.from({ length: 4 }) as _}
          <Skeleton class="h-36" />
        {/each}
      </div>
      <Skeleton class="h-80" />
    {:else if errorMessage}
      <section class="console-panel space-y-3 border-destructive/25 bg-destructive/5 p-5">
        <h2 class="flex items-center gap-2 text-base font-semibold">
          <AlertTriangle class="size-4" />
          {$t(i18nKeys.errors.web.unknownRequestFailure)}
        </h2>
        <p class="text-sm text-muted-foreground">{errorMessage}</p>
      </section>
    {:else if !extension || !metadata || !pageEndpoint}
      <section class="console-panel p-5 text-sm text-muted-foreground">
        {$t(i18nKeys.errors.backend.notFound)}
      </section>
    {:else if pageDocument}
      {#if actionErrorMessage}
        <section class="console-panel border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
          {actionErrorMessage}
        </section>
      {/if}

      {#if pageDocument.badge || (pageDocument.actions?.length ?? 0) > 0}
        <div class="flex flex-wrap items-center justify-between gap-3">
          {#if pageDocument.badge}
            <Badge variant="outline">{pageDocument.badge}</Badge>
          {/if}
          {#if pageDocument.actions?.length}
            <div class="flex flex-wrap gap-2">
              {#each pageDocument.actions as action (action.href)}
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
      {/if}

      {#each pageDocument.sections as section, sectionIndex (`${section.kind}-${sectionIndex}`)}
        {#if section.kind === "summary-grid"}
          <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-console-page-summary-grid>
            {#each section.items as item (item.label)}
              {@const Icon = iconComponent(item.icon)}
              {#if item.href}
                <a
                  href={item.href}
                  class="block rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Card.Root class="min-h-36 transition-colors hover:border-primary/50 hover:bg-muted/30">
                    <Card.Header class="space-y-0 pb-2">
                      <div class="flex items-center justify-between gap-3">
                        <Card.Description>{item.label}</Card.Description>
                        <Icon class="size-4 text-primary" />
                      </div>
                    </Card.Header>
                    <Card.Content class="space-y-2">
                      <div class={["text-3xl font-semibold tabular-nums", toneClass(item.tone)]}>
                        {item.value}
                      </div>
                      {#if item.description}
                        <p class="text-sm text-muted-foreground">{item.description}</p>
                      {/if}
                      {#if item.trend}
                        <p class={["text-sm font-medium", toneClass(item.tone)]}>{item.trend}</p>
                      {/if}
                    </Card.Content>
                  </Card.Root>
                </a>
              {:else}
                <Card.Root class="min-h-36">
                  <Card.Header class="space-y-0 pb-2">
                    <div class="flex items-center justify-between gap-3">
                      <Card.Description>{item.label}</Card.Description>
                      <Icon class="size-4 text-primary" />
                    </div>
                  </Card.Header>
                  <Card.Content class="space-y-2">
                    <div class={["text-3xl font-semibold tabular-nums", toneClass(item.tone)]}>
                      {item.value}
                    </div>
                    {#if item.description}
                      <p class="text-sm text-muted-foreground">{item.description}</p>
                    {/if}
                    {#if item.trend}
                      <p class={["text-sm font-medium", toneClass(item.tone)]}>{item.trend}</p>
                    {/if}
                  </Card.Content>
                </Card.Root>
              {/if}
            {/each}
          </section>
        {:else if section.kind === "panel-grid"}
          <section class="space-y-4">
            {#if section.title || section.description}
              <div class="space-y-1">
                {#if section.title}
                  <h2 class="text-lg font-semibold">{section.title}</h2>
                {/if}
                {#if section.description}
                  <p class="text-sm text-muted-foreground">{section.description}</p>
                {/if}
              </div>
            {/if}
            <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {#each section.items as item (item.title)}
                <article class={["console-panel space-y-4 p-5", panelToneClass(item.tone)]}>
                  <div class="space-y-1">
                    <h3 class="text-base font-semibold">{item.title}</h3>
                    {#if item.description}
                      <p class="text-sm text-muted-foreground">{item.description}</p>
                    {/if}
                  </div>
                  {#if item.rows?.length}
                    <dl class="divide-y">
                      {#each item.rows as row (row.label)}
                        <div class="flex items-center justify-between gap-4 py-2 text-sm">
                          <dt class="text-muted-foreground">{row.label}</dt>
                          <dd class={["text-right font-medium", toneClass(row.tone)]}>{row.value}</dd>
                        </div>
                      {/each}
                    </dl>
                  {/if}
                  {#if item.actions?.length}
                    <div class="flex flex-wrap gap-2">
                      {#each item.actions as action (requestActionKey(action))}
                        <Button
                          type="button"
                          variant={action.variant === "primary" ? "default" : "outline"}
                          disabled={Boolean(action.disabled) || pendingActionKey === requestActionKey(action)}
                          onclick={() => runRequestAction(action)}
                        >
                          {pendingActionKey === requestActionKey(action)
                            ? $t(i18nKeys.common.status.loading)
                            : action.label}
                        </Button>
                      {/each}
                    </div>
                    {#each item.actions as action (requestActionKey(action))}
                      {#if action.disabled && action.disabledReason}
                        <p class="text-xs text-muted-foreground">{action.disabledReason}</p>
                      {/if}
                    {/each}
                  {/if}
                </article>
              {/each}
            </div>
          </section>
        {:else if section.kind === "table"}
          <section class={["console-panel overflow-hidden", tableSectionClass(section)]}>
            <div class="space-y-1 p-5">
              <h2 class="text-lg font-semibold">{section.title}</h2>
              {#if section.description}
                <p class="text-sm text-muted-foreground">{section.description}</p>
              {/if}
              {#if section.filters?.length}
                <div class="flex flex-wrap gap-3 pt-3">
                  {#each section.filters as filterGroup (filterGroup.label)}
                    <div class="flex min-w-0 flex-wrap items-center gap-2">
                      <span class="text-xs font-medium text-muted-foreground">
                        {filterGroup.label}
                      </span>
                      <div class="flex flex-wrap gap-1.5">
                        {#each filterGroup.items as filter (filter.href)}
                          <Button
                            href={filter.href}
                            variant={filter.active ? "default" : "outline"}
                            size="sm"
                          >
                            {filter.label}
                          </Button>
                        {/each}
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
            {#if section.rows.length > 0}
              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    {#each section.columns as column (column.key)}
                      <Table.Head class={column.align === "right" ? "text-right" : ""}>
                        {column.label}
                      </Table.Head>
                    {/each}
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {#each section.rows as row, rowIndex (rowIndex)}
                    <Table.Row>
                      {#each section.columns as column (column.key)}
                        {@const cell = readTableCell(row, column.key)}
                        <Table.Cell
                          class={[
                            column.align === "right" ? "text-right tabular-nums" : "",
                            toneClass(cell.tone),
                          ]}
                        >
                          {cell.text}
                        </Table.Cell>
                      {/each}
                    </Table.Row>
                  {/each}
                </Table.Body>
              </Table.Root>
            {:else}
              <div class="border-t p-5 text-sm text-muted-foreground">
                {section.emptyLabel ?? $t(i18nKeys.common.status.unknown)}
              </div>
            {/if}
            {#if section.pagination}
              <div class="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
                <p class="text-sm text-muted-foreground">{section.pagination.label}</p>
                <div class="flex items-center gap-2">
                  {#if section.pagination.previousHref}
                    <Button href={section.pagination.previousHref} variant="outline" size="sm">
                      {section.pagination.previousLabel}
                    </Button>
                  {:else}
                    <Button variant="outline" size="sm" disabled>
                      {section.pagination.previousLabel}
                    </Button>
                  {/if}
                  {#if section.pagination.nextHref}
                    <Button href={section.pagination.nextHref} variant="outline" size="sm">
                      {section.pagination.nextLabel}
                    </Button>
                  {:else}
                    <Button variant="outline" size="sm" disabled>
                      {section.pagination.nextLabel}
                    </Button>
                  {/if}
                </div>
              </div>
            {/if}
          </section>
        {:else if section.kind === "callouts"}
          <section class="grid gap-3 md:grid-cols-3">
            {#each section.items as item (item.title)}
              <article class={["console-panel space-y-2 p-4", panelToneClass(item.tone)]}>
                <h3 class="text-sm font-semibold">{item.title}</h3>
                {#if item.description}
                  <p class="text-sm leading-6 text-muted-foreground">{item.description}</p>
                {/if}
              </article>
            {/each}
          </section>
        {/if}
      {/each}
    {/if}
  </ConsoleResourceCanvas>
{/snippet}

{#if settingsScope === "organization"}
  <SettingsShell
    title={$t(i18nKeys.console.organization.pageTitle)}
    description={shellDescription}
    groupLabel={$t(i18nKeys.console.organization.pageTitle)}
    activePath={pathname}
    items={organizationSettingsItems(webExtensionsQuery.data?.items ?? [])}
    breadcrumbs={[
      { label: $t(i18nKeys.console.nav.home), href: "/" },
      { label: $t(i18nKeys.console.organization.pageTitle), href: "/organization" },
      { label: shellTitle },
    ]}
  >
    {@render content()}
  </SettingsShell>
{:else}
  <ConsoleShell title={shellTitle} description={shellDescription}>
    {@render content()}
  </ConsoleShell>
{/if}
