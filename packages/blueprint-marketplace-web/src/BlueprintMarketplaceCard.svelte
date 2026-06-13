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
    website: "网站",
  };

  let {
    item,
    actionHref = "",
    actionLabel = "部署",
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

  const cardClass = $derived(cn(
    "min-w-0 border-border/90 bg-card/95 py-0 text-card-foreground shadow-[0_18px_48px_rgba(20,31,47,0.07)] transition-colors hover:border-ring/35",
    "data-[density=default]:min-h-[300px] data-[density=compact]:min-h-[178px] data-[density=mini]:min-h-[158px]",
    selected && "border-ring/50 ring-1 ring-ring/20",
  ));
  const contentClass = $derived(cn(
    "flex min-h-0 flex-1 flex-col justify-between",
    isMini ? "gap-4 p-5" : isCompact ? "gap-3 p-4" : "gap-4 p-4",
  ));
  const iconClass = $derived(cn(
    "grid shrink-0 place-items-center overflow-hidden rounded-lg border border-border/80 bg-muted/45 text-xs font-black uppercase text-foreground",
    isCompact ? "size-10" : "size-11",
    item.icon?.url && !iconFailed && "bg-card",
  ));

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

  function handlePrimaryAction(event: MouseEvent): void {
    onprimaryaction?.(event, item);
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
  <CardContent class={contentClass}>
    <div class="flex min-w-0 items-start justify-between gap-3">
      <div class={cn("grid min-w-0 gap-3", isCompact ? "grid-cols-[2.5rem_minmax(0,1fr)]" : "grid-cols-[2.75rem_minmax(0,1fr)]")}>
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
        <div class={cn(isCompact ? "grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-3" : "grid gap-1 rounded-lg border border-border/80 bg-muted/30 p-3")}>
          <dt class="whitespace-nowrap text-xs font-bold text-muted-foreground">{labels.dependencies}</dt>
          <dd class={cn("min-w-0 truncate font-semibold text-foreground", isCompact && "font-mono text-sm")} title={dependencySummary()}>{dependencySummary()}</dd>
        </div>
        {#if !isMini}
          <div class={cn(isCompact ? "grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-3" : "grid gap-1 rounded-lg border border-border/80 bg-muted/30 p-3")}>
            <dt class="whitespace-nowrap text-xs font-bold text-muted-foreground">{labels.components}</dt>
            <dd class="min-w-0 truncate font-semibold text-foreground">{componentSummary()}</dd>
          </div>
          <div class={cn(isCompact ? "grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-3" : "grid gap-1 rounded-lg border border-border/80 bg-muted/30 p-3")}>
            <dt class="whitespace-nowrap text-xs font-bold text-muted-foreground">{labels.variants}</dt>
            <dd class="min-w-0 truncate font-semibold text-foreground">{variantSummary()}</dd>
          </div>
        {/if}
        <div class={cn(isCompact ? "grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-3" : "grid gap-1 rounded-lg border border-border/80 bg-muted/30 p-3")}>
          <dt class="whitespace-nowrap text-xs font-bold text-muted-foreground">{labels.ports}</dt>
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
      <div class="flex justify-end">
        <Button href={actionHref} variant="outline" size="sm" data-marketplace-deploy-link onclick={handlePrimaryAction}>
          {actionLabel}
          <span aria-hidden="true">→</span>
        </Button>
      </div>
    {/if}
  </CardContent>

  {#if showFooter}
    <CardFooter class="flex min-w-0 items-center justify-end gap-2 border-t px-4 py-3">
      <div class="flex shrink-0 items-center gap-2">
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
        {#if onview}
          <Button variant="outline" size="sm" onclick={() => onview?.(item)}>
            查看 <span aria-hidden="true">↗</span>
          </Button>
        {/if}
        {#if actionHref}
          <Button href={actionHref} size="sm" data-marketplace-deploy-link onclick={handlePrimaryAction}>
            {actionLabel}
            <span aria-hidden="true">→</span>
          </Button>
        {/if}
      </div>
    </CardFooter>
  {/if}
</Card>
