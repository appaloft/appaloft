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
    X,
  } from "@lucide/svelte";
  import { onMount } from "svelte";

  import { dashboardCopy as copy, commonCopy, dashboardI18n as i18n } from "$lib/i18n.svelte";
  import {
    projectDestinationHref,
    projectNavigation,
    workspaceNavigation,
    type DashboardRoute,
    type ProjectDestination,
    type WorkspaceDestination,
  } from "$lib/navigation";
  import { dashboardProjectContext } from "$lib/project-context.svelte";
  import { loadDashboardOrganizationContext } from "$lib/organization-context";
  import { dashboardTheme } from "$lib/theme.svelte";

  import ProjectPreview from "./ProjectPreview.svelte";
  import PatternGallery from "./PatternGallery.svelte";
  import ProjectsPreview from "./ProjectsPreview.svelte";
  import ResourcePanel from "./ResourcePanel.svelte";
  import ScopedExtensions from "./ScopedExtensions.svelte";

  let { route }: { route: DashboardRoute } = $props();
  let mobileProjectMenuOpen = $state(false);
  let agentOpen = $state(false);
  let agentPrompt = $state("");
  let agentCopyState = $state<"idle" | "copied" | "failed">("idle");
  let workspaceName = $state("");

  const displayedWorkspaceName = $derived(
    workspaceName || i18n.t(copy.shell.workspaceScope),
  );
  const workspaceInitial = $derived(displayedWorkspaceName.slice(0, 1).toUpperCase());

  onMount(async () => {
    try {
      const context = await loadDashboardOrganizationContext();
      workspaceName = context.currentOrganization.name;
    } catch {
      workspaceName = "";
    }
  });

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

  function selectAgentPrompt(prompt: string): void {
    agentPrompt = prompt;
    agentCopyState = "idle";
  }

  async function copyAgentBrief(): Promise<void> {
    const scope = projectScoped && projectId
      ? `Project: ${projectId}\nEnvironment: ${environmentId}`
      : `Workspace: ${displayedWorkspaceName}`;
    const destination = route.kind === "resource"
      ? `resource/${route.resourceId}`
      : route.kind === "not-found"
        ? route.pathname
        : route.destination;
    const brief = `${agentPrompt.trim()}\n\nContext\n${scope}\nDashboard destination: ${destination}\nURL: ${window.location.href}`;

    try {
      await navigator.clipboard.writeText(brief);
      agentCopyState = "copied";
    } catch {
      agentCopyState = "failed";
    }
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
          <span class="truncate">{dashboardProjectContext.projectId === projectId ? dashboardProjectContext.projectName : projectId}</span>
          <ChevronDown class="size-3.5 shrink-0 text-muted-foreground" />
        </button>
        <span class="text-muted-foreground/50">/</span>
        <button class="hidden items-center gap-1.5 rounded-[9px] px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted sm:inline-flex">
          {dashboardProjectContext.projectId === projectId && dashboardProjectContext.environmentId === environmentId ? dashboardProjectContext.environmentName : environmentId}
          <ChevronDown class="size-3.5" />
        </button>
      {:else}
        <button class="inline-flex min-w-0 items-center gap-2 rounded-[9px] px-2 py-1.5 text-sm font-medium hover:bg-muted">
          <span class="grid size-5 place-items-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">{workspaceInitial}</span>
          <span class="truncate">{displayedWorkspaceName}</span>
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
      <Button variant="ghost" class="h-9 rounded-[9px] px-2.5 text-xs sm:px-3" aria-label={i18n.t(copy.actions.openAgent)} onclick={() => (agentOpen = true)}>
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
          <p class="mt-1 truncate text-sm font-semibold text-sidebar-foreground">{dashboardProjectContext.projectId === projectId ? dashboardProjectContext.projectName : projectId}</p>
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
        {#if route.destination === "infrastructure"}
          {#await import("./WorkspaceInfrastructure.svelte")}<div class="grid min-h-[50svh] place-items-center text-sm text-muted-foreground">Loading infrastructure…</div>{:then module}<module.default />{:catch}<div class="p-10 text-center text-sm text-destructive">Infrastructure module failed to load.</div>{/await}
        {:else if route.destination === "activity"}
          {#await import("./WorkspaceActivity.svelte")}<div class="grid min-h-[50svh] place-items-center text-sm text-muted-foreground">Loading activity…</div>{:then module}<module.default {route} />{:catch}<div class="p-10 text-center text-sm text-destructive">Activity module failed to load.</div>{/await}
        {:else if route.destination === "marketplace"}
          {#await import("./WorkspaceMarketplace.svelte")}<div class="grid min-h-[50svh] place-items-center text-sm text-muted-foreground">Loading marketplace…</div>{:then module}<module.default />{:catch}<div class="p-10 text-center text-sm text-destructive">Marketplace module failed to load.</div>{/await}
        {:else}
          {#await import("./WorkspaceSettings.svelte")}<div class="grid min-h-[50svh] place-items-center text-sm text-muted-foreground">Loading settings…</div>{:then module}<module.default />{:catch}<div class="p-10 text-center text-sm text-destructive">Settings module failed to load.</div>{/await}
        {/if}
        <div class="mx-auto w-full max-w-[1120px] px-5 pb-10 sm:px-8"><ScopedExtensions {route} /></div>
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

  {#if agentOpen}
    <button class="fixed inset-0 z-40 bg-background/30 backdrop-blur-[2px]" aria-label="Close Agent" onclick={() => (agentOpen = false)}></button>
    <aside data-contextual-agent class="fixed bottom-3 right-3 top-[76px] z-50 flex w-[min(420px,calc(100vw-24px))] flex-col rounded-[18px] border border-divider bg-surface-overlay shadow-[var(--shadow-overlay)]">
      <div class="flex items-start justify-between border-b border-divider p-5"><div><div class="flex items-center gap-2 text-sm font-semibold"><Bot class="size-[18px] text-primary" />Agent</div><p class="mt-1 text-xs text-muted-foreground">{projectScoped && projectId ? `${projectId} · ${environmentId}` : displayedWorkspaceName}</p></div><button class="grid size-9 place-items-center rounded-[9px] hover:bg-muted" aria-label="Close Agent" onclick={() => (agentOpen = false)}><X class="size-4" /></button></div>
      <div class="flex-1 overflow-y-auto p-5"><div class="rounded-[14px] border border-divider bg-surface p-4"><p class="text-sm font-medium">{projectScoped ? "Project context is attached" : "Workspace context is attached"}</p><p class="mt-2 text-xs leading-relaxed text-muted-foreground">Prepare a task with the current scope, then continue in an Agent Workspace. Dashboard does not create a second Agent lifecycle.</p></div><div class="mt-4 grid gap-2">{#each projectScoped ? ["Summarize deployment health", "Find the noisiest Resource", "Explain the latest failure"] : ["Summarize Workspace health", "Find unavailable infrastructure", "Show recent failed work"] as prompt}<button class={`rounded-[11px] border px-4 py-3 text-left text-sm transition-colors ${agentPrompt === prompt ? "border-primary/40 bg-primary/10 text-foreground" : "border-divider bg-surface hover:border-ring/40 hover:bg-surface-subtle"}`} type="button" onclick={() => selectAgentPrompt(prompt)}>{prompt}</button>{/each}</div></div>
      <div class="border-t border-divider p-4"><label class="sr-only" for="dashboard-agent-prompt">Agent prompt</label><textarea id="dashboard-agent-prompt" class="min-h-24 w-full resize-none rounded-[10px] border border-input bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Ask about this scope…" bind:value={agentPrompt} oninput={() => (agentCopyState = "idle")}></textarea><div class="mt-3 flex flex-wrap items-center gap-2"><Button class="h-10 rounded-[10px]" disabled={!agentPrompt.trim()} onclick={copyAgentBrief}>{agentCopyState === "copied" ? "Copied" : "Copy task brief"}</Button></div>{#if agentCopyState === "failed"}<p class="mt-2 text-[11px] text-destructive">Clipboard access was blocked. Select the prompt and copy it manually.</p>{:else}<p class="mt-2 text-[11px] text-muted-foreground">The copied brief includes this destination, scope, environment, and URL. Paste it into the Agent Workspace or CLI.</p>{/if}</div>
    </aside>
  {/if}
</div>
