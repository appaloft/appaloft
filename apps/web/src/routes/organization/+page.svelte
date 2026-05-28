<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import {
    BookOpen,
    KeyRound,
    MailPlus,
    RotateCw,
    ShieldCheck,
    Trash2,
    UserPlus,
    UsersRound,
  } from "@lucide/svelte";
  import type { OrganizationTeamRole } from "@appaloft/contracts";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";

  import ManagementShell from "$lib/components/console/ManagementShell.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { Textarea } from "$lib/components/ui/textarea";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import { formatTime } from "$lib/console/utils";
  import { readErrorMessage } from "$lib/api/client";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";
  import { i18nKeys, t } from "$lib/i18n";

  type DeployTokenWorkflow = "preview-cleanup" | "server-config-deploy" | "source-link-deploy";
  type OrganizationManagementSection = "overview" | "members" | "invitations" | "deploy-tokens";
  type Props = {
    section?: OrganizationManagementSection | null;
  };

  const roleOptions = ["owner", "admin", "developer", "billing", "viewer"] as const;
  const workflowOptions = [
    "source-link-deploy",
    "server-config-deploy",
    "preview-cleanup",
  ] as const;
  const sectionOptions = [
    {
      value: "overview",
      href: "/organization",
      labelKey: i18nKeys.console.organization.overviewTitle,
    },
    {
      value: "members",
      href: "/organization/members",
      labelKey: i18nKeys.console.organization.membersTitle,
    },
    {
      value: "invitations",
      href: "/organization/invitations",
      labelKey: i18nKeys.console.organization.invitationsTitle,
    },
    {
      value: "deploy-tokens",
      href: "/organization/deploy-tokens",
      labelKey: i18nKeys.console.organization.deployTokensTitle,
    },
  ] as const satisfies ReadonlyArray<{
    value: OrganizationManagementSection;
    href: string;
    labelKey: string;
  }>;

  let inviteEmail = $state("");
  let inviteRole = $state<OrganizationTeamRole>("developer");
  let tokenName = $state("");
  let tokenWorkflow = $state<DeployTokenWorkflow>("source-link-deploy");
  let tokenRepositoryFullName = $state("");
  let createdTokenSecret = $state("");
  let operationNotice = $state("");
  let operationError = $state("");
  let selectedOrganizationId = $state("");
  let roleDrafts = $state<Record<string, OrganizationTeamRole>>({});
  let { section = null }: Props = $props();

  const contextQuery = createQuery(() =>
    queryOptions({
      queryKey: ["organizations", "current-context"],
      queryFn: () => orpcClient.organizations.currentContext({}),
      enabled: browser,
      retry: 0,
    }),
  );

  const context = $derived(contextQuery.data ?? null);
  const currentOrganization = $derived(context?.currentOrganization ?? null);
  const currentOrganizationId = $derived(currentOrganization?.organizationId ?? "");
  const currentRole = $derived(currentOrganization?.role ?? "viewer");
  const activeSection = $derived.by<OrganizationManagementSection>(() => {
    if (section) {
      return section;
    }

    if (page.url.pathname.endsWith("/members")) {
      return "members";
    }
    if (page.url.pathname.endsWith("/invitations")) {
      return "invitations";
    }
    if (page.url.pathname.endsWith("/deploy-tokens")) {
      return "deploy-tokens";
    }

    const querySection = page.url.searchParams.get("section");
    if (
      querySection === "members" ||
      querySection === "invitations" ||
      querySection === "deploy-tokens" ||
      querySection === "overview"
    ) {
      return querySection;
    }

    return "overview";
  });
  const canManageByRole = $derived(currentRole === "owner" || currentRole === "admin");
  const canListMembers = $derived(context?.permissions?.canListMembers ?? canManageByRole);
  const canInviteMembers = $derived(context?.permissions?.canInviteMembers ?? canManageByRole);
  const canUpdateMemberRoles = $derived(context?.permissions?.canUpdateMemberRoles ?? canManageByRole);
  const canRemoveMembers = $derived(context?.permissions?.canRemoveMembers ?? canManageByRole);
  const canManageDeployTokens = $derived(
    context?.permissions?.canManageDeployTokens ?? canManageByRole,
  );

  const membersQuery = createQuery(() =>
    queryOptions({
      queryKey: ["organizations", currentOrganizationId, "members"],
      queryFn: () =>
        currentOrganizationId
          ? orpcClient.organizations.listMembers({ organizationId: currentOrganizationId, limit: 100 })
          : { items: [] },
      enabled: browser && Boolean(currentOrganizationId) && canListMembers,
    }),
  );

  const invitationsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["organizations", currentOrganizationId, "invitations"],
      queryFn: () =>
        currentOrganizationId
          ? orpcClient.organizations.listInvitations({
              organizationId: currentOrganizationId,
              limit: 100,
            })
          : { items: [] },
      enabled: browser && Boolean(currentOrganizationId) && canListMembers,
    }),
  );

  const deployTokensQuery = createQuery(() =>
    queryOptions({
      queryKey: ["deploy-tokens", currentOrganizationId],
      queryFn: () =>
        currentOrganizationId
          ? orpcClient.deployTokens.list({ organizationId: currentOrganizationId, limit: 100 })
          : { items: [] },
      enabled: browser && Boolean(currentOrganizationId) && canManageDeployTokens,
    }),
  );

  const inviteMemberMutation = createMutation(() => ({
    mutationFn: () =>
      orpcClient.organizations.inviteMember({
        organizationId: currentOrganizationId,
        email: inviteEmail,
        role: inviteRole,
      }),
    onSuccess: () => {
      inviteEmail = "";
      createdTokenSecret = "";
      operationError = "";
      operationNotice = $t(i18nKeys.console.organization.inviteSucceeded);
      void queryClient.invalidateQueries({ queryKey: ["organizations", currentOrganizationId] });
    },
    onError: (error) => {
      operationNotice = "";
      operationError = readErrorMessage(error);
    },
  }));

  const switchCurrentOrganizationMutation = createMutation(() => ({
    mutationFn: () =>
      orpcClient.organizations.switchCurrent({ organizationId: selectedOrganizationId }),
    onSuccess: (result) => {
      selectedOrganizationId = result.currentOrganization.organizationId;
      createdTokenSecret = "";
      operationError = "";
      operationNotice = $t(i18nKeys.console.organization.switchSucceeded);
      void queryClient.invalidateQueries({ queryKey: ["organizations"] });
      void queryClient.invalidateQueries({ queryKey: ["deploy-tokens"] });
    },
    onError: (error) => {
      operationNotice = "";
      operationError = readErrorMessage(error);
    },
  }));


  const updateMemberRoleMutation = createMutation(() => ({
    mutationFn: (input: { memberId: string; role: OrganizationTeamRole }) =>
      orpcClient.organizations.updateMemberRole({
        organizationId: currentOrganizationId,
        memberId: input.memberId,
        role: input.role,
      }),
    onSuccess: () => {
      operationError = "";
      operationNotice = $t(i18nKeys.console.organization.roleUpdated);
      void queryClient.invalidateQueries({ queryKey: ["organizations", currentOrganizationId] });
    },
    onError: (error) => {
      operationNotice = "";
      operationError = readErrorMessage(error);
    },
  }));

  const removeMemberMutation = createMutation(() => ({
    mutationFn: (memberId: string) =>
      orpcClient.organizations.removeMember({ organizationId: currentOrganizationId, memberId }),
    onSuccess: () => {
      operationError = "";
      operationNotice = $t(i18nKeys.console.organization.memberRemoved);
      void queryClient.invalidateQueries({ queryKey: ["organizations", currentOrganizationId] });
    },
    onError: (error) => {
      operationNotice = "";
      operationError = readErrorMessage(error);
    },
  }));

  const createDeployTokenMutation = createMutation(() => ({
    mutationFn: () =>
      orpcClient.deployTokens.create({
        organizationId: currentOrganizationId,
        displayName: tokenName,
        scope: {
          repositoryFullNames: tokenRepositoryFullName.trim()
            ? [tokenRepositoryFullName.trim()]
            : undefined,
          workflowCommands: [tokenWorkflow],
        },
      }),
    onSuccess: (result) => {
      tokenName = "";
      tokenRepositoryFullName = "";
      createdTokenSecret = result.token;
      operationError = "";
      operationNotice = $t(i18nKeys.console.organization.tokenCreated);
      void queryClient.invalidateQueries({ queryKey: ["deploy-tokens", currentOrganizationId] });
    },
    onError: (error) => {
      operationNotice = "";
      operationError = readErrorMessage(error);
    },
  }));

  const rotateDeployTokenMutation = createMutation(() => ({
    mutationFn: (tokenId: string) =>
      orpcClient.deployTokens.rotate({
        organizationId: currentOrganizationId,
        tokenId,
        confirmation: { tokenId },
      }),
    onSuccess: (result) => {
      createdTokenSecret = result.token;
      operationError = "";
      operationNotice = $t(i18nKeys.console.organization.tokenRotated);
      void queryClient.invalidateQueries({ queryKey: ["deploy-tokens", currentOrganizationId] });
    },
    onError: (error) => {
      operationNotice = "";
      operationError = readErrorMessage(error);
    },
  }));

  const revokeDeployTokenMutation = createMutation(() => ({
    mutationFn: (tokenId: string) =>
      orpcClient.deployTokens.revoke({
        organizationId: currentOrganizationId,
        tokenId,
        confirmation: { tokenId },
      }),
    onSuccess: () => {
      createdTokenSecret = "";
      operationError = "";
      operationNotice = $t(i18nKeys.console.organization.tokenRevoked);
      void queryClient.invalidateQueries({ queryKey: ["deploy-tokens", currentOrganizationId] });
    },
    onError: (error) => {
      operationNotice = "";
      operationError = readErrorMessage(error);
    },
  }));

  const members = $derived(membersQuery.data?.items ?? []);
  const invitations = $derived(invitationsQuery.data?.items ?? []);
  const deployTokens = $derived(deployTokensQuery.data?.items ?? []);
  const loading = $derived(
    contextQuery.isPending ||
      membersQuery.isPending ||
      invitationsQuery.isPending ||
      deployTokensQuery.isPending,
  );
  const canSubmitInvite = $derived(
    Boolean(currentOrganizationId) &&
      canInviteMembers &&
      inviteEmail.trim().length > 0 &&
      !inviteMemberMutation.isPending,
  );
  const canSubmitToken = $derived(
    Boolean(currentOrganizationId) &&
      canManageDeployTokens &&
      tokenName.trim().length > 0 &&
      !createDeployTokenMutation.isPending,
  );
  const canSwitchOrganization = $derived(
    Boolean(selectedOrganizationId) &&
      selectedOrganizationId !== currentOrganizationId &&
      !switchCurrentOrganizationMutation.isPending,
  );

  $effect(() => {
    for (const member of members) {
      roleDrafts[member.memberId] ??= member.role;
    }
  });

  $effect(() => {
    if (currentOrganizationId && !selectedOrganizationId) {
      selectedOrganizationId = currentOrganizationId;
    }
  });

  function roleLabel(role: OrganizationTeamRole): string {
    switch (role) {
      case "owner":
        return $t(i18nKeys.console.organization.roleOwner);
      case "admin":
        return $t(i18nKeys.console.organization.roleAdmin);
      case "billing":
        return $t(i18nKeys.console.organization.roleBilling);
      case "developer":
        return $t(i18nKeys.console.organization.roleDeveloper);
      case "viewer":
        return $t(i18nKeys.console.organization.roleViewer);
    }
  }

  function workflowLabel(workflow: DeployTokenWorkflow): string {
    switch (workflow) {
      case "preview-cleanup":
        return $t(i18nKeys.console.organization.workflowPreviewCleanup);
      case "server-config-deploy":
        return $t(i18nKeys.console.organization.workflowServerConfigDeploy);
      case "source-link-deploy":
        return $t(i18nKeys.console.organization.workflowSourceLinkDeploy);
    }
  }

  function submitInvite(event: SubmitEvent): void {
    event.preventDefault();
    if (canSubmitInvite) {
      inviteMemberMutation.mutate();
    }
  }

  function submitDeployToken(event: SubmitEvent): void {
    event.preventDefault();
    if (canSubmitToken) {
      createDeployTokenMutation.mutate();
    }
  }

  function submitOrganizationSwitch(event: SubmitEvent): void {
    event.preventDefault();
    if (canSwitchOrganization) {
      switchCurrentOrganizationMutation.mutate();
    }
  }

  function updateMemberRole(memberId: string): void {
    const role = roleDrafts[memberId];
    if (role && canUpdateMemberRoles) {
      updateMemberRoleMutation.mutate({ memberId, role });
    }
  }

  function removeMember(memberId: string): void {
    if (!browser || !canRemoveMembers) {
      return;
    }
    if (window.confirm($t(i18nKeys.console.organization.removeMemberConfirm, { memberId }))) {
      removeMemberMutation.mutate(memberId);
    }
  }

  function rotateDeployToken(tokenId: string): void {
    if (!browser || !canManageDeployTokens) {
      return;
    }
    if (window.confirm($t(i18nKeys.console.organization.rotateConfirm, { tokenId }))) {
      rotateDeployTokenMutation.mutate(tokenId);
    }
  }

  function revokeDeployToken(tokenId: string): void {
    if (!browser || !canManageDeployTokens) {
      return;
    }
    if (window.confirm($t(i18nKeys.console.organization.revokeConfirm, { tokenId }))) {
      revokeDeployTokenMutation.mutate(tokenId);
    }
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.organization.pageTitle)} · Appaloft</title>
</svelte:head>

