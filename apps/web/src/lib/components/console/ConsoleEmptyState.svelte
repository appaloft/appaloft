<script lang="ts">
  import { BookOpen, Plus } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import { Button } from "$lib/components/ui/button";
  import * as Empty from "$lib/components/ui/empty";
  import { i18nKeys, t } from "$lib/i18n";

  type EmptyTone =
    | "project"
    | "server"
    | "dependency"
    | "domain"
    | "deployment"
    | "credential"
    | "invitation"
    | "preview-policy";

  let {
    tone,
    title,
    description,
    actionLabel,
    secondaryActionLabel,
    learnMoreHref,
    onAction,
    onSecondaryAction,
    children,
  }: {
    tone: EmptyTone;
    title: string;
    description: string;
    actionLabel?: string;
    secondaryActionLabel?: string;
    learnMoreHref?: string;
    onAction?: () => void;
    onSecondaryAction?: () => void;
    children?: Snippet;
  } = $props();

</script>

<Empty.Root
  class="min-h-[28rem] border border-dashed bg-card px-6 py-14 shadow-sm sm:min-h-[34rem]"
  data-console-empty-state={tone}
>
  <Empty.Media class="relative size-32 overflow-visible">
    <svg
      aria-hidden="true"
      viewBox="0 0 160 130"
      class="absolute inset-0 size-full text-primary/70"
      fill="none"
    >
      {#if tone === "project"}
        <path
          d="M31 44c0-8 6-14 14-14h24c5 0 8 2 11 6l5 7h30c8 0 14 6 14 14v45c0 8-6 14-14 14H45c-8 0-14-6-14-14V44Z"
          stroke="currentColor"
          stroke-width="4"
          stroke-linejoin="round"
        />
        <path d="M32 58h96" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity=".5" />
        <rect x="49" y="75" width="20" height="20" rx="6" stroke="currentColor" stroke-width="4" opacity=".72" />
        <rect x="90" y="75" width="20" height="20" rx="6" stroke="currentColor" stroke-width="4" opacity=".72" />
        <path d="M76 85h8M59 95v8h41v-8" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity=".55" />
      {:else if tone === "server"}
        <rect x="42" y="21" width="76" height="26" rx="7" stroke="currentColor" stroke-width="4" />
        <rect x="42" y="56" width="76" height="26" rx="7" stroke="currentColor" stroke-width="4" />
        <rect x="42" y="91" width="76" height="26" rx="7" stroke="currentColor" stroke-width="4" />
        <path d="M56 34h4M72 34h29M56 69h4M72 69h25M56 104h4M72 104h33" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity=".62" />
      {:else if tone === "dependency"}
        <ellipse cx="80" cy="28" rx="38" ry="14" stroke="currentColor" stroke-width="4" />
        <path d="M42 28v50c0 8 17 14 38 14s38-6 38-14V28" stroke="currentColor" stroke-width="4" />
        <path d="M42 53c0 8 17 14 38 14s38-6 38-14M42 78c0 8 17 14 38 14s38-6 38-14" stroke="currentColor" stroke-width="3" opacity=".48" />
        <path d="M80 92v15M58 107h44" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity=".58" />
        <rect x="44" y="105" width="28" height="18" rx="6" stroke="currentColor" stroke-width="4" opacity=".68" />
        <rect x="88" y="105" width="28" height="18" rx="6" stroke="currentColor" stroke-width="4" opacity=".68" />
      {:else if tone === "domain"}
        <rect x="30" y="30" width="100" height="72" rx="13" stroke="currentColor" stroke-width="4" />
        <path d="M30 51h100M49 41h2M63 41h2" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity=".58" />
        <path d="M55 69h50" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity=".55" />
        <circle cx="69" cy="84" r="16" stroke="currentColor" stroke-width="4" opacity=".72" />
        <path d="M53 84h32M69 68c5 5 8 10 8 16s-3 11-8 16M69 68c-5 5-8 10-8 16s3 11 8 16" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".5" />
        <path d="M102 87l7 7 15-18" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M80 102v13M58 115h44" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity=".52" />
      {:else if tone === "deployment"}
        <path
          d="M80 17c17 14 27 34 27 58 0 22-11 39-27 39S53 97 53 75c0-24 10-44 27-58Z"
          stroke="currentColor"
          stroke-width="4"
          stroke-linejoin="round"
        />
        <circle cx="80" cy="55" r="11" stroke="currentColor" stroke-width="4" opacity=".72" />
        <path d="M63 96H50l-12 17 22-5M97 96h13l12 17-22-5" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity=".68" />
        <path d="M72 115c0 7 8 14 8 14s8-7 8-14" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity=".58" />
        <path d="M80 72v30" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity=".5" />
      {:else if tone === "credential"}
        <circle cx="61" cy="70" r="21" stroke="currentColor" stroke-width="4" />
        <path d="M76 85l12 12h14l8 8h14" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="55" cy="64" r="5" fill="currentColor" opacity=".58" />
        <rect x="40" y="26" width="80" height="28" rx="8" stroke="currentColor" stroke-width="4" opacity=".68" />
        <path d="M55 40h16M86 40h19" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity=".42" />
        <path d="M44 106h58" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity=".32" />
      {:else if tone === "invitation"}
        <rect x="36" y="40" width="88" height="58" rx="12" stroke="currentColor" stroke-width="4" />
        <path
          d="M40 50l40 30 40-30"
          stroke="currentColor"
          stroke-width="4"
          stroke-linecap="round"
          stroke-linejoin="round"
          opacity=".58"
        />
        <path d="M58 100v12M102 100v12M66 112h28" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity=".42" />
        <circle cx="115" cy="34" r="17" stroke="currentColor" stroke-width="4" />
        <path d="M115 25v18M106 34h18" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
        <path d="M46 31h34M91 31h12" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity=".32" />
      {:else}
        <rect x="38" y="25" width="84" height="64" rx="12" stroke="currentColor" stroke-width="4" />
        <path d="M56 56l17 16 32-34" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M80 89v18M55 107h50" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity=".6" />
        <path d="M53 42h17M91 42h17" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".35" />
      {/if}
    </svg>
  </Empty.Media>
  <Empty.Header>
    <Empty.Title class="text-xl">{title}</Empty.Title>
    <Empty.Description>{description}</Empty.Description>
  </Empty.Header>
  {#if actionLabel || secondaryActionLabel || learnMoreHref || children}
    <Empty.Content class="flex-col gap-2 sm:flex-col">
      <div class="flex flex-col items-center gap-2 sm:flex-row">
        {#if actionLabel}
          <Button type="button" onclick={onAction}>
            <Plus class="size-4" />
            {actionLabel}
          </Button>
        {/if}
        {#if secondaryActionLabel}
          <Button type="button" variant="outline" onclick={onSecondaryAction}>
            {secondaryActionLabel}
          </Button>
        {/if}
        {@render children?.()}
      </div>
      {#if learnMoreHref}
        <a
          href={learnMoreHref}
          target="_blank"
          rel="external noreferrer"
          class="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          <BookOpen class="size-3.5" />
          {$t(i18nKeys.common.actions.learnMore)}
        </a>
      {/if}
    </Empty.Content>
  {/if}
</Empty.Root>
