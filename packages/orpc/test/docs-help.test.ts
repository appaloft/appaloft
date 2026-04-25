import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";

import {
  apiDocsHrefs,
  apiRouteDescriptions,
  createDeploymentDocsHref,
  createDeploymentRouteDescription,
} from "../src";

describe("HTTP API docs help links", () => {
  test("[PUB-DOCS-012] create deployment description points at the public docs registry anchor", () => {
    expect(createDeploymentDocsHref).toBe("/docs/deploy/sources/#deployment-source");
    expect(createDeploymentRouteDescription).toContain(createDeploymentDocsHref);
  });

  test("[PUB-DOCS-012] high-confusion HTTP route descriptions point at stable docs anchors", () => {
    expect(apiDocsHrefs.serverCredential).toBe(
      "/docs/servers/credentials/ssh-keys/#server-ssh-credential-path",
    );
    expect(apiDocsHrefs.environmentVariablePrecedence).toBe(
      "/docs/environments/variables/precedence/#environment-variable-precedence",
    );
    expect(apiDocsHrefs.resourceHealthProfile).toBe(
      "/docs/resources/profiles/health-network/#resource-health-profile",
    );
    expect(apiDocsHrefs.domainOwnershipCheck).toBe(
      "/docs/access/domains/ownership/#domain-binding-ownership-check",
    );
    expect(apiDocsHrefs.terminalSession).toBe(
      "/docs/servers/operations/proxy-and-terminal/#server-terminal-session",
    );

    expect(apiRouteDescriptions.configureServerCredential).toContain(apiDocsHrefs.serverCredential);
    expect(apiRouteDescriptions.rotateSshCredential).toContain(apiDocsHrefs.serverCredential);
    expect(apiRouteDescriptions.setEnvironmentVariable).toContain(
      apiDocsHrefs.environmentVariablePrecedence,
    );
    expect(apiRouteDescriptions.configureResourceHealth).toContain(
      apiDocsHrefs.resourceHealthProfile,
    );
    expect(apiRouteDescriptions.confirmDomainBindingOwnership).toContain(
      apiDocsHrefs.domainOwnershipCheck,
    );
    expect(apiRouteDescriptions.openTerminalSession).toContain(apiDocsHrefs.terminalSession);
  });
});
