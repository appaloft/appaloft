import { readFile } from "node:fs/promises";
import { enUS, zhCN } from "@appaloft/i18n";
import { describe, expect, test } from "vitest";

import {
  docsHelpTooltipKeyForHref,
  quickDeploySourceHelpHref,
  webDocsHrefs,
  webDocsTooltipKeys,
} from "./docs-help";

describe("console docs help links", () => {
  test("[PUB-DOCS-010] quick deploy source help uses the public docs registry anchor", () => {
    expect(quickDeploySourceHelpHref).toBe("/docs/deploy/sources/#deployment-source");
  });

  test("[PUB-DOCS-010] Web help hrefs cover high-confusion console surfaces", () => {
    expect(webDocsHrefs.docsHome).toBe("/docs/");
    expect(webDocsHrefs.defaultAccessPolicy).toBe(
      "/docs/access/generated-routes/#default-access-policy",
    );
    expect(webDocsHrefs.serverDeploymentTarget).toBe(
      "/docs/servers/register-connect/#server-deployment-target",
    );
    expect(webDocsHrefs.serverSshCredential).toBe(
      "/docs/servers/credentials/ssh-keys/#server-ssh-credential-path",
    );
    expect(webDocsHrefs.serverConnectivityTest).toBe(
      "/docs/servers/register-connect/#server-connectivity-test",
    );
    expect(webDocsHrefs.serverDockerSwarmTarget).toBe(
      "/docs/servers/register-connect/#docker-swarm-runtime-target",
    );
    expect(webDocsHrefs.environmentVariablePrecedence).toBe(
      "/docs/environments/variables/precedence/#environment-variable-precedence",
    );
    expect(webDocsHrefs.environmentLifecycle).toBe(
      "/docs/environments/model/#environment-lifecycle",
    );
    expect(webDocsHrefs.resourceRuntimeProfile).toBe(
      "/docs/resources/profiles/source-runtime/#resource-runtime-profile",
    );
    expect(webDocsHrefs.resourceProfileDrift).toBe(
      "/docs/resources/profiles/source-runtime/#resource-profile-drift",
    );
    expect(webDocsHrefs.resourceHealthProfile).toBe(
      "/docs/resources/profiles/health-network/#resource-health-profile",
    );
    expect(webDocsHrefs.resourceNetworkProfile).toBe(
      "/docs/resources/profiles/health-network/#resource-network-profile",
    );
    expect(webDocsHrefs.dependencyResourceLifecycle).toBe(
      "/docs/resources/dependencies/#dependency-resource-lifecycle",
    );
    expect(webDocsHrefs.dependencyBackupRestore).toBe(
      "/docs/resources/dependencies/#dependency-backup-restore",
    );
    expect(webDocsHrefs.dependencyRuntimeInjection).toBe(
      "/docs/resources/dependencies/#dependency-runtime-injection",
    );
  });

  test("[PUB-DOCS-010] Web help hrefs cover owner-scoped console surfaces", () => {
    expect(webDocsHrefs.deploymentLifecycle).toBe("/docs/deploy/lifecycle/#deployment-lifecycle");
    expect(webDocsHrefs.deploymentPlanPreview).toBe(
      "/docs/deploy/lifecycle/#deployment-plan-preview",
    );
    expect(webDocsHrefs.productGradePreviews).toBe(
      "/docs/deploy/previews/#product-grade-preview-deployments",
    );
    expect(webDocsHrefs.appaloftSkill).toBe("/docs/agent/appaloft-skill/#appaloft-skill");
    expect(webDocsHrefs.appaloftMcpServer).toBe("/docs/agent/mcp-server/#appaloft-mcp-server");
    expect(webDocsHrefs.serverProxyReadiness).toBe(
      "/docs/servers/operations/proxy-and-terminal/#server-proxy-readiness",
    );
    expect(webDocsHrefs.serverTerminalSession).toBe(
      "/docs/servers/operations/proxy-and-terminal/#server-terminal-session",
    );
    expect(webDocsHrefs.maintenanceWorkerActivation).toBe(
      "/docs/self-hosting/advanced/#maintenance-worker-activation",
    );
    expect(webDocsHrefs.domainGeneratedAccessRoute).toBe(
      "/docs/access/generated-routes/#access-generated-route",
    );
    expect(webDocsHrefs.domainCustomDomainBinding).toBe(
      "/docs/access/domains/custom-domains/#domain-binding-purpose",
    );
    expect(webDocsHrefs.certificateReadiness).toBe(
      "/docs/access/tls/certificates/#certificate-readiness",
    );
    expect(webDocsHrefs.observabilityRuntimeLogs).toBe(
      "/docs/observe/logs-health/#observe-runtime-logs",
    );
    expect(webDocsHrefs.observabilityHealthSummary).toBe(
      "/docs/observe/logs-health/#observe-health-summary",
    );
    expect(webDocsHrefs.diagnosticsSafeSupportPayload).toBe(
      "/docs/observe/diagnostics/#diagnostic-summary-copy-support-payload",
    );
    expect(webDocsHrefs.runtimeUsageInspect).toBe(
      "/docs/observe/diagnostics/#runtime-usage-inspect",
    );
    expect(webDocsHrefs.runtimeTargetCapacity).toBe(
      "/docs/observe/diagnostics/#runtime-target-capacity-inspect",
    );
    expect(webDocsHrefs.sourceAutoDeploySetup).toBe(
      "/docs/deploy/sources/#source-auto-deploy-setup",
    );
    expect(webDocsHrefs.sourceAutoDeploySignatures).toBe(
      "/docs/deploy/sources/#source-auto-deploy-signatures",
    );
    expect(webDocsHrefs.sourceAutoDeployDedupe).toBe(
      "/docs/deploy/sources/#source-auto-deploy-dedupe",
    );
    expect(webDocsHrefs.sourceAutoDeployIgnoredEvents).toBe(
      "/docs/deploy/sources/#source-auto-deploy-ignored-events",
    );
    expect(webDocsHrefs.sourceAutoDeployRecovery).toBe(
      "/docs/deploy/sources/#source-auto-deploy-recovery",
    );
    expect(webDocsHrefs.scheduledTaskLifecycle).toBe(
      "/docs/resources/scheduled-tasks/#scheduled-task-resource-lifecycle",
    );
  });

  test("[PUB-DOCS-010] Web docs help hrefs have localized tooltip summaries", () => {
    expect(Object.keys(webDocsTooltipKeys).sort()).toEqual(Object.keys(webDocsHrefs).sort());
    expect(docsHelpTooltipKeyForHref(webDocsHrefs.sourceAutoDeploySetup)).toBe(
      "console:docsHelp.sourceAutoDeploySetup",
    );
    expect(docsHelpTooltipKeyForHref(webDocsHrefs.sourceAutoDeployDedupe)).toBe(
      "console:docsHelp.sourceAutoDeployDedupe",
    );
  });

  test("[PUB-DOCS-010] docs help tooltips define concepts instead of describing docs", () => {
    expect(Object.values(zhCN.console.docsHelp)).not.toContainEqual(expect.stringMatching(/^解释/));
    expect(Object.values(enUS.console.docsHelp)).not.toContainEqual(
      expect.stringMatching(/^Explains\b/),
    );
  });

  test("[PUB-DOCS-010] owner-scoped Web forms mount help links for complex inputs", async () => {
    const sourceByPath = Object.fromEntries(
      await Promise.all(
        [
          "routes/domain-bindings/+page.svelte",
          "routes/preview-environments/+page.svelte",
          "routes/preview-environments/[previewEnvironmentId=consoleObjectId]/+page.svelte",
          "routes/preview-policies/+page.svelte",
          "routes/instance/+page.svelte",
          "routes/projects/[projectId=consoleObjectId]/+page.svelte",
          "routes/resources/[resourceId=consoleObjectId]/+page.svelte",
          "routes/servers/+page.svelte",
          "routes/servers/[serverId=consoleObjectId]/+page.svelte",
        ].map(async (path) => [
          path,
          await readFile(new URL(`../../${path}`, import.meta.url), "utf8"),
        ]),
      ),
    );

    expect(sourceByPath["routes/domain-bindings/+page.svelte"]).toContain("DocsHelpLink");
    expect(sourceByPath["routes/domain-bindings/+page.svelte"]).toContain(
      "domainCustomDomainBinding",
    );
    expect(sourceByPath["routes/preview-environments/+page.svelte"]).toContain(
      "productGradePreviews",
    );
    expect(
      sourceByPath[
        "routes/preview-environments/[previewEnvironmentId=consoleObjectId]/+page.svelte"
      ],
    ).toContain("productGradePreviews");
    expect(sourceByPath["routes/preview-policies/+page.svelte"]).toContain("productGradePreviews");
    expect(sourceByPath["routes/instance/+page.svelte"]).toContain("DocsHelpLink");
    expect(sourceByPath["routes/instance/+page.svelte"]).toContain("serverTerminalSession");
    expect(sourceByPath["routes/instance/+page.svelte"]).toContain("maintenanceWorkerActivation");
    expect(sourceByPath["routes/projects/[projectId=consoleObjectId]/+page.svelte"]).toContain(
      "environmentLifecycle",
    );

    expect(sourceByPath["routes/resources/[resourceId=consoleObjectId]/+page.svelte"]).toContain(
      "resourceSourceProfile",
    );
    expect(sourceByPath["routes/resources/[resourceId=consoleObjectId]/+page.svelte"]).toContain(
      "resourceRuntimeProfile",
    );
    expect(sourceByPath["routes/resources/[resourceId=consoleObjectId]/+page.svelte"]).toContain(
      "resourceNetworkProfile",
    );
    expect(sourceByPath["routes/resources/[resourceId=consoleObjectId]/+page.svelte"]).toContain(
      "observabilityRuntimeLogs",
    );
    expect(sourceByPath["routes/resources/[resourceId=consoleObjectId]/+page.svelte"]).toContain(
      "diagnosticsSafeSupportPayload",
    );
    expect(sourceByPath["routes/resources/[resourceId=consoleObjectId]/+page.svelte"]).toContain(
      "orpcClient.resources.diagnosticSummary",
    );
    expect(sourceByPath["routes/resources/[resourceId=consoleObjectId]/+page.svelte"]).toContain(
      "orpcClient.resources.importVariables",
    );
    expect(
      sourceByPath["routes/resources/[resourceId=consoleObjectId]/+page.svelte"],
    ).not.toContain("resource-configuration-import-form");
    expect(sourceByPath["routes/resources/[resourceId=consoleObjectId]/+page.svelte"]).toContain(
      "resource-diagnostic-summary-copy",
    );
    expect(sourceByPath["routes/resources/[resourceId=consoleObjectId]/+page.svelte"]).toContain(
      "accessFailureTitle",
    );
    expect(sourceByPath["routes/resources/[resourceId=consoleObjectId]/+page.svelte"]).toContain(
      "selectCurrentResourceAccessRoute",
    );
    expect(sourceByPath["routes/resources/[resourceId=consoleObjectId]/+page.svelte"]).toContain(
      "resourceProfileDrift",
    );
    expect(sourceByPath["routes/resources/[resourceId=consoleObjectId]/+page.svelte"]).toContain(
      "profileDiagnosticsSuggestedCommand",
    );
    expect(sourceByPath["routes/resources/[resourceId=consoleObjectId]/+page.svelte"]).toContain(
      "serverTerminalSession",
    );
    expect(sourceByPath["routes/resources/[resourceId=consoleObjectId]/+page.svelte"]).toContain(
      "certificateReadiness",
    );
    expect(sourceByPath["routes/resources/[resourceId=consoleObjectId]/+page.svelte"]).toContain(
      "domainCustomDomainBinding",
    );
    expect(sourceByPath["routes/resources/[resourceId=consoleObjectId]/+page.svelte"]).toContain(
      "orpcClient.domainBindings.create",
    );
    expect(sourceByPath["routes/resources/[resourceId=consoleObjectId]/+page.svelte"]).toContain(
      "orpcClient.domainBindings.confirmOwnership",
    );
    expect(
      sourceByPath["routes/resources/[resourceId=consoleObjectId]/+page.svelte"],
    ).not.toContain("resource-domain-binding-create-form");
    expect(sourceByPath["routes/resources/[resourceId=consoleObjectId]/+page.svelte"]).toContain(
      "scheduledTaskLifecycle",
    );
    expect(sourceByPath["routes/resources/[resourceId=consoleObjectId]/+page.svelte"]).toContain(
      "orpcClient.scheduledTasks.runNow",
    );
    expect(sourceByPath["routes/resources/[resourceId=consoleObjectId]/+page.svelte"]).toContain(
      "scheduledTaskRunLogs",
    );
    expect(sourceByPath["routes/resources/[resourceId=consoleObjectId]/+page.svelte"]).toContain(
      "orpcClient.certificates.retry",
    );
    expect(sourceByPath["routes/resources/[resourceId=consoleObjectId]/+page.svelte"]).toContain(
      "orpcClient.certificates.revoke",
    );

    expect(sourceByPath["routes/resources/[resourceId=consoleObjectId]/+page.svelte"]).toContain(
      "deploymentLifecycle",
    );
    expect(sourceByPath["routes/resources/[resourceId=consoleObjectId]/+page.svelte"]).toContain(
      "deploymentPlanPreview",
    );
    expect(sourceByPath["routes/servers/[serverId=consoleObjectId]/+page.svelte"]).toContain(
      "serverConnectivityTest",
    );
    expect(sourceByPath["routes/servers/[serverId=consoleObjectId]/+page.svelte"]).toContain(
      "serverTerminalSession",
    );
    expect(sourceByPath["routes/servers/[serverId=consoleObjectId]/+page.svelte"]).toContain(
      "orpc.servers.deleteCheck.queryOptions",
    );
    expect(sourceByPath["routes/servers/[serverId=consoleObjectId]/+page.svelte"]).toContain(
      "orpcClient.servers.delete",
    );
    expect(sourceByPath["routes/servers/[serverId=consoleObjectId]/+page.svelte"]).toContain(
      "orpcClient.servers.deactivate",
    );
    expect(sourceByPath["routes/servers/[serverId=consoleObjectId]/+page.svelte"]).toContain(
      "runtimeTargetCapacity",
    );
    expect(sourceByPath["routes/servers/[serverId=consoleObjectId]/+page.svelte"]).toContain(
      "orpc.servers.capacity.inspect.queryOptions",
    );
    expect(sourceByPath["routes/servers/[serverId=consoleObjectId]/+page.svelte"]).toContain(
      "lifecycleDialogTitle",
    );
    expect(sourceByPath["routes/servers/[serverId=consoleObjectId]/+page.svelte"]).toContain(
      "data-server-lifecycle-dialog",
    );
    expect(sourceByPath["routes/servers/[serverId=consoleObjectId]/+page.svelte"]).toContain(
      "serverLifecycleConfirmation.trim() === server?.id",
    );
    expect(
      await readFile(
        new URL("../../lib/components/console/ServerRegistrationForm.svelte", import.meta.url),
        "utf8",
      ),
    ).toContain("serverDeploymentTarget");
  });

  test("[PUB-DOCS-010] docs help links use the shared tooltip primitive", async () => {
    const docsHelpLinkSource = await readFile(
      new URL("../../lib/components/console/DocsHelpLink.svelte", import.meta.url),
      "utf8",
    );

    expect(docsHelpLinkSource).toContain("$lib/components/ui/tooltip");
    expect(docsHelpLinkSource).toContain("docsHelpTooltipKeyForHref");
    expect(docsHelpLinkSource).toContain("<Tooltip.Content");
    expect(docsHelpLinkSource).not.toContain("title={ariaLabel}");
  });

  test("[PUB-DOCS-010] resource detail section headings keep one docs help affordance", async () => {
    const resourcePageSource = await readFile(
      new URL("../../routes/resources/[resourceId=consoleObjectId]/+page.svelte", import.meta.url),
      "utf8",
    );

    expect(resourcePageSource).not.toMatch(
      /sourceEventsTitle[\s\S]*?sourceAutoDeployIgnoredEvents[\s\S]*?sourceEventsDescription/,
    );
    expect(resourcePageSource).not.toMatch(
      /sourceEventsTitle[\s\S]*?sourceAutoDeployRecovery[\s\S]*?sourceEventsDescription/,
    );
    expect(resourcePageSource).not.toMatch(
      /overviewConfigurationSummary[\s\S]*?resourceRuntimeProfile[\s\S]*?profileEditBoundaryDescription/,
    );
    expect(resourcePageSource).not.toMatch(
      /overviewConfigurationSummary[\s\S]*?resourceNetworkProfile[\s\S]*?profileEditBoundaryDescription/,
    );
    expect(resourcePageSource).not.toMatch(
      /autoDeployTitle[\s\S]*?sourceAutoDeploySignatures[\s\S]*?autoDeployDescription/,
    );
    expect(resourcePageSource).not.toMatch(
      /dependenciesTitle[\s\S]*?dependencyRuntimeInjection[\s\S]*?dependenciesDescription/,
    );
  });
});
