<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { ArrowRight, FolderOpen, Rocket, Server, ShieldCheck } from "@lucide/svelte";

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
    deploymentBadgeVariant,
    findEnvironment,
    findProject,
    formatTime,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";

  const { projectsQuery, serversQuery, environmentsQuery, deploymentsQuery } = createConsoleQueries(browser);

  const projects = $derived(projectsQuery.data?.items ?? []);
  const servers = $derived(serversQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const pageLoading = $derived(
    projectsQuery.isPending ||
      serversQuery.isPending ||
      environmentsQuery.isPending ||
      deploymentsQuery.isPending,
  );
	const requestedProjectId = $derived(browser ? (page.url.searchParams.get("projectId") ?? "") : "");
  const selectedProject = $derived(
    requestedProjectId ? findProject(projects, requestedProjectId) : null,
  );
  const visibleDeployments = $derived(
    selectedProject
      ? deployments.filter((deployment) => deployment.projectId === selectedProject.id)
      : deployments,
  );
  const latestDeployment = $derived(visibleDeployments[0] ?? null);
  const latestProject = $derived(latestDeployment ? findProject(projects, latestDeployment.projectId) : null);
  const latestEnvironment = $derived(
    latestDeployment ? findEnvironment(environments, latestDeployment.environmentId) : null,
  );
  const latestServer = $derived(
    latestDeployment ? servers.find((server) => server.id === latestDeployment.serverId) ?? null : null,
  );

  function requestQuickDeploy(): void {
    if (browser) {
      window.dispatchEvent(new CustomEvent("yundu:open-quick-deploy"));
    }
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.deployments.pageTitle)} · Yundu</title>
</svelte:head>

<ConsoleShell
  title={$t(i18nKeys.console.deployments.pageTitle)}
  description={selectedProject ? $t(i18nKeys.console.deployments.pageDescriptionForProject, { projectName: selectedProject.name }) : $t(i18nKeys.console.deployments.pageDescription)}
