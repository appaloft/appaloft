import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import { webDocsHrefs } from "./docs-help";

describe("organization auth management console surface", () => {
  test("[ORG-TEAM-WEB-001] exposes organization/team operations through shared oRPC contracts", async () => {
    const [pageSource, shellSource, clientContractSource] = await Promise.all([
      readFile(new URL("../../routes/organization/+page.svelte", import.meta.url), "utf8"),
      readFile(
        new URL("../../lib/components/console/ConsoleShell.svelte", import.meta.url),
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
    expect(pageSource).toContain("i18nKeys.console.organization");
    expect(pageSource).toContain("organizationTeamManagement");
    expect(pageSource).not.toContain("better-auth");
    expect(shellSource).not.toContain('href: "/organization"');
    expect(shellSource).not.toContain('href: "/instance"');
    expect(shellSource).toContain('navigateTo("/organization")');
    expect(shellSource).toContain('navigateTo("/instance")');
    expect(shellSource).toContain("i18nKeys.console.nav.organization");
    expect(shellSource).toContain("i18nKeys.console.nav.instance");
    expect(shellSource).toContain('"/api/auth/sign-out"');
    expect(shellSource).toContain("i18nKeys.common.actions.signOut");
    expect(shellSource).toContain("data-console-sign-out-action");
    expect(clientContractSource).toContain("organizations: {");
    expect(clientContractSource).toContain("SwitchCurrentOrganizationCommandInput");
    expect(clientContractSource).toContain("InviteOrganizationMemberCommandInput");
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
    const [organizationPageSource, instancePageSource, managementShellSource] = await Promise.all([
      readFile(new URL("../../routes/organization/+page.svelte", import.meta.url), "utf8"),
      readFile(new URL("../../routes/instance/+page.svelte", import.meta.url), "utf8"),
      readFile(
        new URL("../../lib/components/console/ManagementShell.svelte", import.meta.url),
        "utf8",
      ),
    ]);

    expect(organizationPageSource).toContain("ManagementShell");
    expect(instancePageSource).toContain("ManagementShell");
    expect(instancePageSource).toContain("orpcClient.system.doctor");
    expect(instancePageSource).toContain("maintenanceWorkers");
    expect(instancePageSource).toContain("workerSafetyLabelKey");
    expect(instancePageSource).toContain("i18nKeys.console.instance.maintenanceWorkersTitle");
    expect(organizationPageSource).not.toContain("ConsoleShell");
    expect(instancePageSource).not.toContain("ConsoleShell");
    expect(organizationPageSource).toContain("activeSection");
    expect(organizationPageSource).toContain("sectionOptions");
    expect(organizationPageSource).toContain('href: "/organization/members"');
    expect(organizationPageSource).toContain('href: "/organization/invitations"');
    expect(organizationPageSource).toContain('href: "/organization/deploy-tokens"');
    expect(managementShellSource).not.toContain('href: "/organization"');
    expect(managementShellSource).not.toContain('href: "/instance"');
    expect(managementShellSource).not.toContain("managementItems");
    expect(managementShellSource).not.toContain("i18nKeys.console.nav.management");
    expect(managementShellSource).not.toContain("projectSearch");
    expect(managementShellSource).not.toContain("filteredProjects");
  });
});