<ManagementShell
  title={$t(i18nKeys.console.organization.pageTitle)}
  description={$t(i18nKeys.console.organization.pageDescription)}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.home), href: "/" },
    { label: $t(i18nKeys.console.organization.pageTitle) },
  ]}
>
  {#if loading}
    <div class="space-y-5">
      <Skeleton class="h-5 w-40" />
      <Skeleton class="h-28 w-full" />
      <Skeleton class="h-52 w-full" />
    </div>
  {:else if contextQuery.error}
    <section class="console-panel space-y-4 p-5">
      <div class="space-y-2">
        <h2 class="text-lg font-semibold">{$t(i18nKeys.console.organization.unauthenticatedTitle)}</h2>
        <p class="text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.organization.unauthenticatedBody)}
        </p>
        <p class="text-sm text-destructive">{readErrorMessage(contextQuery.error)}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button href="/login" variant="outline">{$t(i18nKeys.console.authBootstrap.signIn)}</Button>
        <Button href={webDocsHrefs.organizationTeamManagement} target="_blank" variant="outline">
          <BookOpen class="size-4" />
          {$t(i18nKeys.console.organization.docsLink)}
        </Button>
      </div>
    </section>
  {:else if context && currentOrganization}
    <div class="space-y-8">
      <section class="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div class="max-w-2xl space-y-2">
          <h1 class="text-2xl font-semibold">{$t(i18nKeys.console.organization.focusTitle)}</h1>
          <p class="text-sm leading-6 text-muted-foreground">
            {$t(i18nKeys.console.organization.focusDescription)}
          </p>
        </div>
        <div class="console-metric-strip grid-cols-3 text-center md:min-w-96">
          <div>
            <p class="text-xl font-semibold">{members.length}</p>
            <p class="mt-1 text-xs text-muted-foreground">{$t(i18nKeys.console.organization.membersTitle)}</p>
          </div>
          <div>
            <p class="text-xl font-semibold">{invitations.length}</p>
            <p class="mt-1 text-xs text-muted-foreground">{$t(i18nKeys.console.organization.invitationsTitle)}</p>
          </div>
          <div>
            <p class="text-xl font-semibold">{deployTokens.length}</p>
            <p class="mt-1 text-xs text-muted-foreground">{$t(i18nKeys.console.organization.deployTokensTitle)}</p>
          </div>
        </div>
      </section>

      {#if operationNotice || operationError || createdTokenSecret}
        <section class="console-panel space-y-3 p-4">
          {#if operationNotice}
            <p class="text-sm font-medium">{operationNotice}</p>
          {/if}
          {#if operationError}
            <p class="text-sm text-destructive">{operationError}</p>
          {/if}
          {#if createdTokenSecret}
            <div class="space-y-2">
              <p class="text-sm text-muted-foreground">
                {$t(i18nKeys.console.organization.tokenCreatedSecret)}
              </p>
              <Textarea readonly value={createdTokenSecret} class="font-mono text-xs" />
            </div>
          {/if}
        </section>
      {/if}

      <nav class="flex flex-wrap gap-2" aria-label={$t(i18nKeys.console.organization.pageTitle)}>
        {#each sectionOptions as section (section.value)}
          <Button
            href={section.href}
            size="sm"
            variant={activeSection === section.value ? "selected" : "outline"}
          >
            {$t(section.labelKey)}
          </Button>
        {/each}
      </nav>

      {#if activeSection === "overview"}
      <section class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div class="console-panel p-5">
          <div class="flex items-center gap-3">
            <ShieldCheck class="size-5 text-primary" />
            <h2 class="text-lg font-semibold">
              {$t(i18nKeys.console.organization.currentOrganizationTitle)}
            </h2>
          </div>
          <div class="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.name)}</p>
              <p class="mt-1 font-medium">{currentOrganization.name}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.slug)}</p>
              <p class="mt-1 font-mono">{currentOrganization.slug}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.console.organization.organizationId)}</p>
              <p class="mt-1 break-all font-mono">{currentOrganization.organizationId}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.console.organization.currentRole)}</p>
              <p class="mt-1 font-medium">{roleLabel(currentOrganization.role)}</p>
            </div>
          </div>
          <div class="mt-4 flex flex-wrap gap-2">
            {#each context.organizations as organization (organization.organizationId)}
              <Badge variant={organization.organizationId === currentOrganizationId ? "default" : "outline"}>
                {organization.name} · {roleLabel(organization.role)}
              </Badge>
            {/each}
          </div>
          {#if context.organizations.length > 1}
            <form class="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end" onsubmit={submitOrganizationSwitch}>
              <label class="min-w-0 flex-1 space-y-1.5 text-sm font-medium">
                <span>{$t(i18nKeys.console.organization.switchTitle)}</span>
                <Select.Root
                  bind:value={selectedOrganizationId}
                  disabled={switchCurrentOrganizationMutation.isPending}
                  type="single"
                >
                  <Select.Trigger class="w-full">
                    {context.organizations.find(
                      (organization) => organization.organizationId === selectedOrganizationId,
                    )?.name ?? currentOrganization.name}
                  </Select.Trigger>
                  <Select.Content>
                    {#each context.organizations as organization (organization.organizationId)}
                      <Select.Item value={organization.organizationId}>
                        {organization.name} · {roleLabel(organization.role)}
                      </Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </label>
              <Button disabled={!canSwitchOrganization} type="submit" variant="outline">
                <RotateCw class="size-4" />
                {switchCurrentOrganizationMutation.isPending
                  ? $t(i18nKeys.console.organization.switchingAction)
                  : $t(i18nKeys.console.organization.switchAction)}
              </Button>
            </form>
            <p class="mt-2 text-xs leading-5 text-muted-foreground">
              {$t(i18nKeys.console.organization.switchDescription)}
            </p>
          {/if}
        </div>

        <div class="console-panel p-5">
          <div class="flex items-center gap-3">
            <UsersRound class="size-5 text-primary" />
            <h2 class="text-lg font-semibold">{$t(i18nKeys.console.organization.currentUserTitle)}</h2>
          </div>
          <div class="mt-4 space-y-3 text-sm">
            <div>
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.name)}</p>
              <p class="mt-1 font-medium">
                {context.user.displayName ?? $t(i18nKeys.console.organization.noDisplayName)}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.console.organization.email)}</p>
              <p class="mt-1 break-all">{context.user.email}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.console.organization.loginMethodsTitle)}</p>
              <div class="mt-2 flex flex-wrap gap-2">
                {#each context.loginMethods as method (method.key)}
                  <Badge variant={method.enabled ? "outline" : "secondary"}>
                    {method.key} · {method.enabled
                      ? $t(i18nKeys.console.organization.methodEnabled)
                      : $t(i18nKeys.console.organization.methodDisabled)}
                  </Badge>
                {/each}
              </div>
            </div>
          </div>
        </div>
      </section>
      {/if}

      {#if !canInviteMembers && !canUpdateMemberRoles && !canManageDeployTokens}
        <section class="console-panel space-y-2 p-5">
          <h2 class="text-lg font-semibold">{$t(i18nKeys.console.organization.permissionDeniedTitle)}</h2>
          <p class="text-sm leading-6 text-muted-foreground">
            {$t(i18nKeys.console.organization.permissionDeniedBody)}
          </p>
        </section>
      {/if}

      {#if activeSection === "members"}
      <section class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div class="space-y-3">
          <div>
            <h2 class="text-lg font-semibold">{$t(i18nKeys.console.organization.membersTitle)}</h2>
            <p class="mt-1 text-sm text-muted-foreground">
              {$t(i18nKeys.console.organization.membersDescription)}
            </p>
          </div>
          <div class="console-record-list">
            {#if members.length === 0}
              <div class="console-record-row text-sm text-muted-foreground">
                {$t(i18nKeys.console.organization.emptyMembers)}
              </div>
            {:else}
              {#each members as member (member.memberId)}
                <div class="console-record-row gap-4 lg:grid-cols-[minmax(0,1fr)_13rem_auto] lg:items-center">
                  <div class="min-w-0 space-y-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <h3 class="truncate text-base font-semibold">
                        {member.displayName ?? member.email ?? member.userId}
                      </h3>
                      <Badge variant="outline">{roleLabel(member.role)}</Badge>
                    </div>
                    <p class="break-all text-sm text-muted-foreground">
                      {member.email ?? member.userId}
                    </p>
                    <p class="text-xs text-muted-foreground">
                      {$t(i18nKeys.console.organization.joinedAt)} · {formatTime(member.joinedAt)}
                    </p>
                  </div>
                  <Select.Root
                    bind:value={roleDrafts[member.memberId]}
                    disabled={!canUpdateMemberRoles || updateMemberRoleMutation.isPending}
                    type="single"
                  >
                    <Select.Trigger class="w-full">
                      {roleLabel(roleDrafts[member.memberId] ?? member.role)}
                    </Select.Trigger>
                    <Select.Content>
                      {#each roleOptions as role (role)}
                        <Select.Item value={role}>{roleLabel(role)}</Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                  <div class="flex flex-wrap gap-2">
                    <Button
                      disabled={!canUpdateMemberRoles || updateMemberRoleMutation.isPending}
                      onclick={() => updateMemberRole(member.memberId)}
                      size="sm"
                      variant="outline"
                    >
                      {updateMemberRoleMutation.isPending
                        ? $t(i18nKeys.console.organization.updatingRole)
                        : $t(i18nKeys.console.organization.updateRole)}
                    </Button>
                    <Button
                      disabled={!canRemoveMembers || removeMemberMutation.isPending}
                      onclick={() => removeMember(member.memberId)}
                      size="sm"
                      variant="destructive"
                    >
                      <Trash2 class="size-3.5" />
                      {removeMemberMutation.isPending
                        ? $t(i18nKeys.console.organization.removingMember)
                        : $t(i18nKeys.console.organization.removeMember)}
                    </Button>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>

        <form class="console-panel h-fit space-y-4 p-5" onsubmit={submitInvite}>
          <div class="space-y-2">
            <div class="flex items-center gap-2">
              <MailPlus class="size-5 text-primary" />
              <h2 class="text-lg font-semibold">{$t(i18nKeys.console.organization.inviteTitle)}</h2>
            </div>
            <p class="text-sm leading-6 text-muted-foreground">
              {$t(i18nKeys.console.organization.inviteDescription)}
            </p>
          </div>
          <label class="space-y-1.5 text-sm font-medium">
            <span>{$t(i18nKeys.console.organization.emailLabel)}</span>
            <Input bind:value={inviteEmail} disabled={!canInviteMembers} type="email" />
          </label>
          <label class="space-y-1.5 text-sm font-medium">
            <span>{$t(i18nKeys.console.organization.roleLabel)}</span>
            <Select.Root bind:value={inviteRole} disabled={!canInviteMembers} type="single">
              <Select.Trigger class="w-full">{roleLabel(inviteRole)}</Select.Trigger>
              <Select.Content>
                {#each roleOptions as role (role)}
                  <Select.Item value={role}>{roleLabel(role)}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </label>
          <p class="text-xs leading-5 text-muted-foreground">
            {$t(i18nKeys.console.organization.ownerSafetyNotice)}
          </p>
          <Button disabled={!canSubmitInvite} type="submit">
            <UserPlus class="size-4" />
            {inviteMemberMutation.isPending
              ? $t(i18nKeys.console.organization.inviting)
              : $t(i18nKeys.console.organization.inviteAction)}
          </Button>
        </form>
      </section>
      {/if}

      {#if activeSection === "invitations"}
      <section class="space-y-3">
        <div>
          <h2 class="text-lg font-semibold">{$t(i18nKeys.console.organization.invitationsTitle)}</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            {$t(i18nKeys.console.organization.invitationsDescription)}
          </p>
        </div>
        <div class="console-record-list">
          {#if invitations.length === 0}
            <div class="console-record-row text-sm text-muted-foreground">
              {$t(i18nKeys.console.organization.emptyInvitations)}
            </div>
          {:else}
            {#each invitations as invitation (invitation.invitationId)}
              <div class="console-record-row lg:grid-cols-[minmax(0,1fr)_12rem_12rem] lg:items-center">
                <div class="min-w-0">
                  <h3 class="truncate text-base font-semibold">{invitation.email}</h3>
                  <p class="mt-1 text-sm text-muted-foreground">{invitation.invitationId}</p>
                </div>
                <Badge variant="outline">{roleLabel(invitation.role)}</Badge>
                <div class="text-sm text-muted-foreground">
                  {invitation.status} · {formatTime(invitation.createdAt)}
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </section>
      {/if}

      {#if activeSection === "deploy-tokens"}
      <section class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div class="space-y-3">
          <div>
            <h2 class="text-lg font-semibold">{$t(i18nKeys.console.organization.deployTokensTitle)}</h2>
            <p class="mt-1 text-sm text-muted-foreground">
              {$t(i18nKeys.console.organization.deployTokensDescription)}
            </p>
          </div>
          <div class="console-record-list">
            {#if deployTokens.length === 0}
              <div class="console-record-row text-sm text-muted-foreground">
                {$t(i18nKeys.console.organization.emptyTokens)}
              </div>
            {:else}
              {#each deployTokens as token (token.tokenId)}
                <div class="console-record-row gap-4 lg:grid-cols-[minmax(0,1fr)_18rem_auto] lg:items-center">
                  <div class="min-w-0 space-y-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <h3 class="truncate text-base font-semibold">{token.displayName}</h3>
                      <Badge variant={token.status === "active" ? "outline" : "secondary"}>
                        {token.status === "active"
                          ? $t(i18nKeys.console.organization.statusActive)
                          : $t(i18nKeys.console.organization.statusRevoked)}
                      </Badge>
                    </div>
                    <p class="break-all font-mono text-sm text-muted-foreground">{token.tokenId}</p>
                    <p class="text-xs text-muted-foreground">
                      {$t(i18nKeys.console.organization.secretSuffix)} · {token.secretSuffix}
                    </p>
                  </div>
                  <div class="space-y-1 text-sm text-muted-foreground">
                    <p>{$t(i18nKeys.console.organization.createdAt)} · {formatTime(token.createdAt)}</p>
                    <p>
                      {$t(i18nKeys.console.organization.lastUsedAt)} · {token.lastUsedAt
                        ? formatTime(token.lastUsedAt)
                        : $t(i18nKeys.common.status.unknown)}
                    </p>
                    <p>
                      {token.scope.workflowCommands.map((workflow) => workflowLabel(workflow)).join(", ")}
                    </p>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <Button
                      disabled={!canManageDeployTokens || token.status !== "active" || rotateDeployTokenMutation.isPending}
                      onclick={() => rotateDeployToken(token.tokenId)}
                      size="sm"
                      variant="outline"
                    >
                      <RotateCw class="size-3.5" />
                      {rotateDeployTokenMutation.isPending
                        ? $t(i18nKeys.console.organization.rotatingToken)
                        : $t(i18nKeys.console.organization.rotateToken)}
                    </Button>
                    <Button
                      disabled={!canManageDeployTokens || token.status !== "active" || revokeDeployTokenMutation.isPending}
                      onclick={() => revokeDeployToken(token.tokenId)}
                      size="sm"
                      variant="destructive"
                    >
                      {revokeDeployTokenMutation.isPending
                        ? $t(i18nKeys.console.organization.revokingToken)
                        : $t(i18nKeys.console.organization.revokeToken)}
                    </Button>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>

        <form class="console-panel h-fit space-y-4 p-5" onsubmit={submitDeployToken}>
          <div class="space-y-2">
            <div class="flex items-center gap-2">
              <KeyRound class="size-5 text-primary" />
              <h2 class="text-lg font-semibold">{$t(i18nKeys.console.organization.tokenCreateTitle)}</h2>
            </div>
            <p class="text-sm leading-6 text-muted-foreground">
              {$t(i18nKeys.console.organization.tokenCreateDescription)}
            </p>
          </div>
          <label class="space-y-1.5 text-sm font-medium">
            <span>{$t(i18nKeys.console.organization.tokenNameLabel)}</span>
            <Input
              bind:value={tokenName}
              disabled={!canManageDeployTokens}
              placeholder={$t(i18nKeys.console.organization.tokenNamePlaceholder)}
            />
          </label>
          <label class="space-y-1.5 text-sm font-medium">
            <span>{$t(i18nKeys.console.organization.workflowLabel)}</span>
            <Select.Root bind:value={tokenWorkflow} disabled={!canManageDeployTokens} type="single">
              <Select.Trigger class="w-full">{workflowLabel(tokenWorkflow)}</Select.Trigger>
              <Select.Content>
                {#each workflowOptions as workflow (workflow)}
                  <Select.Item value={workflow}>{workflowLabel(workflow)}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </label>
          <label class="space-y-1.5 text-sm font-medium">
            <span>{$t(i18nKeys.console.organization.repositoryScopeLabel)}</span>
            <Input
              bind:value={tokenRepositoryFullName}
              disabled={!canManageDeployTokens}
              placeholder={$t(i18nKeys.console.organization.repositoryScopePlaceholder)}
            />
          </label>
          <p class="text-xs leading-5 text-muted-foreground">
            {$t(i18nKeys.console.organization.tokenSecretNotice)}
          </p>
          <Button disabled={!canSubmitToken} type="submit">
            <KeyRound class="size-4" />
            {createDeployTokenMutation.isPending
              ? $t(i18nKeys.console.organization.creatingToken)
              : $t(i18nKeys.console.organization.createToken)}
          </Button>
        </form>
      </section>
      {/if}

      <div class="flex flex-wrap gap-2">
        <Button href={webDocsHrefs.organizationTeamManagement} target="_blank" variant="outline">
          <BookOpen class="size-4" />
          {$t(i18nKeys.console.organization.docsLink)}
        </Button>
      </div>
    </div>
  {/if}
</ManagementShell>
