<script lang="ts">
  import { browser } from "$app/environment";
  import { ArrowRight, FolderOpen, Rocket, Server, ShieldCheck, Waypoints } from "@lucide/svelte";

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
  import { createConsoleQueries } from "$lib/console/queries";
  import {
    countProjectDeployments,
    countProjectEnvironments,
    deploymentBadgeVariant,
    findProject,
    formatTime,
  } from "$lib/console/utils";

  const {
    readinessQuery,
    versionQuery,
    projectsQuery,
    serversQuery,
    environmentsQuery,
    deploymentsQuery,
  } = createConsoleQueries(browser);

  const readiness = $derived(readinessQuery.data ?? null);
  const version = $derived(versionQuery.data ?? null);
  const projects = $derived(projectsQuery.data?.items ?? []);
  const servers = $derived(serversQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const deployments = $derived(deploymentsQuery.data?.items ?? []);
  const pageLoading = $derived(
    versionQuery.isPending ||
      projectsQuery.isPending ||
      serversQuery.isPending ||
      environmentsQuery.isPending ||
      deploymentsQuery.isPending,
  );
  const hasNoDeploymentBase = $derived(projects.length === 0 && deployments.length === 0);
  const hasProjectsWithoutDeployments = $derived(projects.length > 0 && deployments.length === 0);
  const latestDeployment = $derived(deployments[0] ?? null);
  const latestProject = $derived(latestDeployment ? findProject(projects, latestDeployment.projectId) : null);

  function requestQuickDeploy(): void {
    if (browser) {
      window.dispatchEvent(new CustomEvent("yundu:open-quick-deploy"));
    }
  }
</script>

<svelte:head>
  <title>Console · Yundu</title>
</svelte:head>

<ConsoleShell title="首页" description="控制面状态、最近动作和入口">
  {#if pageLoading}
    <div class="space-y-6">
      <div class="grid gap-4 md:grid-cols-4">
        {#each Array.from({ length: 4 }) as _, index (index)}
          <Card>
            <CardHeader class="space-y-3">
              <Skeleton class="h-4 w-20" />
              <Skeleton class="h-8 w-16" />
            </CardHeader>
          </Card>
        {/each}
      </div>
      <Card>
        <CardHeader>
          <Skeleton class="h-5 w-40" />
          <Skeleton class="h-4 w-64" />
        </CardHeader>
        <CardContent class="space-y-3">
          <Skeleton class="h-20 w-full" />
          <Skeleton class="h-20 w-full" />
        </CardContent>
      </Card>
    </div>
  {:else}
    <div class="space-y-6">
      {#if hasNoDeploymentBase}
        <section class="overflow-hidden rounded-lg border bg-background">
          <div class="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
            <div class="space-y-5 p-6 md:p-8">
              <Badge class="w-fit" variant="outline">需要第一个部署目标</Badge>
              <div class="max-w-2xl space-y-3">
                <h1 class="text-2xl font-semibold md:text-3xl">先把项目、服务器和环境串起来。</h1>
                <p class="text-sm leading-6 text-muted-foreground">
                  Yundu 会把一次发布拆成 detect、plan、execute、verify、rollback。第一个部署会同时建立项目关系、目标服务器和环境快照。
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <Button size="lg" onclick={requestQuickDeploy}>
                  <Rocket class="size-4" />
                  创建第一个部署
                </Button>
                <Button href="/projects" size="lg" variant="outline">
                  <FolderOpen class="size-4" />
                  先看项目
                </Button>
              </div>
            </div>
            <div class="border-t bg-muted/40 p-6 lg:border-l lg:border-t-0">
              <div class="grid gap-3">
                {#each ["选择 source", "创建项目", "注册服务器", "保存环境快照", "生成部署记录"] as step, index (step)}
                  <div class="flex items-center gap-3 rounded-md border bg-background px-4 py-3">
                    <span class="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-medium text-primary-foreground">
                      {index + 1}
                    </span>
                    <span class="text-sm font-medium">{step}</span>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        </section>
      {:else if hasProjectsWithoutDeployments}
        <section class="flex flex-col gap-4 rounded-lg border border-amber-300/70 bg-amber-50/70 p-5 md:flex-row md:items-center md:justify-between">
          <div class="space-y-2">
            <Badge class="w-fit border-amber-400 text-amber-900" variant="outline">项目还没有部署</Badge>
            <h1 class="text-xl font-semibold text-amber-950">已有项目，下一步是绑定 source、服务器和环境。</h1>
            <p class="text-sm text-amber-900">
              当前有 {projects.length} 个项目，但没有部署记录。创建一次部署后，项目页和部署页会互相串起关系。
            </p>
          </div>
          <Button class="bg-amber-950 text-white hover:bg-amber-900" onclick={requestQuickDeploy}>
            <Rocket class="size-4" />
            开始部署
          </Button>
        </section>
      {/if}

      <section class="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader class="pb-2">
            <CardDescription>项目</CardDescription>
            <CardTitle class="text-2xl">{projects.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button href="/projects" variant="ghost" class="px-0">
              查看项目
              <ArrowRight class="size-4" />
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2">
            <CardDescription>部署</CardDescription>
            <CardTitle class="text-2xl">{deployments.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button href="/deployments" variant="ghost" class="px-0">
              查看部署
              <ArrowRight class="size-4" />
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2">
            <CardDescription>服务器</CardDescription>
            <CardTitle class="text-2xl">{servers.length}</CardTitle>
          </CardHeader>
          <CardContent class="text-sm text-muted-foreground">
            {servers.length > 0 ? "可作为部署目标" : "部署时可直接创建"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2">
            <CardDescription>环境</CardDescription>
            <CardTitle class="text-2xl">{environments.length}</CardTitle>
          </CardHeader>
          <CardContent class="text-sm text-muted-foreground">
            {environments.length > 0 ? "已保存变量快照入口" : "部署时建立第一个环境"}
          </CardContent>
        </Card>
      </section>

      <section class="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>最近部署</CardTitle>
            <CardDescription>只保留最近一次动作；完整列表在部署页。</CardDescription>
          </CardHeader>
          <CardContent>
            {#if latestDeployment}
              <div class="space-y-4 rounded-md border p-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-medium">{latestDeployment.runtimePlan.source.displayName}</p>
                    <p class="mt-1 text-sm text-muted-foreground">
                      {latestProject?.name ?? latestDeployment.projectId} · {formatTime(latestDeployment.createdAt)}
                    </p>
                  </div>
                  <Badge variant={deploymentBadgeVariant(latestDeployment.status)}>
                    {latestDeployment.status}
                  </Badge>
                </div>
                <Button href="/deployments" variant="outline">
                  打开部署页
                  <ArrowRight class="size-4" />
                </Button>
              </div>
            {:else}
              <div class="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
                还没有部署记录。快速部署会创建项目关系、环境快照和部署记录。
              </div>
            {/if}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>项目关系</CardTitle>
            <CardDescription>首页只显示前三个项目；完整关系在项目页。</CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            {#if projects.length > 0}
              {#each projects.slice(0, 3) as project (project.id)}
                <a
                  href={`/projects?projectId=${project.id}`}
                  class="flex items-center justify-between gap-3 rounded-md border px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <span>
                    <span class="block text-sm font-medium">{project.name}</span>
                    <span class="block text-xs text-muted-foreground">{project.slug}</span>
                  </span>
                  <span class="flex flex-wrap justify-end gap-2 text-xs text-muted-foreground">
                    <span>{countProjectEnvironments(project, environments)} 环境</span>
                    <span>{countProjectDeployments(project, deployments)} 部署</span>
                  </span>
                </a>
              {/each}
            {:else}
              <div class="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
                创建第一个项目后，这里会出现项目与部署关系。
              </div>
            {/if}
          </CardContent>
        </Card>
      </section>

      <section class="grid gap-4 md:grid-cols-3">
        <div class="rounded-lg border bg-background p-4">
          <div class="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck class="size-4 text-muted-foreground" />
            Readiness
          </div>
          <p class="mt-3 text-sm text-muted-foreground">{readiness?.status ?? "unknown"}</p>
        </div>
        <div class="rounded-lg border bg-background p-4">
          <div class="flex items-center gap-2 text-sm font-medium">
            <Waypoints class="size-4 text-muted-foreground" />
            Mode
          </div>
          <p class="mt-3 text-sm text-muted-foreground">{version?.mode ?? "self-hosted"}</p>
        </div>
        <div class="rounded-lg border bg-background p-4">
          <div class="flex items-center gap-2 text-sm font-medium">
            <Server class="size-4 text-muted-foreground" />
            Database
          </div>
          <p class="mt-3 text-sm text-muted-foreground">
            {readiness?.details?.databaseDriver ?? "unknown"}
          </p>
        </div>
      </section>
    </div>
  {/if}
</ConsoleShell>
