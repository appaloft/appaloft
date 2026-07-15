<script lang="ts">
  import { Badge } from "@appaloft/ui/badge";
  import { Button } from "@appaloft/ui/button";
  import { Card, CardContent, CardFooter } from "@appaloft/ui/card";
  import { cn } from "@appaloft/ui/utils";
  import type {
    BlueprintMarketplaceCardDensity,
    BlueprintMarketplaceCardLabels,
    BlueprintMarketplaceListing,
  } from "./types";

  type Props = {
    readonly item: BlueprintMarketplaceListing;
    readonly actionHref?: string;
    readonly actionLabel?: string;
    readonly detailHref?: string;
    readonly density?: BlueprintMarketplaceCardDensity;
    readonly labels?: Partial<BlueprintMarketplaceCardLabels>;
    readonly selected?: boolean;
    readonly showCategory?: boolean;
    readonly showFacts?: boolean;
    readonly showFooter?: boolean;
    readonly showSummary?: boolean;
    readonly onprimaryaction?: (event: MouseEvent, item: BlueprintMarketplaceListing) => void;
    readonly onview?: ((item: BlueprintMarketplaceListing) => void) | undefined;
  };

  const defaultLabels: BlueprintMarketplaceCardLabels = {
    dependencies: "依赖资源",
    components: "运行单元",
    variants: "部署方案",
    ports: "公开入口",
    noDependencies: "无托管依赖",
    noPorts: "无公开端口",
    componentCount: "{{count}} 个组件",
    defaultVariant: "默认方案",
    variantCount: "{{count}} 个方案",
    variantCountWithLabel: "{{count}} 个方案 · {{label}}",
    official: "官方",
    featured: "精选",
    selected: "已选择",
    detail: "查看详情",
    website: "网站",
  };

  let {
    item,
    actionHref = "",
    actionLabel = "部署",
    detailHref = "",
    density = "default",
    labels: labelOverrides = {},
    selected = false,
    showCategory = true,
    showFacts = true,
    showFooter = true,
    showSummary = true,
    onprimaryaction,
    onview,
  }: Props = $props();

  const labels = $derived({ ...defaultLabels, ...labelOverrides });
  const dependencies = $derived(item.requirementsSummary?.dependencies ?? []);
  const ports = $derived(item.requirementsSummary?.ports ?? []);
  const tags = $derived(item.blueprint.tags ?? []);
  const searchText = $derived([
    item.title,
    item.subtitle,
    item.category,
    item.blueprint.summary,
    item.publisher?.name ?? "",
    ...tags,
    ...dependencies,
    ...ports,
  ].join(" "));
  const isCompact = $derived(density === "compact" || density === "mini");
  const isMini = $derived(density === "mini");

  let iconFailed = $state(false);

  const showCover = $derived(density === "default");
  const cardClass = $derived(cn(
    "relative min-w-0 overflow-hidden border-border/90 bg-card/95 py-0 text-card-foreground shadow-[0_18px_48px_rgba(20,31,47,0.07)] transition-colors hover:border-ring/35",
    "data-[density=default]:min-h-[300px] data-[density=compact]:min-h-[178px] data-[density=mini]:min-h-[158px]",
    detailHref && "cursor-pointer",
    selected && "border-ring/50 ring-1 ring-ring/20",
  ));
  const contentClass = $derived(cn(
    "relative flex min-h-0 flex-1 flex-col justify-between",
    isMini ? "gap-4 p-5" : isCompact ? "gap-3 p-4" : "gap-4 p-4",
  ));
  const iconClass = $derived(cn(
    "grid shrink-0 place-items-center overflow-hidden rounded-lg border border-border/80 bg-muted/45 text-xs font-black uppercase text-foreground",
    isCompact ? "size-10" : "size-11",
    item.icon?.url && !iconFailed && "bg-card",
  ));
  const compactFactClass = "grid grid-cols-[minmax(6.5rem,7rem)_minmax(0,1fr)] items-center gap-3";
  const compactFactLabelClass = "min-w-0 truncate whitespace-nowrap text-xs font-bold text-muted-foreground";

  function dependencySummary(): string {
    return dependencies.length > 0 ? dependencies.join(" / ") : labels.noDependencies;
  }

  function portSummary(): string {
    if (ports.length === 0) {
      return labels.noPorts;
    }
    return ports
      .map((port) => port.split(":").at(-1) ?? port)
      .slice(0, 2)
      .join(" / ");
  }

  function componentSummary(): string {
    const count = item.requirementsSummary?.components ?? 1;
    return formatLabel(labels.componentCount, { count: count.toString() });
  }

  function variantSummary(): string {
    const variants = item.variants ?? [];
    if (variants.length === 0) {
      return labels.defaultVariant;
    }

    const defaultVariant = variants.find((variant) => variant.id === item.defaultVariant);
    const firstLabel = defaultVariant?.label ?? variants[0]?.label ?? variants[0]?.id;
    return variants.length === 1
      ? (firstLabel ?? formatLabel(labels.variantCount, { count: "1" }))
      : formatLabel(labels.variantCountWithLabel, {
          count: variants.length.toString(),
          label: firstLabel ?? labels.defaultVariant,
        });
  }

  function iconLabel(): string {
    return (item.icon?.label ?? item.title.slice(0, 2)).trim();
  }

  function iconFallbackStyle(): string | undefined {
    return item.icon?.tone && (!item.icon?.url || iconFailed)
      ? `background:${item.icon.tone};color:white;border-color:${item.icon.tone}`
      : undefined;
  }

  function normalizeCoverHex(value: string | undefined): string | undefined {
    if (!value) {
      return undefined;
    }
    const trimmed = value.trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
      return trimmed.toLowerCase();
    }
    if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
      const [, r, g, b] = trimmed;
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    if (/^[0-9A-Fa-f]{6}$/.test(trimmed)) {
      return `#${trimmed.toLowerCase()}`;
    }
    return undefined;
  }

  function coverTone(): string {
    const explicit = normalizeCoverHex(item.icon?.tone);
    if (explicit) {
      return explicit;
    }
    const fromUrl = item.icon?.url?.match(/cdn\.simpleicons\.org\/[^/?#]+\/([0-9A-Fa-f]{3,8})/i)?.[1];
    const parsed = normalizeCoverHex(fromUrl);
    if (parsed) {
      return parsed;
    }
    return "#4e84ff";
  }

  function coverStyle(): string {
    const tone = coverTone();
    const raw = tone.replace("#", "");
    const r = Number.parseInt(raw.slice(0, 2), 16);
    const g = Number.parseInt(raw.slice(2, 4), 16);
    const b = Number.parseInt(raw.slice(4, 6), 16);
    const deep = `rgb(${Math.max(r - 40, 10)}, ${Math.max(g - 36, 14)}, ${Math.max(b - 24, 28)})`;
    const soft = `rgb(${Math.min(r + 28, 255)}, ${Math.min(g + 32, 255)}, ${Math.min(b + 36, 255)})`;
    return `background: radial-gradient(ellipse 90% 80% at 20% 20%, rgba(255,255,255,0.28), transparent 55%), linear-gradient(135deg, ${soft} 0%, ${tone} 48%, ${deep} 100%);`;
  }

  function handlePrimaryAction(event: MouseEvent): void {
    onprimaryaction?.(event, item);
  }

  function detailLinkLabel(): string {
    return `${labels.detail}: ${item.title}`;
  }

  function formatLabel(template: string, values: Record<string, string>): string {
    return Object.entries(values).reduce(
      (result, [key, value]) => result.replaceAll(`{{${key}}}`, value),
      template,
    );
  }
</script>

<Card
  class={cardClass}
  data-blueprint-marketplace-card
  data-marketplace-card
  data-marketplace-category={item.category}
  data-marketplace-search-text={searchText}
  data-density={density}
>
  {#if detailHref}
    <a
      class="absolute inset-0 z-10 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      href={detailHref}
      aria-label={detailLinkLabel()}
      data-blueprint-marketplace-detail-link
    ></a>
  {/if}

  {#if showCover}
    <div
      class="relative h-[104px] overflow-hidden border-b border-border/40"
      style={coverStyle()}
      data-blueprint-marketplace-cover
      aria-hidden="true"
    >
      <div
        class="pointer-events-none absolute inset-0 opacity-20"
        style="background-image:linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px);background-size:22px 22px;"
      ></div>
      <div class="relative flex h-full items-center justify-center">
        <div class="grid size-14 place-items-center rounded-xl border border-white/55 bg-white/95 shadow-md">
          {#if item.icon?.url && !iconFailed}
            <img
              class="size-8 object-contain"
              src={item.icon.url}
              alt=""
              loading="lazy"
              decoding="async"
              onerror={() => {
                iconFailed = true;
              }}
            />
          {:else}
            <span class="text-sm font-black uppercase text-foreground">{iconLabel()}</span>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <CardContent class={contentClass}>
    <div class="flex min-w-0 items-start justify-between gap-3">
      <div class={cn("grid min-w-0 gap-3", showCover ? "grid-cols-1" : isCompact ? "grid-cols-[2.5rem_minmax(0,1fr)]" : "grid-cols-[2.75rem_minmax(0,1fr)]")}>
        {#if !showCover}
          <div class={iconClass} style={iconFallbackStyle()}>
            {#if item.icon?.url && !iconFailed}
              <img
                class={cn("object-contain", isCompact ? "size-6" : "size-7")}
                src={item.icon.url}
                alt={item.icon.alt ?? `${item.title} icon`}
                loading="lazy"
                decoding="async"
                onerror={() => {
                  iconFailed = true;
                }}
              />
            {:else if iconLabel()}
              <span>{iconLabel()}</span>
            {:else}
              <span aria-hidden="true">□</span>
            {/if}
          </div>
        {/if}
        <div class="min-w-0">
          <h3 class={cn("truncate font-semibold leading-snug text-foreground", isCompact ? "text-base" : "text-lg")}>{item.title}</h3>
          <p class={cn("mt-1 line-clamp-2 text-muted-foreground", isCompact ? "text-sm leading-6" : "text-sm leading-6")}>{item.subtitle}</p>
        </div>
      </div>
      <div class="flex shrink-0 flex-wrap justify-end gap-1.5">
        {#if showCategory && !isMini && item.featured}
          <Badge variant="outline" class="h-6 normal-case tracking-normal">{labels.featured}</Badge>
        {/if}
        {#if selected}
          <Badge variant="secondary" class="h-6 normal-case tracking-normal">{labels.selected}</Badge>
        {/if}
      </div>
    </div>

    {#if showSummary && !isMini}
      <p class="line-clamp-2 text-sm leading-6 text-muted-foreground">{item.blueprint.summary}</p>
    {/if}

    {#if showFacts}
      <dl class={cn("grid gap-2", isCompact ? "grid-cols-1" : "grid-cols-2")} data-blueprint-marketplace-facts>
        <div class={cn(isCompact ? compactFactClass : "grid gap-1 rounded-lg border border-border/80 bg-muted/30 p-3")}>
          <dt class={isCompact ? compactFactLabelClass : "whitespace-nowrap text-xs font-bold text-muted-foreground"} title={labels.dependencies}>{labels.dependencies}</dt>
          <dd class={cn("min-w-0 truncate font-semibold text-foreground", isCompact && "font-mono text-sm")} title={dependencySummary()}>{dependencySummary()}</dd>
        </div>
        {#if !isMini}
          <div class={cn(isCompact ? compactFactClass : "grid gap-1 rounded-lg border border-border/80 bg-muted/30 p-3")}>
            <dt class={isCompact ? compactFactLabelClass : "whitespace-nowrap text-xs font-bold text-muted-foreground"} title={labels.components}>{labels.components}</dt>
            <dd class="min-w-0 truncate font-semibold text-foreground">{componentSummary()}</dd>
          </div>
          <div class={cn(isCompact ? compactFactClass : "grid gap-1 rounded-lg border border-border/80 bg-muted/30 p-3")}>
            <dt class={isCompact ? compactFactLabelClass : "whitespace-nowrap text-xs font-bold text-muted-foreground"} title={labels.variants}>{labels.variants}</dt>
            <dd class="min-w-0 truncate font-semibold text-foreground">{variantSummary()}</dd>
          </div>
        {/if}
        <div class={cn(isCompact ? compactFactClass : "grid gap-1 rounded-lg border border-border/80 bg-muted/30 p-3")}>
          <dt class={isCompact ? compactFactLabelClass : "whitespace-nowrap text-xs font-bold text-muted-foreground"} title={labels.ports}>{labels.ports}</dt>
          <dd class={cn("min-w-0 truncate font-semibold text-foreground", isCompact && "font-mono text-sm")} title={portSummary()}>{portSummary()}</dd>
        </div>
      </dl>
    {/if}

    {#if tags.length > 0 && !isCompact}
      <div class="flex flex-wrap gap-1.5">
        {#each tags.slice(0, 5) as tag (tag)}
          <Badge variant="outline" class="h-6 normal-case tracking-normal">{tag}</Badge>
        {/each}
      </div>
    {/if}

    {#if !showFooter && actionHref}
      <div class="relative z-20 flex justify-end">
        <Button href={actionHref} variant="outline" size="sm" data-marketplace-deploy-link onclick={handlePrimaryAction}>
          {actionLabel}
          <span aria-hidden="true">→</span>
        </Button>
      </div>
    {/if}
  </CardContent>

  {#if showFooter}
    <CardFooter
      class={cn("relative z-20 flex min-w-0 items-center justify-end gap-2 border-t px-4 py-3", isCompact && "px-3 py-2.5")}
    >
      <div class={cn("flex shrink-0 items-center gap-2", isCompact && "min-w-0 flex-wrap justify-end")}>
        {#if item.websiteUrl}
          <Button
            href={item.websiteUrl}
            target="_blank"
            rel="noreferrer"
            variant="outline"
            size="icon-sm"
            aria-label={`${item.title} ${labels.website}`}
            title={`${item.title} ${labels.website}`}
          >
            ↗
          </Button>
        {/if}
        {#if detailHref}
          <Button
            href={detailHref}
            variant="outline"
            size="sm"
            class={isCompact ? "h-8 px-2.5" : ""}
          >
            {labels.detail}
            <span aria-hidden="true">→</span>
          </Button>
        {/if}
        {#if onview}
          <Button
            variant="outline"
            size="sm"
            class={isCompact ? "h-8 px-2.5" : ""}
            onclick={() => onview?.(item)}
          >
            {labels.detail}
            <span aria-hidden="true">↗</span>
          </Button>
        {/if}
        {#if actionHref}
          <Button
            href={actionHref}
            size="sm"
            class={isCompact ? "h-8 px-2.5" : ""}
            data-marketplace-deploy-link
            onclick={handlePrimaryAction}
          >
            {actionLabel}
            <span aria-hidden="true">→</span>
          </Button>
        {/if}
      </div>
    </CardFooter>
  {/if}
</Card>