>
  {#if pageLoading}
    <div class="space-y-6">
      <div class="grid gap-4 md:grid-cols-3">
        {#each Array.from({ length: 3 }) as _, index (index)}
          <Card>
            <CardHeader class="space-y-3">
              <Skeleton class="h-4 w-24" />
              <Skeleton class="h-8 w-16" />
            </CardHeader>
          </Card>
        {/each}
      </div>
      <Card>
        <CardHeader>
          <Skeleton class="h-5 w-36" />
          <Skeleton class="h-4 w-64" />
        </CardHeader>
        <CardContent class="space-y-3">
          {#each Array.from({ length: 6 }) as _, index (index)}
            <Skeleton class="h-12 w-full" />
          {/each}
        </CardContent>
      </Card>
    </div>
  {:else if deployments.length === 0}
    <section class="rounded-lg border bg-background p-6 md:p-8">
      <Badge class="w-fit" variant="outline">{$t(i18nKeys.console.deployments.noFilteredDeployments)}</Badge>
      <div class="mt-4 max-w-2xl space-y-3">
        <h1 class="text-2xl font-semibold md:text-3xl">{$t(i18nKeys.console.deployments.emptyTitle)}</h1>
        <p class="text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.deployments.emptyBody)}
        </p>
      </div>
      <div class="mt-6 flex flex-wrap gap-2">
        <Button size="lg" onclick={requestQuickDeploy}>
          <Rocket class="size-4" />
          {$t(i18nKeys.common.actions.createDeployment)}
        </Button>
        <Button href="/projects" size="lg" variant="outline">
          <FolderOpen class="size-4" />
          {$t(i18nKeys.common.actions.viewProjects)}
        </Button>
      </div>
    </section>
  {:else}
    <div class="space-y-6">
      <section class="flex flex-col gap-4 rounded-lg border bg-background p-5 md:flex-row md:items-center md:justify-between">
        <div class="space-y-2">
          <Badge class="w-fit" variant="outline">
            {selectedProject ? selectedProject.name : $t(i18nKeys.console.deployments.allProjects)}
          </Badge>
          <h1 class="text-2xl font-semibold">{$t(i18nKeys.console.deployments.records)}</h1>
          <p class="text-sm text-muted-foreground">
            {$t(i18nKeys.console.deployments.description)}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          {#if selectedProject}
            <Button href="/deployments" variant="outline">{$t(i18nKeys.common.actions.viewAll)}</Button>
          {/if}
          <Button onclick={requestQuickDeploy}>
            <Rocket class="size-4" />
            {$t(i18nKeys.common.actions.newDeployment)}
          </Button>
        </div>
      </section>

      <section class="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader class="pb-2">
            <CardDescription>{$t(i18nKeys.common.domain.currentList)}</CardDescription>
            <CardTitle class="text-2xl">{visibleDeployments.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader class="pb-2">
            <CardDescription>{$t(i18nKeys.common.domain.projects)}</CardDescription>
            <CardTitle class="text-2xl">{projects.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader class="pb-2">
            <CardDescription>{$t(i18nKeys.common.domain.servers)}</CardDescription>
            <CardTitle class="text-2xl">{servers.length}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <section class="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>{$t(i18nKeys.console.deployments.listTitle)}</CardTitle>
            <CardDescription>{$t(i18nKeys.console.deployments.listDescription)}</CardDescription>
          </CardHeader>
          <CardContent class="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{$t(i18nKeys.common.domain.source)}</TableHead>
                  <TableHead>{$t(i18nKeys.common.domain.project)}</TableHead>
                  <TableHead>{$t(i18nKeys.common.domain.environment)}</TableHead>
                  <TableHead>{$t(i18nKeys.common.domain.server)}</TableHead>
                  <TableHead>{$t(i18nKeys.common.domain.status)}</TableHead>
                  <TableHead>{$t(i18nKeys.common.domain.time)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {#if visibleDeployments.length > 0}
                  {#each visibleDeployments as deployment (deployment.id)}
                    {@const project = findProject(projects, deployment.projectId)}
                    {@const environment = findEnvironment(environments, deployment.environmentId)}
                    {@const server = servers.find((item) => item.id === deployment.serverId) ?? null}
                    <TableRow>
                      <TableCell class="font-medium">{deployment.runtimePlan.source.displayName}</TableCell>
                      <TableCell>
                        {#if project}
                          <a class="underline-offset-4 hover:underline" href={`/projects?projectId=${project.id}`}>
                            {project.name}
                          </a>
                        {:else}
                          {deployment.projectId}
                        {/if}
                      </TableCell>
                      <TableCell>{environment?.name ?? deployment.environmentId}</TableCell>
                      <TableCell>{server?.name ?? deployment.serverId}</TableCell>
                      <TableCell>
                        <Badge variant={deploymentBadgeVariant(deployment.status)}>
                          {deployment.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatTime(deployment.createdAt)}</TableCell>
                    </TableRow>
                  {/each}
                {:else}
                  <TableRow>
                    <TableCell colspan={6} class="text-center text-muted-foreground">
                      {$t(i18nKeys.console.deployments.noFilteredDeployments)}
                    </TableCell>
                  </TableRow>
                {/if}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{$t(i18nKeys.console.deployments.latestTitle)}</CardTitle>
            <CardDescription>{$t(i18nKeys.console.deployments.latestDescription)}</CardDescription>
          </CardHeader>
          <CardContent>
            {#if latestDeployment}
              <div class="space-y-4">
                <div class="rounded-md border p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="text-sm font-medium">{latestDeployment.runtimePlan.source.displayName}</p>
                      <p class="mt-1 text-xs text-muted-foreground">
                        {latestDeployment.runtimePlan.source.locator}
                      </p>
                    </div>
                    <Badge variant={deploymentBadgeVariant(latestDeployment.status)}>
                      {latestDeployment.status}
                    </Badge>
                  </div>
                </div>

                <div class="space-y-3 text-sm">
                  <div class="flex items-center justify-between gap-3 rounded-md border px-4 py-3">
                    <span class="flex items-center gap-2 text-muted-foreground">
                      <FolderOpen class="size-4" />
                      {$t(i18nKeys.common.domain.project)}
                    </span>
                    <span class="font-medium">{latestProject?.name ?? latestDeployment.projectId}</span>
                  </div>
                  <div class="flex items-center justify-between gap-3 rounded-md border px-4 py-3">
                    <span class="flex items-center gap-2 text-muted-foreground">
                      <ShieldCheck class="size-4" />
                      {$t(i18nKeys.common.domain.environment)}
                    </span>
                    <span class="font-medium">{latestEnvironment?.name ?? latestDeployment.environmentId}</span>
                  </div>
                  <div class="flex items-center justify-between gap-3 rounded-md border px-4 py-3">
                    <span class="flex items-center gap-2 text-muted-foreground">
                      <Server class="size-4" />
                      {$t(i18nKeys.common.domain.server)}
                    </span>
                    <span class="font-medium">{latestServer?.name ?? latestDeployment.serverId}</span>
                  </div>
                </div>

                {#if latestProject}
                  <Button href={`/projects?projectId=${latestProject.id}`} variant="outline">
                    {$t(i18nKeys.common.actions.openProject)}
                    <ArrowRight class="size-4" />
                  </Button>
                {/if}
              </div>
            {:else}
              <div class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                {$t(i18nKeys.console.deployments.noFilteredDeployments)}
              </div>
            {/if}
          </CardContent>
        </Card>
      </section>
    </div>
  {/if}
</ConsoleShell>
