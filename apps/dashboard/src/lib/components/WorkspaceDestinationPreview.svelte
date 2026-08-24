<script lang="ts">
  import { Activity, Boxes, Settings, Store, Waypoints } from "@lucide/svelte";

  import { dashboardCopy as copy, dashboardI18n as i18n } from "$lib/i18n.svelte";
  import type { WorkspaceDestination } from "$lib/navigation";

  let { destination }: { destination: Exclude<WorkspaceDestination, "projects"> } = $props();

  const content = $derived({
    infrastructure: { title: i18n.t(copy.nav.infrastructure), description: i18n.t(copy.destination.infrastructure) },
    activity: { title: i18n.t(copy.nav.activity), description: i18n.t(copy.destination.activity) },
    marketplace: { title: i18n.t(copy.nav.marketplace), description: i18n.t(copy.destination.marketplace) },
    settings: { title: i18n.t(copy.nav.settings), description: i18n.t(copy.destination.settings) },
  }[destination]);
</script>

<section class="mx-auto w-full max-w-[1120px] px-5 py-8 sm:px-8 lg:py-12">
  <span class="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{i18n.t(copy.shell.foundationPreview)}</span>
  <h1 class="mt-5 text-3xl font-semibold tracking-[-0.025em]">{content.title}</h1>
  <p class="mt-3 max-w-2xl text-[0.9375rem] text-muted-foreground">{content.description}</p>

  <div class="mt-10 grid gap-4 md:grid-cols-3">
    {#each [0, 1, 2] as index}
      <article class="min-h-56 rounded-[16px] border border-divider bg-surface p-5 sm:p-6">
        <span data-icon-surface={index === 0 ? "blue" : index === 1 ? "cyan" : "violet"} class={`grid size-11 place-items-center rounded-[12px] ${index === 0 ? "bg-icon-blue text-icon-blue-foreground" : index === 1 ? "bg-icon-cyan text-icon-cyan-foreground" : "bg-icon-violet text-icon-violet-foreground"}`}>
          {#if destination === "infrastructure"}
            {#if index === 0}<Waypoints class="size-5" />{:else}<Boxes class="size-5" />{/if}
          {:else if destination === "activity"}
            <Activity class="size-5" />
          {:else if destination === "marketplace"}
            <Store class="size-5" />
          {:else}
            <Settings class="size-5" />
          {/if}
        </span>
        <div class="mt-16 h-2.5 w-24 rounded-full bg-muted"></div>
        <div class="mt-3 h-2 w-full rounded-full bg-muted"></div>
        <div class="mt-2 h-2 w-3/4 rounded-full bg-muted"></div>
      </article>
    {/each}
  </div>
</section>
