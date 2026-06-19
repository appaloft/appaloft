<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
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
  import * as Dialog from "$lib/components/ui/dialog";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import {
    findConsolePageExtensionByPath,
    readConsolePageExtensionMetadata,
    resolveConsolePageEndpoint,
  } from "$lib/console/console-page-extension";
  import ConsoleResourceCanvas from "$lib/components/console/ConsoleResourceCanvas.svelte";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import SettingsShell from "$lib/components/console/SettingsShell.svelte";
  import { organizationSettingsItems } from "$lib/console/settings-nav";
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

  type ConsolePageSection =
    | ConsolePageSummaryGridSection
    | ConsolePagePanelGridSection
    | ConsolePageDialogPanelGridSection
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

  type ConsolePageDialogPanelGridSection = {
    kind: "dialog-panel-grid";
    title: string;
    description?: string;
    triggerLabel: string;
    dialogTitle?: string;
    dialogDescription?: string;
    items: ConsolePagePanelItem[];
  };

  type ConsolePagePanelItem = {
    title: string;
    description?: string;
    fields?: ConsolePagePanelField[];
    rows?: ConsolePageKeyValue[];
    actions?: ConsolePageRequestAction[];
    tone?: ConsolePageTone;
  };

  type ConsolePagePanelField = {
    name: string;
    label: string;
    type: "number" | "range" | "range-number";
    value: number;
    min?: number;
    max?: number;
    step?: number;
    displayDivisor?: number;
    prefix?: string;
    suffix?: string;
  };

  type ConsolePageRequestAction = {
    label: string;
    endpoint: string;
    method?: "POST";
    body?: Record<string, unknown>;
    fieldBindings?: Record<string, string>;
    variant?: "primary" | "secondary";
    disabled?: boolean;
    disabledReason?: string;
    redirectUrlField?: string;
  };

  type ConsolePageKeyValue = {
    label: string;
    value: string;
    tone?: ConsolePageTone;
    calculation?: ConsolePageRowCalculation;
  };

  type ConsolePageRowCalculation =
    | {
        kind: "field-money";
        field: string;
        divisor?: number;
        currency?: string;
      }
    | {
        kind: "tiered-multiple";
        field: string;
        divisor?: number;
        tiers: ConsolePageCalculationTier[];
      }
    | {
        kind: "tiered-unit-rate";
        field: string;
        divisor?: number;
        tiers: ConsolePageCalculationTier[];
        currency?: string;
        suffix?: string;
      };

  type ConsolePageCalculationTier = {
    min: number;
    multiplier: number;
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

  type ConsolePageTableDetails = {
    label: string;
    title: string;
    description?: string;
    rows: ConsolePageKeyValue[];
  };

  type ConsolePageTableCellValue = string | number | ConsolePageTableCell;
  type ConsolePageTableRow = {
    details?: ConsolePageTableDetails;
    [key: string]: ConsolePageTableCellValue | ConsolePageTableDetails | undefined;
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
  let panelFieldValues = $state<Record<string, number>>({});
  let selectedPanelGridSection = $state<ConsolePageDialogPanelGridSection | null>(null);
  let panelGridDialogOpen = $state(false);
  let selectedTableDetails = $state<ConsolePageTableDetails | null>(null);
  let tableDetailsOpen = $state(false);

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
      placeholderData: (previousData) => previousData,
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
      (Boolean(pageEndpoint) && pageDocumentQuery.isPending && !pageDocumentQuery.data),
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

  function navigateConsolePageHref(href: string | undefined) {
    if (!href) return;

    void goto(href, {
      keepFocus: true,
      noScroll: true,
    });
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
    if (value && typeof value === "object" && "text" in value) {
      return value;
    }

    return { text: String(value ?? "") };
  }

  function openTableDetails(details: ConsolePageTableDetails | undefined): void {
    if (!details) return;
    selectedTableDetails = details;
    tableDetailsOpen = true;
  }

  function openPanelGridDialog(section: ConsolePageDialogPanelGridSection): void {
    selectedPanelGridSection = section;
    panelGridDialogOpen = true;
  }

  function tableSectionClass(section: ConsolePageTableSection): string {
    return section.height === "tall" ? "min-h-[520px]" : "";
  }

  function summaryGridClass(section: ConsolePageSummaryGridSection): string {
    return section.items.length <= 3 ? "xl:grid-cols-3" : "xl:grid-cols-4";
  }

  function requestActionKey(action: ConsolePageRequestAction, item?: ConsolePagePanelItem): string {
    return `${item?.title ?? "page"}:${action.method ?? "POST"}:${action.endpoint}:${action.label}`;
  }

  function panelFieldKey(item: ConsolePagePanelItem, field: ConsolePagePanelField): string {
    return `${item.title}:${field.name}`;
  }

  function panelFieldValue(item: ConsolePagePanelItem, field: ConsolePagePanelField): number {
    const value = panelFieldValues[panelFieldKey(item, field)] ?? field.value;
    return clampPanelFieldValue(value, field);
  }

  function panelFieldValueByName(item: ConsolePagePanelItem, fieldName: string): number | null {
    const field = item.fields?.find((candidate) => candidate.name === fieldName);
    return field ? panelFieldValue(item, field) : null;
  }

  function panelFieldDisplayDivisor(field: ConsolePagePanelField): number {
    return field.displayDivisor && field.displayDivisor > 0 ? field.displayDivisor : 1;
  }

  function panelFieldDisplayValue(item: ConsolePagePanelItem, field: ConsolePagePanelField): number {
    return panelFieldValue(item, field) / panelFieldDisplayDivisor(field);
  }

  function panelFieldDisplayBound(value: number | undefined, field: ConsolePagePanelField): number | undefined {
    return typeof value === "number" ? value / panelFieldDisplayDivisor(field) : undefined;
  }

  function clampPanelFieldValue(value: number, field: ConsolePagePanelField): number {
    const min = typeof field.min === "number" ? field.min : Number.NEGATIVE_INFINITY;
    const max = typeof field.max === "number" ? field.max : Number.POSITIVE_INFINITY;
    return Math.min(max, Math.max(min, value));
  }

  function setPanelFieldDisplayValue(
    item: ConsolePagePanelItem,
    field: ConsolePagePanelField,
    displayValue: number,
  ): void {
    if (!Number.isFinite(displayValue)) return;
    const nextValue = Math.round(displayValue * panelFieldDisplayDivisor(field));
    panelFieldValues = {
      ...panelFieldValues,
      [panelFieldKey(item, field)]: clampPanelFieldValue(nextValue, field),
    };
  }

  function resolveCalculationTier(
    tiers: ConsolePageCalculationTier[],
    fieldValue: number,
  ): ConsolePageCalculationTier | null {
    return (
      [...tiers].sort((a, b) => b.min - a.min).find((tier) => fieldValue >= tier.min) ??
      tiers[0] ??
      null
    );
  }

  function calculatedTieredValue(
    item: ConsolePagePanelItem,
    calculation: Extract<ConsolePageRowCalculation, { kind: "tiered-multiple" | "tiered-unit-rate" }>,
  ): { readonly fieldValue: number; readonly units: number } | null {
    const fieldValue = panelFieldValueByName(item, calculation.field);
    if (fieldValue === null) return null;
    const tier = resolveCalculationTier(calculation.tiers, fieldValue);
    if (!tier) return null;
    const units = Math.floor((fieldValue * tier.multiplier) / (calculation.divisor ?? 1));
    return { fieldValue, units };
  }

  function formatConsoleMoney(cents: number, currency = "USD", maximumFractionDigits = 0): string {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits,
      minimumFractionDigits: maximumFractionDigits,
    }).format(cents / 100);
  }

  function formatConsoleUnitRate(amountCents: number, units: number, currency = "USD"): string {
    if (units <= 0) return formatConsoleMoney(0, currency, 3);
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(amountCents / 100 / units);
  }

  function panelRowValue(item: ConsolePagePanelItem, row: ConsolePageKeyValue): string {
    const calculation = row.calculation;
    if (!calculation) return row.value;
    if (calculation.kind === "field-money") {
      const fieldValue = panelFieldValueByName(item, calculation.field);
      return fieldValue === null
        ? row.value
        : formatConsoleMoney(fieldValue, calculation.currency, fieldValue % 100 === 0 ? 0 : 2);
    }
    if (calculation.kind === "tiered-multiple") {
      const calculated = calculatedTieredValue(item, calculation);
      return calculated ? String(calculated.units) : row.value;
    }
    if (calculation.kind === "tiered-unit-rate") {
      const calculated = calculatedTieredValue(item, calculation);
      return calculated
        ? `${formatConsoleUnitRate(calculated.fieldValue, calculated.units, calculation.currency)}${calculation.suffix ?? ""}`
        : row.value;
    }
    return row.value;
  }

  function requestActionBody(
    action: ConsolePageRequestAction,
    item?: ConsolePagePanelItem,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = { ...(action.body ?? {}) };
    if (!item || !action.fieldBindings) return body;
    for (const [bodyKey, fieldName] of Object.entries(action.fieldBindings)) {
      const value = panelFieldValueByName(item, fieldName);
      if (value !== null) {
        body[bodyKey] = value;
      }
    }
    return body;
  }

  async function runRequestAction(
    action: ConsolePageRequestAction,
    item?: ConsolePagePanelItem,
  ): Promise<void> {
    if (action.disabled) {
      actionErrorMessage = action.disabledReason ?? "";
      return;
    }

    const actionKey = requestActionKey(action, item);
    pendingActionKey = actionKey;
    actionErrorMessage = "";
    try {
      const response = await request<Record<string, unknown>>(action.endpoint, {
        method: action.method ?? "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestActionBody(action, item)),
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

{#snippet panelGridItems(items: ConsolePagePanelItem[], className: string)}
  <div class={className}>
    {#each items as item (item.title)}
      <article class={["console-panel space-y-4 p-5", panelToneClass(item.tone)]}>
        <div class="space-y-1">
          <h3 class="text-base font-semibold">{item.title}</h3>
          {#if item.description}
            <p class="text-sm text-muted-foreground">{item.description}</p>
          {/if}
        </div>
        {#if item.fields?.length}
          <div class="space-y-3">
            {#each item.fields as field (field.name)}
              <label
                class="block space-y-2 text-sm"
                data-console-page-panel-field={field.name}
              >
                <span class="font-medium text-foreground">{field.label}</span>
                <div class="flex items-center gap-3">
                  {#if field.type === "range" || field.type === "range-number"}
                    <input
                      class="h-2 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
                      type="range"
                      value={panelFieldDisplayValue(item, field)}
                      min={panelFieldDisplayBound(field.min, field)}
                      max={panelFieldDisplayBound(field.max, field)}
                      step={panelFieldDisplayBound(field.step, field)}
                      oninput={(event) =>
                        setPanelFieldDisplayValue(
                          item,
                          field,
                          Number((event.currentTarget as HTMLInputElement).value),
                        )}
                    />
                  {/if}
                  {#if field.prefix}
                    <span class="shrink-0 text-sm font-medium text-muted-foreground">
                      {field.prefix}
                    </span>
                  {/if}
                  {#if field.type === "number" || field.type === "range-number"}
                    <input
                      class="h-9 w-24 rounded-md border border-input bg-background px-3 py-1 text-right text-sm font-medium shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      type="number"
                      value={panelFieldDisplayValue(item, field)}
                      min={panelFieldDisplayBound(field.min, field)}
                      max={panelFieldDisplayBound(field.max, field)}
                      step={panelFieldDisplayBound(field.step, field)}
                      oninput={(event) =>
                        setPanelFieldDisplayValue(
                          item,
                          field,
                          Number((event.currentTarget as HTMLInputElement).value),
                        )}
                    />
                  {/if}
                  {#if field.suffix}
                    <span class="shrink-0 text-sm text-muted-foreground">{field.suffix}</span>
                  {/if}
                </div>
              </label>
            {/each}
          </div>
        {/if}
        {#if item.rows?.length}
          <dl class="divide-y">
            {#each item.rows as row (row.label)}
              <div class="flex items-center justify-between gap-4 py-2 text-sm">
                <dt class="text-muted-foreground">{row.label}</dt>
                <dd class={["text-right font-medium", toneClass(row.tone)]}>
                  {panelRowValue(item, row)}
                </dd>
              </div>
            {/each}
          </dl>
        {/if}
        {#if item.actions?.length}
          <div class="flex flex-wrap gap-2">
            {#each item.actions as action (requestActionKey(action, item))}
              <Button
                type="button"
                variant={action.variant === "primary" ? "default" : "outline"}
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
              <p class="text-xs text-muted-foreground">{action.disabledReason}</p>
            {/if}
          {/each}
        {/if}
      </article>
    {/each}
  </div>
{/snippet}

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

      <section class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div class="min-w-0 max-w-2xl space-y-2">
          <h1 class="truncate text-2xl font-semibold">{pageDocument.title}</h1>
          {#if pageDocument.description}
            <p class="text-sm leading-6 text-muted-foreground">{pageDocument.description}</p>
          {/if}
          {#if pageDocument.badge}
            <Badge variant="outline">{pageDocument.badge}</Badge>
          {/if}
        </div>
        {#if pageDocument.actions?.length}
          <div class="flex shrink-0 flex-wrap gap-2">
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
      </section>

      {#each pageDocument.sections as section, sectionIndex (`${section.kind}-${sectionIndex}`)}
        {#if section.kind === "summary-grid"}
          <section class={["grid gap-4 md:grid-cols-2", summaryGridClass(section)]} data-console-page-summary-grid>
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
            {@render panelGridItems(section.items, "grid gap-4 md:grid-cols-2 xl:grid-cols-3")}
          </section>
        {:else if section.kind === "dialog-panel-grid"}
          <section class="console-panel flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0 space-y-1">
              <h2 class="text-lg font-semibold">{section.title}</h2>
              {#if section.description}
                <p class="text-sm leading-6 text-muted-foreground">{section.description}</p>
              {/if}
            </div>
            <Button type="button" class="shrink-0" onclick={() => openPanelGridDialog(section)}>
              {section.triggerLabel}
            </Button>
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
                            type="button"
                            variant={filter.active ? "default" : "outline"}
                            size="sm"
                            onclick={() => navigateConsolePageHref(filter.href)}
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
              <div class="overflow-x-auto border-t" data-console-page-table-body>
                <table class="w-full min-w-[760px] text-sm" data-console-page-record-list>
                  <thead class="bg-muted/40 text-xs font-medium text-muted-foreground">
                    <tr>
                      {#each section.columns as column (column.key)}
                        <th
                          scope="col"
                          class={[
                            "px-5 py-3 font-medium",
                            column.align === "right" ? "text-right" : "text-left",
                          ]}
                        >
                          {column.label}
                        </th>
                      {/each}
                      <th scope="col" class="w-24 px-5 py-3 text-right font-medium"></th>
                    </tr>
                  </thead>
                  <tbody class="divide-y">
                    {#each section.rows as row, rowIndex (rowIndex)}
                      <tr class="transition-colors hover:bg-muted/30" data-console-page-record-row>
                        {#each section.columns as column (column.key)}
                          {@const cell = readTableCell(row, column.key)}
                          <td
                            class={[
                              "max-w-64 px-5 py-4 align-top",
                              column.align === "right" ? "text-right tabular-nums" : "text-left",
                            ]}
                          >
                            <span
                              class={[
                                "block truncate font-medium",
                                toneClass(cell.tone),
                              ]}
                              title={cell.text}
                            >
                              {cell.text}
                            </span>
                          </td>
                        {/each}
                        <td class="px-5 py-4 text-right align-top">
                          {#if row.details}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onclick={() => openTableDetails(row.details)}
                            >
                              {row.details.label}
                            </Button>
                          {/if}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
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
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onclick={() => navigateConsolePageHref(section.pagination?.previousHref)}
                    >
                      {section.pagination.previousLabel}
                    </Button>
                  {:else}
                    <Button variant="outline" size="sm" disabled>
                      {section.pagination.previousLabel}
                    </Button>
                  {/if}
                  {#if section.pagination.nextHref}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onclick={() => navigateConsolePageHref(section.pagination?.nextHref)}
                    >
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

<Dialog.Root bind:open={panelGridDialogOpen}>
  <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-5xl">
    {#if selectedPanelGridSection}
      <Dialog.Header>
        <Dialog.Title>
          {selectedPanelGridSection.dialogTitle ?? selectedPanelGridSection.title}
        </Dialog.Title>
        {#if selectedPanelGridSection.dialogDescription || selectedPanelGridSection.description}
          <Dialog.Description>
            {selectedPanelGridSection.dialogDescription ?? selectedPanelGridSection.description}
          </Dialog.Description>
        {/if}
      </Dialog.Header>
      {#if actionErrorMessage}
        <div class="mt-5 rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
          {actionErrorMessage}
        </div>
      {/if}
      <div class="mt-5">
        {@render panelGridItems(
          selectedPanelGridSection.items,
          "grid max-h-[70vh] gap-4 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3",
        )}
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={tableDetailsOpen}>
  <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-2xl">
    {#if selectedTableDetails}
      <Dialog.Header>
        <Dialog.Title>{selectedTableDetails.title}</Dialog.Title>
        {#if selectedTableDetails.description}
          <Dialog.Description>{selectedTableDetails.description}</Dialog.Description>
        {/if}
      </Dialog.Header>
      <dl class="mt-5 divide-y rounded-lg border">
        {#each selectedTableDetails.rows as row (row.label)}
          <div class="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[12rem_1fr] sm:gap-4">
            <dt class="text-muted-foreground">{row.label}</dt>
            <dd class={["break-words font-medium", toneClass(row.tone)]}>{row.value}</dd>
          </div>
        {/each}
      </dl>
    {/if}
  </Dialog.Content>
</Dialog.Root>

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
