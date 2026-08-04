import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("Agent Adapter organization management", () => {
  test("[ADAPTER-SURFACE-011] uses the shared oRPC lifecycle and organization settings IA", async () => {
    const [pageSource, routeSource, settingsNavSource] = await Promise.all([
      readFile(new URL("../../routes/organization/+page.svelte", import.meta.url), "utf8"),
      readFile(
        new URL("../../routes/organization/agent-adapters/+page.svelte", import.meta.url),
        "utf8",
      ),
      readFile(new URL("./settings-nav.ts", import.meta.url), "utf8"),
    ]);

    expect(routeSource).toContain('<OrganizationPage section="agent-adapters" />');
    expect(settingsNavSource).toContain('href: "/organization/agent-adapters"');
    expect(pageSource).toContain("orpc.agentAdapters.list.queryOptions");
    expect(pageSource).toContain("orpc.agentAdapters.show.queryOptions");
    expect(pageSource).toContain("orpcClient.agentAdapters.validate");
    expect(pageSource).toContain("orpcClient.agentAdapters.install");
    expect(pageSource).toContain("orpcClient.agentAdapters.disable");
    expect(pageSource).toContain("orpcClient.agentAdapters.uninstall");
    expect(pageSource).toContain("data-organization-agent-adapters-display-surface");
    expect(pageSource).toContain("data-organization-agent-adapter-install-dialog");
    expect(pageSource).toContain("data-organization-agent-adapter-lifecycle-dialog");
    const displaySurface =
      pageSource.match(
        /data-organization-agent-adapters-display-surface[\s\S]*?{#if activeSection === "archived-projects"}/,
      )?.[0] ?? "";
    expect(displaySurface).not.toContain("<form");
    expect(displaySurface).not.toContain("<Textarea");
    expect(pageSource).toContain("<Textarea");
    expect(pageSource).toContain("submitAgentAdapterLifecycleAction");
    expect(pageSource).toContain("orpc.agentWorkspaceProfiles.list.queryOptions");
    expect(pageSource).toContain("orpcClient.agentWorkspaceProfiles.validate");
    expect(pageSource).toContain("orpcClient.agentWorkspaceProfiles.install");
    expect(pageSource).toContain("orpcClient.agentWorkspaceProfiles.disable");
    expect(pageSource).toContain("orpcClient.agentWorkspaceProfiles.uninstall");
    expect(pageSource).toContain("data-organization-agent-workspace-profiles");
    expect(pageSource).toContain("data-organization-agent-workspace-profile-install-dialog");
    expect(pageSource).toContain("data-organization-agent-workspace-profile-lifecycle-dialog");
    expect(pageSource).toContain("capabilityKey(agentWorkspaceProfileInstallCapability)");
    expect(pageSource).not.toContain("organizationId: currentOrganizationId,\n        manifest");
  });

  test("[AGENT-SETUP-UX-001][AGENT-SETUP-UX-002][AGENT-SETUP-UX-003] presents task setup before custom manifests", async () => {
    const pageSource = await readFile(
      new URL("../../routes/organization/+page.svelte", import.meta.url),
      "utf8",
    );

    expect(pageSource).toContain("data-organization-agent-setup-overview");
    expect(pageSource).toContain('data-organization-agent-option="opencode"');
    expect(pageSource).toContain('data-organization-agent-option="pi"');
    expect(pageSource).toContain("data-organization-model-connections");
    expect(pageSource).toContain("agent-model-connections");
    expect(pageSource).toContain("data-organization-agent-custom-integrations");
    const primarySurface =
      pageSource.match(
        /data-organization-agent-setup-overview[\s\S]*?data-organization-agent-custom-integrations/,
      )?.[0] ?? "";
    expect(primarySurface).not.toContain("openAgentAdapterInstallDialog");
    expect(primarySurface).not.toContain("openAgentWorkspaceProfileInstallDialog");
    expect(primarySurface).not.toContain("<Textarea");
  });
});
