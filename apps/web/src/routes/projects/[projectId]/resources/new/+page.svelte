<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { createMutation } from "@tanstack/svelte-query";
  import {
    ArrowLeft,
    Boxes,
    FolderOpen,
    GitFork,
    Package,
    Play,
    Server,
    Settings2,
    Waypoints,
  } from "@lucide/svelte";
  import type {
    CreateDeploymentInput,
    CreateResourceInput,
    DeploymentProgressEvent,
    ResourceSummary,
  } from "@appaloft/contracts";
  import type { Component } from "svelte";

  import { readErrorMessage } from "$lib/api/client";
  import ConsoleShell from "$lib/components/console/ConsoleShell.svelte";
  import DeploymentProgressDialog from "$lib/components/console/DeploymentProgressDialog.svelte";
  import DockerIcon from "$lib/components/console/DockerIcon.svelte";
  import GitHubIcon from "$lib/components/console/GitHubIcon.svelte";
  import ResourceSourceOption from "$lib/components/console/ResourceSourceOption.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { Textarea } from "$lib/components/ui/textarea";
  import {
    createDeploymentWithProgress,
    type DeploymentProgressDialogStatus,
  } from "$lib/console/deployment-progress";
  import { createConsoleQueries } from "$lib/console/queries";
  import {
    deploymentDetailHref,
    findProject,
    findServer,
    projectDetailHref,
  } from "$lib/console/utils";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  const resourceKinds = [
    "application",
    "service",
    "worker",
    "static-site",
    "compose-stack",
    "database",
    "cache",
    "external",
  ] as const satisfies readonly ResourceSummary["kind"][];
  const sourceKinds = ["local-folder", "github", "remote-git", "docker-image", "compose"] as const;
  type SourceOptionIcon = Component<{ class?: string }>;
  const sourceKindIcons = {
    "local-folder": FolderOpen,
    github: GitHubIcon,
    "remote-git": GitFork,
    "docker-image": DockerIcon,
    compose: Waypoints,
  } as const satisfies Record<ResourceCreateSourceKind, SourceOptionIcon>;

  type ResourceCreateSourceKind = (typeof sourceKinds)[number];
  type ResourceSourceInput = NonNullable<CreateResourceInput["source"]>;
  type ResourceRuntimeProfileInput = NonNullable<CreateResourceInput["runtimeProfile"]>;
  type ResourceHealthCheckInput = NonNullable<ResourceRuntimeProfileInput["healthCheck"]>;
  type ResourceNetworkProfileInput = NonNullable<CreateResourceInput["networkProfile"]>;
  type AppaloftDesktopBridge = {
    selectDirectory?: () => Promise<string | null | undefined>;
  };
  type WindowWithAppaloftDesktopBridge = Window &
    typeof globalThis & {
      appaloftDesktop?: AppaloftDesktopBridge;
    };

  const { projectsQuery, environmentsQuery, serversQuery } = createConsoleQueries(browser);

  const projectId = $derived(page.params.projectId ?? "");
  const projects = $derived(projectsQuery.data?.items ?? []);
  const environments = $derived(environmentsQuery.data?.items ?? []);
  const servers = $derived(serversQuery.data?.items ?? []);
  const pageLoading = $derived(
    projectsQuery.isPending || environmentsQuery.isPending || serversQuery.isPending,
  );
  const project = $derived(findProject(projects, projectId));
  const projectEnvironments = $derived(
    project ? environments.filter((environment) => environment.projectId === project.id) : [],
  );

  let environmentId = $state("");
  let serverId = $state("");
  let destinationId = $state("");
  let name = $state("");
  let description = $state("");
  let kind = $state<ResourceSummary["kind"]>("application");
  let sourceKind = $state<ResourceCreateSourceKind>("local-folder");
  let localFolderLocator = $state(".");
  let githubLocator = $state("");
  let remoteGitLocator = $state("");
  let dockerImageLocator = $state("");
  let composeLocator = $state("");
  let localFolderSelectionNotice = $state<string | null>(null);
  let resourceInternalPort = $state("3000");
  let resourceHealthCheckEnabled = $state(false);
  let resourceHealthCheckMethod = $state<"GET" | "HEAD" | "POST" | "OPTIONS">("GET");
  let resourceHealthCheckScheme = $state<"http" | "https">("http");
  let resourceHealthCheckHost = $state("localhost");
  let resourceHealthCheckPort = $state("");
  let resourceHealthCheckPath = $state("/");
  let resourceHealthCheckExpectedStatusCode = $state("200");
  let resourceHealthCheckResponseText = $state("");
  let resourceHealthCheckIntervalSeconds = $state("5");
  let resourceHealthCheckTimeoutSeconds = $state("5");
  let resourceHealthCheckRetries = $state("10");
  let resourceHealthCheckStartPeriodSeconds = $state("5");
  let deploymentCreatePending = $state(false);
  let deploymentProgressDialogOpen = $state(false);
  let deploymentProgressDialogStatus = $state<DeploymentProgressDialogStatus>("idle");
  let deploymentProgressEvents = $state<DeploymentProgressEvent[]>([]);
  let deploymentProgressStreamError = $state("");
  let deploymentProgressDeploymentId = $state("");
  let deploymentProgressResourceId = $state("");
  let deploymentProgressRequestId = $state("");
  let feedback = $state<{
    kind: "success" | "error";
    title: string;
    detail: string;
  } | null>(null);

  const selectedEnvironment = $derived(
    projectEnvironments.find((environment) => environment.id === environmentId) ?? null,
  );
  const selectedServer = $derived(findServer(servers, serverId));
  const sourceKindLabel = $derived(sourceKindLabelFor(sourceKind));
  const sourceLocator = $derived(sourceLocatorFor(sourceKind));
  const sourceLocatorLabel = $derived(sourceLocatorLabelFor(sourceKind));
  const sourceLocatorPlaceholder = $derived(sourceLocatorPlaceholderFor(sourceKind));
  const sourceLocatorHelp = $derived(sourceLocatorHelpFor(sourceKind));
  const resourceHealthCheckSummary = $derived(
    resourceHealthCheckEnabled
      ? `${resourceHealthCheckMethod} ${resourceHealthCheckPath.trim() || "/"} · ${resourceHealthCheckIntervalSeconds.trim() || "5"}s/${resourceHealthCheckTimeoutSeconds.trim() || "5"}s · ${resourceHealthCheckRetries.trim() || "10"}x`
      : $t(i18nKeys.common.status.notConfigured),
  );
  const canChooseNativeLocalFolder = $derived(
    browser &&
      typeof (window as WindowWithAppaloftDesktopBridge).appaloftDesktop?.selectDirectory === "function",
  );
  const canDeploy = $derived(
    Boolean(project?.id && environmentId && serverId && name.trim() && sourceLocator.trim()),
  );

  const createResourceMutation = createMutation(() => ({
    mutationFn: (input: CreateResourceInput) => orpcClient.resources.create(input),
  }));

  $effect(() => {
    if (!browser) {
      return;
    }

    if (!projectEnvironments.some((environment) => environment.id === environmentId)) {
      environmentId = projectEnvironments[0]?.id ?? "";
    }
  });

  $effect(() => {
    if (!browser) {
      return;
    }

    if (!servers.some((server) => server.id === serverId)) {
      serverId = servers[0]?.id ?? "";
    }
  });

  function appendDeploymentProgressEvent(event: DeploymentProgressEvent): void {
    deploymentProgressEvents = [...deploymentProgressEvents, event];
    deploymentProgressDeploymentId = event.deploymentId ?? deploymentProgressDeploymentId;

    if (event.status === "failed") {
      deploymentProgressDialogStatus = "failed";
    } else if (event.status === "succeeded") {
      deploymentProgressDialogStatus = "succeeded";
    } else {
      deploymentProgressDialogStatus = "running";
    }
  }

  async function refreshWorkspaceData(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["resources"] }),
      queryClient.invalidateQueries({ queryKey: ["deployments"] }),
    ]);
  }

  async function deployResource(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if (!project || !canDeploy || createResourceMutation.isPending || deploymentCreatePending) {
      return;
    }

    feedback = null;
    deploymentCreatePending = true;
    deploymentProgressDialogOpen = false;
    deploymentProgressDialogStatus = "idle";
    deploymentProgressEvents = [];
    deploymentProgressStreamError = "";
    deploymentProgressDeploymentId = "";
    deploymentProgressResourceId = "";
    deploymentProgressRequestId = "";

    let createdResourceId = "";

    try {
      const trimmedDestinationId = destinationId.trim();
      const createdResource = await createResourceMutation.mutateAsync({
        projectId: project.id,
        environmentId,
        ...(trimmedDestinationId ? { destinationId: trimmedDestinationId } : {}),
        name: name.trim(),
        kind,
        ...(description.trim() ? { description: description.trim() } : {}),
        source: resourceSourceForForm(),
        runtimeProfile: runtimeProfileForSource(),
        networkProfile: networkProfileForSource(),
      });

      createdResourceId = createdResource.id;
      deploymentProgressResourceId = createdResource.id;
      deploymentProgressDialogOpen = true;
      deploymentProgressDialogStatus = "running";

      const deploymentInput: CreateDeploymentInput = {
        projectId: project.id,
        environmentId,
        resourceId: createdResource.id,
        serverId,
        ...(trimmedDestinationId ? { destinationId: trimmedDestinationId } : {}),
      };
      const deployment = await createDeploymentWithProgress(
        deploymentInput,
        appendDeploymentProgressEvent,
        {
          onRequestId: (requestId) => {
            deploymentProgressRequestId = requestId;
          },
          onStreamError: (message) => {
            deploymentProgressStreamError = message;
          },
        },
      );

      deploymentProgressDeploymentId = deployment.id;
      deploymentProgressDialogStatus = "succeeded";
      feedback = {
        kind: "success",
        title: $t(i18nKeys.console.projects.createResourceSuccessTitle),
        detail: deployment.id,
      };
      await refreshWorkspaceData();
      await goto(
        deploymentDetailHref({
          id: deployment.id,
          projectId: project.id,
          environmentId,
          resourceId: createdResource.id,
        }),
      );
    } catch (error) {
      const message = readErrorMessage(error);
      const title = createdResourceId
        ? $t(i18nKeys.console.resources.newDeploymentErrorTitle)
        : $t(i18nKeys.console.projects.createResourceErrorTitle);

      if (createdResourceId) {
        deploymentProgressDialogStatus = "failed";
        deploymentProgressStreamError = message;
      }

      feedback = {
        kind: "error",
        title,
        detail: createdResourceId
          ? $t(i18nKeys.console.projects.createResourceDeploymentPartialError, {
              resourceId: createdResourceId,
              message,
            })
          : message,
      };
    } finally {
      deploymentCreatePending = false;
    }
  }

  function deploymentProgressHref(): string {
    if (!project || !deploymentProgressDeploymentId || !deploymentProgressResourceId) {
      return "/deployments";
    }

    return deploymentDetailHref({
      id: deploymentProgressDeploymentId,
      projectId: project.id,
      environmentId,
      resourceId: deploymentProgressResourceId,
    });
  }

  function selectSourceKind(nextSourceKind: ResourceCreateSourceKind): void {
    sourceKind = nextSourceKind;
    localFolderSelectionNotice = null;

    if (nextSourceKind === "compose" && kind === "application") {
      kind = "compose-stack";
    }
  }

  function sourceKindLabelFor(nextSourceKind: ResourceCreateSourceKind): string {
    switch (nextSourceKind) {
      case "local-folder":
        return $t(i18nKeys.console.quickDeploy.sourceLocalFolder);
      case "github":
        return $t(i18nKeys.console.quickDeploy.sourceGithub);
      case "remote-git":
        return $t(i18nKeys.console.quickDeploy.sourceRemoteGit);
      case "docker-image":
        return $t(i18nKeys.console.quickDeploy.sourceDockerImage);
      case "compose":
        return $t(i18nKeys.console.quickDeploy.sourceCompose);
    }
  }

  function sourceKindHintFor(nextSourceKind: ResourceCreateSourceKind): string {
    switch (nextSourceKind) {
      case "local-folder":
        return $t(i18nKeys.console.quickDeploy.sourceLocalFolderHint);
      case "github":
        return $t(i18nKeys.console.quickDeploy.sourceGithubHint);
      case "remote-git":
        return $t(i18nKeys.console.quickDeploy.sourceRemoteGitHint);
      case "docker-image":
        return $t(i18nKeys.console.quickDeploy.sourceDockerImageHint);
      case "compose":
        return $t(i18nKeys.console.quickDeploy.sourceComposeHint);
    }
  }

  function sourceLocatorLabelFor(nextSourceKind: ResourceCreateSourceKind): string {
    switch (nextSourceKind) {
      case "local-folder":
        return $t(i18nKeys.console.quickDeploy.localFolderPath);
      case "github":
        return $t(i18nKeys.console.quickDeploy.githubRepositoryUrl);
      case "remote-git":
        return $t(i18nKeys.console.quickDeploy.remoteGitUrl);
      case "docker-image":
        return $t(i18nKeys.console.quickDeploy.dockerImage);
      case "compose":
        return $t(i18nKeys.console.quickDeploy.composeManifest);
    }
  }

  function sourceLocatorPlaceholderFor(nextSourceKind: ResourceCreateSourceKind): string {
    switch (nextSourceKind) {
      case "local-folder":
        return $t(i18nKeys.console.quickDeploy.localFolderPlaceholder);
      case "github":
        return $t(i18nKeys.console.quickDeploy.githubRepositoryUrlPlaceholder);
      case "remote-git":
        return $t(i18nKeys.console.quickDeploy.remoteGitUrlPlaceholder);
      case "docker-image":
        return $t(i18nKeys.console.quickDeploy.dockerImagePlaceholder);
      case "compose":
        return $t(i18nKeys.console.quickDeploy.composeManifestPlaceholder);
    }
  }

  function sourceLocatorHelpFor(nextSourceKind: ResourceCreateSourceKind): string {
    switch (nextSourceKind) {
      case "local-folder":
        return $t(i18nKeys.console.quickDeploy.chooseSourceDirectoryBrowserHint);
      case "github":
        return $t(i18nKeys.console.quickDeploy.githubRepositoryUrlHint);
      case "remote-git":
        return $t(i18nKeys.console.quickDeploy.sourceRemoteGitHint);
      case "docker-image":
        return $t(i18nKeys.console.quickDeploy.sourceDockerImageHint);
      case "compose":
        return $t(i18nKeys.console.quickDeploy.sourceComposeHint);
    }
  }

  function sourceLocatorFor(nextSourceKind: ResourceCreateSourceKind): string {
    switch (nextSourceKind) {
      case "local-folder":
        return localFolderLocator;
      case "github":
        return githubLocator;
      case "remote-git":
        return remoteGitLocator;
      case "docker-image":
        return dockerImageLocator;
      case "compose":
        return composeLocator;
    }
  }

  function setSourceLocator(value: string): void {
    switch (sourceKind) {
      case "local-folder":
        localFolderLocator = value;
        return;
      case "github":
        githubLocator = value;
        return;
      case "remote-git":
        remoteGitLocator = value;
        return;
      case "docker-image":
        dockerImageLocator = value;
        return;
      case "compose":
        composeLocator = value;
        return;
    }
  }

  function resourceSourceForForm(): ResourceSourceInput {
    const locator = sourceLocator.trim();

    if (!locator) {
      throw new Error($t(i18nKeys.console.projects.createResourceSourceRequired));
    }

    switch (sourceKind) {
      case "local-folder":
        return {
          kind: "local-folder",
          locator,
          displayName: sourceDisplayName(locator),
        };
      case "github":
      case "remote-git":
        return {
          kind: "git-public",
          locator,
          displayName: sourceDisplayName(locator),
        };
      case "docker-image":
        return {
          kind: "docker-image",
          locator,
          displayName: sourceDisplayName(locator),
        };
      case "compose":
        return {
          kind: "compose",
          locator,
          displayName: sourceDisplayName(locator),
        };
    }
  }

  function positiveIntegerField(value: string, fallback: number): number {
    const parsed = Number(value.trim() || String(fallback));
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error($t(i18nKeys.console.quickDeploy.healthCheckInvalid));
    }
    return parsed;
  }

  function nonNegativeIntegerField(value: string, fallback: number): number {
    const parsed = Number(value.trim() || String(fallback));
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error($t(i18nKeys.console.quickDeploy.healthCheckInvalid));
    }
    return parsed;
  }

  function optionalPortField(value: string): number | undefined {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      throw new Error($t(i18nKeys.console.quickDeploy.healthCheckInvalid));
    }
    return parsed;
  }

  function statusCodeField(value: string): number {
    const parsed = Number(value.trim() || "200");
    if (!Number.isInteger(parsed) || parsed < 100 || parsed > 599) {
      throw new Error($t(i18nKeys.console.quickDeploy.healthCheckInvalid));
    }
    return parsed;
  }

  function healthCheckPolicyForForm(): ResourceHealthCheckInput | undefined {
    if (!resourceHealthCheckEnabled) {
      return undefined;
    }

    const path = resourceHealthCheckPath.trim() || "/";
    const port = optionalPortField(resourceHealthCheckPort);
    return {
      enabled: true,
      type: "http",
      intervalSeconds: positiveIntegerField(resourceHealthCheckIntervalSeconds, 5),
      timeoutSeconds: positiveIntegerField(resourceHealthCheckTimeoutSeconds, 5),
      retries: positiveIntegerField(resourceHealthCheckRetries, 10),
      startPeriodSeconds: nonNegativeIntegerField(resourceHealthCheckStartPeriodSeconds, 5),
      http: {
        method: resourceHealthCheckMethod,
        scheme: resourceHealthCheckScheme,
        host: resourceHealthCheckHost.trim() || "localhost",
        ...(port ? { port } : {}),
        path,
        expectedStatusCode: statusCodeField(resourceHealthCheckExpectedStatusCode),
        ...(resourceHealthCheckResponseText.trim()
          ? { expectedResponseText: resourceHealthCheckResponseText.trim() }
          : {}),
      },
    };
  }

  function runtimeProfileForSource(): ResourceRuntimeProfileInput {
    const healthCheck = healthCheckPolicyForForm();
    const withHealthCheck = (input: ResourceRuntimeProfileInput): ResourceRuntimeProfileInput =>
      healthCheck
        ? {
            ...input,
            healthCheckPath: healthCheck.http?.path,
            healthCheck,
          }
        : input;

    switch (sourceKind) {
      case "docker-image":
        return withHealthCheck({ strategy: "prebuilt-image" });
      case "compose":
        return withHealthCheck({ strategy: "docker-compose" });
      case "local-folder":
      case "github":
      case "remote-git":
        return withHealthCheck({ strategy: "auto" });
    }
  }

  async function chooseLocalFolder(): Promise<void> {
    localFolderSelectionNotice = null;

    if (!browser) {
      return;
    }

    const selectDirectory = (window as WindowWithAppaloftDesktopBridge).appaloftDesktop?.selectDirectory;

    if (!selectDirectory) {
      localFolderSelectionNotice = $t(
        i18nKeys.console.quickDeploy.chooseSourceDirectoryBrowserHint,
      );
      return;
    }

    try {
      const locator = await selectDirectory();
      if (locator?.trim()) {
        localFolderLocator = locator.trim();
      }
    } catch (error) {
      localFolderSelectionNotice = readErrorMessage(error);
    }
  }

  function networkProfileForSource(): ResourceNetworkProfileInput {
    const internalPort = Number(resourceInternalPort.trim() || "3000");

    if (!Number.isInteger(internalPort) || internalPort < 1 || internalPort > 65535) {
      throw new Error($t(i18nKeys.console.quickDeploy.applicationPortInvalid));
    }

    return {
      internalPort,
      upstreamProtocol: "http",
      exposureMode: "reverse-proxy",
    };
  }

  function sourceDisplayName(locator: string): string {
    const cleanedLocator = locator.replace(/\/$/, "");
    const segment = cleanedLocator.split("/").at(-1)?.replace(/\.git$/, "");
    return segment || cleanedLocator;
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.common.actions.createResource)} · Appaloft</title>
</svelte:head>

