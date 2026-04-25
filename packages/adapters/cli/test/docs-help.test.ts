import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";

describe("CLI docs help links", () => {
  test("[PUB-DOCS-011] deploy help surfaces the public docs registry anchor", async () => {
    const { deployCommandDescription, deployCommandDocsHref } = await import(
      "../src/commands/deployment"
    );

    expect(deployCommandDocsHref).toBe("/docs/deploy/sources/#deployment-source");
    expect(deployCommandDescription).toContain(deployCommandDocsHref);
  });

  test("[PUB-DOCS-011] high-confusion CLI command descriptions point at stable docs anchors", async () => {
    const { cliCommandDescriptions, cliDocsHrefs } = await import("../src/commands/docs-help");

    expect(cliDocsHrefs.serverSshCredential).toBe(
      "/docs/servers/credentials/ssh-keys/#server-ssh-credential-path",
    );
    expect(cliDocsHrefs.environmentVariablePrecedence).toBe(
      "/docs/environments/variables/precedence/#environment-variable-precedence",
    );
    expect(cliDocsHrefs.resourceRuntimeProfile).toBe(
      "/docs/resources/profiles/source-runtime/#resource-runtime-profile",
    );
    expect(cliDocsHrefs.domainCustomBinding).toBe(
      "/docs/access/domains/custom-domains/#domain-binding-purpose",
    );
    expect(cliDocsHrefs.certificateReadiness).toBe(
      "/docs/access/tls/certificates/#certificate-readiness",
    );
    expect(cliDocsHrefs.deploymentPreviewCleanup).toBe(
      "/docs/deploy/recovery/#deployment-preview-cleanup",
    );
    expect(cliDocsHrefs.deploymentSourceRelink).toBe(
      "/docs/deploy/recovery/#deployment-source-relink",
    );
    expect(cliDocsHrefs.serverTerminalSession).toBe(
      "/docs/servers/operations/proxy-and-terminal/#server-terminal-session",
    );

    expect(cliCommandDescriptions.serverCredential).toContain(cliDocsHrefs.serverSshCredential);
    expect(cliCommandDescriptions.serverCredentialRotate).toContain(
      cliDocsHrefs.serverSshCredential,
    );
    expect(cliCommandDescriptions.environmentSet).toContain(
      cliDocsHrefs.environmentVariablePrecedence,
    );
    expect(cliCommandDescriptions.resourceConfigureRuntime).toContain(
      cliDocsHrefs.resourceRuntimeProfile,
    );
    expect(cliCommandDescriptions.domainBindingCreate).toContain(cliDocsHrefs.domainCustomBinding);
    expect(cliCommandDescriptions.certificateIssueOrRenew).toContain(
      cliDocsHrefs.certificateReadiness,
    );
    expect(cliCommandDescriptions.previewCleanup).toContain(cliDocsHrefs.deploymentPreviewCleanup);
    expect(cliCommandDescriptions.sourceLinkRelink).toContain(cliDocsHrefs.deploymentSourceRelink);
    expect(cliCommandDescriptions.serverTerminal).toContain(cliDocsHrefs.serverTerminalSession);
  });
});
