<script lang="ts">
  import { Button } from "@appaloft/ui/button";
  import {
    Activity,
    ArrowLeft,
    Bell,
    Bot,
    Boxes,
    ChevronDown,
    FolderKanban,
    Gauge,
    Menu,
    Moon,
    Settings,
    Store,
    Sun,
    Waypoints,
  } from "@lucide/svelte";

  import { dashboardCopy as copy, commonCopy, dashboardI18n as i18n } from "$lib/i18n.svelte";
  import {
    projectDestinationHref,
    projectNavigation,
    workspaceNavigation,
    type DashboardRoute,
    type ProjectDestination,
    type WorkspaceDestination,
  } from "$lib/navigation";
  import { dashboardTheme } from "$lib/theme.svelte";

  import ProjectPreview from "./ProjectPreview.svelte";
  import PatternGallery from "./PatternGallery.svelte";
  import ProjectsPreview from "./ProjectsPreview.svelte";
  import ResourcePanel from "./ResourcePanel.svelte";
  import WorkspaceDestinationPreview from "./WorkspaceDestinationPreview.svelte";

  let { route }: { route: DashboardRoute } = $props();
  let mobileProjectMenuOpen = $state(false);

  const projectScoped = $derived(route.kind === "project" || route.kind === "resource");
  const projectId = $derived(
    route.kind === "project" || route.kind === "resource" ? route.projectId : undefined,
  );
  const projectDestination = $derived<ProjectDestination>(
    route.kind === "project" ? route.destination : "overview",
  );
  const environmentId = $derived(
    route.kind === "project" || route.kind === "resource"
      ? route.environmentId || "production"
      : undefined,
  );

  function workspaceLabel(destination: WorkspaceDestination): string {
    return i18n.t(copy.nav[destination]);
  }

  function projectLabel(destination: ProjectDestination): string {
    return i18n.t(copy.nav[destination]);
  }
</script>