<ConsoleShell
  title={$t(i18nKeys.common.actions.createResource)}
  description={$t(i18nKeys.console.projects.createResourceDescription)}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.home), href: "/" },
    { label: $t(i18nKeys.console.projects.pageTitle), href: "/projects" },
    {
      label: project?.name ?? $t(i18nKeys.console.projects.pageTitle),
      href: project ? projectDetailHref(project.id) : undefined,
    },
    { label: $t(i18nKeys.common.actions.createResource) },
  ]}
>
  {#if pageLoading}
    <div class="space-y-5">
      <Skeleton class="h-32 w-full" />
      <Skeleton class="h-80 w-full" />
    </div>
  {:else if !project}
    <section class="space-y-5 py-2">
      <Badge class="w-fit" variant="outline">{$t(i18nKeys.errors.backend.notFound)}</Badge>
      <div class="mt-4 max-w-2xl space-y-3">
        <h1 class="text-2xl font-semibold md:text-3xl">
          {$t(i18nKeys.console.projects.notFoundTitle)}
        </h1>
        <p class="text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.projects.notFoundBody)}
        </p>
      </div>
      <div class="mt-6">
        <Button href="/projects" variant="outline">
          <ArrowLeft class="size-4" />
          {$t(i18nKeys.common.actions.backToProjects)}
        </Button>
      </div>
    </section>
  {:else}
    <div class="space-y-8">
      <section class="space-y-4">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="max-w-3xl space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{project.name}</Badge>
              <Badge variant="secondary">{$t(i18nKeys.common.domain.resource)}</Badge>
            </div>
            <div class="space-y-2">
              <h1 class="text-2xl font-semibold md:text-3xl">
                {$t(i18nKeys.console.projects.createResourceTitle)}
              </h1>
              <p class="text-sm leading-6 text-muted-foreground">
                {$t(i18nKeys.console.projects.createResourceDescription)}
              </p>
            </div>
          </div>
          <Button href={projectDetailHref(project.id)} variant="outline">
            <ArrowLeft class="size-4" />
            {$t(i18nKeys.common.actions.openProject)}
          </Button>
        </div>
      </section>

      <form class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]" onsubmit={deployResource}>
        <div class="space-y-5">
          <section class="space-y-4">
            <div class="flex items-start gap-3">
              <div class="bg-muted p-2">
                <Boxes class="size-4" />
              </div>
              <div>
                <h2 class="text-lg font-semibold">
                  {$t(i18nKeys.console.projects.createResourceIdentityTitle)}
                </h2>
                <p class="mt-1 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.projects.createResourceIdentityDescription)}
                </p>
              </div>
            </div>

            <div class="mt-5 grid gap-4 sm:grid-cols-2">
              <label class="space-y-1.5 text-sm font-medium">
                <span>{$t(i18nKeys.common.domain.environment)}</span>
                <Select.Root bind:value={environmentId} type="single">
                  <Select.Trigger class="w-full">
                    {selectedEnvironment?.name ?? $t(i18nKeys.console.domainBindings.noEnvironmentOptions)}
                  </Select.Trigger>
                  <Select.Content>
                    {#each projectEnvironments as environment (environment.id)}
                      <Select.Item value={environment.id}>{environment.name}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </label>

              <label class="space-y-1.5 text-sm font-medium">
                <span>{$t(i18nKeys.common.domain.kind)}</span>
                <Select.Root bind:value={kind} type="single">
                  <Select.Trigger class="w-full">{kind}</Select.Trigger>
                  <Select.Content>
                    {#each resourceKinds as resourceKind (resourceKind)}
                      <Select.Item value={resourceKind}>{resourceKind}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </label>

              <label class="space-y-1.5 text-sm font-medium sm:col-span-2">
                <span>{$t(i18nKeys.common.domain.name)}</span>
                <Input
                  bind:value={name}
                  autocomplete="off"
                  placeholder={$t(i18nKeys.console.projects.createResourceNamePlaceholder)}
                />
              </label>

              <label class="space-y-1.5 text-sm font-medium sm:col-span-2">
                <span>{$t(i18nKeys.common.domain.description)}</span>
                <Textarea
                  bind:value={description}
                  class="min-h-24"
                  placeholder={$t(i18nKeys.console.projects.noDescription)}
                />
              </label>
            </div>
          </section>

          <section class="space-y-4">
            <div class="flex items-start gap-3">
              <div class="bg-muted p-2">
                <FolderOpen class="size-4" />
              </div>
              <div>
                <h2 class="text-lg font-semibold">
                  {$t(i18nKeys.console.projects.createResourceSourceTitle)}
                </h2>
                <p class="mt-1 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.projects.createResourceSourceDescription)}
                </p>
              </div>
            </div>

            <div
              class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
              role="radiogroup"
              aria-label={$t(i18nKeys.common.domain.source)}
            >
              {#each sourceKinds as option (option)}
                <ResourceSourceOption
                  selected={sourceKind === option}
                  label={sourceKindLabelFor(option)}
                  description={sourceKindHintFor(option)}
                  icon={sourceKindIcons[option]}
                  onselect={() => selectSourceKind(option)}
                />
              {/each}
            </div>

            <label class="mt-5 block space-y-1.5 text-sm font-medium">
              <span>{sourceLocatorLabel}</span>
              {#if sourceKind === "local-folder"}
                <div class="flex gap-2">
                  <Input
                    value={sourceLocator}
                    oninput={(event) => setSourceLocator(event.currentTarget.value)}
                    autocomplete="off"
                    class="font-mono text-xs"
                    placeholder={sourceLocatorPlaceholder}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    class="shrink-0"
                    disabled={!canChooseNativeLocalFolder}
                    title={canChooseNativeLocalFolder
                      ? $t(i18nKeys.common.actions.selectDirectory)
                      : $t(i18nKeys.console.quickDeploy.chooseSourceDirectoryBrowserHint)}
                    onclick={chooseLocalFolder}
                  >
                    <FolderOpen class="size-4" />
                    {$t(i18nKeys.common.actions.selectDirectory)}
                  </Button>
                </div>
                <p class="text-xs text-muted-foreground">
                  {sourceLocatorHelp}
                </p>
                {#if localFolderSelectionNotice}
                  <p class="text-xs text-destructive">{localFolderSelectionNotice}</p>
                {/if}
              {:else}
                <Input
                  value={sourceLocator}
                  oninput={(event) => setSourceLocator(event.currentTarget.value)}
                  autocomplete="off"
                  placeholder={sourceLocatorPlaceholder}
                />
                <p class="text-xs text-muted-foreground">
                  {sourceLocatorHelp}
                </p>
              {/if}
            </label>
          </section>

          <section class="space-y-4">
            <div class="flex items-start gap-3">
              <div class="bg-muted p-2">
                <Server class="size-4" />
              </div>
              <div>
                <h2 class="text-lg font-semibold">
                  {$t(i18nKeys.console.resources.newDeploymentTargetTitle)}
                </h2>
                <p class="mt-1 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.resources.newDeploymentTargetDescription)}
                </p>
              </div>
            </div>

            <div class="mt-5 grid gap-4 sm:grid-cols-2">
              <label class="space-y-1.5 text-sm font-medium">
                <span>{$t(i18nKeys.common.domain.server)}</span>
                <Select.Root bind:value={serverId} type="single">
                  <Select.Trigger class="w-full">
                    {selectedServer?.name ?? $t(i18nKeys.console.domainBindings.noServerOptions)}
                  </Select.Trigger>
                  <Select.Content>
                    {#each servers as server (server.id)}
                      <Select.Item value={server.id}>{server.name}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </label>

              <label class="space-y-1.5 text-sm font-medium">
                <span>{$t(i18nKeys.common.domain.destination)}</span>
                <Input
                  bind:value={destinationId}
                  autocomplete="off"
                  placeholder={$t(i18nKeys.console.domainBindings.formDestinationPlaceholder)}
                />
              </label>
            </div>
          </section>

          <section class="space-y-4">
            <div class="flex items-start gap-3">
              <div class="bg-muted p-2">
                <Waypoints class="size-4" />
              </div>
              <div>
                <h2 class="text-lg font-semibold">
                  {$t(i18nKeys.console.projects.createResourceRuntimeTitle)}
                </h2>
                <p class="mt-1 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.projects.createResourceRuntimeDescription)}
                </p>
              </div>
            </div>

            <div class="mt-5 grid gap-4 sm:grid-cols-2">
              <label class="space-y-1.5 text-sm font-medium">
                <span>{$t(i18nKeys.console.quickDeploy.applicationPort)}</span>
                <Input
                  bind:value={resourceInternalPort}
                  autocomplete="off"
                  inputmode="numeric"
                  placeholder="3000"
                />
                <span class="block text-xs font-normal text-muted-foreground">
                  {$t(i18nKeys.console.quickDeploy.applicationPortHint)}
                </span>
              </label>

              <div class="bg-muted/25 px-3 py-2">
                <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.mode)}</p>
                <p class="mt-1 truncate text-sm font-medium">
                  {runtimeProfileForSource().strategy}
                </p>
              </div>
            </div>

            <div class="mt-5 rounded-md border bg-background px-3 py-3">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div class="space-y-1">
                  <p class="text-sm font-medium">
                    {$t(i18nKeys.console.quickDeploy.healthCheckPolicy)}
                  </p>
                  <p class="text-xs text-muted-foreground">
                    {$t(i18nKeys.console.quickDeploy.healthCheckPathHint)}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={resourceHealthCheckEnabled ? "selected" : "outline"}
                  onclick={() => {
                    resourceHealthCheckEnabled = !resourceHealthCheckEnabled;
                  }}
                >
                  {$t(i18nKeys.console.quickDeploy.healthCheckToggle)}
                </Button>
              </div>

              {#if resourceHealthCheckEnabled}
                <div class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <label class="space-y-1.5 text-sm font-medium">
                    <span>{$t(i18nKeys.console.quickDeploy.healthCheckMethod)}</span>
                    <Select.Root bind:value={resourceHealthCheckMethod} type="single">
                      <Select.Trigger class="w-full">{resourceHealthCheckMethod}</Select.Trigger>
                      <Select.Content>
                        {#each ["GET", "HEAD", "POST", "OPTIONS"] as method (method)}
                          <Select.Item value={method}>{method}</Select.Item>
                        {/each}
                      </Select.Content>
                    </Select.Root>
                  </label>
                  <label class="space-y-1.5 text-sm font-medium">
                    <span>{$t(i18nKeys.console.quickDeploy.healthCheckScheme)}</span>
                    <Select.Root bind:value={resourceHealthCheckScheme} type="single">
                      <Select.Trigger class="w-full">{resourceHealthCheckScheme}</Select.Trigger>
                      <Select.Content>
                        {#each ["http", "https"] as scheme (scheme)}
                          <Select.Item value={scheme}>{scheme}</Select.Item>
                        {/each}
                      </Select.Content>
                    </Select.Root>
                  </label>
                  <label class="space-y-1.5 text-sm font-medium">
                    <span>{$t(i18nKeys.console.quickDeploy.healthCheckHost)}</span>
                    <Input bind:value={resourceHealthCheckHost} autocomplete="off" placeholder="localhost" />
                  </label>
                  <label class="space-y-1.5 text-sm font-medium">
                    <span>{$t(i18nKeys.console.quickDeploy.healthCheckPort)}</span>
                    <Input
                      bind:value={resourceHealthCheckPort}
                      autocomplete="off"
                      inputmode="numeric"
                      placeholder={resourceInternalPort.trim() || "3000"}
                    />
                  </label>
                  <label class="space-y-1.5 text-sm font-medium">
                    <span>{$t(i18nKeys.console.quickDeploy.healthCheckPath)}</span>
                    <Input bind:value={resourceHealthCheckPath} autocomplete="off" placeholder="/health" />
                  </label>
                  <label class="space-y-1.5 text-sm font-medium">
                    <span>{$t(i18nKeys.console.quickDeploy.healthCheckExpectedStatusCode)}</span>
                    <Input
                      bind:value={resourceHealthCheckExpectedStatusCode}
                      autocomplete="off"
                      inputmode="numeric"
                      placeholder="200"
                    />
                  </label>
                  <label class="space-y-1.5 text-sm font-medium sm:col-span-2">
                    <span>{$t(i18nKeys.console.quickDeploy.healthCheckResponseText)}</span>
                    <Input bind:value={resourceHealthCheckResponseText} autocomplete="off" placeholder="OK" />
                  </label>
                  <label class="space-y-1.5 text-sm font-medium">
                    <span>{$t(i18nKeys.console.quickDeploy.healthCheckIntervalSeconds)}</span>
                    <Input
                      bind:value={resourceHealthCheckIntervalSeconds}
                      autocomplete="off"
                      inputmode="numeric"
                      placeholder="5"
                    />
                  </label>
                  <label class="space-y-1.5 text-sm font-medium">
                    <span>{$t(i18nKeys.console.quickDeploy.healthCheckTimeoutSeconds)}</span>
                    <Input
                      bind:value={resourceHealthCheckTimeoutSeconds}
                      autocomplete="off"
                      inputmode="numeric"
                      placeholder="5"
                    />
                  </label>
                  <label class="space-y-1.5 text-sm font-medium">
                    <span>{$t(i18nKeys.console.quickDeploy.healthCheckRetries)}</span>
                    <Input
                      bind:value={resourceHealthCheckRetries}
                      autocomplete="off"
                      inputmode="numeric"
                      placeholder="10"
                    />
                  </label>
                  <label class="space-y-1.5 text-sm font-medium">
                    <span>{$t(i18nKeys.console.quickDeploy.healthCheckStartPeriodSeconds)}</span>
                    <Input
                      bind:value={resourceHealthCheckStartPeriodSeconds}
                      autocomplete="off"
                      inputmode="numeric"
                      placeholder="5"
                    />
                  </label>
                </div>
              {/if}
            </div>
          </section>
        </div>

        <aside class="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <section class="space-y-4">
            <div class="flex items-start gap-3">
              <div class="bg-muted p-2">
                <Settings2 class="size-4" />
              </div>
              <div>
                <h2 class="text-lg font-semibold">
                  {$t(i18nKeys.console.projects.createResourceReviewTitle)}
                </h2>
                <p class="mt-1 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.projects.createResourceReviewDescription)}
                </p>
              </div>
            </div>

            <div class="mt-5 space-y-3">
              <div class="rounded-md border bg-muted/10 px-3 py-2">
                <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.project)}</p>
                <p class="mt-1 truncate text-sm font-medium">{project.name}</p>
              </div>
              <div class="rounded-md border bg-muted/10 px-3 py-2">
                <p class="text-xs text-muted-foreground">
                  {$t(i18nKeys.common.domain.environment)}
                </p>
                <p class="mt-1 truncate text-sm font-medium">
                  {selectedEnvironment?.name ?? "-"}
                </p>
              </div>
              <div class="rounded-md border bg-muted/10 px-3 py-2">
                <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.server)}</p>
                <p class="mt-1 truncate text-sm font-medium">
                  {selectedServer?.name ?? "-"}
                </p>
              </div>
              <div class="rounded-md border bg-muted/10 px-3 py-2">
                <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.source)}</p>
                <p class="mt-1 truncate text-sm font-medium">{sourceKindLabel}</p>
                <p class="mt-1 truncate font-mono text-xs text-muted-foreground">
                  {sourceLocator.trim() || $t(i18nKeys.console.quickDeploy.sourceNotSet)}
                </p>
              </div>
              <div class="rounded-md border bg-muted/10 px-3 py-2">
                <p class="text-xs text-muted-foreground">
                  {$t(i18nKeys.common.domain.proxy)}
                </p>
                <p class="mt-1 text-sm font-medium">
                  reverse-proxy · http · {resourceInternalPort.trim() || "3000"}
                </p>
              </div>
              <div class="rounded-md border bg-muted/10 px-3 py-2">
                <p class="text-xs text-muted-foreground">
                  {$t(i18nKeys.console.quickDeploy.healthCheckPolicy)}
                </p>
                <p class="mt-1 truncate text-sm font-medium">{resourceHealthCheckSummary}</p>
              </div>
            </div>

            {#if feedback}
              <div
                class={[
                  "mt-4 rounded-md border px-3 py-2 text-sm",
                  feedback.kind === "success"
                    ? "border-primary/25 bg-primary/5"
                    : "border-destructive/30 bg-destructive/5 text-destructive",
                ]}
              >
                <p class="font-medium">{feedback.title}</p>
                <p class="mt-1 break-all text-xs">{feedback.detail}</p>
              </div>
            {/if}

            <div class="mt-5 flex flex-col gap-2">
              <Button
                class="w-full"
                disabled={!canDeploy || createResourceMutation.isPending || deploymentCreatePending}
                type="submit"
              >
                <Play class="size-4" />
                {createResourceMutation.isPending || deploymentCreatePending
                  ? $t(i18nKeys.common.actions.deploying)
                  : $t(i18nKeys.common.actions.deploy)}
              </Button>
              <Button class="w-full" href={projectDetailHref(project.id)} variant="outline">
                <ArrowLeft class="size-4" />
                {$t(i18nKeys.common.actions.openProject)}
              </Button>
            </div>
          </section>

          <section class="space-y-4">
            <div class="flex items-start gap-3">
              <div class="bg-muted p-2">
                <Package class="size-4" />
              </div>
              <div>
                <h2 class="text-sm font-semibold">
                  {$t(i18nKeys.console.resources.networkProfileTitle)}
                </h2>
                <p class="mt-1 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.resources.networkProfileDescription)}
                </p>
              </div>
            </div>
          </section>
        </aside>
      </form>
    </div>
  {/if}
</ConsoleShell>

<DeploymentProgressDialog
  open={deploymentProgressDialogOpen}
  status={deploymentProgressDialogStatus}
  events={deploymentProgressEvents}
  streamError={deploymentProgressStreamError}
  deploymentId={deploymentProgressDeploymentId}
  requestId={deploymentProgressRequestId}
  title={$t(i18nKeys.console.deployments.progressTitle)}
  description={$t(i18nKeys.console.deployments.progressDescription)}
  onClose={() => {
    deploymentProgressDialogOpen = false;
  }}
  onOpenDeployment={() => {
    void goto(deploymentProgressHref());
  }}
/>
