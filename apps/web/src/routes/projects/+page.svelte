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
  <title>Projects · Yundu</title>
</svelte:head>

<ConsoleShell title="项目" description="项目、环境和部署关系">
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
      <Badge class="w-fit" variant="outline">暂无项目</Badge>
      <div class="mt-4 max-w-2xl space-y-3">
        <h1 class="text-2xl font-semibold md:text-3xl">先创建一个项目，再让部署记录挂到它下面。</h1>
        <p class="text-sm leading-6 text-muted-foreground">
          快速部署会把 source、项目、服务器和环境一次性串起来。之后部署页按项目展示每一次发布结果。
        </p>
      </div>
      <div class="mt-6 flex flex-wrap gap-2">
        <Button size="lg" onclick={requestQuickDeploy}>
          <Rocket class="size-4" />
          创建项目并部署
        </Button>
        <Button href="/deployments" size="lg" variant="outline">
          打开部署页
        </Button>
      </div>
    </section>
  {:else}
    <div class="space-y-6">
      <section class="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader class="pb-2">
            <CardDescription>项目</CardDescription>
            <CardTitle class="text-2xl">{projects.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader class="pb-2">
            <CardDescription>环境</CardDescription>
            <CardTitle class="text-2xl">{environments.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader class="pb-2">
            <CardDescription>部署</CardDescription>
            <CardTitle class="text-2xl">{deployments.length}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <section class="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>项目列表</CardTitle>
              <CardDescription>项目是部署记录、环境变量和目标关系的归属点。</CardDescription>
            </div>
            <Button onclick={requestQuickDeploy}>
              <Rocket class="size-4" />
              新部署
            </Button>
          </CardHeader>
          <CardContent class="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>项目</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>环境</TableHead>
                  <TableHead>部署</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead class="w-[96px]">操作</TableHead>
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
                        管理
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
            <CardTitle>{selectedProject?.name ?? "未选择项目"}</CardTitle>
            <CardDescription>
              {selectedProject?.description ?? "环境和部署记录会按项目聚合。"}
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-5">
            {#if selectedProject}
              <div class="grid grid-cols-2 gap-3">
                <div class="rounded-md border bg-muted/30 p-4">
                  <div class="flex items-center gap-2 text-sm font-medium">
                    <Settings2 class="size-4 text-muted-foreground" />
                    环境
                  </div>
                  <p class="mt-3 text-2xl font-semibold">{selectedProjectEnvironments.length}</p>
                </div>
                <div class="rounded-md border bg-muted/30 p-4">
                  <div class="flex items-center gap-2 text-sm font-medium">
                    <Rocket class="size-4 text-muted-foreground" />
                    部署
                  </div>
                  <p class="mt-3 text-2xl font-semibold">{selectedProjectDeployments.length}</p>
                </div>
              </div>

              <div class="space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <h2 class="text-sm font-medium">环境</h2>
                  <Badge variant="outline">{selectedProjectEnvironments.length}</Badge>
                </div>
                {#if selectedProjectEnvironments.length > 0}
                  {#each selectedProjectEnvironments as environment (environment.id)}
                    <div class="rounded-md border px-4 py-3">
                      <p class="text-sm font-medium">{environment.name}</p>
                      <p class="mt-1 text-xs text-muted-foreground">
                        {environment.kind} · {environment.maskedVariables.length} 个变量
                      </p>
                    </div>
                  {/each}
                {:else}
                  <div class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    这个项目还没有环境。创建部署时可以一并建立 production 环境。
                  </div>
                {/if}
              </div>

              <div class="space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <h2 class="text-sm font-medium">最近部署</h2>
                  <Button href={`/deployments?projectId=${selectedProject.id}`} size="sm" variant="outline">
                    查看全部
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
                        <p class="text-sm font-medium">这个项目还没有部署。</p>
                        <p class="text-sm text-muted-foreground">
                          先发起一次部署，之后每次运行、回滚和环境快照都会挂到这里。
                        </p>
                        <Button size="sm" onclick={requestQuickDeploy}>
                          <Rocket class="size-4" />
                          部署这个项目
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
