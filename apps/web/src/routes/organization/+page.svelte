<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    ArrowRight,
    Building2,
    BookOpen,
    FolderOpen,
    KeyRound,
    Pencil,
    RotateCw,
    ShieldCheck,
    ShieldAlert,
    Trash2,
    UserPlus,
    UsersRound,
  } from "@lucide/svelte";
  import type {
    OrganizationInvitationStatus,
    OrganizationMemberSummary,
    OrganizationTeamRole,
    ProductLoginMethodStatus,
    SystemPluginWebExtension,
  } from "@appaloft/contracts";
  import { createMutation, createQuery, queryOptions } from "@tanstack/svelte-query";

  import ConsoleEmptyState from "$lib/components/console/ConsoleEmptyState.svelte";
  import ConsoleOrganizationSwitcher from "$lib/components/console/ConsoleOrganizationSwitcher.svelte";
  import SettingsShell from "$lib/components/console/SettingsShell.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { webDocsHrefs } from "$lib/console/docs-help";
  import { organizationSettingsItems } from "$lib/console/settings-nav";
  import { modalIsOpen, setModalOpen } from "$lib/console/url-modal";
  import { formatTime, projectDetailHref } from "$lib/console/utils";
  import { readErrorMessage, request } from "$lib/api/client";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";
  import { i18nKeys, t } from "$lib/i18n";

  type DeployTokenWorkflow = "preview-cleanup" | "server-config-deploy" | "source-link-deploy";
  type MemberLifecycleAction = "remove" | "restore";
  type DeployTokenLifecycleAction = "rotate" | "revoke";
  type OrganizationManagementSection =
    | "profile"
    | "members"
    | "invitations"
    | "deploy-tokens"
    | "archived-projects"
    | "danger-zone";
  type Props = {
    section?: OrganizationManagementSection | null;
  };
  type SystemPluginWebExtensionsResponse = {
    items: SystemPluginWebExtension[];
  };

  const roleOptions = ["owner", "admin", "developer", "billing", "viewer"] as const;
  const memberRoleOptions = ["admin", "developer", "billing", "viewer"] as const;
  const workflowOptions = [
    "source-link-deploy",
    "server-config-deploy",
    "preview-cleanup",
  ] as const;
  let inviteEmail = $state("");
  let inviteRole = $state<OrganizationTeamRole>("developer");
  let tokenName = $state("");
  let tokenWorkflow = $state<DeployTokenWorkflow>("source-link-deploy");
  let tokenRepositoryFullName = $state("");
  let organizationName = $state("");
  let organizationSlug = $state("");
  let organizationLogoUrl = $state("");
  let deleteConfirmationOrganizationName = $state("");
  let createdTokenSecret = $state("");
  let operationNotice = $state("");
  let operationError = $state("");
  let roleDrafts = $state<Record<string, OrganizationTeamRole>>({});
  let ownerTransferDrafts = $state<Record<string, string>>({});
  let inviteDialogOpen = $state(false);
  let deployTokenCreateDialogOpen = $state(false);
  let organizationProfileDialogOpen = $state(false);
  let memberRoleDialogOpen = $state(false);
  let ownerTransferDialogOpen = $state(false);
  let memberLifecycleDialogOpen = $state(false);
  let deployTokenLifecycleDialogOpen = $state(false);
  let deleteOrganizationDialogOpen = $state(false);
  let selectedMemberRoleMemberId = $state("");
  let selectedOwnerTransferMemberId = $state("");
  let selectedMemberLifecycleMemberId = $state("");
  let selectedMemberLifecycleAction = $state<MemberLifecycleAction | null>(null);
  let selectedDeployTokenId = $state("");
  let selectedDeployTokenLifecycleAction = $state<DeployTokenLifecycleAction | null>(null);
  let { section = null }: Props = $props();

  const contextQuery = createQuery(() =>
    queryOptions({
      queryKey: ["organizations", "current-context"],
      queryFn: () => orpcClient.organizations.currentContext({}),
      enabled: browser,
      retry: 0,
      staleTime: 30_000,
    }),
  );
  const webExtensionsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["system-plugins", "web-extensions"],
      queryFn: () => request<SystemPluginWebExtensionsResponse>("/api/system-plugins/web-extensions"),
      enabled: browser,
      staleTime: 30_000,
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
    if (page.url.pathname.endsWith("/archived-projects")) {
      return "archived-projects";
    }
    if (page.url.pathname.endsWith("/danger-zone")) {
      return "danger-zone";
    }

    return "profile";
  });
  const canManageByRole = $derived(currentRole === "owner" || currentRole === "admin");
  const canListMembers = $derived(context?.permissions?.canListMembers ?? canManageByRole);
  const canInviteMembers = $derived(context?.permissions?.canInviteMembers ?? canManageByRole);
  const canUpdateMemberRoles = $derived(context?.permissions?.canUpdateMemberRoles ?? canManageByRole);
  const canRemoveMembers = $derived(context?.permissions?.canRemoveMembers ?? canManageByRole);
  const canTransferOwnership = $derived(
    context?.permissions?.canTransferOwnership ?? canUpdateMemberRoles,
  );
  const canManageDeployTokens = $derived(
    context?.permissions?.canManageDeployTokens ?? canManageByRole,
  );
  const canChangeOrganizationProfile = $derived(currentRole === "owner" || currentRole === "admin");
  const canDeleteOrganization = $derived(currentRole === "owner");
  const shouldLoadOrganizationProfile = $derived(activeSection === "profile");
  const shouldLoadMembers = $derived(activeSection === "profile" || activeSection === "members");
  const shouldLoadInvitations = $derived(
    activeSection === "profile" || activeSection === "invitations",
  );
  const shouldLoadDeployTokens = $derived(
    activeSection === "profile" || activeSection === "deploy-tokens",
  );
  const shouldLoadArchivedProjects = $derived(activeSection === "archived-projects");

  const membersQuery = createQuery(() =>
    queryOptions({
      queryKey: ["organizations", currentOrganizationId, "members"],
      queryFn: () =>
        currentOrganizationId
          ? orpcClient.organizations.listMembers({ organizationId: currentOrganizationId, limit: 100 })
          : { items: [] },
      enabled: browser && Boolean(currentOrganizationId) && canListMembers && shouldLoadMembers,
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
      enabled: browser && Boolean(currentOrganizationId) && canListMembers && shouldLoadInvitations,
    }),
  );

  const deployTokensQuery = createQuery(() =>
    queryOptions({
      queryKey: ["deploy-tokens", currentOrganizationId],
      queryFn: () =>
        currentOrganizationId
          ? orpcClient.deployTokens.list({ organizationId: currentOrganizationId, limit: 100 })
          : { items: [] },
      enabled: browser && Boolean(currentOrganizationId) && canManageDeployTokens && shouldLoadDeployTokens,
    }),
  );

  const profileQuery = createQuery(() =>
    queryOptions({
      queryKey: ["organizations", currentOrganizationId, "profile"],
      queryFn: () =>
        orpcClient.organizations.showProfile({ organizationId: currentOrganizationId }),
      enabled: browser && Boolean(currentOrganizationId) && shouldLoadOrganizationProfile,
    }),
  );
  const archivedProjectsQuery = createQuery(() =>
    queryOptions({
      queryKey: ["projects", { lifecycleStatus: "archived", limit: 100 }],
      queryFn: () => orpcClient.projects.list({ lifecycleStatus: "archived", limit: 100 }),
      enabled: browser && Boolean(currentOrganizationId) && shouldLoadArchivedProjects,
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
      setInviteDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["organizations", currentOrganizationId] });
    },
    onError: (error) => {
      operationNotice = "";
      operationError = readErrorMessage(error);
    },
  }));

  const switchCurrentOrganizationMutation = createMutation(() => ({
    mutationFn: (organizationId: string) =>
      orpcClient.organizations.switchCurrent({ organizationId }),
    onSuccess: (result) => {
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

  const changeOrganizationProfileMutation = createMutation(() => ({
    mutationFn: () =>
      orpcClient.organizations.changeProfile({
        organizationId: currentOrganizationId,
        name: organizationName,
        slug: organizationSlug,
        logoUrl: organizationLogoUrl.trim() ? organizationLogoUrl : null,
      }),
    onSuccess: () => {
      operationError = "";
      operationNotice = $t(i18nKeys.console.organization.profileSaved);
      organizationProfileDialogOpen = false;
      void queryClient.invalidateQueries({ queryKey: ["organizations"] });
      void queryClient.invalidateQueries({
        queryKey: ["organizations", currentOrganizationId, "profile"],
      });
    },
    onError: (error) => {
      operationNotice = "";
      operationError = readErrorMessage(error);
    },
  }));

  const deleteOrganizationMutation = createMutation(() => ({
    mutationFn: () =>
      orpcClient.organizations.delete({
        organizationId: currentOrganizationId,
        confirmation: { organizationId: currentOrganizationId },
      }),
    onSuccess: () => {
      deleteConfirmationOrganizationName = "";
      deleteOrganizationDialogOpen = false;
      operationError = "";
      operationNotice = $t(i18nKeys.console.organization.organizationDeleted);
      void queryClient.invalidateQueries({ queryKey: ["organizations"] });
      if (browser) {
        window.location.href = "/";
      }
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
      memberRoleDialogOpen = false;
      selectedMemberRoleMemberId = "";
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
      setMemberLifecycleDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["organizations", currentOrganizationId] });
    },
    onError: (error) => {
      operationNotice = "";
      operationError = readErrorMessage(error);
    },
  }));

  const reactivateMemberMutation = createMutation(() => ({
    mutationFn: (memberId: string) =>
      orpcClient.organizations.reactivateMember({ organizationId: currentOrganizationId, memberId }),
    onSuccess: () => {
      operationError = "";
      operationNotice = $t(i18nKeys.console.organization.memberRestored);
      setMemberLifecycleDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["organizations", currentOrganizationId] });
    },
    onError: (error) => {
      operationNotice = "";
      operationError = readErrorMessage(error);
    },
  }));

  const transferOwnerMutation = createMutation(() => ({
    mutationFn: (input: { fromMemberId: string; toMemberId: string }) =>
      orpcClient.organizations.transferOwner({
        organizationId: currentOrganizationId,
        fromMemberId: input.fromMemberId,
        toMemberId: input.toMemberId,
    }),
    onSuccess: () => {
      ownerTransferDrafts = {};
      ownerTransferDialogOpen = false;
      selectedOwnerTransferMemberId = "";
      operationError = "";
      operationNotice = $t(i18nKeys.console.organization.transferOwnerSucceeded);
      void queryClient.invalidateQueries({ queryKey: ["organizations"] });
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
      setDeployTokenCreateDialogOpen(false);
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
      setDeployTokenLifecycleDialogOpen(false);
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
      setDeployTokenLifecycleDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["deploy-tokens", currentOrganizationId] });
    },
    onError: (error) => {
      operationNotice = "";
      operationError = readErrorMessage(error);
    },
  }));

  const members = $derived(membersQuery.data?.items ?? []);
  const activeMembers = $derived(members.filter((member) => member.status !== "deactivated"));
  const removedMembers = $derived(members.filter((member) => member.status === "deactivated"));
  const selectedMemberRoleMember = $derived(
    activeMembers.find((member) => member.memberId === selectedMemberRoleMemberId) ?? null,
  );
  const selectedOwnerTransferMember = $derived(
    activeMembers.find((member) => member.memberId === selectedOwnerTransferMemberId) ?? null,
  );
  const selectedMemberLifecycleMember = $derived(
    members.find((member) => member.memberId === selectedMemberLifecycleMemberId) ?? null,
  );
  const invitations = $derived(invitationsQuery.data?.items ?? []);
  const deployTokens = $derived(deployTokensQuery.data?.items ?? []);
  const selectedDeployToken = $derived(
    deployTokens.find((token) => token.tokenId === selectedDeployTokenId) ?? null,
  );
  const archivedProjects = $derived(archivedProjectsQuery.data?.items ?? []);
  const organizationProfile = $derived(profileQuery.data ?? null);
  const organizationProfileLoading = $derived(
    Boolean(currentOrganizationId) &&
      activeSection === "profile" &&
      profileQuery.isPending,
  );
  const profileMetricsLoading = $derived(
    Boolean(currentOrganizationId) &&
      activeSection === "profile" &&
      ((canListMembers && membersQuery.isPending) ||
        (canListMembers && invitationsQuery.isPending) ||
        (canManageDeployTokens && deployTokensQuery.isPending)),
  );
  const membersSectionLoading = $derived(
    Boolean(currentOrganizationId) &&
      activeSection === "members" &&
      canListMembers &&
      membersQuery.isPending,
  );
  const invitationsSectionLoading = $derived(
    Boolean(currentOrganizationId) &&
      activeSection === "invitations" &&
      canListMembers &&
      invitationsQuery.isPending,
  );
  const deployTokensSectionLoading = $derived(
    Boolean(currentOrganizationId) &&
      activeSection === "deploy-tokens" &&
      canManageDeployTokens &&
      deployTokensQuery.isPending,
  );
  const archivedProjectsSectionLoading = $derived(
    Boolean(currentOrganizationId) &&
      activeSection === "archived-projects" &&
      archivedProjectsQuery.isPending,
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
  const canSubmitMemberRole = $derived(
    Boolean(selectedMemberRoleMember) &&
      canUpdateMemberRoles &&
      selectedMemberRoleMember?.role !== "owner" &&
      Boolean(roleDrafts[selectedMemberRoleMember?.memberId ?? ""]) &&
      roleDrafts[selectedMemberRoleMember?.memberId ?? ""] !== selectedMemberRoleMember?.role &&
      !updateMemberRoleMutation.isPending,
  );
  const canSubmitOwnerTransfer = $derived(
    Boolean(selectedOwnerTransferMember) &&
      selectedOwnerTransferMember?.role === "owner" &&
      canTransferOwnership &&
      Boolean(ownerTransferDrafts[selectedOwnerTransferMember?.memberId ?? ""]) &&
      !transferOwnerMutation.isPending,
  );
  const canSubmitMemberLifecycleAction = $derived(
    Boolean(selectedMemberLifecycleMember) &&
      Boolean(selectedMemberLifecycleAction) &&
      canRemoveMembers &&
      (selectedMemberLifecycleAction === "remove"
        ? selectedMemberLifecycleMember?.role !== "owner" &&
          selectedMemberLifecycleMember?.status !== "deactivated" &&
          !removeMemberMutation.isPending
        : selectedMemberLifecycleMember?.status === "deactivated" &&
          !reactivateMemberMutation.isPending),
  );
  const canSubmitDeployTokenLifecycleAction = $derived(
    Boolean(selectedDeployToken) &&
      Boolean(selectedDeployTokenLifecycleAction) &&
      canManageDeployTokens &&
      selectedDeployToken?.status === "active" &&
      (selectedDeployTokenLifecycleAction === "rotate"
        ? !rotateDeployTokenMutation.isPending
        : !revokeDeployTokenMutation.isPending),
  );
  const canSubmitOrganizationProfile = $derived(
    Boolean(currentOrganizationId) &&
      canChangeOrganizationProfile &&
      !changeOrganizationProfileMutation.isPending &&
      (organizationName.trim() !== (organizationProfile?.name ?? currentOrganization?.name ?? "") ||
        organizationSlug.trim() !== (organizationProfile?.slug ?? currentOrganization?.slug ?? "") ||
        organizationLogoUrl.trim() !== (organizationProfile?.logoUrl ?? "")),
  );
  const canSubmitOrganizationDelete = $derived(
    Boolean(currentOrganizationId) &&
      canDeleteOrganization &&
      deleteConfirmationOrganizationName.trim() ===
        (organizationProfile?.name ?? currentOrganization?.name ?? "") &&
      !deleteOrganizationMutation.isPending,
  );

  $effect(() => {
    for (const member of activeMembers) {
      roleDrafts[member.memberId] ??= member.role;
      if (member.role === "owner") {
        const candidates = ownerTransferCandidates(member.memberId);
        if (!candidates.some((candidate) => candidate.memberId === ownerTransferDrafts[member.memberId])) {
          ownerTransferDrafts[member.memberId] = candidates[0]?.memberId ?? "";
        }
      }
    }
  });

  $effect(() => {
    inviteDialogOpen = modalIsOpen(page, "invite-organization-member");
    deployTokenCreateDialogOpen = modalIsOpen(page, "create-deploy-token");
  });

  $effect(() => {
    const profile = organizationProfile;
    if (!profile) {
      return;
    }

    organizationName = profile.name;
    organizationSlug = profile.slug;
    organizationLogoUrl = profile.logoUrl ?? "";
  });

  function openInviteDialog(): void {
    void setModalOpen(page, "invite-organization-member", true);
  }

  function setInviteDialogOpen(open: boolean): void {
    inviteDialogOpen = open;
    void setModalOpen(page, "invite-organization-member", open);
  }

  function openDeployTokenCreateDialog(): void {
    void setModalOpen(page, "create-deploy-token", true);
  }

  function setDeployTokenCreateDialogOpen(open: boolean): void {
    deployTokenCreateDialogOpen = open;
    void setModalOpen(page, "create-deploy-token", open);
  }

  function openOrganizationProfileDialog(): void {
    organizationName = organizationProfile?.name ?? currentOrganization?.name ?? "";
    organizationSlug = organizationProfile?.slug ?? currentOrganization?.slug ?? "";
    organizationLogoUrl = organizationProfile?.logoUrl ?? "";
    operationError = "";
    organizationProfileDialogOpen = true;
  }

  function setOrganizationProfileDialogOpen(open: boolean): void {
    organizationProfileDialogOpen = open;
    if (!open) {
      organizationName = organizationProfile?.name ?? currentOrganization?.name ?? "";
      organizationSlug = organizationProfile?.slug ?? currentOrganization?.slug ?? "";
      organizationLogoUrl = organizationProfile?.logoUrl ?? "";
      operationError = "";
    }
  }

  function openMemberRoleDialog(member: OrganizationMemberSummary): void {
    if (member.role === "owner") {
      return;
    }

    selectedMemberRoleMemberId = member.memberId;
    roleDrafts = {
      ...roleDrafts,
      [member.memberId]: member.role,
    };
    operationError = "";
    memberRoleDialogOpen = true;
  }

  function setMemberRoleDialogOpen(open: boolean): void {
    memberRoleDialogOpen = open;
    if (!open) {
      const memberId = selectedMemberRoleMemberId;
      const member = activeMembers.find((candidate) => candidate.memberId === memberId);
      if (member) {
        roleDrafts = {
          ...roleDrafts,
          [memberId]: member.role,
        };
      }
      selectedMemberRoleMemberId = "";
      operationError = "";
    }
  }

  function openOwnerTransferDialog(member: OrganizationMemberSummary): void {
    if (member.role !== "owner") {
      return;
    }

    const candidates = ownerTransferCandidates(member.memberId);
    selectedOwnerTransferMemberId = member.memberId;
    ownerTransferDrafts = {
      ...ownerTransferDrafts,
      [member.memberId]: ownerTransferDrafts[member.memberId] ?? candidates[0]?.memberId ?? "",
    };
    operationError = "";
    ownerTransferDialogOpen = true;
  }

  function setOwnerTransferDialogOpen(open: boolean): void {
    ownerTransferDialogOpen = open;
    if (!open) {
      selectedOwnerTransferMemberId = "";
      operationError = "";
    }
  }

  function openMemberLifecycleDialog(member: OrganizationMemberSummary): void {
    if (!canRemoveMembers) {
      return;
    }
    if (member.role === "owner") {
      return;
    }

    selectedMemberLifecycleMemberId = member.memberId;
    selectedMemberLifecycleAction = null;
    operationError = "";
    memberLifecycleDialogOpen = true;
  }

  function setMemberLifecycleDialogOpen(open: boolean): void {
    memberLifecycleDialogOpen = open;
    if (!open) {
      selectedMemberLifecycleMemberId = "";
      selectedMemberLifecycleAction = null;
      operationError = "";
    }
  }

  function memberLifecycleDialogTitle(action: MemberLifecycleAction | null): string {
    if (action === "restore") {
      return $t(i18nKeys.console.organization.restoreMemberDialogTitle);
    }
    if (!action) {
      return $t(i18nKeys.console.organization.memberLifecycleDialogTitle);
    }
    return $t(i18nKeys.console.organization.removeMemberDialogTitle);
  }

  function memberLifecycleDialogDescription(action: MemberLifecycleAction | null): string {
    if (action === "restore") {
      return $t(i18nKeys.console.organization.restoreMemberDialogDescription);
    }
    if (!action) {
      return $t(i18nKeys.console.organization.memberLifecycleDialogDescription);
    }
    return $t(i18nKeys.console.organization.removeMemberDialogDescription);
  }

  function submitMemberLifecycleAction(): void {
    const member = selectedMemberLifecycleMember;
    const action = selectedMemberLifecycleAction;
    if (!member || !action || !canSubmitMemberLifecycleAction) {
      return;
    }

    if (action === "restore") {
      reactivateMemberMutation.mutate(member.memberId);
      return;
    }

    removeMemberMutation.mutate(member.memberId);
  }

  function openDeployTokenLifecycleDialog(tokenId: string): void {
    const token = deployTokens.find((candidate) => candidate.tokenId === tokenId);
    if (!token || !canManageDeployTokens || token.status !== "active") {
      return;
    }

    selectedDeployTokenId = tokenId;
    selectedDeployTokenLifecycleAction = null;
    operationError = "";
    deployTokenLifecycleDialogOpen = true;
  }

  function setDeployTokenLifecycleDialogOpen(open: boolean): void {
    deployTokenLifecycleDialogOpen = open;
    if (!open) {
      selectedDeployTokenId = "";
      selectedDeployTokenLifecycleAction = null;
      operationError = "";
    }
  }

  function deployTokenLifecycleDialogTitle(action: DeployTokenLifecycleAction | null): string {
    if (action === "revoke") {
      return $t(i18nKeys.console.organization.revokeTokenDialogTitle);
    }
    if (!action) {
      return $t(i18nKeys.console.organization.tokenLifecycleDialogTitle);
    }
    return $t(i18nKeys.console.organization.rotateTokenDialogTitle);
  }

  function deployTokenLifecycleDialogDescription(action: DeployTokenLifecycleAction | null): string {
    if (action === "revoke") {
      return $t(i18nKeys.console.organization.revokeTokenDialogDescription);
    }
    if (!action) {
      return $t(i18nKeys.console.organization.tokenLifecycleDialogDescription);
    }
    return $t(i18nKeys.console.organization.rotateTokenDialogDescription);
  }

  function openDeleteOrganizationDialog(): void {
    deleteConfirmationOrganizationName = "";
    operationError = "";
    deleteOrganizationDialogOpen = true;
  }

  function setDeleteOrganizationDialogOpen(open: boolean): void {
    deleteOrganizationDialogOpen = open;
    if (!open) {
      deleteConfirmationOrganizationName = "";
    }
  }

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

  function loginMethodLabel(method: ProductLoginMethodStatus["key"]): string {
    switch (method) {
      case "local-password":
        return $t(i18nKeys.console.organization.methodLocalPassword);
      case "github":
        return $t(i18nKeys.console.organization.methodGithub);
      case "google":
        return $t(i18nKeys.console.organization.methodGoogle);
      case "oidc":
        return $t(i18nKeys.console.organization.methodOidc);
    }
  }

  function invitationStatusLabel(status: OrganizationInvitationStatus): string {
    switch (status) {
      case "accepted":
        return $t(i18nKeys.console.organization.statusAccepted);
      case "expired":
        return $t(i18nKeys.console.organization.statusExpired);
      case "pending":
        return $t(i18nKeys.console.organization.statusPending);
      case "revoked":
        return $t(i18nKeys.console.organization.statusRevokedInvitation);
    }
  }

  function memberDisplayLabel(member: OrganizationMemberSummary): string {
    const primary = member.displayName ?? member.email ?? member.userId;
    const secondary = member.email && member.email !== primary ? ` · ${member.email}` : "";
    return `${primary}${secondary}`;
  }

  function ownerTransferCandidates(fromMemberId: string): OrganizationMemberSummary[] {
    return activeMembers.filter(
      (candidate) =>
        candidate.memberId !== fromMemberId &&
        candidate.role !== "owner" &&
        candidate.status !== "deactivated",
    );
  }

  function ownerTransferLabel(fromMemberId: string): string {
    const selectedMember = ownerTransferCandidates(fromMemberId).find(
      (candidate) => candidate.memberId === ownerTransferDrafts[fromMemberId],
    );
    return selectedMember
      ? memberDisplayLabel(selectedMember)
      : $t(i18nKeys.console.organization.transferOwnerPlaceholder);
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

  function switchOrganization(organizationId: string): void {
    if (
      !organizationId ||
      organizationId === currentOrganizationId ||
      switchCurrentOrganizationMutation.isPending
    ) {
      return;
    }

    switchCurrentOrganizationMutation.mutate(organizationId);
  }

  function navigateTo(path: string): void {
    if (browser) {
      void goto(path);
    }
  }

  function submitOrganizationProfile(event: SubmitEvent): void {
    event.preventDefault();
    if (canSubmitOrganizationProfile) {
      changeOrganizationProfileMutation.mutate();
    }
  }

  function submitOrganizationDelete(event: SubmitEvent): void {
    event.preventDefault();
    if (canSubmitOrganizationDelete) {
      deleteOrganizationMutation.mutate();
    }
  }

  function submitMemberRole(event: SubmitEvent): void {
    event.preventDefault();
    if (selectedMemberRoleMember && canSubmitMemberRole) {
      updateMemberRole(selectedMemberRoleMember.memberId);
    }
  }

  function submitOwnerTransfer(event: SubmitEvent): void {
    event.preventDefault();
    if (selectedOwnerTransferMember && canSubmitOwnerTransfer) {
      transferOwner(selectedOwnerTransferMember.memberId);
    }
  }

  function updateMemberRole(memberId: string): void {
    const role = roleDrafts[memberId];
    const member = activeMembers.find((candidate) => candidate.memberId === memberId);
    if (role && role !== "owner" && member?.role !== "owner" && canUpdateMemberRoles) {
      updateMemberRoleMutation.mutate({ memberId, role });
    }
  }

  function transferOwner(fromMemberId: string): void {
    const toMemberId = ownerTransferDrafts[fromMemberId];
    const fromMember = activeMembers.find((candidate) => candidate.memberId === fromMemberId);
    const toMember = activeMembers.find((candidate) => candidate.memberId === toMemberId);
    if (fromMember?.role === "owner" && toMember?.role !== "owner" && toMemberId && canTransferOwnership) {
      transferOwnerMutation.mutate({ fromMemberId, toMemberId });
    }
  }

  function submitDeployTokenLifecycleAction(): void {
    const token = selectedDeployToken;
    const action = selectedDeployTokenLifecycleAction;
    if (!token || !action || !canSubmitDeployTokenLifecycleAction) {
      return;
    }

    if (action === "rotate") {
      rotateDeployTokenMutation.mutate(token.tokenId);
      return;
    }

    revokeDeployTokenMutation.mutate(token.tokenId);
  }

  function centeredOrganizationSectionClass(baseClass: string): string {
    return activeSection === "members" ||
      activeSection === "invitations" ||
      activeSection === "deploy-tokens" ||
      activeSection === "archived-projects"
      ? `mx-auto w-full max-w-6xl ${baseClass}`
      : baseClass;
  }
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.organization.pageTitle)} · Appaloft</title>
</svelte:head>

