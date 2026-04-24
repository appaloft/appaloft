import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import { quickDeploySourceHelpHref, webDocsHrefs } from "./docs-help";

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
    expect(webDocsHrefs.environmentVariablePrecedence).toBe(
      "/docs/environments/variables/precedence/#environment-variable-precedence",
    );
    expect(webDocsHrefs.resourceRuntimeProfile).toBe(
      "/docs/resources/profiles/source-runtime/#resource-runtime-profile",
    );
    expect(webDocsHrefs.resourceHealthProfile).toBe(
      "/docs/resources/profiles/health-network/#resource-health-profile",
    );
    expect(webDocsHrefs.resourceNetworkProfile).toBe(
      "/docs/resources/profiles/health-network/#resource-network-profile",
    );
  });

  test("[PUB-DOCS-010] Web help hrefs cover owner-scoped console surfaces", () => {
    expect(webDocsHrefs.deploymentLifecycle).toBe("/docs/deploy/lifecycle/#deployment-lifecycle");
    expect(webDocsHrefs.serverProxyReadiness).toBe(
      "/docs/servers/operations/proxy-and-terminal/#server-proxy-readiness",
    );
    expect(webDocsHrefs.serverTerminalSession).toBe(
      "/docs/servers/operations/proxy-and-terminal/#server-terminal-session",
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
  });

  test("[PUB-DOCS-010] owner-scoped Web forms mount help links for complex inputs", async () => {
    const sourceByPath = Object.fromEntries(
      await Promise.all(
        [
          "routes/domain-bindings/+page.svelte",
          "routes/resources/[resourceId]/+page.svelte",
          "routes/projects/[projectId]/environments/[environmentId]/resources/[resourceId]/deployments/new/+page.svelte",
          "routes/servers/+page.svelte",
          "routes/servers/[serverId]/+page.svelte",
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
    expect(sourceByPath["routes/domain-bindings/+page.svelte"]).toContain("certificateReadiness");
    expect(sourceByPath["routes/domain-bindings/+page.svelte"]).toContain("serverProxyReadiness");

    expect(sourceByPath["routes/resources/[resourceId]/+page.svelte"]).toContain(
      "resourceSourceProfile",
    );
    expect(sourceByPath["routes/resources/[resourceId]/+page.svelte"]).toContain(
      "resourceRuntimeProfile",
    );
    expect(sourceByPath["routes/resources/[resourceId]/+page.svelte"]).toContain(
      "resourceNetworkProfile",
    );
    expect(sourceByPath["routes/resources/[resourceId]/+page.svelte"]).toContain(
      "observabilityRuntimeLogs",
    );
    expect(sourceByPath["routes/resources/[resourceId]/+page.svelte"]).toContain(
      "diagnosticsSafeSupportPayload",
    );
    expect(sourceByPath["routes/resources/[resourceId]/+page.svelte"]).toContain(
      "serverTerminalSession",
    );

    expect(
      sourceByPath[
        "routes/projects/[projectId]/environments/[environmentId]/resources/[resourceId]/deployments/new/+page.svelte"
      ],
    ).toContain("deploymentLifecycle");
    expect(sourceByPath["routes/servers/+page.svelte"]).toContain("defaultAccessPolicy");
    expect(sourceByPath["routes/servers/+page.svelte"]).toContain("serverSshCredential");
    expect(sourceByPath["routes/servers/+page.svelte"]).toContain(
      "orpcClient.credentials.ssh.delete",
    );
    expect(sourceByPath["routes/servers/+page.svelte"]).toContain("deleteCredentialDialogTitle");
    expect(sourceByPath["routes/servers/[serverId]/+page.svelte"]).toContain(
      "serverConnectivityTest",
    );
    expect(sourceByPath["routes/servers/[serverId]/+page.svelte"]).toContain("defaultAccessPolicy");
    expect(sourceByPath["routes/servers/[serverId]/+page.svelte"]).toContain(
      "serverTerminalSession",
    );
  });
});
