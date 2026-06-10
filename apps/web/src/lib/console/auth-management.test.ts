import { readFile } from "node:fs/promises";
import { zhCN } from "@appaloft/i18n";
import { describe, expect, test } from "vitest";

import { webDocsHrefs } from "./docs-help";

describe("organization auth management console surface", () => {
  test("[ORG-TEAM-WEB-001] exposes organization/team operations through shared oRPC contracts", async () => {
    const [
      pageSource,
      shellSource,
      organizationSwitcherSource,
      userMenuSource,
      clientContractSource,
    ] = await Promise.all([
      readFile(new URL("../../routes/organization/+page.svelte", import.meta.url), "utf8"),
      readFile(
        new URL("../../lib/components/console/ConsoleShell.svelte", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../lib/components/console/ConsoleOrganizationSwitcher.svelte", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../lib/components/console/ConsoleUserMenu.svelte", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../../../../packages/orpc/src/client-contract.ts", import.meta.url),
        "utf8",
      ),
    ]);

    expect(pageSource).toContain("orpcClient.organizations.currentContext");
    expect(pageSource).toContain("orpcClient.organizations.switchCurrent");
    expect(pageSource).toContain("orpcClient.organizations.listMembers");
    expect(pageSource).toContain("orpcClient.organizations.listInvitations");
    expect(pageSource).toContain("orpcClient.organizations.inviteMember");
    expect(pageSource).toContain("orpcClient.organizations.updateMemberRole");
    expect(pageSource).toContain("orpcClient.organizations.removeMember");
    expect(pageSource).toContain("orpcClient.organizations.reactivateMember");
    expect(pageSource).toContain("orpcClient.organizations.transferOwner");
    expect(pageSource).toContain('member.role === "owner"');
    expect(pageSource).toContain("memberRoleOptions");
    expect(pageSource).toContain("ownerTransferDrafts");
    expect(pageSource).toContain("i18nKeys.console.organization");
    expect(pageSource).toContain("organizationTeamManagement");
    expect(pageSource).not.toContain("better-auth");
    expect(shellSource).not.toContain('href: "/organization"');
    expect(shellSource).not.toContain('href: "/instance"');
    expect(shellSource).toContain("ConsoleOrganizationSwitcher");
    expect(organizationSwitcherSource).toContain('navigateTo("/organization")');
    expect(organizationSwitcherSource).toContain('navigateTo("/instance")');
    expect(organizationSwitcherSource).toContain("i18nKeys.console.nav.organization");
    expect(organizationSwitcherSource).toContain("i18nKeys.console.nav.instance");
    expect(organizationSwitcherSource).toContain("data-console-organization-switcher-trigger");
    expect(shellSource).toContain("ConsoleUserMenu");
    expect(userMenuSource).toContain('"/api/auth/sign-out"');
    expect(userMenuSource).toContain("i18nKeys.common.actions.signOut");
    expect(userMenuSource).toContain("data-console-sign-out-action");
    expect(userMenuSource).toContain("DropdownMenuSeparator");
    expect(userMenuSource.indexOf("i18nKeys.common.language.label")).toBeLessThan(
      userMenuSource.indexOf("data-console-sign-out-action"),
    );
    expect(clientContractSource).toContain("organizations: {");
    expect(clientContractSource).toContain("SwitchCurrentOrganizationCommandInput");
    expect(clientContractSource).toContain("InviteOrganizationMemberCommandInput");
    expect(clientContractSource).toContain("TransferOrganizationOwnerCommandInput");
  });

  test("[ORG-TEAM-WEB-002] exposes deploy-token management without raw auth runtime coupling", async () => {
    const pageSource = await readFile(
      new URL("../../routes/organization/+page.svelte", import.meta.url),
      "utf8",
    );

    expect(pageSource).toContain("orpcClient.deployTokens.list");
    expect(pageSource).toContain("orpcClient.deployTokens.create");
    expect(pageSource).toContain("orpcClient.deployTokens.rotate");
    expect(pageSource).toContain("orpcClient.deployTokens.revoke");
    expect(pageSource).toContain("tokenCreatedSecret");
    expect(pageSource).toContain("confirmation: { tokenId }");
    expect(pageSource).not.toContain("@appaloft/auth-better");
    expect(pageSource).not.toContain("betterAuth");
  });

  test("[ORG-TEAM-WEB-003] points Web help at the organization/team public docs anchor", () => {
    expect(webDocsHrefs.organizationTeamManagement).toBe(
      "/docs/self-hosting/organization-team-management/#self-hosting-organization-team-management",
    );
  });

  test("[ORG-TEAM-WEB-004] keeps organization and instance management outside the product sidebar", async () => {
    const [
      organizationPageSource,
      instancePageSource,
      instanceWorkersRouteSource,
      managementShellSource,
      settingsNavSource,
    ] = await Promise.all([
      readFile(new URL("../../routes/organization/+page.svelte", import.meta.url), "utf8"),
      readFile(new URL("../../routes/instance/+page.svelte", import.meta.url), "utf8"),
      readFile(new URL("../../routes/instance/workers/+page.svelte", import.meta.url), "utf8"),
      readFile(
        new URL("../../lib/components/console/ManagementShell.svelte", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../../lib/console/settings-nav.ts", import.meta.url), "utf8"),
    ]);

    expect(organizationPageSource).toContain("SettingsShell");
    expect(organizationPageSource).not.toContain("ConsoleShell");
    expect(organizationPageSource).toContain("activeSection");
    expect(organizationPageSource).toContain("organizationSettingsItems");
    expect(instancePageSource).toContain("SettingsShell");
    expect(instancePageSource).not.toContain("ConsoleShell");
    expect(instancePageSource).not.toContain("ConsoleResourceCanvas");
    expect(instancePageSource).toContain("instanceSettingsItems");
    expect(instancePageSource).toContain("ConsoleOrganizationSwitcher");
    expect(instancePageSource).toContain("orpcClient.system.doctor");
    expect(instancePageSource).toContain("maintenanceWorkers");
    expect(instancePageSource).toContain("workerSafetyLabelKey");
    expect(instancePageSource).toContain("i18nKeys.console.instance.maintenanceWorkersTitle");
    expect(instanceWorkersRouteSource).toContain('<InstancePage section="workers" />');
    expect(instancePageSource).not.toContain("ManagementShell");
    expect(settingsNavSource).toContain('href: "/organization/members"');
    expect(settingsNavSource).toContain('href: "/organization/invitations"');
    expect(settingsNavSource).toContain('href: "/organization/deploy-tokens"');
    expect(settingsNavSource).toContain("instanceSettingsItems");
    expect(settingsNavSource).toContain('href: "/instance/workers"');
    expect(settingsNavSource).toContain("i18nKeys.console.instance.workerManagementTitle");
    expect(managementShellSource).not.toContain('href: "/organization"');
    expect(managementShellSource).not.toContain('href: "/instance"');
    expect(managementShellSource).not.toContain("managementItems");
    expect(managementShellSource).not.toContain("i18nKeys.console.nav.management");
    expect(managementShellSource).not.toContain("projectSearch");
    expect(managementShellSource).not.toContain("filteredProjects");
  });

  test("[ORG-TEAM-WEB-005] presents instance worker operations through settings routes and work ledger", async () => {
    const [instancePageSource, contractsSource, zhLocaleSource] = await Promise.all([
      readFile(new URL("../../routes/instance/+page.svelte", import.meta.url), "utf8"),
      readFile(new URL("../../../../../packages/contracts/src/index.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../../../../../packages/i18n/src/locales/zh-CN.ts", import.meta.url),
        "utf8",
      ),
    ]);

    expect(instancePageSource).toContain("SettingsShell");
    expect(instancePageSource).not.toContain("ConsoleShell");
    expect(instancePageSource).not.toContain("ConsoleResourceCanvas");
    expect(instancePageSource).toContain("parseInstanceSection");
    expect(instancePageSource).toContain("instanceSectionHref");
    expect(instancePageSource).toContain('page.url.searchParams.get("section")');
    expect(instancePageSource).toContain('activeSection === "overview"');
    expect(instancePageSource).toContain('activeSection === "workers"');
    expect(instancePageSource).toContain('activeSection === "maintenance"');
    expect(instancePageSource).toContain('activeSection === "sessions"');
    expect(instancePageSource).toContain('activeSection === "guidance"');
    expect(instancePageSource).toContain('return "/instance/workers"');
    expect(instancePageSource).toContain("i18nKeys.console.instance.overviewTitle");
    expect(instancePageSource).toContain("i18nKeys.console.instance.commitShaLabel");
    expect(instancePageSource).toContain("currentCommitSha");
    expect(instancePageSource).toContain("orpcClient.system.doctor");
    expect(instancePageSource).toContain("orpcClient.operatorWork.list");
    expect(instancePageSource).toContain("orpcClient.operatorWork.show");
    expect(instancePageSource).toContain("maintenanceWorkers");
    expect(instancePageSource).toContain("durableWorker");
    expect(instancePageSource).toContain("durableRuntimeTopology");
    expect(instancePageSource).toContain("selectedOperatorWorkEvents");
    expect(instancePageSource).toContain("workerSafetyLabelKey");
    expect(instancePageSource).toContain("i18nKeys.console.instance.workerDurableRuntime");
    expect(instancePageSource).toContain("worker.runtimeTopology");
    expect(instancePageSource).toContain("worker.runtimeTopology.heartbeat");
    expect(instancePageSource).toContain("workerRuntimeHeartbeat");
    expect(instancePageSource).toContain("workerRuntimeTopology");
    expect(instancePageSource).toContain("workerManagementTitle");
    expect(instancePageSource).toContain("workerWorkEventsTitle");
    expect(instancePageSource).not.toContain("ManagementShell");
    expect(contractsSource).toContain("currentCommitSha: z.string().optional()");
    expect(contractsSource).toContain("heartbeat");
    expect(contractsSource).toContain("workerId: z.string()");
    expect(contractsSource).toContain("operatorWorkEventSchema");
    expect(zhLocaleSource).toContain('pageTitle: "实例"');
    expect(zhLocaleSource).toContain('instance: "实例"');
    expect(zhLocaleSource).toContain('workerManagementTitle: "Worker 管理"');
    expect(zhLocaleSource).toContain('workerWorkEventsTitle: "事件日志"');
  });

  test("[SETTINGS-WEB-001] account and organization settings use sidebar shell and neutral contracts", async () => {
    const [
      organizationPageSource,
      organizationDangerSource,
      organizationMembersSource,
      organizationInvitationsSource,
      accountProfileSource,
      accountSecuritySource,
      accountSessionsSource,
      accountDangerSource,
      settingsShellSource,
      settingsNavSource,
      consoleShellSource,
      organizationSwitcherSource,
      consoleExtensionPageSource,
      userMenuSource,
      clientContractSource,
      enUSSource,
      zhCNSource,
      layoutCssSource,
    ] = await Promise.all([
      readFile(new URL("../../routes/organization/+page.svelte", import.meta.url), "utf8"),
      readFile(
        new URL("../../routes/organization/danger-zone/+page.svelte", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../../routes/organization/members/+page.svelte", import.meta.url), "utf8"),
      readFile(
        new URL("../../routes/organization/invitations/+page.svelte", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../../routes/account/profile/+page.svelte", import.meta.url), "utf8"),
      readFile(new URL("../../routes/account/security/+page.svelte", import.meta.url), "utf8"),
      readFile(new URL("../../routes/account/sessions/+page.svelte", import.meta.url), "utf8"),
      readFile(new URL("../../routes/account/danger-zone/+page.svelte", import.meta.url), "utf8"),
      readFile(
        new URL("../../lib/components/console/SettingsShell.svelte", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../../lib/console/settings-nav.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../../lib/components/console/ConsoleShell.svelte", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../lib/components/console/ConsoleOrganizationSwitcher.svelte", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../lib/components/console/ConsoleExtensionPage.svelte", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../lib/components/console/ConsoleUserMenu.svelte", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../../../../packages/orpc/src/client-contract.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../../../../packages/i18n/src/locales/en-US.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../../../../packages/i18n/src/locales/zh-CN.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../../routes/layout.css", import.meta.url), "utf8"),
    ]);

    expect(settingsShellSource).toContain("Sidebar");
    expect(settingsShellSource).toContain("sidebarHeader?: Snippet");
    expect(settingsShellSource).toContain("{@render sidebarHeader()}");
    expect(settingsShellSource).toContain("labelKey");
    expect(settingsShellSource).toContain("label?: string");
    expect(settingsShellSource).toContain("itemLabel");
    expect(settingsShellSource).toContain("SettingsShellItem");
    expect(settingsShellSource).toContain("ConsoleUserMenu");
    expect(settingsNavSource).toContain("accountSettingsItems");
    expect(settingsNavSource).toContain("organizationSettingsItems");
    expect(settingsNavSource).toContain('extension.placement === "settings"');
    expect(settingsNavSource).toContain('extension.target === "console-route"');
    expect(settingsNavSource).toContain('href: "/account/profile"');
    expect(settingsNavSource).toContain('href: "/account/security"');
    expect(settingsNavSource).toContain('href: "/account/sessions"');
    expect(settingsNavSource).toContain('href: "/account/danger-zone"');
    expect(settingsNavSource).toContain('href: "/organization/danger-zone"');

    expect(accountProfileSource).toContain("SettingsShell");
    expect(accountProfileSource).toContain("orpcClient.account.showProfile");
    expect(accountProfileSource).toContain("orpcClient.account.changeProfile");
    expect(accountSecuritySource).toContain("SettingsShell");
    expect(accountSecuritySource).toContain("accountSettingsItems");
    expect(accountSecuritySource).toContain('page.url.searchParams.get("section")');
    expect(accountSecuritySource).toContain("selectAccountSecuritySection");
    expect(accountSecuritySource).toContain("console-subnav-layout");
    expect(accountSecuritySource).toContain("console-subnav-content");
    expect(accountSecuritySource).not.toContain("ConsoleResourceCanvas");
    expect(layoutCssSource).toContain(".console-subnav-layout");
    expect(layoutCssSource).toContain("margin: -1rem");
    expect(layoutCssSource).toContain("margin: -1.5rem");
    expect(layoutCssSource).toContain("min-height: calc(100svh - 3.5rem)");
    expect(layoutCssSource).toContain(".console-subnav-layout > .console-subnav");
    expect(layoutCssSource).toContain("padding: 0.5rem");
    expect(layoutCssSource).toContain("border-right-color: var(--sidebar-border)");
    expect(accountSessionsSource).toContain("orpcClient.account.listSessions");
    expect(accountSessionsSource).toContain("orpcClient.account.revokeSession");
    expect(accountSessionsSource).toContain("clientKind");
    expect(accountSessionsSource).toContain("displayName");
    expect(accountSessionsSource).toContain("SquareTerminal");
    expect(accountSessionsSource).toContain("clientCli");
    expect(accountDangerSource).toContain("orpcClient.account.delete");
    expect(accountDangerSource).toContain("confirmation: { userId");

    expect(organizationPageSource).toContain("SettingsShell");
    expect(organizationPageSource).toContain("ConsoleOrganizationSwitcher");
    expect(organizationPageSource).toContain("{#snippet sidebarHeader()}");
    expect(organizationPageSource).toContain("showManagementLinks={false}");
    expect(organizationPageSource).toContain("/api/system-plugins/web-extensions");
    expect(organizationPageSource).toContain(
      "organizationSettingsItems(webExtensionsQuery.data?.items ?? [])",
    );
    expect(organizationPageSource).toContain("orpcClient.organizations.showProfile");
    expect(organizationPageSource).toContain("orpcClient.organizations.changeProfile");
    expect(organizationPageSource).toContain("orpcClient.organizations.delete");
    expect(organizationPageSource).toContain("orpcClient.organizations.transferOwner");
    expect(organizationPageSource).toContain(
      "confirmation: { organizationId: currentOrganizationId }",
    );
    expect(organizationPageSource).toContain("deleteOrganizationDialogOpen");
    expect(organizationPageSource).toContain("openDeleteOrganizationDialog");
    expect(organizationPageSource).toContain("centeredOrganizationSectionClass");
    expect(organizationPageSource).toContain("mx-auto w-full max-w-6xl");
    expect(organizationPageSource).toContain("deleteConfirmationOrganizationName");
    expect(organizationPageSource).toContain("deleteConfirmationOrganizationName.trim() ===");
    expect(organizationPageSource).toContain(
      '(organizationProfile?.name ?? currentOrganization?.name ?? "")',
    );
    expect(organizationPageSource).toContain(
      "placeholder={organizationProfile?.name ?? currentOrganization.name}",
    );
    expect(organizationPageSource).not.toContain("deleteConfirmationOrganizationId");
    expect(organizationPageSource).toContain("{#if contextQuery.isPending}");
    expect(organizationPageSource).not.toContain("{#if loading}");
    expect(organizationPageSource).toContain("organizationProfileLoading");
    expect(organizationPageSource).toContain("membersSectionLoading");
    expect(organizationPageSource).toContain("invitationsSectionLoading");
    expect(organizationPageSource).toContain("deployTokensSectionLoading");
    expect(organizationPageSource).toContain("ConsoleEmptyState");
    expect(organizationPageSource).toContain("Dialog.Root");
    expect(organizationPageSource).toContain("modalIsOpen");
    expect(organizationPageSource).toContain("setModalOpen");
    expect(organizationPageSource).toContain('"invite-organization-member"');
    expect(organizationPageSource).toContain('"create-deploy-token"');
    expect(organizationPageSource).toContain(
      'activeSection === "profile" || activeSection === "members"',
    );
    expect(organizationPageSource).toMatch(
      /activeSection === "profile" \|\|\s+activeSection === "invitations"/,
    );
    expect(organizationPageSource).toMatch(
      /activeSection === "profile" \|\|\s+activeSection === "deploy-tokens"/,
    );
    expect(organizationDangerSource).toContain('section="danger-zone"');
    expect(organizationMembersSource).toContain('section="members"');
    expect(organizationInvitationsSource).toContain('section="invitations"');
    const organizationTemplateSource = organizationPageSource.slice(
      organizationPageSource.indexOf("<SettingsShell"),
    );
    const profileSummarySource = organizationTemplateSource.slice(
      organizationTemplateSource.indexOf('{#if activeSection === "profile"}'),
      organizationTemplateSource.indexOf("{#if operationNotice"),
    );
    const membersSectionSource = organizationTemplateSource.slice(
      organizationTemplateSource.indexOf('{#if activeSection === "members"}'),
      organizationTemplateSource.indexOf('{#if activeSection === "invitations"}'),
    );
    const invitationsSectionSource = organizationTemplateSource.slice(
      organizationTemplateSource.indexOf('{#if activeSection === "invitations"}'),
      organizationTemplateSource.indexOf('{#if activeSection === "deploy-tokens"}'),
    );
    const deployTokensSectionSource = organizationTemplateSource.slice(
      organizationTemplateSource.indexOf('{#if activeSection === "deploy-tokens"}'),
      organizationTemplateSource.indexOf('{#if activeSection === "danger-zone"}'),
    );
    expect(profileSummarySource).toContain("focusTitle");
    expect(profileSummarySource).toContain("focusDescription");
    expect(profileSummarySource).toContain("console-metric-strip");
    for (const sectionSource of [
      membersSectionSource,
      invitationsSectionSource,
      deployTokensSectionSource,
    ]) {
      expect(sectionSource).not.toContain("focusTitle");
      expect(sectionSource).not.toContain("focusDescription");
      expect(sectionSource).not.toContain("console-metric-strip");
    }
    expect(membersSectionSource).not.toContain("submitInvite");
    expect(membersSectionSource).not.toContain("inviteEmail");
    expect(membersSectionSource).toContain("activeMembers");
    expect(membersSectionSource).toContain("removedMembers");
    expect(membersSectionSource).toContain("removedMembersTitle");
    expect(membersSectionSource).toContain("reactivateMember");
    expect(membersSectionSource).toContain("statusDeactivated");
    expect(invitationsSectionSource).toContain("openInviteDialog");
    expect(invitationsSectionSource).toContain('tone="invitation"');
    expect(invitationsSectionSource).toContain("emptyInvitationsTitle");
    expect(invitationsSectionSource).toContain(
      "actionLabel={$t(i18nKeys.console.organization.inviteAction)}",
    );
    expect(invitationsSectionSource).toContain("onAction={openInviteDialog}");
    expect(invitationsSectionSource).toContain("{:else if invitations.length === 0}");
    expect(invitationsSectionSource).not.toContain("submitInvite");
    expect(invitationsSectionSource).not.toContain("bind:value={inviteEmail}");
    expect(deployTokensSectionSource).toContain("openDeployTokenCreateDialog");
    expect(deployTokensSectionSource).toContain('tone="credential"');
    expect(deployTokensSectionSource).toContain("emptyTokensTitle");
    expect(deployTokensSectionSource).toContain(
      "actionLabel={$t(i18nKeys.console.organization.createToken)}",
    );
    expect(deployTokensSectionSource).toContain("onAction={openDeployTokenCreateDialog}");
    expect(deployTokensSectionSource).toContain("{:else if deployTokens.length === 0}");
    expect(deployTokensSectionSource).not.toContain("submitDeployToken");
    expect(deployTokensSectionSource).not.toContain("bind:value={tokenName}");
    expect(organizationPageSource).toContain("onsubmit={submitInvite}");
    expect(organizationPageSource).toContain("onsubmit={submitDeployToken}");
    expect(organizationPageSource).toContain("loginMethodLabel(method.key)");
    expect(organizationPageSource).toContain("invitationStatusLabel(invitation.status)");
    expect(organizationPageSource).not.toContain("{method.key} ·");
    expect(organizationPageSource).not.toContain("{invitation.status} ·");

    for (const source of [
      organizationPageSource,
      accountProfileSource,
      accountSecuritySource,
      accountSessionsSource,
      accountDangerSource,
    ]) {
      expect(source).not.toContain("@appaloft/auth-better");
      expect(source).not.toContain("betterAuth");
      expect(source).not.toContain("better-auth");
    }

    expect(consoleShellSource).toContain("ConsoleUserMenu");
    expect(consoleShellSource).toContain("ConsoleOrganizationSwitcher");
    expect(organizationSwitcherSource).toContain("DropdownMenuContent");
    expect(organizationSwitcherSource).toContain("DropdownMenuItem");
    expect(consoleExtensionPageSource).toContain(
      '<h1 class="truncate text-2xl font-semibold">{pageDocument.title}</h1>',
    );
    expect(consoleExtensionPageSource).toContain("{pageDocument.description}");
    expect(consoleExtensionPageSource).toContain("pageDocument.actions");
    expect(consoleExtensionPageSource).toContain("data-console-page-table-body");
    expect(consoleExtensionPageSource).toContain('class="border-t px-5"');
    expect(userMenuSource).toContain('navigateTo("/account/profile")');
    expect(userMenuSource).not.toContain('navigateTo("/account/security")');
    expect(clientContractSource).toContain("account: {");
    expect(clientContractSource).toContain("ShowAccountProfileQueryInput");
    expect(clientContractSource).toContain("ChangeAccountProfileCommandInput");
    expect(clientContractSource).toContain("DeleteAccountCommandInput");
    expect(clientContractSource).toContain("ShowOrganizationProfileQueryInput");
    expect(clientContractSource).toContain("ChangeOrganizationProfileCommandInput");
    expect(clientContractSource).toContain("DeleteOrganizationCommandInput");
    expect(enUSSource).toContain("accountSettings");
    expect(enUSSource).toContain("dangerZoneTitle");
    expect(enUSSource).toContain(
      "Manage the current organization members, invitations, and deploy token credentials.",
    );
    expect(enUSSource).toContain("Invite member");
    expect(enUSSource).toContain("View current organization members and roles.");
    expect(enUSSource).not.toContain("Appaloft contracts");
    expect(enUSSource).not.toContain("operators, invitations");
    expect(enUSSource).not.toContain("Invite operator");
    expect(enUSSource).not.toContain("organization query contract");
    expect(zhCNSource).toContain("accountSettings");
    expect(zhCNSource).toContain("dangerZoneTitle");

    expect(zhCN.console.organization).toMatchObject({
      pageTitle: "组织",
      profileTitle: "资料",
      deployTokensTitle: "部署令牌",
      dangerZoneTitle: "危险区域",
      dangerConfirmLabel: "输入组织名称以确认",
      dangerConfirmMismatch: "组织名称不匹配。",
      deleteOrganizationDialogTitle: "确认删除组织",
      roleLabel: "角色",
      methodLocalPassword: "本地密码",
      statusPending: "待处理",
      inviteTitle: "邀请成员",
      inviteDescription: "创建组织邀请，不会显示邀请密钥。",
      focusDescription: "管理当前组织的成员、邀请和部署令牌凭据。",
      deployTokensDescription: "创建、轮换和撤销自动化流程使用的机器凭据。",
      emptyInvitationsDescription: "创建第一个邀请后，待处理和历史邀请会显示在这里。",
      emptyInvitationsTitle: "还没有组织邀请。",
      emptyTokensDescription: "创建第一个部署令牌后，自动化流程可以安全调用部署入口。",
      emptyTokensTitle: "还没有部署令牌。",
      membersDescription: "查看当前组织的成员和角色。",
      invitationsDescription: "查看待处理和历史邀请，并创建新的组织邀请。",
      ownerSafetyNotice: "所有者变更只能通过移交完成。角色更新和成员移除仅适用于非所有者成员。",
      repositoryScopePlaceholder: "组织名/仓库名",
      tokenCreateDescription: "按用途限定令牌权限，并可选限制到指定仓库。",
      tokenNamePlaceholder: "自动化部署凭据",
      workflowLabel: "用途",
    });
    expect(Object.values(zhCN.console.organization).join("\n")).not.toMatch(
      /\b(Organization|organization|operator|Operator|Deploy tokens|Deploy token|deploy-token|Role|Developer|Owner|Profile|Workflow|workflow|Repository|repository|Token|token|Source-link|GitHub Action deploy|owner\/repository|full name|Secret suffix|secret|contract|contracts)\b|契约|工作流命令|仓库全名/,
    );
  });
});
