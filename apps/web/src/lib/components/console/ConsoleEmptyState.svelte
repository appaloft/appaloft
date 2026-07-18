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

  function illustrationForTone(value: EmptyTone): string {
    return value === "project" || value === "credential" || value === "invitation"
      ? "/illustrations/console-empty-workstation.png"
      : "/illustrations/console-empty-infrastructure.png";
  }
</script>

<Empty.Root
  class="min-h-[28rem] border border-dashed bg-card px-6 py-14 shadow-sm sm:min-h-[34rem]"
  data-console-empty-state={tone}
>
  <Empty.Media class="mb-3 h-40 w-56 overflow-visible sm:h-44 sm:w-64">
    <img
      src={illustrationForTone(tone)}
      alt=""
      aria-hidden="true"
      class="size-full object-contain"
      width="640"
      height="426"
      decoding="async"
    />
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
