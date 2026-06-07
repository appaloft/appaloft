<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { ArrowRight, FolderOpen, Plus, ShieldCheck } from "@lucide/svelte";
  import type { CreateProjectResponse } from "@appaloft/contracts";

  import ConsoleEmptyState from "$lib/components/console/ConsoleEmptyState.svelte";
  import ConsoleResourceCanvas from "$lib/components/console/ConsoleResourceCanvas.svelte";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import ProjectCreateForm from "$lib/components/console/ProjectCreateForm.svelte";
  import ResourceHealthDot from "$lib/components/console/ResourceHealthDot.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import { createConsoleQueries } from "$lib/console/queries";
  import { modalIsOpen, setModalOpen } from "$lib/console/url-modal";
  import {
    countProjectEnvironments,
    formatTime,
    latestProjectDeployment,
    projectDetailHref,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";

  const { projectsQuery, environmentsQuery, resourcesQuery, deploymentsQuery } =
    createConsoleQueries(browser);

  const projects = $derived(projectsQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const resources = $derived(resourcesQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const pageLoading = $derived(
    projectsQuery.isPending ||
      environmentsQuery.isPending ||
      resourcesQuery.isPending ||
      deploymentsQuery.isPending,
  );
  let projectCreateDialogOpen = $state(false);

  $effect(() => {
    projectCreateDialogOpen = modalIsOpen(page, "create-project");
  });

  function openProjectCreateDialog(): void {
    void setModalOpen(page, "create-project", true);
  }

  function setProjectCreateDialogOpen(open: boolean): void {
    projectCreateDialogOpen = open;
    void setModalOpen(page, "create-project", open);
  }

  function openCreatedProject(project: CreateProjectResponse): void {
    void goto(projectDetailHref(project.id));
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.projects.pageTitle)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={$t(i18nKeys.console.projects.pageTitle)}
  description={$t(i18nKeys.console.projects.description)}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.home), href: "/" },
    { label: $t(i18nKeys.console.projects.pageTitle) },
  ]}
>
  {#if pageLoading}
    <div class="space-y-5">
      <section class="space-y-3">
        <Skeleton class="h-5 w-36" />
        <Skeleton class="h-4 w-72" />
      </section>
      <div class="space-y-3">
        {#each Array.from({ length: 5 }) as _, index (index)}
          <Skeleton class="h-12 w-full" />
        {/each}
      </div>
    </div>
  {:else}
    <ConsoleResourceCanvas>
      <section class="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div class="max-w-2xl space-y-2">
          <div class="flex items-center gap-2">
            <h1 class="text-2xl font-semibold">{$t(i18nKeys.console.projects.focusTitle)}</h1>
            <DocsHelpLink
              href={webDocsHrefs.projectLifecycle}
              ariaLabel={$t(i18nKeys.common.actions.openDocs)}
            />
          </div>
          <p class="text-sm leading-6 text-muted-foreground">
            {$t(i18nKeys.console.projects.focusDescription)}
          </p>
        </div>
        {#if projects.length > 0}
          <Button class="shrink-0 self-start" type="button" onclick={openProjectCreateDialog}>
            <Plus class="size-4" />
            {$t(i18nKeys.console.projects.createProjectAction)}
          </Button>
        {/if}
      </section>

      <section class="space-y-3">
        {#if projects.length > 0}
          <div>
            <h2 class="text-lg font-semibold">{$t(i18nKeys.console.projects.projectListTitle)}</h2>
            <p class="mt-1 text-sm text-muted-foreground">
              {$t(i18nKeys.console.projects.projectListDescription)}
            </p>
          </div>

          <div class="console-record-list">
            {#each projects as project (project.id)}
              {@const projectResources = resources.filter((resource) => resource.projectId === project.id)}
              {@const latestDeployment = latestProjectDeployment(project, deployments)}
              {@const latestResource =
                projectResources.find((resource) => resource.lastDeploymentId === latestDeployment?.id) ??
                projectResources[0]}
              <a
                href={projectDetailHref(project.id)}
                class="console-record-row group lg:grid-cols-[minmax(0,1fr)_36rem_auto] lg:items-center"
              >
                <div class="min-w-0 space-y-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="truncate text-base font-semibold">{project.name}</h3>
                    <Badge variant="outline">{project.slug}</Badge>
                  </div>
                  <p class="line-clamp-2 text-sm leading-6 text-muted-foreground">
                    {project.description ?? $t(i18nKeys.console.projects.noDescription)}
                  </p>
                </div>

                <div class="grid gap-1 text-sm text-muted-foreground sm:grid-cols-3">
                  <span class="inline-flex items-center gap-2">
                    <ShieldCheck class="size-3.5" />
                    {countProjectEnvironments(project, environments)}
                    {$t(i18nKeys.common.domain.environments)}
                  </span>
                  <span class="inline-flex items-center gap-2">
                    <FolderOpen class="size-3.5" />
                    {projectResources.length} {$t(i18nKeys.common.domain.resources)}
                  </span>
                  <span class="flex min-w-0 items-center gap-2">
                    {#if latestResource}
                      <ResourceHealthDot resourceId={latestResource.id} class="shrink-0" />
                      <span class="truncate">
                        {latestResource.name}
                        {#if latestDeployment}
                          · {formatTime(latestDeployment.createdAt)}
                        {/if}
                      </span>
                    {:else}
                      {$t(i18nKeys.console.projects.noResourcesShort)}
                    {/if}
                  </span>
                </div>

                <span
                  class="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground"
                >
                  {$t(i18nKeys.common.actions.viewDetails)}
                  <ArrowRight class="size-4" />
                </span>
              </a>
            {/each}
          </div>
        {:else}
          <ConsoleEmptyState
            tone="project"
            title={$t(i18nKeys.console.projects.emptyTitle)}
            description={$t(i18nKeys.console.projects.emptyBody)}
            actionLabel={$t(i18nKeys.console.projects.createProjectAction)}
            learnMoreHref={webDocsHrefs.projectLifecycle}
            onAction={openProjectCreateDialog}
          />
        {/if}
      </section>
    </ConsoleResourceCanvas>
  {/if}

  <Dialog.Root
    bind:open={projectCreateDialogOpen}
    onOpenChange={setProjectCreateDialogOpen}
  >
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
      <Dialog.Header>
        <Dialog.Title>{$t(i18nKeys.console.projects.createProjectTitle)}</Dialog.Title>
        <Dialog.Description>
          {$t(i18nKeys.console.projects.createProjectDescription)}
        </Dialog.Description>
      </Dialog.Header>
      <div class="px-5 pb-5">
        <ProjectCreateForm
          panel={false}
          showIntro={false}
          idPrefix="projects-page-create"
          onCreated={openCreatedProject}
        />
      </div>
    </Dialog.Content>
  </Dialog.Root>
</ConsoleShell>
