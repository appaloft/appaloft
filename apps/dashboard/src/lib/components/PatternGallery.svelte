<script lang="ts">
  import { Badge } from "@appaloft/ui/badge";
  import { Button } from "@appaloft/ui/button";
  import * as Card from "@appaloft/ui/card";
  import { AlertTriangle, CheckCircle2, CircleDashed, Plus, Search, Trash2 } from "@lucide/svelte";

  import { dashboardCopy as copy, dashboardI18n as i18n } from "$lib/i18n.svelte";

  const colors = [
    ["Canvas", "bg-canvas"],
    ["Surface", "bg-surface"],
    ["Subtle", "bg-surface-subtle"],
    ["Selected", "bg-surface-selected"],
    ["Primary", "bg-primary"],
    ["Success", "bg-chart-2"],
    ["Warning", "bg-chart-4"],
    ["Failure", "bg-destructive"],
  ] as const;
</script>

<section class="mx-auto w-full max-w-[1120px] px-5 py-8 sm:px-8 lg:py-12">
  <p class="text-xs font-medium text-primary">dashboard-v2 / pattern gallery</p>
  <h1 class="mt-3 text-3xl font-semibold tracking-[-0.025em]">Calm infrastructure primitives</h1>
  <p class="mt-3 max-w-2xl text-sm text-muted-foreground">
    Executable reference for spacing, surfaces, controls, status, focus, and empty states.
  </p>

  <div class="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
    {#each colors as color}
      <div class="rounded-[14px] border border-divider bg-surface p-3">
        <div class={`h-16 rounded-[10px] border border-divider ${color[1]}`}></div>
        <p class="mt-3 text-xs font-medium">{color[0]}</p>
      </div>
    {/each}
  </div>

  <div class="mt-8 grid gap-5 lg:grid-cols-2">
    <Card.Root class="rounded-[16px] border-divider bg-surface p-0 shadow-none">
      <Card.Header class="p-5 pb-0">
        <Card.Title class="text-base">Controls</Card.Title>
        <Card.Description>40px controls with a visible, calm focus treatment.</Card.Description>
      </Card.Header>
      <Card.Content class="space-y-5 p-5">
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">Project search</span>
          <span class="relative block">
            <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input class="h-10 w-full rounded-[10px] border border-control bg-surface pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/15" placeholder={i18n.t(copy.actions.searchProjects)} />
          </span>
        </label>
        <div class="flex flex-wrap gap-2">
          <Button class="h-10 rounded-[10px] px-4 shadow-none"><Plus class="size-4" />Primary</Button>
          <Button variant="outline" class="h-10 rounded-[10px] px-4 shadow-none">Secondary</Button>
          <Button variant="ghost" class="h-10 rounded-[10px] px-4">Ghost</Button>
          <Button variant="destructive" class="h-10 rounded-[10px] px-4"><Trash2 class="size-4" />Delete</Button>
        </div>
      </Card.Content>
    </Card.Root>

    <Card.Root class="rounded-[16px] border-divider bg-surface p-0 shadow-none">
      <Card.Header class="p-5 pb-0">
        <Card.Title class="text-base">Operational states</Card.Title>
        <Card.Description>Status uses icon, label, fill, and border — never hue alone.</Card.Description>
      </Card.Header>
      <Card.Content class="grid gap-3 p-5">
        <div class="flex items-center gap-3 rounded-[12px] border border-emerald-500/20 bg-emerald-500/[0.055] p-3">
          <CheckCircle2 class="size-[18px] text-emerald-600 dark:text-emerald-400" />
          <span class="text-sm font-medium">Healthy deployment</span>
          <Badge variant="secondary" class="ml-auto rounded-full border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">Ready</Badge>
        </div>
        <div class="flex items-center gap-3 rounded-[12px] border border-amber-500/20 bg-amber-500/[0.055] p-3">
          <AlertTriangle class="size-[18px] text-amber-600 dark:text-amber-400" />
          <span class="text-sm font-medium">Attention required</span>
          <Badge variant="secondary" class="ml-auto rounded-full border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300">Delayed</Badge>
        </div>
        <div class="flex items-center gap-3 rounded-[12px] border border-divider bg-surface-subtle p-3">
          <CircleDashed class="size-[18px] text-muted-foreground" />
          <span class="text-sm font-medium">Not configured</span>
          <Badge variant="secondary" class="ml-auto rounded-full">Neutral</Badge>
        </div>
      </Card.Content>
    </Card.Root>
  </div>

  <section class="mt-5 flex min-h-64 flex-col items-center justify-center rounded-[16px] border border-dashed border-divider bg-surface px-6 text-center">
    <span class="grid size-12 place-items-center rounded-[14px] bg-surface-subtle text-muted-foreground"><CircleDashed class="size-5" /></span>
    <h2 class="mt-5 text-base font-semibold">No resources in this environment</h2>
    <p class="mt-2 max-w-sm text-sm text-muted-foreground">Create the first resource when the environment is ready to receive a deployable workload.</p>
    <Button class="mt-5 h-10 rounded-[10px] px-4 shadow-none"><Plus class="size-4" />{i18n.t(copy.actions.addResource)}</Button>
  </section>
</section>