<SettingsShell
  title={$t(i18nKeys.console.organization.pageTitle)}
  description={$t(i18nKeys.console.organization.pageDescription)}
  groupLabel={$t(i18nKeys.console.organization.pageTitle)}
  activePath={page.url.pathname}
  items={organizationSettingsItems(webExtensionsQuery.data?.items ?? [])}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.home), href: "/" },
    { label: $t(i18nKeys.console.organization.pageTitle) },
  ]}
>
  {#snippet sidebarHeader()}
    <ConsoleOrganizationSwitcher
      {currentOrganization}
      organizations={context?.organizations ?? []}
      pending={switchCurrentOrganizationMutation.isPending}
      onSwitch={switchOrganization}
      onNavigate={navigateTo}
    />
  {/snippet}

  {#if contextQuery.isPending}
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
      {#if activeSection === "profile"}
        <section class="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div class="max-w-2xl space-y-2">
            <h1 class="text-2xl font-semibold">{$t(i18nKeys.console.organization.focusTitle)}</h1>
            <p class="text-sm leading-6 text-muted-foreground">
              {$t(i18nKeys.console.organization.focusDescription)}
            </p>
          </div>
          <div class="console-metric-strip grid-cols-3 text-center md:min-w-96">
            <div>
              {#if profileMetricsLoading}
                <Skeleton class="mx-auto h-7 w-10" />
              {:else}
                <p class="text-xl font-semibold">{members.length}</p>
              {/if}
              <p class="mt-1 text-xs text-muted-foreground">{$t(i18nKeys.console.organization.membersTitle)}</p>
            </div>
            <div>
              {#if profileMetricsLoading}
                <Skeleton class="mx-auto h-7 w-10" />
              {:else}
                <p class="text-xl font-semibold">{invitations.length}</p>
              {/if}
              <p class="mt-1 text-xs text-muted-foreground">{$t(i18nKeys.console.organization.invitationsTitle)}</p>
            </div>
            <div>
              {#if profileMetricsLoading}
                <Skeleton class="mx-auto h-7 w-10" />
              {:else}
                <p class="text-xl font-semibold">{deployTokens.length}</p>
              {/if}
              <p class="mt-1 text-xs text-muted-foreground">{$t(i18nKeys.console.organization.deployTokensTitle)}</p>
            </div>
          </div>
        </section>
      {/if}

      {#if operationNotice || operationError || createdTokenSecret}
        <section class="console-panel space-y-3 p-4" data-organization-operation-notice-display-surface>
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
              <pre
                class="overflow-x-auto rounded-md border bg-muted/30 p-3 text-xs leading-5"
                data-organization-token-secret-display
              ><code class="font-mono">{createdTokenSecret}</code></pre>
            </div>
          {/if}
        </section>
      {/if}

      {#if activeSection === "profile"}
      {#if organizationProfileLoading}
        <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div class="space-y-5">
            <Skeleton class="h-80 w-full" />
            <Skeleton class="h-44 w-full" />
          </div>
          <Skeleton class="h-80 w-full" />
        </div>
      {:else}
      <section class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div class="space-y-5">
          <section
            class="console-panel space-y-5 p-5"
            data-organization-profile-summary
            data-organization-profile-display-surface
          >
            <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div class="flex items-start gap-3">
                <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-2">
                  <Building2 class="size-5 text-primary" />
                </div>
                <div class="min-w-0 space-y-1">
                  <h2 class="text-lg font-semibold">
                    {$t(i18nKeys.console.organization.profileTitle)}
                  </h2>
                  <p class="text-sm leading-6 text-muted-foreground">
                    {$t(i18nKeys.console.organization.profileDescription)}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                class="w-fit shrink-0"
                disabled={!canChangeOrganizationProfile || !currentOrganizationId}
                onclick={openOrganizationProfileDialog}
              >
                <Pencil class="size-4" />
                {$t(i18nKeys.common.actions.edit)}
              </Button>
            </div>

            <dl class="grid gap-4 sm:grid-cols-2">
              <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/20 p-4">
                <dt class="text-xs font-medium text-muted-foreground">
                  {$t(i18nKeys.common.domain.name)}
                </dt>
                <dd class="mt-1 break-words text-sm font-medium">
                  {organizationProfile?.name ?? currentOrganization.name}
                </dd>
              </div>
              <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/20 p-4">
                <dt class="text-xs font-medium text-muted-foreground">
                  {$t(i18nKeys.common.domain.slug)}
                </dt>
                <dd class="mt-1 break-all font-mono text-sm">
                  {organizationProfile?.slug ?? currentOrganization.slug}
                </dd>
              </div>
              <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/20 p-4">
                <dt class="text-xs font-medium text-muted-foreground">
                  {$t(i18nKeys.console.organization.logoUrlLabel)}
                </dt>
                <dd class="mt-1 break-all text-sm font-medium">
                  {organizationProfile?.logoUrl?.trim() || $t(i18nKeys.common.status.notConfigured)}
                </dd>
              </div>
              <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/20 p-4">
                <dt class="text-xs font-medium text-muted-foreground">
                  {$t(i18nKeys.common.domain.source)}
                </dt>
                <dd class="mt-1 text-sm font-medium">
                  {$t(i18nKeys.console.organization.pageTitle)}
                </dd>
              </div>
            </dl>
          </section>

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
                      {loginMethodLabel(method.key)} · {method.enabled
                        ? $t(i18nKeys.console.organization.methodEnabled)
                        : $t(i18nKeys.console.organization.methodDisabled)}
                    </Badge>
                  {/each}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="console-panel h-fit p-5">
          <div class="flex items-center gap-3">
            <ShieldCheck class="size-5 text-primary" />
            <h2 class="text-lg font-semibold">
              {$t(i18nKeys.console.organization.currentOrganizationTitle)}
            </h2>
          </div>
          <div class="mt-4 grid gap-3 text-sm">
            <div>
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.name)}</p>
              <p class="mt-1 font-medium">{organizationProfile?.name ?? currentOrganization.name}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.slug)}</p>
              <p class="mt-1 font-mono">{organizationProfile?.slug ?? currentOrganization.slug}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.console.organization.organizationId)}</p>
              <p class="mt-1 break-all font-mono">{currentOrganization.organizationId}</p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.console.organization.currentRole)}</p>
              <p class="mt-1 font-medium">{roleLabel(currentOrganization.role)}</p>
            </div>
            {#if organizationProfile?.createdAt}
              <div>
                <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.createdAt)}</p>
                <p class="mt-1">{formatTime(organizationProfile.createdAt)}</p>
              </div>
            {/if}
          </div>
          {#if context.organizations.length > 1}
            <div class="mt-5">
              <ConsoleOrganizationSwitcher
                {currentOrganization}
                organizations={context.organizations}
                pending={switchCurrentOrganizationMutation.isPending}
                showManagementLinks={false}
                triggerClass="border bg-background hover:bg-muted"
                collapsedClass=""
                onSwitch={switchOrganization}
              />
            </div>
            <p class="mt-2 text-xs leading-5 text-muted-foreground">
              {$t(i18nKeys.console.organization.switchDescription)}
            </p>
          {/if}
        </div>
      </section>
      {/if}
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
      <section
        class={centeredOrganizationSectionClass("space-y-3")}
        data-organization-members-display-surface
      >
        <div>
          <h2 class="text-lg font-semibold">{$t(i18nKeys.console.organization.membersTitle)}</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            {$t(i18nKeys.console.organization.membersDescription)}
          </p>
        </div>
        {#if membersSectionLoading}
          <div class="console-record-list">
            <div class="console-record-row">
              <Skeleton class="h-12 w-full" />
            </div>
            <div class="console-record-row">
              <Skeleton class="h-12 w-full" />
            </div>
          </div>
        {:else}
        <div class="space-y-5">
          <div class="console-record-list">
            {#if members.length === 0}
              <div class="console-record-row text-sm text-muted-foreground">
                {$t(i18nKeys.console.organization.emptyMembers)}
              </div>
            {:else}
              {#each activeMembers as member (member.memberId)}
                <div class="console-record-row gap-4 lg:grid-cols-[minmax(0,1fr)_12rem_auto] lg:items-center">
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
                  <div class="text-sm text-muted-foreground">
                    <p class="text-xs font-medium">
                      {$t(i18nKeys.console.organization.roleLabel)}
                    </p>
                    <p class="mt-1 font-medium text-foreground">{roleLabel(member.role)}</p>
                  </div>
                  {#if member.role === "owner"}
                    <div class="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        disabled={!canTransferOwnership ||
                          transferOwnerMutation.isPending ||
                          ownerTransferCandidates(member.memberId).length === 0}
                        onclick={() => openOwnerTransferDialog(member)}
                        size="sm"
                        variant="outline"
                      >
                        <ShieldCheck class="size-3.5" />
                        {$t(i18nKeys.console.organization.transferOwner)}
                      </Button>
                    </div>
                  {:else}
                    <div class="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        disabled={!canUpdateMemberRoles || updateMemberRoleMutation.isPending}
                        onclick={() => openMemberRoleDialog(member)}
                        size="sm"
                        variant="outline"
                      >
                        {$t(i18nKeys.console.organization.updateRole)}
                      </Button>
                      <Button
                        type="button"
                        disabled={!canRemoveMembers || removeMemberMutation.isPending}
                        onclick={() => openMemberLifecycleDialog(member)}
                        size="sm"
                        variant="outline"
                      >
                        <ShieldCheck class="size-3.5" />
                        {$t(i18nKeys.console.organization.lifecycleManageAction)}
                      </Button>
                    </div>
                  {/if}
                </div>
              {/each}
              {#if activeMembers.length === 0}
                <div class="console-record-row text-sm text-muted-foreground">
                  {$t(i18nKeys.console.organization.emptyMembers)}
                </div>
              {/if}
            {/if}
          </div>

          {#if removedMembers.length > 0}
            <div class="space-y-3">
              <div>
                <h3 class="text-sm font-semibold">{$t(i18nKeys.console.organization.removedMembersTitle)}</h3>
                <p class="mt-1 text-sm text-muted-foreground">
                  {$t(i18nKeys.console.organization.removedMembersDescription)}
                </p>
              </div>
              <div class="console-record-list">
                {#each removedMembers as member (member.memberId)}
                  <div class="console-record-row gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div class="min-w-0 space-y-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <h3 class="truncate text-base font-semibold">
                          {member.displayName ?? member.email ?? member.userId}
                        </h3>
                        <Badge variant="outline">{roleLabel(member.role)}</Badge>
                        <Badge variant="secondary">{$t(i18nKeys.console.organization.statusDeactivated)}</Badge>
                      </div>
                      <p class="break-all text-sm text-muted-foreground">
                        {member.email ?? member.userId}
                      </p>
                      <p class="text-xs text-muted-foreground">
                        {$t(i18nKeys.console.organization.joinedAt)} · {formatTime(member.joinedAt)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      disabled={!canRemoveMembers || reactivateMemberMutation.isPending}
                      onclick={() => openMemberLifecycleDialog(member)}
                      size="sm"
                      variant="outline"
                    >
                      <RotateCw class="size-3.5" />
                      {$t(i18nKeys.console.organization.lifecycleManageAction)}
                    </Button>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
        {/if}
      </section>
      {/if}

      {#if activeSection === "invitations"}
      <section
        class={centeredOrganizationSectionClass("space-y-5")}
        data-organization-invitations-display-surface
      >
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="max-w-2xl">
            <h2 class="text-lg font-semibold">{$t(i18nKeys.console.organization.invitationsTitle)}</h2>
            <p class="mt-1 text-sm text-muted-foreground">
              {$t(i18nKeys.console.organization.invitationsDescription)}
            </p>
          </div>
          <Button
            type="button"
            disabled={!canInviteMembers}
            onclick={openInviteDialog}
          >
            <UserPlus class="size-4" />
            {$t(i18nKeys.console.organization.inviteAction)}
          </Button>
        </div>
        {#if invitationsSectionLoading}
          <div class="console-record-list">
            <div class="console-record-row">
              <Skeleton class="h-12 w-full" />
            </div>
            <div class="console-record-row">
              <Skeleton class="h-12 w-full" />
            </div>
          </div>
        {:else if invitations.length === 0}
          <ConsoleEmptyState
            tone="invitation"
            title={$t(i18nKeys.console.organization.emptyInvitationsTitle)}
            description={$t(i18nKeys.console.organization.emptyInvitationsDescription)}
            actionLabel={$t(i18nKeys.console.organization.inviteAction)}
            learnMoreHref={webDocsHrefs.organizationTeamManagement}
            onAction={openInviteDialog}
          />
        {:else}
          <div class="console-record-list">
            {#each invitations as invitation (invitation.invitationId)}
              <div class="console-record-row lg:grid-cols-[minmax(0,1fr)_12rem_12rem] lg:items-center">
                <div class="min-w-0">
                  <h3 class="truncate text-base font-semibold">{invitation.email}</h3>
                  <p class="mt-1 text-sm text-muted-foreground">{invitation.invitationId}</p>
                </div>
                <Badge variant="outline">{roleLabel(invitation.role)}</Badge>
                <div class="text-sm text-muted-foreground">
                  {invitationStatusLabel(invitation.status)} · {formatTime(invitation.createdAt)}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </section>
      {/if}

      {#if activeSection === "deploy-tokens"}
      <section
        class={centeredOrganizationSectionClass("space-y-5")}
        data-organization-deploy-tokens-display-surface
      >
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="max-w-2xl">
            <h2 class="text-lg font-semibold">{$t(i18nKeys.console.organization.deployTokensTitle)}</h2>
            <p class="mt-1 text-sm text-muted-foreground">
              {$t(i18nKeys.console.organization.deployTokensDescription)}
            </p>
          </div>
          <Button
            type="button"
            disabled={!canManageDeployTokens}
            onclick={openDeployTokenCreateDialog}
          >
            <KeyRound class="size-4" />
            {$t(i18nKeys.console.organization.createToken)}
          </Button>
        </div>
        {#if deployTokensSectionLoading}
          <div class="console-record-list">
            <div class="console-record-row">
              <Skeleton class="h-14 w-full" />
            </div>
            <div class="console-record-row">
              <Skeleton class="h-14 w-full" />
            </div>
          </div>
        {:else if deployTokens.length === 0}
          <ConsoleEmptyState
            tone="credential"
            title={$t(i18nKeys.console.organization.emptyTokensTitle)}
            description={$t(i18nKeys.console.organization.emptyTokensDescription)}
            actionLabel={$t(i18nKeys.console.organization.createToken)}
            learnMoreHref={webDocsHrefs.organizationTeamManagement}
            onAction={openDeployTokenCreateDialog}
          />
        {:else}
          <div class="console-record-list">
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
                <div class="flex flex-wrap gap-2 lg:justify-end">
                  <Button
                    type="button"
                    disabled={!canManageDeployTokens || token.status !== "active" || rotateDeployTokenMutation.isPending || revokeDeployTokenMutation.isPending}
                    onclick={() => openDeployTokenLifecycleDialog(token.tokenId)}
                    size="sm"
                    variant="outline"
                  >
                    <ShieldCheck class="size-3.5" />
                    {$t(i18nKeys.console.organization.lifecycleManageAction)}
                  </Button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </section>
      {/if}

      {#if activeSection === "archived-projects"}
      <section
        class={centeredOrganizationSectionClass("space-y-5")}
        data-organization-archived-projects-display-surface
      >
        <div class="max-w-2xl">
          <h2 class="text-lg font-semibold">{$t(i18nKeys.console.organization.archivedProjectsTitle)}</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            {$t(i18nKeys.console.organization.archivedProjectsDescription)}
          </p>
        </div>
        {#if archivedProjectsSectionLoading}
          <div class="console-record-list">
            <div class="console-record-row">
              <Skeleton class="h-14 w-full" />
            </div>
            <div class="console-record-row">
              <Skeleton class="h-14 w-full" />
            </div>
          </div>
        {:else if archivedProjects.length === 0}
          <ConsoleEmptyState
            tone="project"
            title={$t(i18nKeys.console.organization.archivedProjectsEmptyTitle)}
            description={$t(i18nKeys.console.organization.archivedProjectsEmptyDescription)}
            learnMoreHref={webDocsHrefs.projectLifecycle}
          />
        {:else}
          <div class="console-record-list">
            {#each archivedProjects as project (project.id)}
              <a
                href={projectDetailHref(project.id)}
                class="console-record-row group gap-4 lg:grid-cols-[minmax(0,1fr)_14rem_auto] lg:items-center"
              >
                <div class="min-w-0 space-y-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <FolderOpen class="size-4 text-primary" />
                    <h3 class="truncate text-base font-semibold">{project.name}</h3>
                    <Badge variant="outline">{project.slug}</Badge>
                  </div>
                  <p class="line-clamp-2 text-sm leading-6 text-muted-foreground">
                    {project.description ?? $t(i18nKeys.console.projects.noDescription)}
                  </p>
                </div>
                <div class="text-sm text-muted-foreground">
                  <p>{$t(i18nKeys.console.organization.createdAt)} · {formatTime(project.createdAt)}</p>
                  {#if project.archivedAt}
                    <p>{$t(i18nKeys.console.projects.archivedAt)} · {formatTime(project.archivedAt)}</p>
                  {/if}
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
        {/if}
      </section>
      {/if}

      {#if activeSection === "danger-zone"}
      <section class="mx-auto max-w-4xl" data-organization-danger-display-surface>
        <div class="console-panel space-y-5 border-destructive/25 bg-destructive/5 p-5">
          <div class="flex items-start gap-3">
            <div class="rounded-[calc(var(--radius-lg)-2px)] border border-destructive/30 bg-background p-2">
              <ShieldAlert class="size-5 text-destructive" />
            </div>
            <div class="min-w-0 flex-1 space-y-1">
              <h2 class="text-lg font-semibold text-destructive">
                {$t(i18nKeys.console.organization.dangerZoneTitle)}
              </h2>
              <p class="text-sm leading-6 text-muted-foreground">
                {$t(i18nKeys.console.organization.dangerDescription)}
              </p>
            </div>
          </div>

          <div class="space-y-4">
            <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-background/70 p-4 text-sm">
              <p class="text-xs text-muted-foreground">{$t(i18nKeys.console.organization.nameLabel)}</p>
              <p class="mt-1 break-words font-medium">
                {organizationProfile?.name ?? currentOrganization.name}
              </p>
              <p class="mt-3 text-xs text-muted-foreground">{$t(i18nKeys.console.organization.organizationId)}</p>
              <p class="mt-1 break-all font-mono">{currentOrganization.organizationId}</p>
              <p class="mt-3 text-xs text-muted-foreground">
                {$t(i18nKeys.console.organization.currentRole)} · {roleLabel(currentOrganization.role)}
              </p>
            </div>
            <div
              class="rounded-[calc(var(--radius-lg)-2px)] border border-destructive/25 bg-background/70 p-4 text-sm"
              data-organization-danger-blocker-check
            >
              <p class="font-medium text-destructive">
                {$t(i18nKeys.console.organization.dangerConfirmLabel)}
              </p>
              <p class="mt-1 leading-6 text-muted-foreground">
                {$t(i18nKeys.console.organization.deleteOrganizationDialogWarning)}
              </p>
              {#if !canDeleteOrganization}
                <p class="mt-2 text-xs font-medium text-muted-foreground">
                  {$t(i18nKeys.console.organization.permissionDeniedTitle)}
                </p>
              {/if}
            </div>
            <Button
              disabled={!canDeleteOrganization}
              type="button"
              variant="outline"
              onclick={openDeleteOrganizationDialog}
            >
              <ShieldAlert class="size-4" />
              {$t(i18nKeys.console.organization.lifecycleManageAction)}
            </Button>
          </div>
        </div>
      </section>
      {/if}

      {#if activeSection === "profile"}
        <div class="flex w-full flex-wrap gap-2">
          <Button href={webDocsHrefs.organizationTeamManagement} target="_blank" variant="outline">
            <BookOpen class="size-4" />
            {$t(i18nKeys.console.organization.docsLink)}
          </Button>
        </div>
      {/if}
    </div>
  {/if}

  <Dialog.Root bind:open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
      <Dialog.Header>
        <Dialog.Title>{$t(i18nKeys.console.organization.inviteTitle)}</Dialog.Title>
        <Dialog.Description>
          {$t(i18nKeys.console.organization.inviteDescription)}
        </Dialog.Description>
      </Dialog.Header>
      <form class="space-y-4 px-5 pb-5" onsubmit={submitInvite} data-organization-invite-dialog>
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
        <Dialog.Footer class="px-0 pb-0">
          <Button type="button" variant="outline" onclick={() => setInviteDialogOpen(false)}>
            {$t(i18nKeys.common.actions.close)}
          </Button>
          <Button disabled={!canSubmitInvite} type="submit">
            <UserPlus class="size-4" />
            {inviteMemberMutation.isPending
              ? $t(i18nKeys.console.organization.inviting)
              : $t(i18nKeys.console.organization.inviteAction)}
          </Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  </Dialog.Root>

  <Dialog.Root
    bind:open={organizationProfileDialogOpen}
    onOpenChange={setOrganizationProfileDialogOpen}
  >
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
      <Dialog.Header>
        <Dialog.Title>{$t(i18nKeys.console.organization.profileTitle)}</Dialog.Title>
        <Dialog.Description>
          {$t(i18nKeys.console.organization.profileDescription)}
        </Dialog.Description>
      </Dialog.Header>
      <form
        class="space-y-4 px-5 pb-5"
        onsubmit={submitOrganizationProfile}
        data-organization-profile-edit-dialog
      >
        <label class="appaloft-field-stack">
          <span class="appaloft-field-label">{$t(i18nKeys.common.domain.name)}</span>
          <Input bind:value={organizationName} disabled={!canChangeOrganizationProfile} />
        </label>
        <label class="appaloft-field-stack">
          <span class="appaloft-field-label">{$t(i18nKeys.common.domain.slug)}</span>
          <Input bind:value={organizationSlug} disabled={!canChangeOrganizationProfile} />
        </label>
        <label class="appaloft-field-stack">
          <span class="appaloft-field-label">{$t(i18nKeys.console.organization.logoUrlLabel)}</span>
          <Input
            bind:value={organizationLogoUrl}
            disabled={!canChangeOrganizationProfile}
            type="url"
            placeholder={$t(i18nKeys.console.organization.logoUrlPlaceholder)}
          />
        </label>
        {#if operationError}
          <div class="rounded-[calc(var(--radius-lg)-2px)] border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p class="break-words text-destructive">{operationError}</p>
          </div>
        {/if}
        <Dialog.Footer class="px-0 pb-0">
          <Button
            type="button"
            variant="outline"
            onclick={() => setOrganizationProfileDialogOpen(false)}
          >
            {$t(i18nKeys.common.actions.cancel)}
          </Button>
          <Button disabled={!canSubmitOrganizationProfile} type="submit">
            <ShieldCheck class="size-4" />
            {changeOrganizationProfileMutation.isPending
              ? $t(i18nKeys.console.organization.savingProfile)
              : $t(i18nKeys.console.organization.saveProfile)}
          </Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  </Dialog.Root>

  <Dialog.Root bind:open={memberRoleDialogOpen} onOpenChange={setMemberRoleDialogOpen}>
    {#if selectedMemberRoleMember}
      <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
        <form onsubmit={submitMemberRole} data-organization-member-role-dialog>
          <Dialog.Header>
            <Dialog.Title>{$t(i18nKeys.console.organization.updateRole)}</Dialog.Title>
            <Dialog.Description>
              {$t(i18nKeys.console.organization.membersDescription)}
            </Dialog.Description>
          </Dialog.Header>

          <div class="space-y-4 px-5 py-4">
            <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-3 text-sm">
              <p class="font-medium">{memberDisplayLabel(selectedMemberRoleMember)}</p>
              <p class="mt-1 text-muted-foreground">
                {$t(i18nKeys.console.organization.roleLabel)} · {roleLabel(selectedMemberRoleMember.role)}
              </p>
            </div>
            <label class="space-y-1.5 text-sm font-medium">
              <span>{$t(i18nKeys.console.organization.roleLabel)}</span>
              <Select.Root
                bind:value={roleDrafts[selectedMemberRoleMember.memberId]}
                disabled={!canUpdateMemberRoles || updateMemberRoleMutation.isPending}
                type="single"
              >
                <Select.Trigger class="w-full">
                  {roleLabel(roleDrafts[selectedMemberRoleMember.memberId] ?? selectedMemberRoleMember.role)}
                </Select.Trigger>
                <Select.Content>
                  {#each memberRoleOptions as role (role)}
                    <Select.Item value={role}>{roleLabel(role)}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
            </label>
            <p class="text-xs leading-5 text-muted-foreground">
              {$t(i18nKeys.console.organization.ownerSafetyNotice)}
            </p>
            {#if operationError}
              <div class="rounded-[calc(var(--radius-lg)-2px)] border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p class="break-words text-destructive">{operationError}</p>
              </div>
            {/if}
          </div>

          <Dialog.Footer class="border-t p-5">
            <Button type="button" variant="outline" onclick={() => setMemberRoleDialogOpen(false)}>
              {$t(i18nKeys.common.actions.cancel)}
            </Button>
            <Button disabled={!canSubmitMemberRole} type="submit">
              {updateMemberRoleMutation.isPending
                ? $t(i18nKeys.console.organization.updatingRole)
                : $t(i18nKeys.console.organization.updateRole)}
            </Button>
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    {/if}
  </Dialog.Root>

  <Dialog.Root bind:open={ownerTransferDialogOpen} onOpenChange={setOwnerTransferDialogOpen}>
    {#if selectedOwnerTransferMember}
      {@const transferCandidates = ownerTransferCandidates(selectedOwnerTransferMember.memberId)}
      <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
        <form onsubmit={submitOwnerTransfer} data-organization-owner-transfer-dialog>
          <Dialog.Header>
            <Dialog.Title>{$t(i18nKeys.console.organization.transferOwner)}</Dialog.Title>
            <Dialog.Description>
              {$t(i18nKeys.console.organization.ownerSafetyNotice)}
            </Dialog.Description>
          </Dialog.Header>

          <div class="space-y-4 px-5 py-4">
            <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-3 text-sm">
              <p class="font-medium">{memberDisplayLabel(selectedOwnerTransferMember)}</p>
              <p class="mt-1 text-muted-foreground">
                {$t(i18nKeys.console.organization.roleLabel)} · {roleLabel(selectedOwnerTransferMember.role)}
              </p>
            </div>
            <label class="space-y-1.5 text-sm font-medium">
              <span>{$t(i18nKeys.console.organization.transferOwnerPlaceholder)}</span>
              <Select.Root
                bind:value={ownerTransferDrafts[selectedOwnerTransferMember.memberId]}
                disabled={!canTransferOwnership ||
                  transferOwnerMutation.isPending ||
                  transferCandidates.length === 0}
                type="single"
              >
                <Select.Trigger class="w-full">
                  {ownerTransferLabel(selectedOwnerTransferMember.memberId)}
                </Select.Trigger>
                <Select.Content>
                  {#each transferCandidates as candidate (candidate.memberId)}
                    <Select.Item value={candidate.memberId}>
                      {memberDisplayLabel(candidate)}
                    </Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
            </label>
            {#if operationError}
              <div class="rounded-[calc(var(--radius-lg)-2px)] border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p class="break-words text-destructive">{operationError}</p>
              </div>
            {/if}
          </div>

          <Dialog.Footer class="border-t p-5">
            <Button type="button" variant="outline" onclick={() => setOwnerTransferDialogOpen(false)}>
              {$t(i18nKeys.common.actions.cancel)}
            </Button>
            <Button disabled={!canSubmitOwnerTransfer} type="submit">
              <ShieldCheck class="size-4" />
              {transferOwnerMutation.isPending
                ? $t(i18nKeys.console.organization.transferringOwner)
                : $t(i18nKeys.console.organization.transferOwner)}
            </Button>
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    {/if}
  </Dialog.Root>

  <Dialog.Root bind:open={memberLifecycleDialogOpen} onOpenChange={setMemberLifecycleDialogOpen}>
    {#if selectedMemberLifecycleMember}
      <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
        <Dialog.Header>
          <Dialog.Title>
            {memberLifecycleDialogTitle(selectedMemberLifecycleAction)}
          </Dialog.Title>
          <Dialog.Description>
            {memberLifecycleDialogDescription(selectedMemberLifecycleAction)}
          </Dialog.Description>
        </Dialog.Header>

        <div class="space-y-4 px-5 py-4" data-organization-member-lifecycle-dialog>
          <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-3 text-sm">
            <p class="font-medium">{memberDisplayLabel(selectedMemberLifecycleMember)}</p>
            <p class="mt-1 text-muted-foreground">
              {$t(i18nKeys.console.organization.roleLabel)} · {roleLabel(selectedMemberLifecycleMember.role)}
            </p>
            <p class="mt-1 text-muted-foreground">
              {$t(i18nKeys.console.organization.joinedAt)} · {formatTime(selectedMemberLifecycleMember.joinedAt)}
            </p>
          </div>

          <div class="grid gap-2 sm:grid-cols-2">
            {#if selectedMemberLifecycleMember.status !== "deactivated"}
              <Button
                type="button"
                variant={selectedMemberLifecycleAction === "remove" ? "destructive" : "outline"}
                class="h-auto justify-start px-3 py-3 text-left"
                onclick={() => {
                  selectedMemberLifecycleAction = "remove";
                  operationError = "";
                }}
              >
                <Trash2 class="size-4 shrink-0" />
                <span class="min-w-0">
                  <span class="block font-medium">
                    {$t(i18nKeys.console.organization.removeMember)}
                  </span>
                  <span class="block text-xs font-normal opacity-80">
                    {$t(i18nKeys.console.organization.memberLifecycleRemoveOption)}
                  </span>
                </span>
              </Button>
            {/if}
            {#if selectedMemberLifecycleMember.status === "deactivated"}
              <Button
                type="button"
                variant={selectedMemberLifecycleAction === "restore" ? "default" : "outline"}
                class="h-auto justify-start px-3 py-3 text-left"
                onclick={() => {
                  selectedMemberLifecycleAction = "restore";
                  operationError = "";
                }}
              >
                <RotateCw class="size-4 shrink-0" />
                <span class="min-w-0">
                  <span class="block font-medium">
                    {$t(i18nKeys.console.organization.restoreMember)}
                  </span>
                  <span class="block text-xs font-normal opacity-80">
                    {$t(i18nKeys.console.organization.memberLifecycleRestoreOption)}
                  </span>
                </span>
              </Button>
            {/if}
          </div>

          {#if selectedMemberLifecycleAction === "remove"}
            <div class="rounded-[calc(var(--radius-lg)-2px)] border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p class="font-medium text-destructive">
                {$t(i18nKeys.console.organization.removeMemberConfirm, {
                  memberId: selectedMemberLifecycleMember.memberId,
                })}
              </p>
              <p class="mt-1 text-muted-foreground">
                {$t(i18nKeys.console.organization.ownerSafetyNotice)}
              </p>
            </div>
          {:else if selectedMemberLifecycleAction === "restore"}
            <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/20 p-3 text-sm">
              <p class="font-medium">
                {$t(i18nKeys.console.organization.restoreMemberDialogTitle)}
              </p>
              <p class="mt-1 text-muted-foreground">
                {$t(i18nKeys.console.organization.restoreMemberDialogDescription)}
              </p>
            </div>
          {:else}
            <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/20 p-3 text-sm">
              <p class="font-medium">
                {$t(i18nKeys.console.organization.memberLifecycleDialogTitle)}
              </p>
              <p class="mt-1 text-muted-foreground">
                {$t(i18nKeys.console.organization.memberLifecycleDialogDescription)}
              </p>
            </div>
          {/if}

          {#if operationError}
            <div class="rounded-[calc(var(--radius-lg)-2px)] border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p class="break-words text-destructive">{operationError}</p>
            </div>
          {/if}
        </div>

        <Dialog.Footer class="border-t p-5">
          <Button type="button" variant="outline" onclick={() => setMemberLifecycleDialogOpen(false)}>
            {$t(i18nKeys.common.actions.cancel)}
          </Button>
          <Button
            type="button"
            variant={selectedMemberLifecycleAction === "remove" ? "destructive" : "default"}
            disabled={!canSubmitMemberLifecycleAction}
            onclick={submitMemberLifecycleAction}
          >
            {#if selectedMemberLifecycleAction === "restore"}
              <RotateCw class="size-4" />
              {reactivateMemberMutation.isPending
                ? $t(i18nKeys.console.organization.restoringMember)
                : $t(i18nKeys.console.organization.restoreMember)}
            {:else}
              <Trash2 class="size-4" />
              {removeMemberMutation.isPending
                ? $t(i18nKeys.console.organization.removingMember)
                : $t(i18nKeys.console.organization.removeMember)}
            {/if}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    {/if}
  </Dialog.Root>

  <Dialog.Root
    bind:open={deployTokenLifecycleDialogOpen}
    onOpenChange={setDeployTokenLifecycleDialogOpen}
  >
    {#if selectedDeployToken}
      <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
        <Dialog.Header>
          <Dialog.Title>
            {deployTokenLifecycleDialogTitle(selectedDeployTokenLifecycleAction)}
          </Dialog.Title>
          <Dialog.Description>
            {deployTokenLifecycleDialogDescription(selectedDeployTokenLifecycleAction)}
          </Dialog.Description>
        </Dialog.Header>

        <div class="space-y-4 px-5 py-4" data-organization-deploy-token-lifecycle-dialog>
          <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-3 text-sm">
            <p class="font-medium">{selectedDeployToken.displayName}</p>
            <p class="mt-1 break-all font-mono text-muted-foreground">
              {selectedDeployToken.tokenId}
            </p>
            <p class="mt-1 text-muted-foreground">
              {$t(i18nKeys.console.organization.secretSuffix)} · {selectedDeployToken.secretSuffix}
            </p>
          </div>

          <div
            class={[
              "rounded-[calc(var(--radius-lg)-2px)] border p-3 text-sm",
              selectedDeployTokenLifecycleAction === "revoke"
                ? "border-destructive/30 bg-destructive/5"
                : "bg-muted/20",
            ]}
          >
            <p class={selectedDeployTokenLifecycleAction === "revoke" ? "font-medium text-destructive" : "font-medium"}>
              {selectedDeployTokenLifecycleAction === "revoke"
                ? $t(i18nKeys.console.organization.revokeConfirm, {
                    tokenId: selectedDeployToken.tokenId,
                  })
                : selectedDeployTokenLifecycleAction === "rotate"
                  ? $t(i18nKeys.console.organization.rotateConfirm, {
                    tokenId: selectedDeployToken.tokenId,
                  })
                  : $t(i18nKeys.console.organization.tokenLifecycleDialogDescription)}
            </p>
            <p class="mt-1 text-muted-foreground">
              {$t(i18nKeys.console.organization.tokenSecretNotice)}
            </p>
          </div>

          <div class="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant={selectedDeployTokenLifecycleAction === "rotate" ? "default" : "outline"}
              class="h-auto justify-start px-3 py-3 text-left"
              onclick={() => {
                selectedDeployTokenLifecycleAction = "rotate";
                operationError = "";
              }}
            >
              <RotateCw class="size-4 shrink-0" />
              <span class="min-w-0">
                <span class="block font-medium">
                  {$t(i18nKeys.console.organization.rotateToken)}
                </span>
                <span class="block text-xs font-normal opacity-80">
                  {$t(i18nKeys.console.organization.tokenLifecycleRotateOption)}
                </span>
              </span>
            </Button>
            <Button
              type="button"
              variant={selectedDeployTokenLifecycleAction === "revoke" ? "destructive" : "outline"}
              class="h-auto justify-start px-3 py-3 text-left"
              onclick={() => {
                selectedDeployTokenLifecycleAction = "revoke";
                operationError = "";
              }}
            >
              <Trash2 class="size-4 shrink-0" />
              <span class="min-w-0">
                <span class="block font-medium">
                  {$t(i18nKeys.console.organization.revokeToken)}
                </span>
                <span class="block text-xs font-normal opacity-80">
                  {$t(i18nKeys.console.organization.tokenLifecycleRevokeOption)}
                </span>
              </span>
            </Button>
          </div>

          {#if operationError}
            <div class="rounded-[calc(var(--radius-lg)-2px)] border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p class="break-words text-destructive">{operationError}</p>
            </div>
          {/if}
        </div>

        <Dialog.Footer class="border-t p-5">
          <Button type="button" variant="outline" onclick={() => setDeployTokenLifecycleDialogOpen(false)}>
            {$t(i18nKeys.common.actions.cancel)}
          </Button>
          <Button
            type="button"
            variant={selectedDeployTokenLifecycleAction === "revoke" ? "destructive" : "default"}
            disabled={!canSubmitDeployTokenLifecycleAction}
            onclick={submitDeployTokenLifecycleAction}
          >
            {#if selectedDeployTokenLifecycleAction === "rotate"}
              <RotateCw class="size-4" />
              {rotateDeployTokenMutation.isPending
                ? $t(i18nKeys.console.organization.rotatingToken)
                : $t(i18nKeys.console.organization.rotateToken)}
            {:else}
              <Trash2 class="size-4" />
              {revokeDeployTokenMutation.isPending
                ? $t(i18nKeys.console.organization.revokingToken)
                : $t(i18nKeys.console.organization.revokeToken)}
            {/if}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    {/if}
  </Dialog.Root>

  <Dialog.Root bind:open={deleteOrganizationDialogOpen} onOpenChange={setDeleteOrganizationDialogOpen}>
    {#if currentOrganization}
      <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
        <form onsubmit={submitOrganizationDelete} data-organization-delete-dialog>
          <Dialog.Header>
            <Dialog.Title>{$t(i18nKeys.console.organization.deleteOrganizationDialogTitle)}</Dialog.Title>
            <Dialog.Description>
              {$t(i18nKeys.console.organization.deleteOrganizationDialogDescription, {
                name: organizationProfile?.name ?? currentOrganization.name,
              })}
            </Dialog.Description>
          </Dialog.Header>

          <div class="space-y-4 px-5 py-4">
            <div class="rounded-[calc(var(--radius-lg)-2px)] border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p class="font-medium text-destructive">
                {$t(i18nKeys.console.organization.dangerZoneTitle)}
              </p>
              <p class="mt-1 text-muted-foreground">
                {$t(i18nKeys.console.organization.deleteOrganizationDialogWarning)}
              </p>
            </div>

            <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-3 text-sm">
              <p class="text-xs text-muted-foreground">
                {$t(i18nKeys.console.organization.nameLabel)}
              </p>
              <p class="mt-1 break-words font-medium">
                {organizationProfile?.name ?? currentOrganization.name}
              </p>
              <p class="mt-3 text-xs text-muted-foreground">
                {$t(i18nKeys.console.organization.organizationId)}
              </p>
              <p class="mt-1 break-all font-mono text-xs">{currentOrganization.organizationId}</p>
            </div>

            <label class="appaloft-field-stack">
              <span class="appaloft-field-label">
                {$t(i18nKeys.console.organization.dangerConfirmLabel)}
              </span>
              <Input
                bind:value={deleteConfirmationOrganizationName}
                autocomplete="off"
                aria-invalid={deleteConfirmationOrganizationName.length > 0 &&
                  deleteConfirmationOrganizationName.trim() !==
                    (organizationProfile?.name ?? currentOrganization.name)}
                placeholder={organizationProfile?.name ?? currentOrganization.name}
              />
            </label>

            {#if deleteConfirmationOrganizationName.length > 0 &&
              deleteConfirmationOrganizationName.trim() !==
                (organizationProfile?.name ?? currentOrganization.name)}
              <p class="text-sm text-destructive">
                {$t(i18nKeys.console.organization.dangerConfirmMismatch)}
              </p>
            {/if}
          </div>

          <Dialog.Footer class="border-t p-5">
            <Button type="button" variant="outline" onclick={() => setDeleteOrganizationDialogOpen(false)}>
              {$t(i18nKeys.common.actions.close)}
            </Button>
            <Button
              disabled={!canSubmitOrganizationDelete}
              type="submit"
              variant="destructive"
            >
              <Trash2 class="size-4" />
              {deleteOrganizationMutation.isPending
                ? $t(i18nKeys.console.organization.deletingOrganization)
                : $t(i18nKeys.console.organization.deleteOrganization)}
            </Button>
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    {/if}
  </Dialog.Root>

  <Dialog.Root
    bind:open={deployTokenCreateDialogOpen}
    onOpenChange={setDeployTokenCreateDialogOpen}
  >
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)}>
      <Dialog.Header>
        <Dialog.Title>{$t(i18nKeys.console.organization.tokenCreateTitle)}</Dialog.Title>
        <Dialog.Description>
          {$t(i18nKeys.console.organization.tokenCreateDescription)}
        </Dialog.Description>
      </Dialog.Header>
      <form class="space-y-4 px-5 pb-5" onsubmit={submitDeployToken} data-organization-deploy-token-create-dialog>
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
        <Dialog.Footer class="px-0 pb-0">
          <Button type="button" variant="outline" onclick={() => setDeployTokenCreateDialogOpen(false)}>
            {$t(i18nKeys.common.actions.close)}
          </Button>
          <Button disabled={!canSubmitToken} type="submit">
            <KeyRound class="size-4" />
            {createDeployTokenMutation.isPending
              ? $t(i18nKeys.console.organization.creatingToken)
              : $t(i18nKeys.console.organization.createToken)}
          </Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  </Dialog.Root>
</SettingsShell>
