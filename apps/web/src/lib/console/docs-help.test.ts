import { describe, expect, test } from "vitest";

import { quickDeploySourceHelpHref, webDocsHrefs } from "./docs-help";

describe("console docs help links", () => {
  test("[PUB-DOCS-010] quick deploy source help uses the public docs registry anchor", () => {
    expect(quickDeploySourceHelpHref).toBe("/docs/deploy/sources/#deployment-source");
  });

  test("[PUB-DOCS-010] Web help hrefs cover high-confusion console surfaces", () => {
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
});
