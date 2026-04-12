<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { ArrowRight, FolderOpen, Rocket, Settings2 } from "@lucide/svelte";

  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "$lib/components/ui/table";
  import { createConsoleQueries } from "$lib/console/queries";
  import {
    countProjectDeployments,
    countProjectEnvironments,
    deploymentBadgeVariant,
    formatTime,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";

  const { projectsQuery, environmentsQuery, deploymentsQuery } = createConsoleQueries(browser);

  const projects = $derived(projectsQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const pageLoading = $derived(
    projectsQuery.isPending || environmentsQuery.isPending || deploymentsQuery.isPending,
  );
	const requestedProjectId = $derived(browser ? (page.url.searchParams.get("projectId") ?? "") : "");
  const selectedProject = $derived(
    projects.find((project) => project.id === requestedProjectId) ?? projects[0] ?? null,
  );
  const selectedProjectEnvironments = $derived(
    selectedProject
      ? environments.filter((environment) => environment.projectId === selectedProject.id)
      : [],
  );
  const selectedProjectDeployments = $derived(
    selectedProject
      ? deployments.filter((deployment) => deployment.projectId === selectedProject.id)
      : [],
  );

  function requestQuickDeploy(): void {
    if (browser) {
      window.dispatchEvent(new CustomEvent("yundu:open-quick-deploy"));
    }
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.projects.pageTitle)} · Yundu</title>
</svelte:head>

<ConsoleShell title={$t(i18nKeys.console.projects.pageTitle)} description={$t(i18nKeys.console.projects.description)}>
  {#if pageLoading}
    <div class="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <CardHeader>
          <Skeleton class="h-5 w-28" />
          <Skeleton class="h-4 w-56" />
        </CardHeader>
        <CardContent class="space-y-3">
          {#each Array.from({ length: 5 }) as _, index (index)}
            <Skeleton class="h-12 w-full" />
          {/each}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton class="h-5 w-32" />
          <Skeleton class="h-4 w-64" />
        </CardHeader>
        <CardContent class="space-y-3">
          <Skeleton class="h-24 w-full" />
          <Skeleton class="h-24 w-full" />
        </CardContent>
      </Card>
    </div>
  {:else if projects.length === 0}
    <section class="rounded-lg border bg-background p-6 md:p-8">
      <Badge class="w-fit" variant="outline">{$t(i18nKeys.console.shell.noProjects)}</Badge>
      <div class="mt-4 max-w-2xl space-y-3">
        <h1 class="text-2xl font-semibold md:text-3xl">{$t(i18nKeys.console.projects.emptyTitle)}</h1>
        <p class="text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.projects.emptyBody)}
        </p>
      </div>
      <div class="mt-6 flex flex-wrap gap-2">
        <Button size="lg" onclick={requestQuickDeploy}>
          <Rocket class="size-4" />
          {$t(i18nKeys.common.actions.createAndDeploy)}
        </Button>
        <Button href="/deployments" size="lg" variant="outline">
          {$t(i18nKeys.common.actions.openDeployments)}
        </Button>
      </div>
    </section>
  {:else}
    <div class="space-y-6">
      <section class="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader class="pb-2">
            <CardDescription>{$t(i18nKeys.common.domain.projects)}</CardDescription>
            <CardTitle class="text-2xl">{projects.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader class="pb-2">
            <CardDescription>{$t(i18nKeys.common.domain.environments)}</CardDescription>
            <CardTitle class="text-2xl">{environments.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader class="pb-2">
            <CardDescription>{$t(i18nKeys.common.domain.deployments)}</CardDescription>
            <CardTitle class="text-2xl">{deployments.length}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <section class="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>{$t(i18nKeys.console.projects.projectListTitle)}</CardTitle>
              <CardDescription>{$t(i18nKeys.console.projects.projectListDescription)}</CardDescription>
            </div>
            <Button onclick={requestQuickDeploy}>
              <Rocket class="size-4" />
              {$t(i18nKeys.common.actions.newDeployment)}
            </Button>
          </CardHeader>
          <CardContent class="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{$t(i18nKeys.common.domain.project)}</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>{$t(i18nKeys.common.domain.environments)}</TableHead>
                  <TableHead>{$t(i18nKeys.common.domain.deployments)}</TableHead>
                  <TableHead>{$t(i18nKeys.common.domain.time)}</TableHead>
                  <TableHead class="w-[96px]">{$t(i18nKeys.console.nav.settings)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {#each projects as project (project.id)}
                  <TableRow data-state={selectedProject?.id === project.id ? "selected" : undefined}>
                    <TableCell class="font-medium">{project.name}</TableCell>
                    <TableCell>{project.slug}</TableCell>
                    <TableCell>{countProjectEnvironments(project, environments)}</TableCell>
                    <TableCell>{countProjectDeployments(project, deployments)}</TableCell>
                    <TableCell>{formatTime(project.createdAt)}</TableCell>
                    <TableCell>
                      <Button
                        href={`/projects?projectId=${project.id}`}
                        size="sm"
                        variant={selectedProject?.id === project.id ? "default" : "ghost"}
                      >
                        {$t(i18nKeys.console.nav.settings)}
                      </Button>
                    </TableCell>
                  </TableRow>
                {/each}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{selectedProject?.name ?? $t(i18nKeys.console.projects.noProjectSelected)}</CardTitle>
            <CardDescription>
              {selectedProject?.description ?? $t(i18nKeys.console.projects.noProjectSelectedDescription)}
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-5">
            {#if selectedProject}
              <div class="grid grid-cols-2 gap-3">
                <div class="rounded-md border bg-muted/30 p-4">
                  <div class="flex items-center gap-2 text-sm font-medium">
                    <Settings2 class="size-4 text-muted-foreground" />
                    {$t(i18nKeys.common.domain.environments)}
                  </div>
                  <p class="mt-3 text-2xl font-semibold">{selectedProjectEnvironments.length}</p>
                </div>
                <div class="rounded-md border bg-muted/30 p-4">
                  <div class="flex items-center gap-2 text-sm font-medium">
                    <Rocket class="size-4 text-muted-foreground" />
                    {$t(i18nKeys.common.domain.deployments)}
                  </div>
                  <p class="mt-3 text-2xl font-semibold">{selectedProjectDeployments.length}</p>
                </div>
              </div>

              <div class="space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <h2 class="text-sm font-medium">{$t(i18nKeys.common.domain.environments)}</h2>
                  <Badge variant="outline">{selectedProjectEnvironments.length}</Badge>
                </div>
                {#if selectedProjectEnvironments.length > 0}
                  {#each selectedProjectEnvironments as environment (environment.id)}
                    <div class="rounded-md border px-4 py-3">
                      <p class="text-sm font-medium">{environment.name}</p>
                      <p class="mt-1 text-xs text-muted-foreground">
                        {environment.kind} · {$t(i18nKeys.console.projects.environmentCount, { count: environment.maskedVariables.length })}
                      </p>
                    </div>
                  {/each}
                {:else}
                  <div class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    {$t(i18nKeys.console.projects.noEnvironment)}
                  </div>
                {/if}
              </div>

              <div class="space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <h2 class="text-sm font-medium">{$t(i18nKeys.console.home.latestDeploymentTitle)}</h2>
                  <Button href={`/deployments?projectId=${selectedProject.id}`} size="sm" variant="outline">
                    {$t(i18nKeys.common.actions.viewAll)}
                    <ArrowRight class="size-4" />
                  </Button>
                </div>
                {#if selectedProjectDeployments.length > 0}
                  {#each selectedProjectDeployments.slice(0, 4) as deployment (deployment.id)}
                    <a
                      href={`/deployments?projectId=${selectedProject.id}`}
                      class="flex items-center justify-between gap-3 rounded-md border px-4 py-3 transition-colors hover:bg-muted/50"
                    >
                      <span>
                        <span class="block text-sm font-medium">
                          {deployment.runtimePlan.source.displayName}
                        </span>
                        <span class="block text-xs text-muted-foreground">
                          {formatTime(deployment.createdAt)}
                        </span>
                      </span>
                      <Badge variant={deploymentBadgeVariant(deployment.status)}>
                        {deployment.status}
                      </Badge>
                    </a>
                  {/each}
                {:else}
                  <div class="rounded-md border border-dashed p-4">
                    <div class="flex items-start gap-3">
                      <FolderOpen class="mt-0.5 size-4 text-muted-foreground" />
                      <div class="space-y-2">
                        <p class="text-sm font-medium">{$t(i18nKeys.console.projects.noProjectDeploymentTitle)}</p>
                        <p class="text-sm text-muted-foreground">
                          {$t(i18nKeys.console.projects.noProjectDeploymentBody)}
                        </p>
                        <Button size="sm" onclick={requestQuickDeploy}>
                          <Rocket class="size-4" />
                          {$t(i18nKeys.common.actions.createDeployment)}
                        </Button>
                      </div>
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
          </CardContent>
        </Card>
      </section>
    </div>
  {/if}
</ConsoleShell>
