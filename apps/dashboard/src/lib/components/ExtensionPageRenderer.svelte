<script lang="ts">
  import { ArrowUpRight, CheckCircle2, CircleAlert } from "@lucide/svelte";

  import type { ConsoleExtensionPageDocumentV1 } from "$lib/extensions";

  let { document }: { document: ConsoleExtensionPageDocumentV1 } = $props();

  type UnknownRecord = Record<string, unknown>;

  function record(value: unknown): UnknownRecord {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as UnknownRecord)
      : {};
  }

  function records(value: unknown): UnknownRecord[] {
    return Array.isArray(value) ? value.map(record) : [];
  }

  function text(value: unknown): string {
    if (typeof value === "string" || typeof value === "number") return String(value);
    const structured = record(value);
    if (structured.kind === "datetime" && typeof structured.value === "string") {
      const date = new Date(structured.value);
      return Number.isFinite(date.getTime())
        ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
            date,
          )
        : structured.value;
    }
    return typeof structured.label === "string"
      ? structured.label
      : typeof structured.text === "string"
        ? structured.text
        : "—";
  }

  function toneClass(value: unknown): string {
    const tone = typeof value === "string" ? value : record(value).tone;
    if (tone === "positive") return "text-emerald-600 dark:text-emerald-400";
    if (tone === "warning") return "text-amber-600 dark:text-amber-400";
    if (tone === "danger") return "text-destructive";
    return "text-foreground";
  }
</script>

{#snippet renderSection(section: UnknownRecord)}
  {#if section.kind === "summary-grid"}
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {#each records(section.items) as item}
        <article class="rounded-[14px] border border-divider bg-surface p-5">
          <p class="text-xs font-medium text-muted-foreground">{text(item.label)}</p>
          <p class={`mt-3 text-xl font-semibold ${toneClass(item.tone)}`}>{text(item.value)}</p>
          {#if item.description}
            <p class="mt-2 text-sm text-muted-foreground">{text(item.description)}</p>
          {/if}
        </article>
      {/each}
    </div>
  {:else if section.kind === "table"}
    <section class="overflow-hidden rounded-[14px] border border-divider bg-surface">
      {#if section.title || section.description}
        <div class="border-b border-divider p-5">
          {#if section.title}<h4 class="font-semibold">{text(section.title)}</h4>{/if}
          {#if section.description}
            <p class="mt-1 text-sm text-muted-foreground">{text(section.description)}</p>
          {/if}
        </div>
      {/if}
      <div class="overflow-x-auto">
        <table class="w-full min-w-[560px] text-left text-sm">
          <thead class="bg-muted/55 text-xs text-muted-foreground">
            <tr>
              {#each records(section.columns) as column}
                <th class="px-4 py-3 font-medium">{text(column.label)}</th>
              {/each}
            </tr>
          </thead>
          <tbody class="divide-y divide-divider">
            {#each records(section.rows) as row}
              <tr>
                {#each records(section.columns) as column}
                  {@const cells = record(row.cells)}
                  {@const cell = record(cells[String(column.key)] ?? row[String(column.key)])}
                  <td class={`px-4 py-3 ${toneClass(cell.tone)}`}>
                    {text("text" in cell ? cell.text : cells[String(column.key)] ?? row[String(column.key)])}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if records(section.rows).length === 0}
        <p class="p-8 text-center text-sm text-muted-foreground">{text(section.emptyLabel)}</p>
      {/if}
    </section>
  {:else if section.kind === "callouts"}
    <div class="space-y-3">
      {#each records(section.items) as item}
        <article class="flex gap-3 rounded-[14px] border border-divider bg-surface p-5">
          {#if item.tone === "positive"}
            <CheckCircle2 class="mt-0.5 size-5 shrink-0 text-emerald-500" />
          {:else}
            <CircleAlert class={`mt-0.5 size-5 shrink-0 ${toneClass(item.tone)}`} />
          {/if}
          <div>
            <h4 class="text-sm font-semibold">{text(item.title)}</h4>
            {#if item.description}
              <p class="mt-1 text-sm text-muted-foreground">{text(item.description)}</p>
            {/if}
          </div>
        </article>
      {/each}
    </div>
  {:else if section.kind === "tabs"}
    <section class="rounded-[14px] border border-divider bg-surface p-5">
      {#if section.title}<h4 class="font-semibold">{text(section.title)}</h4>{/if}
      {#if section.description}
        <p class="mt-1 text-sm text-muted-foreground">{text(section.description)}</p>
      {/if}
      <div class="mt-4 space-y-5">
        {#each records(section.tabs) as tab}
          <section>
            <h5 class="text-sm font-semibold">{text(tab.label)}</h5>
            {#if tab.description}
              <p class="mt-1 text-xs text-muted-foreground">{text(tab.description)}</p>
            {/if}
            <div class="mt-3 space-y-3">
              {#each records(tab.sections) as child}
                {@render renderSection(child)}
              {/each}
            </div>
          </section>
        {/each}
      </div>
    </section>
  {:else}
    {@const items = records(section.items)}
    <section class="rounded-[14px] border border-divider bg-surface p-5">
      {#if section.eyebrow}
        <p class="text-xs font-medium text-primary">{text(section.eyebrow)}</p>
      {/if}
      {#if section.title}<h4 class="mt-1 font-semibold">{text(section.title)}</h4>{/if}
      {#if section.description}
        <p class="mt-1 text-sm text-muted-foreground">{text(section.description)}</p>
      {/if}
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        {#each items as item}
          <article class="rounded-[12px] border border-divider bg-surface-raised p-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h5 class="text-sm font-semibold">{text(item.title)}</h5>
                {#if item.description}
                  <p class="mt-1 text-xs text-muted-foreground">{text(item.description)}</p>
                {/if}
              </div>
              {#if item.badge}
                <span class="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">
                  {text(item.badge)}
                </span>
              {/if}
            </div>
            {#if records(item.rows).length}
              <dl class="mt-4 space-y-2 border-t border-divider pt-3">
                {#each records(item.rows) as row}
                  <div class="flex items-start justify-between gap-3 text-xs">
                    <dt class="text-muted-foreground">{text(row.label)}</dt>
                    <dd class={toneClass(row.tone)}>{text(row.value)}</dd>
                  </div>
                {/each}
              </dl>
            {/if}
          </article>
        {/each}
      </div>
    </section>
  {/if}
{/snippet}

<section class="space-y-4" data-extension-document={document.schemaVersion}>
  <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
    <div>
      {#if document.badge}
        <span class="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          {document.badge}
        </span>
      {/if}
      <h3 class="mt-2 text-lg font-semibold">{document.title}</h3>
      {#if document.description}
        <p class="mt-1 text-sm text-muted-foreground">{document.description}</p>
      {/if}
    </div>
    {#if document.actions?.length}
      <div class="flex flex-wrap gap-2">
        {#each document.actions as action}
          {@const value = record(action)}
          <a
            class="inline-flex h-9 items-center gap-2 rounded-[9px] border border-divider bg-surface-raised px-3 text-xs font-medium hover:bg-muted"
            href={text(value.href)}
            target={value.external === true ? "_blank" : undefined}
            rel={value.external === true ? "noreferrer" : undefined}
          >
            {text(value.label)}
            {#if value.external === true}<ArrowUpRight class="size-3.5" />{/if}
          </a>
        {/each}
      </div>
    {/if}
  </header>
  {#each document.sections as section}
    {@render renderSection(record(section))}
  {/each}
</section>