<div class="dashboard-shell min-h-svh text-foreground">
  <header class="fixed inset-x-0 top-0 z-30 flex h-16 items-center border-b border-divider bg-surface-raised/90 px-4 backdrop-blur-md sm:px-5">
    <div class="flex min-w-0 flex-1 items-center gap-3">
      <a class="grid size-9 shrink-0 place-items-center rounded-[11px] bg-primary text-primary-foreground shadow-[var(--shadow-primary)]" href="/projects" aria-label="Appaloft">
        <span class="text-[15px] font-semibold">A</span>
      </a>
      <span class="hidden h-6 w-px bg-divider sm:block"></span>
      {#if projectScoped && projectId}
        <a class="hidden items-center gap-2 text-sm text-muted-foreground hover:text-foreground sm:inline-flex" href="/projects">
          <FolderKanban class="size-4" />
          {i18n.t(copy.nav.projects)}
        </a>
        <span class="hidden text-muted-foreground/50 sm:block">/</span>
        <button class="inline-flex min-w-0 items-center gap-2 rounded-[9px] px-2 py-1.5 text-sm font-medium hover:bg-muted">
          <span class="size-2 shrink-0 rounded-full bg-primary"></span>
          <span class="truncate">Atlas API</span>
          <ChevronDown class="size-3.5 shrink-0 text-muted-foreground" />
        </button>
        <span class="text-muted-foreground/50">/</span>
        <button class="hidden items-center gap-1.5 rounded-[9px] px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted sm:inline-flex">
          {environmentId}
          <ChevronDown class="size-3.5" />
        </button>
      {:else}
        <button class="inline-flex min-w-0 items-center gap-2 rounded-[9px] px-2 py-1.5 text-sm font-medium hover:bg-muted">
          <span class="grid size-5 place-items-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">N</span>
          <span class="truncate">{i18n.t(copy.shell.workspaceName)}</span>
          <ChevronDown class="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      {/if}
    </div>

    <div class="flex shrink-0 items-center gap-1">
      <button
        class="hidden h-9 items-center rounded-[9px] px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground sm:inline-flex"
        onclick={() => i18n.toggle()}
      >
        {i18n.locale === "en-US" ? "中文" : "EN"}
      </button>
      <Button
        variant="ghost"
        size="icon"
        class="size-9 rounded-[9px]"
        onclick={() => dashboardTheme.toggle()}
        aria-label={i18n.t(
          dashboardTheme.value === "dark"
            ? commonCopy.actions.switchToLightMode
            : commonCopy.actions.switchToDarkMode,
        )}
      >
        {#if dashboardTheme.value === "dark"}<Sun class="size-4" />{:else}<Moon class="size-4" />{/if}
      </Button>
      <Button variant="ghost" size="icon" class="hidden size-9 rounded-[9px] sm:inline-flex" aria-label={i18n.t(copy.actions.notifications)}>
        <Bell class="size-4" />
      </Button>
      <Button variant="ghost" class="h-9 rounded-[9px] px-2.5 text-xs sm:px-3" aria-label={i18n.t(copy.actions.openAgent)}>
        <Bot class="size-4" />
        <span class="hidden sm:inline">Agent</span>
      </Button>
    </div>
  </header>

  <div class="flex min-h-svh pt-16">
    <aside class="fixed bottom-0 left-0 top-16 z-20 hidden w-[248px] flex-col border-r border-sidebar-border bg-sidebar p-3 lg:flex">
      {#if projectScoped && projectId}
        <a class="mb-3 flex h-10 items-center gap-2 rounded-[10px] px-3 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground" href="/projects">
          <ArrowLeft class="size-4" />
          {i18n.t(copy.actions.returnProjects)}
        </a>
        <div class="mb-3 border-b border-sidebar-border px-3 pb-4">
          <p class="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{i18n.t(copy.shell.projectScope)}</p>
          <p class="mt-1 truncate text-sm font-semibold text-sidebar-foreground">Atlas API</p>
        </div>
        <nav class="space-y-1" aria-label="Project">
          {#each projectNavigation as item}
            <a
              class={`relative flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm transition-colors ${projectDestination === item.id ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground before:absolute before:left-0 before:h-5 before:w-0.5 before:rounded-full before:bg-primary" : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"}`}
              href={projectDestinationHref(projectId, item.id, environmentId)}
              aria-current={projectDestination === item.id ? "page" : undefined}
            >
              {#if item.id === "overview"}<Boxes class="size-4" />{:else if item.id === "deployments"}<Activity class="size-4" />{:else if item.id === "observability"}<Gauge class="size-4" />{:else}<Settings class="size-4" />{/if}
              {projectLabel(item.id)}
            </a>
          {/each}
        </nav>
      {:else}
        <div class="mb-3 px-3 pb-3 pt-2">
          <p class="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{i18n.t(copy.shell.workspaceScope)}</p>
        </div>
        <nav class="space-y-1" aria-label="Workspace">
          {#each workspaceNavigation as item}
            {@const active = route.kind === "workspace" && route.destination === item.id}
            <a
              class={`relative flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm transition-colors ${active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground before:absolute before:left-0 before:h-5 before:w-0.5 before:rounded-full before:bg-primary" : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"}`}
              href={item.href}
              aria-current={active ? "page" : undefined}
            >
              {#if item.id === "projects"}<FolderKanban class="size-4" />{:else if item.id === "infrastructure"}<Waypoints class="size-4" />{:else if item.id === "activity"}<Activity class="size-4" />{:else if item.id === "marketplace"}<Store class="size-4" />{:else}<Settings class="size-4" />{/if}
              {workspaceLabel(item.id)}
            </a>
          {/each}
        </nav>
        <div class="mt-auto rounded-[12px] border border-sidebar-border bg-surface/75 p-3">
          <div class="flex items-center gap-2 text-xs font-medium">
            <span class="size-2 rounded-full bg-emerald-500"></span>
            {i18n.t(copy.shell.allSystemsOperational)}
          </div>
          <p class="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{i18n.t(copy.shell.localPreview)}</p>
        </div>
      {/if}
    </aside>

    <main
      class={`min-w-0 flex-1 pb-20 lg:ml-[248px] lg:pb-0 ${route.kind === "resource" ? "dashboard-resource-background" : ""}`}
    >
      {#if route.kind === "workspace" && route.destination === "projects"}
        <ProjectsPreview {route} />
      {:else if route.kind === "workspace" && route.destination !== "projects"}
        <WorkspaceDestinationPreview destination={route.destination} />
      {:else if route.kind === "project" || route.kind === "resource"}
        <ProjectPreview {route} />
      {:else if route.kind === "utility" && route.destination === "patterns"}
        <PatternGallery />
      {:else}
        <section class="mx-auto max-w-2xl px-5 py-20 text-center">
          <p class="text-sm font-medium text-primary">404</p>
          <h1 class="mt-3 text-2xl font-semibold">{i18n.t(copy.notFound.title)}</h1>
          <p class="mt-2 text-sm text-muted-foreground">{i18n.t(copy.notFound.description)}</p>
          <Button href="/projects" class="mt-6 h-10 rounded-[10px] px-4">{i18n.t(copy.actions.returnProjects)}</Button>
        </section>
      {/if}
    </main>
  </div>

  {#if route.kind === "project" && projectId}
    <button
      class="fixed bottom-[76px] right-4 z-30 grid size-11 place-items-center rounded-[12px] border border-divider bg-surface-overlay shadow-[var(--shadow-overlay)] lg:hidden"
      onclick={() => (mobileProjectMenuOpen = !mobileProjectMenuOpen)}
      aria-label={i18n.t(copy.actions.projectNavigation)}
      aria-expanded={mobileProjectMenuOpen}
    >
      <Menu class="size-5" />
    </button>
    {#if mobileProjectMenuOpen}
      <nav class="fixed inset-x-3 bottom-[76px] z-30 rounded-[16px] border border-divider bg-surface-overlay p-2 shadow-[var(--shadow-overlay)] lg:hidden" aria-label="Project">
        {#each projectNavigation as item}
          <a
            class={`flex h-11 items-center gap-3 rounded-[10px] px-3 text-sm ${projectDestination === item.id ? "bg-surface-selected font-medium text-accent-foreground" : "text-muted-foreground"}`}
            href={projectDestinationHref(projectId, item.id, environmentId)}
          >{projectLabel(item.id)}</a>
        {/each}
      </nav>
    {/if}
  {/if}

  {#if !projectScoped}
    <nav class="fixed inset-x-0 bottom-0 z-30 grid h-[68px] grid-cols-5 border-t border-divider bg-surface-raised/90 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden" aria-label="Workspace">
      {#each workspaceNavigation as item}
        {@const active = route.kind === "workspace" && route.destination === item.id}
        <a class={`flex min-w-0 flex-col items-center justify-center gap-1 text-[10px] font-medium ${active ? "text-primary" : "text-muted-foreground"}`} href={item.href} aria-current={active ? "page" : undefined}>
          {#if item.id === "projects"}<FolderKanban class="size-[18px]" />{:else if item.id === "infrastructure"}<Waypoints class="size-[18px]" />{:else if item.id === "activity"}<Activity class="size-[18px]" />{:else if item.id === "marketplace"}<Store class="size-[18px]" />{:else}<Settings class="size-[18px]" />{/if}
          <span class="truncate">{workspaceLabel(item.id)}</span>
        </a>
      {/each}
    </nav>
  {/if}

  {#if route.kind === "resource"}
    <ResourcePanel {route} />
  {/if}
</div>
