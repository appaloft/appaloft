<script lang="ts">
  import { Badge } from "@appaloft/ui/badge";
  import { Button } from "@appaloft/ui/button";
  import * as Card from "@appaloft/ui/card";
  import { ArrowUpRight, Boxes, CheckCircle2, Clock3, Plus, Search } from "@lucide/svelte";

  import { dashboardCopy as copy, dashboardI18n as i18n } from "$lib/i18n.svelte";
  import { projectDestinationHref } from "$lib/navigation";

  const projects = [
    {
      id: "atlas-api",
      name: "Atlas API",
      description: "Public API and async workers",
      status: "healthy",
      resources: 6,
      activity: "8 min ago",
      accent: "bg-primary",
    },
    {
      id: "northstar-web",
      name: "Northstar Web",
      description: "Customer application and edge delivery",
      status: "attention",
      resources: 4,
      activity: "23 min ago",
      accent: "bg-chart-2",
    },
    {
      id: "ledger-sync",
      name: "Ledger Sync",
      description: "Scheduled reconciliation services",
      status: "healthy",
      resources: 3,
      activity: "2 hr ago",
      accent: "bg-chart-4",
    },
  ] as const;
</script>

<section class="mx-auto w-full max-w-[1180px] px-5 py-8 sm:px-8 lg:py-12">
  <div class="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
    <div class="max-w-2xl">
      <div class="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span class="size-1.5 rounded-full bg-primary"></span>
        {i18n.t(copy.shell.foundationPreview)}
      </div>
      <h1 class="text-[clamp(1.75rem,3vw,2.25rem)] font-semibold leading-tight tracking-[-0.02em]">
        {i18n.t(copy.projects.title)}
      </h1>
      <p class="mt-2 max-w-xl text-[0.9375rem] text-muted-foreground">
        {i18n.t(copy.projects.description)}
      </p>
    </div>
    <Button class="h-10 rounded-[10px] px-4 shadow-none">
      <Plus class="size-4" />
      {i18n.t(copy.actions.newProject)}
    </Button>
  </div>

  <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <label class="relative block w-full max-w-sm">
      <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        class="h-10 w-full rounded-[10px] border border-control bg-surface pl-10 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/75 hover:border-ring/40 focus:border-ring focus:ring-2 focus:ring-ring/15"
        placeholder={i18n.t(copy.actions.searchProjects)}
      />
    </label>
    <p class="text-xs text-muted-foreground">{i18n.t(copy.shell.previewNotice)}</p>
  </div>

  <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    {#each projects as project}
      <Card.Root class="group overflow-hidden rounded-[16px] border-divider bg-surface py-0 shadow-none transition-colors hover:border-ring/35">
        <a
          class="block p-5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          href={projectDestinationHref(project.id, "overview")}
        >
          <div class="flex items-start justify-between gap-4">
            <span class={`grid size-10 place-items-center rounded-[11px] text-white ${project.accent}`}>
              <Boxes class="size-[18px]" />
            </span>
            <ArrowUpRight class="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>
          <div class="mt-8">
            <h2 class="text-base font-semibold">{project.name}</h2>
            <p class="mt-1 text-sm text-muted-foreground">{project.description}</p>
          </div>
          <div class="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-divider pt-4 text-xs text-muted-foreground">
            <span class="inline-flex items-center gap-1.5">
              {#if project.status === "healthy"}
                <CheckCircle2 class="size-3.5 text-emerald-600 dark:text-emerald-400" />
                {i18n.t(copy.projects.healthy)}
              {:else}
                <span class="size-2 rounded-full bg-amber-500"></span>
                {i18n.t(copy.projects.needsAttention)}
              {/if}
            </span>
            <span>{i18n.t(copy.projects.resourceCount, { count: project.resources })}</span>
            <span class="ml-auto inline-flex items-center gap-1.5">
              <Clock3 class="size-3.5" />
              {i18n.t(copy.projects.lastDeployed, { time: project.activity })}
            </span>
          </div>
        </a>
      </Card.Root>
    {/each}
  </div>

  <div class="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
    <section class="rounded-[16px] border border-divider bg-surface p-5 sm:p-6">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h2 class="font-semibold">{i18n.t(copy.project.recentDeployments)}</h2>
          <p class="mt-1 text-sm text-muted-foreground">atlas-api / production</p>
        </div>
        <Button variant="ghost" class="h-9 rounded-[9px] px-3 text-xs">
          {i18n.t(copy.actions.viewAllActivity)}
          <ArrowUpRight class="size-3.5" />
        </Button>
      </div>
      <div class="mt-5 divide-y divide-divider rounded-[12px] bg-surface-subtle px-4">
        {#each ["api-gateway", "events-worker", "billing-sync"] as resource, index}
          <div class="flex min-w-0 items-center gap-3 py-3.5">
            <span class="size-2 shrink-0 rounded-full bg-emerald-500"></span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{resource}</p>
              <p class="mt-0.5 text-xs text-muted-foreground">main · {index + 2} commits</p>
            </div>
            <Badge variant="secondary" class="rounded-full border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              {i18n.t(copy.projects.healthy)}
            </Badge>
          </div>
        {/each}
      </div>
    </section>

    <section class="flex min-h-56 flex-col justify-between rounded-[16px] border border-divider bg-surface p-5 sm:p-6">
      <div class="grid size-11 place-items-center rounded-[12px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 class="size-5" />
      </div>
      <div>
        <h2 class="font-semibold">{i18n.t(copy.projects.quietTitle)}</h2>
        <p class="mt-2 max-w-sm text-sm text-muted-foreground">
          {i18n.t(copy.projects.quietDescription)}
        </p>
      </div>
    </section>
  </div>
</section>
