<script lang="ts">
  import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "@lucide/svelte";

  import { Button } from "$lib/components/ui/button";

  type StateTone = "neutral" | "success" | "warning" | "error" | "permission";

  type Props = {
    tone?: StateTone;
    title: string;
    description?: string;
    detail?: string;
    actionLabel?: string;
    actionHref?: string;
    actionDisabled?: boolean;
    secondaryActionLabel?: string;
    secondaryActionHref?: string;
    class?: string;
  };

  let {
    tone = "neutral",
    title,
    description = "",
    detail = "",
    actionLabel = "",
    actionHref = "",
    actionDisabled = false,
    secondaryActionLabel = "",
    secondaryActionHref = "",
    class: className = "",
  }: Props = $props();

  const Icon = $derived.by(() => {
    switch (tone) {
      case "success":
        return CheckCircle2;
      case "warning":
        return AlertTriangle;
      case "error":
      case "permission":
        return ShieldAlert;
      case "neutral":
        return Info;
    }
  });
  const toneClass = $derived.by(() => {
    switch (tone) {
      case "success":
        return "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300";
      case "warning":
        return "border-amber-500/25 bg-amber-500/5 text-amber-800 dark:text-amber-300";
      case "error":
      case "permission":
        return "border-destructive/25 bg-destructive/5 text-destructive";
      case "neutral":
        return "border-border bg-muted/20 text-muted-foreground";
    }
  });
</script>

<section class={["console-subtle-panel px-4 py-5", className]}>
  <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
    <div class="flex min-w-0 gap-3">
      <div
        class={[
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border",
          toneClass,
        ]}
      >
        <Icon class="size-4" />
      </div>
      <div class="min-w-0">
        <h3 class="text-sm font-semibold text-foreground">{title}</h3>
        {#if description}
          <p class="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        {/if}
        {#if detail}
          <p class="mt-2 max-w-2xl break-words font-mono text-xs text-muted-foreground">
            {detail}
          </p>
        {/if}
      </div>
    </div>

    {#if actionLabel || secondaryActionLabel}
      <div class="flex shrink-0 flex-wrap gap-2">
        {#if secondaryActionLabel && secondaryActionHref}
          <Button href={secondaryActionHref} size="sm" variant="outline">
            {secondaryActionLabel}
          </Button>
        {/if}
        {#if actionLabel && actionHref}
          <Button href={actionHref} size="sm" disabled={actionDisabled}>
            {actionLabel}
          </Button>
        {/if}
      </div>
    {/if}
  </div>
</section>
