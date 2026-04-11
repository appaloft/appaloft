<script lang="ts">
	import { browser } from "$app/environment";
	import {
		CheckCircle2,
		FolderOpen,
		GitBranch,
		LoaderCircle,
		Package,
		Play,
		Rocket,
		Server,
		Settings2,
		ShieldCheck,
		TerminalSquare,
		Waypoints,
	} from "@lucide/svelte";
	import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";

	import { API_BASE, readErrorMessage, request } from "$lib/api/client";
	import { Avatar, AvatarFallback } from "$lib/components/ui/avatar";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import {
		Card,
		CardContent,
		CardDescription,
		CardFooter,
		CardHeader,
		CardTitle,
	} from "$lib/components/ui/card";
	import { Input } from "$lib/components/ui/input";
	import { Separator } from "$lib/components/ui/separator";
	import {
		Sheet,
		SheetContent,
		SheetDescription,
		SheetHeader,
		SheetTitle,
	} from "$lib/components/ui/sheet";
	import {
		Sidebar,
		SidebarContent,
		SidebarFooter,
		SidebarGroup,
		SidebarGroupContent,
		SidebarGroupLabel,
		SidebarHeader,
		SidebarInput,
		SidebarInset,
		SidebarMenu,
		SidebarMenuButton,
		SidebarMenuItem,
		SidebarProvider,
		SidebarRail,
		SidebarTrigger,
	} from "$lib/components/ui/sidebar";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow,
	} from "$lib/components/ui/table";
	import { Textarea } from "$lib/components/ui/textarea";
	import type {
		AuthSessionResponse,
		DeploymentSummary,
		EnvironmentSummary,
		GitHubRepositorySummary,
		HealthResponse,
		ProjectSummary,
		ReadinessResponse,
		ServerSummary,
		VersionResponse,
	} from "@yundu/contracts";
	import { orpcClient } from "$lib/orpc";

	type SourceKind = "local-folder" | "github" | "remote-git" | "docker-image" | "compose";
	type DraftMode = "existing" | "new";
	type YunduDesktopBridge = {
		selectDirectory?: () => Promise<string | null | undefined>;
	};
	type WindowWithYunduDesktopBridge = Window &
		typeof globalThis & {
			yunduDesktop?: YunduDesktopBridge;
		};
	type ProviderSummary = {
		key: string;
		title: string;
		category: string;
		capabilities: string[];
	};

	const environmentKinds = [
		"local",
		"development",
		"test",
		"staging",
		"production",
		"preview",
		"custom",
	] as const;

	const sourceOptions: Array<{
		key: SourceKind;
		label: string;
		hint: string;
		icon: typeof FolderOpen;
	}> = [
		{
			key: "local-folder",
			label: "本地目录",
			hint: "适合当前工作区或本地源码目录。",
			icon: FolderOpen,
		},
		{
			key: "github",
			label: "GitHub 仓库",
			hint: "需要时再触发授权，选仓库后自动回填。",
			icon: GitBranch,
		},
		{
			key: "remote-git",
			label: "Remote Git",
			hint: "适合 GitHub 之外的 git 源。",
			icon: GitBranch,
		},
		{
			key: "docker-image",
			label: "Docker 镜像",
			hint: "直接发布已有镜像，无需再构建。",
			icon: Package,
		},
		{
			key: "compose",
			label: "Compose",
			hint: "导入 compose 清单或仓库中的 compose 路径。",
			icon: Waypoints,
		},
	];

	const navigationSections = [
		{ key: "overview", label: "概览", icon: Package },
		{ key: "projects-panel", label: "项目", icon: FolderOpen },
		{ key: "deployments-panel", label: "部署", icon: Rocket },
		{ key: "servers-panel", label: "服务器", icon: Server },
		{ key: "environments-panel", label: "环境", icon: Settings2 },
	] as const;

	const healthQuery = createQuery(() =>
		queryOptions({
			queryKey: ["system", "health"],
			queryFn: () => request<HealthResponse>("/api/health"),
			enabled: browser,
			retry: 0,
		}),
	);
	const readinessQuery = createQuery(() =>
		queryOptions({
			queryKey: ["system", "readiness"],
			queryFn: () => request<ReadinessResponse>("/api/readiness"),
			enabled: browser,
		}),
	);
	const versionQuery = createQuery(() =>
		queryOptions({
			queryKey: ["system", "version"],
			queryFn: () => request<VersionResponse>("/api/version"),
			enabled: browser,
		}),
	);
	const authSessionQuery = createQuery(() =>
		queryOptions({
			queryKey: ["system", "auth-session"],
			queryFn: () => request<AuthSessionResponse>("/api/auth/session"),
			enabled: browser,
		}),
	);
	const projectsQuery = createQuery(() =>
		queryOptions({
			queryKey: ["projects"],
			queryFn: () => orpcClient.projects.list(),
			enabled: browser,
		}),
	);
	const serversQuery = createQuery(() =>
		queryOptions({
			queryKey: ["servers"],
			queryFn: () => orpcClient.servers.list(),
			enabled: browser,
		}),
	);
	const environmentsQuery = createQuery(() =>
		queryOptions({
			queryKey: ["environments"],
			queryFn: () => orpcClient.environments.list({}),
			enabled: browser,
		}),
	);
	const deploymentsQuery = createQuery(() =>
		queryOptions({
			queryKey: ["deployments"],
			queryFn: () => orpcClient.deployments.list({}),
			enabled: browser,
		}),
	);
	const providersQuery = createQuery(() =>
		queryOptions({
			queryKey: ["providers"],
			queryFn: () => orpcClient.providers.list(),
			enabled: browser,
		}),
	);

	let githubRepositorySearch = $state("");
	let projectSearch = $state("");
	let quickDeployOpen = $state(false);

	const createProjectMutation = createMutation(() => ({
		mutationFn: (input: { name: string; description?: string }) => orpcClient.projects.create(input),
	}));
	const registerServerMutation = createMutation(() => ({
		mutationFn: (input: { name: string; host: string; port?: number; providerKey: string }) =>
			orpcClient.servers.create(input),
	}));
	const createEnvironmentMutation = createMutation(() => ({
		mutationFn: (input: {
			projectId: string;
			name: string;
			kind: (typeof environmentKinds)[number];
			parentEnvironmentId?: string;
		}) => orpcClient.environments.create(input),
	}));
	const setEnvironmentVariableMutation = createMutation(() => ({
		mutationFn: (input: {
			environmentId: string;
			key: string;
			value: string;
			kind: "plain-config" | "secret" | "provider-specific" | "deployment-strategy";
			exposure: "build-time" | "runtime";
			isSecret?: boolean;
			scope?: "defaults" | "system" | "organization" | "project" | "environment" | "deployment";
		}) => orpcClient.environments.setVariable(input),
	}));
	const createDeploymentMutation = createMutation(() => ({
		mutationFn: (input: {
			projectId: string;
			serverId: string;
			environmentId: string;
			sourceLocator: string;
		}) => orpcClient.deployments.create(input),
	}));

	let sourceKind = $state<SourceKind>("local-folder");
	let projectMode = $state<DraftMode>("new");
	let serverMode = $state<DraftMode>("new");
	let environmentMode = $state<DraftMode>("new");

	let selectedProjectId = $state("");
	let selectedServerId = $state("");
	let selectedEnvironmentId = $state("");

	let projectName = $state("");
	let projectDescription = $state("");
	let serverName = $state("edge-1");
	let serverHost = $state("");
	let serverPort = $state("22");
	let serverProviderKey = $state("generic-ssh");
	let environmentName = $state("production");
	let environmentKind = $state<(typeof environmentKinds)[number]>("production");
	let variableKey = $state("");
	let variableValue = $state("");
	let variableIsSecret = $state(true);
	let selectedGitHubRepositoryId = $state("");
	let selectedGitHubRepository = $state<GitHubRepositorySummary | null>(null);

	let localFolderLocator = $state(".");
	let localFolderSelectionNotice = $state<string | null>(null);
	let githubLocator = $state("https://github.com/");
	let remoteGitLocator = $state("");
	let dockerImageLocator = $state("");
	let composeLocator = $state("");

	let deployFeedback = $state<{
		kind: "success" | "error";
		title: string;
		detail: string;
	} | null>(null);

	const health = $derived(healthQuery.data ?? null);
	const readiness = $derived(readinessQuery.data ?? null);
	const version = $derived(versionQuery.data ?? null);
	const authSession = $derived(
		authSessionQuery.data ?? {
			enabled: false,
			provider: "none",
			loginRequired: false,
			deferredAuth: false,
			session: null,
			providers: [],
		},
	);
	const projects = $derived((projectsQuery.data?.items ?? []) as ProjectSummary[]);
	const servers = $derived((serversQuery.data?.items ?? []) as ServerSummary[]);
	const environments = $derived((environmentsQuery.data?.items ?? []) as EnvironmentSummary[]);
	const deployments = $derived((deploymentsQuery.data?.items ?? []) as DeploymentSummary[]);
	const providers = $derived((providersQuery.data?.items ?? []) as ProviderSummary[]);

	const githubProvider = $derived(
		authSession.providers.find((provider) => provider.key === "github") ?? null,
	);
	const githubRepositoriesQuery = createQuery(() =>
		queryOptions({
			queryKey: ["integrations", "github", "repositories", githubRepositorySearch.trim()],
			queryFn: () =>
				orpcClient.integrations.github.repositories.list({
					...(githubRepositorySearch.trim() ? { search: githubRepositorySearch.trim() } : {}),
				}),
			enabled:
				browser &&
				sourceKind === "github" &&
				Boolean(githubProvider?.configured) &&
				Boolean(githubProvider?.connected),
		}),
	);
	const githubRepositories = $derived(
		(githubRepositoriesQuery.data?.items ?? []) as GitHubRepositorySummary[],
	);
	const githubConnected = $derived(Boolean(githubProvider?.connected));
	const authIdentity = $derived(readSessionIdentity(authSession.session));
	const canChooseNativeLocalFolder = $derived(
		browser &&
			typeof (window as WindowWithYunduDesktopBridge).yunduDesktop?.selectDirectory === "function",
	);
	const selectedProject = $derived(projects.find((project) => project.id === selectedProjectId) ?? null);
	const selectedServer = $derived(servers.find((server) => server.id === selectedServerId) ?? null);
	const selectedEnvironment = $derived(
		environments.find((environment) => environment.id === selectedEnvironmentId) ?? null,
	);
	const selectedProjectEnvironments = $derived(
		environments.filter((environment) => environment.projectId === selectedProjectId),
	);
	const selectedProjectDeployments = $derived(
		deployments.filter((deployment) => deployment.projectId === selectedProjectId),
	);
	const selectedProjectVariableCount = $derived(
		selectedProjectEnvironments.reduce(
			(total, environment) => total + environment.maskedVariables.length,
			0,
		),
	);
	const filteredProjects = $derived.by(() => {
		const query = projectSearch.trim().toLowerCase();
		if (!query) {
			return projects;
		}

		return projects.filter((project) =>
			[project.name, project.slug, project.description ?? ""].some((value) =>
				value.toLowerCase().includes(query),
			),
		);
	});
	const filteredEnvironments = $derived.by(() => {
		if (projectMode === "existing" && selectedProjectId) {
			return environments.filter((environment) => environment.projectId === selectedProjectId);
		}

		return environments;
	});
	const visibleEnvironments = $derived(
		selectedProjectId ? selectedProjectEnvironments : environments,
	);
	const visibleDeployments = $derived(
		selectedProjectId ? selectedProjectDeployments : deployments,
	);
	const connectionError = $derived(healthQuery.error ? readErrorMessage(healthQuery.error) : "");
	const warnings = $derived.by(() => {
		const issues: string[] = [];
		for (const [label, error] of [
			["readiness", readinessQuery.error],
			["version", versionQuery.error],
			["projects", projectsQuery.error],
			["servers", serversQuery.error],
			["environments", environmentsQuery.error],
			["deployments", deploymentsQuery.error],
			["providers", providersQuery.error],
			["auth", authSessionQuery.error],
			...(sourceKind === "github" ? ([["github-repositories", githubRepositoriesQuery.error]] as const) : []),
		] as const) {
			if (error) {
				issues.push(`${label}: ${readErrorMessage(error)}`);
			}
		}

		return issues;
	});
	const pageLoading = $derived(
		healthQuery.isPending ||
			readinessQuery.isPending ||
			versionQuery.isPending ||
			projectsQuery.isPending ||
			serversQuery.isPending ||
			environmentsQuery.isPending ||
			deploymentsQuery.isPending ||
			providersQuery.isPending ||
			authSessionQuery.isPending,
	);
	const deployPending = $derived(
		createProjectMutation.isPending ||
			registerServerMutation.isPending ||
			createEnvironmentMutation.isPending ||
			setEnvironmentVariableMutation.isPending ||
			createDeploymentMutation.isPending,
	);
	const statusLabel = $derived(
		!health ? "API 离线" : readiness?.status === "degraded" ? "需要检查" : "API 在线",
	);
	const sourceLocator = $derived.by(() => {
		switch (sourceKind) {
			case "github":
				return githubLocator.trim();
			case "remote-git":
				return remoteGitLocator.trim();
			case "docker-image":
				return dockerImageLocator.trim();
			case "compose":
				return composeLocator.trim();
			default:
				return localFolderLocator.trim();
		}
	});
	const sourcePlaceholder = $derived.by(() => {
		switch (sourceKind) {
			case "github":
				return "https://github.com/acme/platform.git";
			case "remote-git":
				return "https://git.example.com/team/project.git";
			case "docker-image":
				return "ghcr.io/acme/platform:latest";
			case "compose":
				return "./deploy/docker-compose.yml";
			default:
				return ".";
		}
	});
	const deploymentCommandPreview = $derived.by(() => {
		const segments = [`yundu deploy ${sourceLocator || "."}`];

		if (selectedProjectId) {
			segments.push(`--project ${selectedProjectId}`);
		}

		if (selectedServerId) {
			segments.push(`--server ${selectedServerId}`);
		}

		if (selectedEnvironmentId) {
			segments.push(`--environment ${selectedEnvironmentId}`);
		}

		return segments.join(" ");
	});
	const deploymentModeLabel = $derived(version?.mode ?? "self-hosted");
	const databaseDriver = $derived(readiness?.details?.databaseDriver ?? "unknown");
	const providerOptions = $derived(
		providers.length > 0
			? providers
			: [
					{
						key: "generic-ssh",
						title: "Generic SSH",
						category: "deploy-target",
						capabilities: ["ssh", "single-server"],
					},
				],
	);

	$effect(() => {
		if (projects.length === 0) {
			projectMode = "new";
			selectedProjectId = "";
			environmentMode = "new";
			selectedEnvironmentId = "";
			return;
		}

		if (!selectedProjectId) {
			selectedProjectId = projects[0].id;
		}
	});

	$effect(() => {
		if (servers.length === 0) {
			serverMode = "new";
			selectedServerId = "";
			return;
		}

		if (!selectedServerId) {
			selectedServerId = servers[0].id;
		}
	});

	$effect(() => {
		if (projectMode === "new") {
			environmentMode = "new";
			selectedEnvironmentId = "";
		}
	});

	$effect(() => {
		if (environmentMode === "existing" && filteredEnvironments.length === 0) {
			environmentMode = "new";
			selectedEnvironmentId = "";
			return;
		}

		if (environmentMode === "existing" && !selectedEnvironmentId && filteredEnvironments.length > 0) {
			selectedEnvironmentId = filteredEnvironments[0].id;
		}
	});

	$effect(() => {
		if (providerOptions.length > 0 && !providerOptions.some((provider) => provider.key === serverProviderKey)) {
			serverProviderKey = providerOptions[0].key;
		}
	});

	function readSessionIdentity(session: unknown): string | null {
		if (!session || typeof session !== "object") {
			return null;
		}

		const sessionRecord = session as Record<string, unknown>;
		const user =
			"user" in sessionRecord && sessionRecord.user && typeof sessionRecord.user === "object"
				? (sessionRecord.user as Record<string, unknown>)
				: null;

		if (!user) {
			return null;
		}

		if (typeof user.name === "string" && user.name.trim().length > 0) {
			return user.name;
		}

		if (typeof user.email === "string" && user.email.trim().length > 0) {
			return user.email;
		}

		return null;
	}

	function formatTime(value: string): string {
		return value.slice(0, 19).replace("T", " ");
	}

	function initials(value: string | null | undefined): string {
		if (!value) {
			return "CP";
		}

		return value
			.split(/[\s/-]+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((chunk) => chunk[0]?.toUpperCase() ?? "")
			.join("");
	}

	function deploymentBadgeVariant(
		status: string,
	): "default" | "secondary" | "outline" | "destructive" {
		switch (status) {
			case "failed":
			case "rolled_back":
				return "destructive";
			case "running":
			case "queued":
				return "secondary";
			case "succeeded":
				return "default";
			default:
				return "outline";
		}
	}

	function setSourceLocator(value: string): void {
		switch (sourceKind) {
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
			default:
				localFolderLocator = value;
		}
	}

	async function chooseLocalFolder(): Promise<void> {
		localFolderSelectionNotice = null;

		if (!browser) {
			return;
		}

		const selectDirectory = (window as WindowWithYunduDesktopBridge).yunduDesktop?.selectDirectory;

		if (!selectDirectory) {
			localFolderSelectionNotice = "当前浏览器不能只读取本地路径，请直接输入或粘贴目录路径。";
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

	function jumpTo(sectionId: string): void {
		if (!browser) {
			return;
		}

		document.getElementById(sectionId)?.scrollIntoView({
			behavior: "smooth",
			block: "start",
		});
	}

	async function connectGitHub(): Promise<void> {
		try {
			const endpoint =
				authSession.session && !githubConnected ? "/api/auth/link-social" : "/api/auth/sign-in/social";
			const response = await request<{
				redirect: boolean;
				url?: string;
			}>(endpoint, {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					provider: "github",
					callbackURL: browser ? window.location.href : API_BASE,
					scopes: ["repo", "read:user"],
					disableRedirect: true,
				}),
			});

			if (response.url && browser) {
				window.location.href = response.url;
			}
		} catch (error) {
			deployFeedback = {
				kind: "error",
				title: "无法连接 GitHub",
				detail: readErrorMessage(error),
			};
		}
	}

	function applyGitHubRepository(repository: GitHubRepositorySummary): void {
		sourceKind = "github";
		selectedGitHubRepositoryId = repository.id;
		selectedGitHubRepository = repository;
		githubLocator = repository.cloneUrl;

		if (projectMode === "new") {
			projectName = repository.name;
			projectDescription = repository.description ?? "";
		}
	}

	async function handleQuickDeploy(): Promise<void> {
		deployFeedback = null;

		try {
			if (!sourceLocator) {
				throw new Error("请先填写来源地址。");
			}

			if (sourceKind === "github") {
				if (!githubProvider?.configured) {
					throw new Error("后端尚未配置 GitHub OAuth。");
				}

				if (!githubConnected) {
					throw new Error("请先连接 GitHub，再继续导入仓库。");
				}
			}

			let projectId = selectedProjectId;

			if (projectMode === "new") {
				if (!projectName.trim()) {
					throw new Error("请填写项目名。");
				}

				const createdProject = await createProjectMutation.mutateAsync({
					name: projectName.trim(),
					...(projectDescription.trim()
						? {
								description: projectDescription.trim(),
							}
						: {}),
				});
				projectId = createdProject.id;
				selectedProjectId = projectId;
				await projectsQuery.refetch();
			}

			if (!projectId) {
				throw new Error("请选择或创建一个项目。");
			}

			let serverId = selectedServerId;

			if (serverMode === "new") {
				if (!serverName.trim() || !serverHost.trim()) {
					throw new Error("请填写服务器名称和主机地址。");
				}

				const createdServer = await registerServerMutation.mutateAsync({
					name: serverName.trim(),
					host: serverHost.trim(),
					providerKey: serverProviderKey,
					...(serverPort.trim()
						? {
								port: Number(serverPort),
							}
						: {}),
				});
				serverId = createdServer.id;
				selectedServerId = serverId;
				await serversQuery.refetch();
			}

			if (!serverId) {
				throw new Error("请选择或创建一个服务器。");
			}

			let environmentId = selectedEnvironmentId;

			if (environmentMode === "new") {
				if (!environmentName.trim()) {
					throw new Error("请填写环境名。");
				}

				const createdEnvironment = await createEnvironmentMutation.mutateAsync({
					projectId,
					name: environmentName.trim(),
					kind: environmentKind,
				});
				environmentId = createdEnvironment.id;
				selectedEnvironmentId = environmentId;
				await environmentsQuery.refetch();
			}

			if (!environmentId) {
				throw new Error("请选择或创建一个环境。");
			}

			if (variableKey.trim()) {
				await setEnvironmentVariableMutation.mutateAsync({
					environmentId,
					key: variableKey.trim(),
					value: variableValue,
					exposure: "runtime",
					kind: variableIsSecret ? "secret" : "plain-config",
					isSecret: variableIsSecret,
					scope: "environment",
				});
				await environmentsQuery.refetch();
			}

			const deployment = await createDeploymentMutation.mutateAsync({
				projectId,
				serverId,
				environmentId,
				sourceLocator,
			});

			await deploymentsQuery.refetch();

			deployFeedback = {
				kind: "success",
				title: "部署记录已创建",
				detail: `deploymentId: ${deployment.id}`,
			};
		} catch (error) {
			deployFeedback = {
				kind: "error",
				title: "无法创建部署",
				detail: readErrorMessage(error),
			};
		}
	}
</script>

<svelte:head>
	<title>Console · Yundu</title>
</svelte:head>

<SidebarProvider>
	<Sidebar variant="inset" collapsible="icon">
		<SidebarHeader class="gap-3">
			<div class="flex items-center gap-3 rounded-lg border bg-background px-3 py-2">
				<Avatar size="sm">
					<AvatarFallback>{initials(selectedProject?.name ?? "Control Plane")}</AvatarFallback>
				</Avatar>
				<div class="min-w-0 group-data-[collapsible=icon]:hidden">
					<p class="truncate text-sm font-medium">
						{selectedProject?.name ?? "项目控制台"}
					</p>
					<p class="truncate text-xs text-muted-foreground">
						{selectedProject?.slug ?? "选择项目或直接发起部署"}
					</p>
				</div>
			</div>
			<SidebarInput
				bind:value={projectSearch}
				class="group-data-[collapsible=icon]:hidden"
				placeholder="搜索项目"
			/>
		</SidebarHeader>

		<SidebarContent>
			<SidebarGroup>
				<SidebarGroupLabel>工作台</SidebarGroupLabel>
				<SidebarGroupContent>
					<SidebarMenu>
						{#each navigationSections as section (section.key)}
							<SidebarMenuItem>
								<SidebarMenuButton
									tooltipContent={section.label}
									onclick={() => jumpTo(section.key)}
								>
									<section.icon class="size-4" />
									<span>{section.label}</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
						{/each}
					</SidebarMenu>
				</SidebarGroupContent>
			</SidebarGroup>

			<SidebarGroup>
				<SidebarGroupLabel>项目</SidebarGroupLabel>
				<SidebarGroupContent>
					<SidebarMenu>
						{#if filteredProjects.length > 0}
							{#each filteredProjects as project (project.id)}
								<SidebarMenuItem>
									<SidebarMenuButton
										isActive={selectedProjectId === project.id}
										tooltipContent={project.name}
										onclick={() => {
											selectedProjectId = project.id;
											projectMode = "existing";
											jumpTo("projects-panel");
										}}
									>
										<FolderOpen class="size-4" />
										<span>{project.name}</span>
									</SidebarMenuButton>
								</SidebarMenuItem>
							{/each}
						{:else}
							<SidebarMenuItem>
								<SidebarMenuButton tooltipContent="暂无项目">
									<Package class="size-4" />
									<span>暂无项目</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
						{/if}
					</SidebarMenu>
				</SidebarGroupContent>
			</SidebarGroup>
		</SidebarContent>

		<SidebarFooter>
			<div class="rounded-lg border bg-background px-3 py-3 text-sm group-data-[collapsible=icon]:hidden">
				<div class="flex items-center justify-between gap-2">
					<span class="text-muted-foreground">GitHub</span>
					<Badge variant={githubConnected ? "default" : "outline"}>
						{githubConnected ? "已连接" : "按需连接"}
					</Badge>
				</div>
				<p class="mt-2 text-xs text-muted-foreground">
					{githubConnected
						? authIdentity ?? "已授权，可直接选择仓库"
						: githubProvider?.configured
							? "只有选择 GitHub source 时才会跳转授权。"
							: "后端尚未配置 GitHub OAuth。"}
				</p>
				{#if githubProvider?.configured && !githubConnected}
					<Button class="mt-3 w-full" size="sm" variant="outline" onclick={connectGitHub}>
						<GitBranch class="size-4" />
						连接 GitHub
					</Button>
				{/if}
			</div>

			<div class="flex flex-wrap gap-2 group-data-[collapsible=icon]:hidden">
				<Badge variant={!health ? "secondary" : readiness?.status === "degraded" ? "outline" : "default"}>
					{statusLabel}
				</Badge>
				<Badge variant="outline">{databaseDriver}</Badge>
			</div>
		</SidebarFooter>
		<SidebarRail />
	</Sidebar>

	<SidebarInset>
		<header class="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-sm md:px-6">
			<div class="flex min-w-0 items-center gap-3">
				<SidebarTrigger />
				<div class="min-w-0">
					<p class="truncate text-sm font-medium">
						{selectedProject?.name ?? "项目控制台"}
					</p>
					<p class="truncate text-xs text-muted-foreground">
						{selectedProject
							? `${selectedProject.slug} · ${selectedProjectDeployments.length} 次部署`
							: "管理项目、来源、环境和发布配置"}
					</p>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<Badge variant="outline" class="hidden md:inline-flex">
					{deploymentModeLabel}
				</Badge>
				<Button
					size="sm"
					variant="outline"
					onclick={() => {
						quickDeployOpen = true;
					}}
				>
					<Play class="size-4" />
					快速部署
				</Button>
			</div>
		</header>

		<div class="flex-1 p-4 md:p-6">
			{#if pageLoading}
				<div class="space-y-6">
					<div class="space-y-6">
						<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
							{#each Array.from({ length: 4 }) as _, index (index)}
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
								<Skeleton class="h-5 w-40" />
								<Skeleton class="h-4 w-64" />
							</CardHeader>
							<CardContent class="space-y-3">
								{#each Array.from({ length: 5 }) as _, index (index)}
									<Skeleton class="h-10 w-full" />
								{/each}
							</CardContent>
						</Card>
					</div>
					<Card>
						<CardHeader>
							<Skeleton class="h-5 w-36" />
							<Skeleton class="h-4 w-56" />
						</CardHeader>
						<CardContent class="space-y-3">
							{#each Array.from({ length: 8 }) as _, index (index)}
								<Skeleton class="h-10 w-full" />
							{/each}
						</CardContent>
					</Card>
				</div>
			{:else if connectionError}
				<Card class="border-destructive/30">
					<CardHeader>
						<CardTitle>后端不可用</CardTitle>
						<CardDescription>
							先启动 `yundu serve`，再确认数据库已就绪。若使用 PostgreSQL，请检查用户名和密码。
						</CardDescription>
					</CardHeader>
					<CardContent class="space-y-4">
						<pre class="overflow-x-auto rounded-md border bg-muted px-3 py-3 text-xs text-muted-foreground">{connectionError}</pre>
						<div class="flex flex-wrap gap-2">
							<Button variant="outline" onclick={() => window.open(`${API_BASE}/api/health`, "_blank")}>
								检查 /api/health
							</Button>
							<Badge variant="outline">yundu db migrate && yundu serve</Badge>
						</div>
					</CardContent>
				</Card>
			{:else}
				<div>
					<div class="space-y-6">
						<section id="overview" class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
							<Card>
								<CardHeader class="pb-2">
									<CardDescription>项目</CardDescription>
									<CardTitle class="text-2xl">{projects.length}</CardTitle>
								</CardHeader>
							</Card>
							<Card>
								<CardHeader class="pb-2">
									<CardDescription>服务器</CardDescription>
									<CardTitle class="text-2xl">{servers.length}</CardTitle>
								</CardHeader>
							</Card>
							<Card>
								<CardHeader class="pb-2">
									<CardDescription>环境</CardDescription>
									<CardTitle class="text-2xl">{visibleEnvironments.length}</CardTitle>
								</CardHeader>
							</Card>
							<Card>
								<CardHeader class="pb-2">
									<CardDescription>部署</CardDescription>
									<CardTitle class="text-2xl">{visibleDeployments.length}</CardTitle>
								</CardHeader>
							</Card>
						</section>

						{#if readiness?.status === "degraded" || warnings.length > 0}
							<Card class="border-amber-300/60 bg-amber-50/60">
								<CardHeader>
									<CardTitle class="flex items-center gap-2 text-base">
										<ShieldCheck class="size-4" />
										控制面需要检查
									</CardTitle>
									<CardDescription>
										API 已启动，但存在 readiness 或数据查询问题。
									</CardDescription>
								</CardHeader>
								<CardContent class="space-y-2 text-sm text-muted-foreground">
									{#each warnings as warning (warning)}
										<p>{warning}</p>
									{/each}
								</CardContent>
							</Card>
						{/if}

						<Card>
							<CardHeader class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
								<div class="space-y-1">
									<CardTitle>{selectedProject?.name ?? "尚未选择项目"}</CardTitle>
									<CardDescription>
										{selectedProject?.description ??
											"左侧直接切换项目，主区域查看配置和部署记录。"}
									</CardDescription>
								</div>
								<div class="flex flex-wrap gap-2">
									<Badge variant={!health ? "secondary" : readiness?.status === "degraded" ? "outline" : "default"}>
										{statusLabel}
									</Badge>
									<Badge variant="outline">{deploymentModeLabel}</Badge>
									<Badge variant="outline">{databaseDriver}</Badge>
								</div>
							</CardHeader>
							<CardContent class="grid gap-4 md:grid-cols-3">
								<div class="rounded-lg border bg-muted/30 p-4">
									<p class="text-xs uppercase tracking-wide text-muted-foreground">认证</p>
									<p class="mt-2 text-sm font-medium">
										{githubConnected ? authIdentity ?? "GitHub 已连接" : "按需授权"}
									</p>
								</div>
								<div class="rounded-lg border bg-muted/30 p-4">
									<p class="text-xs uppercase tracking-wide text-muted-foreground">环境变量</p>
									<p class="mt-2 text-sm font-medium">{selectedProjectVariableCount} 个</p>
								</div>
								<div class="rounded-lg border bg-muted/30 p-4">
									<p class="text-xs uppercase tracking-wide text-muted-foreground">版本</p>
									<p class="mt-2 text-sm font-medium">{health?.version ?? version?.version ?? "unknown"}</p>
								</div>
							</CardContent>
						</Card>

						<Card id="projects-panel">
							<CardHeader>
								<CardTitle>项目</CardTitle>
								<CardDescription>直接切换项目，查看其环境、服务器和部署状态。</CardDescription>
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
										{#if projects.length > 0}
											{#each projects as project (project.id)}
												<TableRow data-state={selectedProjectId === project.id ? "selected" : undefined}>
													<TableCell class="font-medium">{project.name}</TableCell>
													<TableCell>{project.slug}</TableCell>
													<TableCell>
														{environments.filter((environment) => environment.projectId === project.id).length}
													</TableCell>
													<TableCell>
														{deployments.filter((deployment) => deployment.projectId === project.id).length}
													</TableCell>
													<TableCell>{formatTime(project.createdAt)}</TableCell>
													<TableCell>
														<Button
															size="sm"
															variant={selectedProjectId === project.id ? "default" : "ghost"}
															onclick={() => {
																selectedProjectId = project.id;
																projectMode = "existing";
															}}
														>
															管理
														</Button>
													</TableCell>
												</TableRow>
											{/each}
										{:else}
											<TableRow>
												<TableCell colspan={6} class="text-center text-muted-foreground">
													暂无项目，使用右上角快速部署创建并部署第一个项目。
												</TableCell>
											</TableRow>
										{/if}
									</TableBody>
								</Table>
							</CardContent>
						</Card>

						<div class="grid gap-6 lg:grid-cols-2">
							<Card id="servers-panel">
								<CardHeader>
									<CardTitle>服务器</CardTitle>
									<CardDescription>已注册的目标服务器与 provider。</CardDescription>
								</CardHeader>
								<CardContent class="space-y-3">
									{#if servers.length > 0}
										{#each servers as server (server.id)}
											<button
												type="button"
												class={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
													selectedServerId === server.id
														? "border-primary bg-primary/5"
														: "hover:bg-muted/50"
												}`}
												onclick={() => {
													selectedServerId = server.id;
													serverMode = "existing";
												}}
											>
												<div class="flex items-center justify-between gap-3">
													<div>
														<p class="text-sm font-medium">{server.name}</p>
														<p class="text-xs text-muted-foreground">
															{server.host}:{server.port} · {server.providerKey}
														</p>
													</div>
													<Server class="size-4 text-muted-foreground" />
												</div>
											</button>
										{/each}
									{:else}
										<p class="text-sm text-muted-foreground">
											暂无服务器，使用右上角快速部署注册目标服务器。
										</p>
									{/if}
								</CardContent>
							</Card>

							<Card id="environments-panel">
								<CardHeader>
									<CardTitle>环境</CardTitle>
									<CardDescription>当前项目的环境与变量快照入口。</CardDescription>
								</CardHeader>
								<CardContent class="space-y-3">
									{#if visibleEnvironments.length > 0}
										{#each visibleEnvironments as environment (environment.id)}
											<button
												type="button"
												class={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
													selectedEnvironmentId === environment.id
														? "border-primary bg-primary/5"
														: "hover:bg-muted/50"
												}`}
												onclick={() => {
													selectedEnvironmentId = environment.id;
													environmentMode = "existing";
												}}
											>
												<div class="flex items-center justify-between gap-3">
													<div>
														<p class="text-sm font-medium">{environment.name}</p>
														<p class="text-xs text-muted-foreground">
															{environment.kind} · {environment.maskedVariables.length} 个变量
														</p>
													</div>
													<Settings2 class="size-4 text-muted-foreground" />
												</div>
											</button>
										{/each}
									{:else}
										<p class="text-sm text-muted-foreground">
											当前没有环境。使用右上角快速部署添加第一个环境。
										</p>
									{/if}
								</CardContent>
							</Card>
						</div>

						<Card id="deployments-panel">
							<CardHeader>
								<CardTitle>最近部署</CardTitle>
								<CardDescription>查看运行计划、来源和状态。</CardDescription>
							</CardHeader>
							<CardContent class="overflow-x-auto">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>来源</TableHead>
											<TableHead>环境</TableHead>
											<TableHead>服务器</TableHead>
											<TableHead>状态</TableHead>
											<TableHead>时间</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{#if visibleDeployments.length > 0}
											{#each visibleDeployments as deployment (deployment.id)}
												<TableRow>
													<TableCell class="font-medium">
														{deployment.runtimePlan.source.displayName}
													</TableCell>
													<TableCell>{deployment.environmentId}</TableCell>
													<TableCell>{deployment.serverId}</TableCell>
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
												<TableCell colspan={5} class="text-center text-muted-foreground">
													暂无部署记录。
												</TableCell>
											</TableRow>
										{/if}
									</TableBody>
								</Table>
							</CardContent>
						</Card>
					</div>

					<Sheet bind:open={quickDeployOpen}>
						<SheetContent side="right" class="w-full overflow-y-auto sm:max-w-xl">
							<SheetHeader>
								<SheetTitle>快速部署</SheetTitle>
								<SheetDescription>
									按照 source、项目、服务器、环境四个步骤提交一次部署。
								</SheetDescription>
							</SheetHeader>
							<div class="mt-6 space-y-6">
						<Card>
							<CardHeader>
								<CardTitle>快速部署</CardTitle>
								<CardDescription>
									按照 source、项目、服务器、环境四个步骤提交一次部署。
								</CardDescription>
							</CardHeader>
							<CardContent class="space-y-6">
								<div class="space-y-3">
									<div class="flex items-center gap-2 text-sm font-medium">
										<Waypoints class="size-4 text-muted-foreground" />
										<span>来源</span>
									</div>
									<div class="grid gap-2">
										{#each sourceOptions as option (option.key)}
											<button
												type="button"
												class={`flex items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${
													sourceKind === option.key
														? "border-primary bg-primary/5"
														: "hover:bg-muted/50"
												}`}
												onclick={() => {
													sourceKind = option.key;
												}}
											>
												<option.icon class="mt-0.5 size-4 text-muted-foreground" />
												<div class="space-y-1">
													<p class="text-sm font-medium">{option.label}</p>
													<p class="text-xs text-muted-foreground">{option.hint}</p>
												</div>
											</button>
										{/each}
									</div>
									<div class="space-y-2">
										<label class="text-xs font-medium text-muted-foreground" for="source-locator">
											来源地址
										</label>
										{#if sourceKind === "local-folder"}
											<div class="flex gap-2">
												<Input
													id="source-locator"
													class="font-mono text-xs"
													bind:value={localFolderLocator}
													placeholder={sourcePlaceholder}
												/>
												<Button
													type="button"
													variant="outline"
													class="shrink-0"
													disabled={!canChooseNativeLocalFolder}
													title={
														canChooseNativeLocalFolder
															? "选择本地目录"
															: "普通浏览器不能只读取本地路径，请手动输入。"
													}
													onclick={chooseLocalFolder}
												>
													<FolderOpen class="size-4" />
													选择目录
												</Button>
											</div>
											<p class="text-xs text-muted-foreground">
												普通浏览器不会读取本机绝对路径，请直接输入或粘贴；桌面版可只选择并保存路径。
											</p>
											{#if localFolderSelectionNotice}
												<p class="text-xs text-destructive">{localFolderSelectionNotice}</p>
											{/if}
										{:else}
											<Input
												id="source-locator"
												value={sourceLocator}
												oninput={(event) =>
													setSourceLocator((event.currentTarget as HTMLInputElement).value)}
												placeholder={sourcePlaceholder}
											/>
										{/if}
									</div>
								</div>

								{#if sourceKind === "github"}
									<div class="space-y-3">
										<Separator />
										<div class="flex items-center justify-between gap-2">
											<div>
												<p class="text-sm font-medium">GitHub 仓库</p>
												<p class="text-xs text-muted-foreground">
													只有需要导入 GitHub 时才会触发登录。
												</p>
											</div>
											{#if githubConnected}
												<Badge>已连接</Badge>
											{:else}
												<Badge variant="outline">按需授权</Badge>
											{/if}
										</div>

										{#if !githubProvider?.configured}
											<div class="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
												后端尚未配置 GitHub OAuth。
											</div>
										{:else if !githubConnected}
											<Button variant="outline" class="w-full" onclick={connectGitHub}>
												<GitBranch class="size-4" />
												连接 GitHub
											</Button>
										{:else}
											<div class="space-y-3">
												<Input
													bind:value={githubRepositorySearch}
													placeholder="搜索 GitHub 仓库"
												/>
												<div class="max-h-64 space-y-2 overflow-auto rounded-lg border p-2">
													{#if githubRepositoriesQuery.isPending}
														{#each Array.from({ length: 4 }) as _, index (index)}
															<Skeleton class="h-14 w-full" />
														{/each}
													{:else if githubRepositories.length > 0}
														{#each githubRepositories as repository (repository.id)}
															<button
																type="button"
																class={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
																	selectedGitHubRepositoryId === repository.id
																		? "border-primary bg-primary/5"
																		: "hover:bg-muted/50"
																}`}
																onclick={() => applyGitHubRepository(repository)}
															>
																<div class="flex items-start justify-between gap-3">
																	<div>
																		<p class="text-sm font-medium">{repository.fullName}</p>
																		<p class="mt-1 text-xs text-muted-foreground">
																			{repository.description ?? "暂无描述"}
																		</p>
																	</div>
																	<Badge variant="outline">
																		{repository.private ? "private" : "public"}
																	</Badge>
																</div>
															</button>
														{/each}
													{:else}
														<p class="px-2 py-3 text-sm text-muted-foreground">
															当前没有仓库结果。
														</p>
													{/if}
												</div>
											</div>
										{/if}
									</div>
								{/if}

								<div class="space-y-3">
									<Separator />
									<div class="flex items-center gap-2 text-sm font-medium">
										<Package class="size-4 text-muted-foreground" />
										<span>项目</span>
									</div>
									<div class="grid grid-cols-2 gap-2">
										<Button
											variant={projectMode === "existing" ? "default" : "outline"}
											onclick={() => {
												projectMode = "existing";
											}}
										>
											使用已有
										</Button>
										<Button
											variant={projectMode === "new" ? "default" : "outline"}
											onclick={() => {
												projectMode = "new";
											}}
										>
											新建项目
										</Button>
									</div>
									{#if projectMode === "existing"}
										<div class="max-h-44 space-y-2 overflow-auto rounded-lg border p-2">
											{#if projects.length > 0}
												{#each projects as project (project.id)}
													<Button
														class="w-full justify-start"
														size="sm"
														variant={selectedProjectId === project.id ? "default" : "ghost"}
														onclick={() => {
															selectedProjectId = project.id;
														}}
													>
														{project.name}
													</Button>
												{/each}
											{:else}
												<p class="px-2 py-2 text-sm text-muted-foreground">暂无项目可选。</p>
											{/if}
										</div>
									{:else}
										<div class="space-y-3">
										<div class="space-y-2">
											<label class="text-xs font-medium text-muted-foreground" for="project-name">
												项目名
											</label>
											<Input
												id="project-name"
												bind:value={projectName}
												placeholder="platform-control-plane"
											/>
										</div>
										<div class="space-y-2">
											<label class="text-xs font-medium text-muted-foreground" for="project-description">
												描述
											</label>
											<Textarea
												id="project-description"
												bind:value={projectDescription}
												placeholder="描述这个项目要部署什么，运行在谁的服务器上。"
												rows={3}
												/>
											</div>
										</div>
									{/if}
								</div>

								<div class="space-y-3">
									<Separator />
									<div class="flex items-center gap-2 text-sm font-medium">
										<Server class="size-4 text-muted-foreground" />
										<span>服务器</span>
									</div>
									<div class="grid grid-cols-2 gap-2">
										<Button
											variant={serverMode === "existing" ? "default" : "outline"}
											onclick={() => {
												serverMode = "existing";
											}}
										>
											使用已有
										</Button>
										<Button
											variant={serverMode === "new" ? "default" : "outline"}
											onclick={() => {
												serverMode = "new";
											}}
										>
											新建服务器
										</Button>
									</div>
									{#if serverMode === "existing"}
										<div class="max-h-44 space-y-2 overflow-auto rounded-lg border p-2">
											{#if servers.length > 0}
												{#each servers as server (server.id)}
													<Button
														class="w-full justify-start"
														size="sm"
														variant={selectedServerId === server.id ? "default" : "ghost"}
														onclick={() => {
															selectedServerId = server.id;
														}}
													>
														{server.name} · {server.host}
													</Button>
												{/each}
											{:else}
												<p class="px-2 py-2 text-sm text-muted-foreground">暂无服务器可选。</p>
											{/if}
										</div>
									{:else}
										<div class="space-y-3">
											<div class="grid gap-3 sm:grid-cols-2">
												<div class="space-y-2">
													<label class="text-xs font-medium text-muted-foreground" for="server-name">
														名称
													</label>
													<Input id="server-name" bind:value={serverName} placeholder="edge-1" />
												</div>
												<div class="space-y-2">
													<label class="text-xs font-medium text-muted-foreground" for="server-port">
														SSH 端口
													</label>
													<Input id="server-port" bind:value={serverPort} placeholder="22" />
												</div>
											</div>
											<div class="space-y-2">
												<label class="text-xs font-medium text-muted-foreground" for="server-host">
													主机地址
												</label>
												<Input id="server-host" bind:value={serverHost} placeholder="203.0.113.10" />
											</div>
											<div class="space-y-2">
												<p class="text-xs font-medium text-muted-foreground">Provider</p>
												<div class="grid gap-2">
													{#each providerOptions as provider (provider.key)}
														<Button
															class="justify-start"
															size="sm"
															variant={serverProviderKey === provider.key ? "default" : "outline"}
															onclick={() => {
																serverProviderKey = provider.key;
															}}
														>
															{provider.title}
														</Button>
													{/each}
												</div>
											</div>
										</div>
									{/if}
								</div>

								<div class="space-y-3">
									<Separator />
									<div class="flex items-center gap-2 text-sm font-medium">
										<Settings2 class="size-4 text-muted-foreground" />
										<span>环境</span>
									</div>
									<div class="grid grid-cols-2 gap-2">
										<Button
											variant={environmentMode === "existing" ? "default" : "outline"}
											onclick={() => {
												environmentMode = "existing";
											}}
										>
											使用已有
										</Button>
										<Button
											variant={environmentMode === "new" ? "default" : "outline"}
											onclick={() => {
												environmentMode = "new";
											}}
										>
											新建环境
										</Button>
									</div>
									{#if environmentMode === "existing"}
										<div class="max-h-44 space-y-2 overflow-auto rounded-lg border p-2">
											{#if filteredEnvironments.length > 0}
												{#each filteredEnvironments as environment (environment.id)}
													<Button
														class="w-full justify-start"
														size="sm"
														variant={selectedEnvironmentId === environment.id ? "default" : "ghost"}
														onclick={() => {
															selectedEnvironmentId = environment.id;
														}}
													>
														{environment.name} · {environment.kind}
													</Button>
												{/each}
											{:else}
												<p class="px-2 py-2 text-sm text-muted-foreground">暂无环境可选。</p>
											{/if}
										</div>
									{:else}
										<div class="space-y-3">
										<div class="space-y-2">
											<label class="text-xs font-medium text-muted-foreground" for="environment-name">
												环境名
											</label>
											<Input
												id="environment-name"
												bind:value={environmentName}
												placeholder="production"
											/>
										</div>
										<div class="space-y-2">
											<p class="text-xs font-medium text-muted-foreground">环境类型</p>
											<div class="grid grid-cols-2 gap-2">
													{#each environmentKinds as kind (kind)}
														<Button
															size="sm"
															variant={environmentKind === kind ? "default" : "outline"}
															onclick={() => {
																environmentKind = kind;
															}}
														>
															{kind}
														</Button>
													{/each}
												</div>
											</div>
										</div>
									{/if}
								</div>

								<div class="space-y-3">
									<Separator />
									<div class="flex items-center gap-2 text-sm font-medium">
										<TerminalSquare class="size-4 text-muted-foreground" />
										<span>首个变量</span>
									</div>
									<div class="space-y-3">
										<div class="grid gap-3 sm:grid-cols-2">
											<div class="space-y-2">
												<label class="text-xs font-medium text-muted-foreground" for="variable-key">
													Key
												</label>
												<Input
													id="variable-key"
													bind:value={variableKey}
													placeholder="DATABASE_URL"
												/>
											</div>
											<div class="space-y-2">
												<label class="text-xs font-medium text-muted-foreground" for="variable-value">
													Value
												</label>
												<Input
													id="variable-value"
													bind:value={variableValue}
													placeholder="postgres://..."
												/>
											</div>
										</div>
										<Button
											variant={variableIsSecret ? "default" : "outline"}
											size="sm"
											onclick={() => {
												variableIsSecret = !variableIsSecret;
											}}
										>
											{variableIsSecret ? "作为 Secret 存储" : "作为普通配置存储"}
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>

						{#if selectedGitHubRepository}
							<Card>
								<CardHeader>
									<CardTitle>已选择仓库</CardTitle>
									<CardDescription>仓库信息会自动回填到部署表单。</CardDescription>
								</CardHeader>
								<CardContent class="space-y-3 text-sm">
									<div class="flex items-center justify-between gap-3">
										<span class="text-muted-foreground">仓库</span>
										<span class="font-medium">{selectedGitHubRepository.fullName}</span>
									</div>
									<div class="flex items-center justify-between gap-3">
										<span class="text-muted-foreground">默认分支</span>
										<span class="font-medium">{selectedGitHubRepository.defaultBranch}</span>
									</div>
									<div class="flex items-center justify-between gap-3">
										<span class="text-muted-foreground">克隆地址</span>
										<span class="truncate font-mono text-xs">{selectedGitHubRepository.cloneUrl}</span>
									</div>
								</CardContent>
							</Card>
						{/if}

						<Card>
							<CardHeader>
								<CardTitle>提交摘要</CardTitle>
								<CardDescription>这次提交会创建或复用哪些资源。</CardDescription>
							</CardHeader>
							<CardContent class="space-y-3 text-sm">
								<div class="flex items-center justify-between gap-3">
									<span class="text-muted-foreground">来源类型</span>
									<span class="font-medium">
										{sourceOptions.find((option) => option.key === sourceKind)?.label}
									</span>
								</div>
								<div class="flex items-center justify-between gap-3">
									<span class="text-muted-foreground">来源地址</span>
									<span class="truncate font-mono text-xs">{sourceLocator || "未填写"}</span>
								</div>
								<div class="flex items-center justify-between gap-3">
									<span class="text-muted-foreground">项目</span>
									<span class="font-medium">
										{projectMode === "existing"
											? selectedProject?.name ?? "未选择"
											: projectName || "待创建"}
									</span>
								</div>
								<div class="flex items-center justify-between gap-3">
									<span class="text-muted-foreground">服务器</span>
									<span class="font-medium">
										{serverMode === "existing"
											? selectedServer?.name ?? "未选择"
											: serverName || "待创建"}
									</span>
								</div>
								<div class="flex items-center justify-between gap-3">
									<span class="text-muted-foreground">环境</span>
									<span class="font-medium">
										{environmentMode === "existing"
											? selectedEnvironment?.name ?? "未选择"
											: environmentName || "待创建"}
									</span>
								</div>
							</CardContent>
							<CardFooter class="flex-col items-stretch gap-3">
								<Button class="w-full" disabled={deployPending} onclick={handleQuickDeploy}>
									{#if deployPending}
										<LoaderCircle class="size-4 animate-spin" />
										正在提交
									{:else}
										<Play class="size-4" />
										创建并部署
									{/if}
								</Button>
								<pre class="overflow-x-auto rounded-md border bg-muted px-3 py-3 text-xs text-muted-foreground">{deploymentCommandPreview}</pre>
							</CardFooter>
						</Card>

						{#if deployFeedback}
							<Card class={deployFeedback.kind === "success" ? "border-primary/30" : "border-destructive/30"}>
								<CardHeader>
									<CardTitle class="flex items-center gap-2 text-base">
										{#if deployFeedback.kind === "success"}
											<CheckCircle2 class="size-4" />
										{:else}
											<ShieldCheck class="size-4" />
										{/if}
										{deployFeedback.title}
									</CardTitle>
								</CardHeader>
								<CardContent>
									<p class="text-sm text-muted-foreground">{deployFeedback.detail}</p>
								</CardContent>
							</Card>
						{/if}
							</div>
						</SheetContent>
					</Sheet>
				</div>
			{/if}
		</div>
	</SidebarInset>
</SidebarProvider>
