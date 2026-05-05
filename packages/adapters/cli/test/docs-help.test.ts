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
    expect(cliDocsHrefs.environmentLifecycle).toBe(
      "/docs/environments/model/#environment-lifecycle",
    );
    expect(cliDocsHrefs.resourceRuntimeProfile).toBe(
      "/docs/resources/profiles/source-runtime/#resource-runtime-profile",
    );
    expect(cliDocsHrefs.resourceProfileDrift).toBe(
      "/docs/resources/profiles/source-runtime/#resource-profile-drift",
    );
    expect(cliDocsHrefs.resourceAccessProfile).toBe(
      "/docs/access/generated-routes/#resource-access-profile",
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
    expect(cliDocsHrefs.deploymentPlanPreview).toBe(
      "/docs/deploy/lifecycle/#deployment-plan-preview",
    );
    expect(cliDocsHrefs.serverTerminalSession).toBe(
      "/docs/servers/operations/proxy-and-terminal/#server-terminal-session",
    );
    expect(cliDocsHrefs.serverDockerSwarmTarget).toBe(
      "/docs/servers/register-connect/#docker-swarm-runtime-target",
    );
    expect(cliDocsHrefs.remoteStateLock).toBe("/docs/reference/errors-statuses/#remote-state-lock");
    expect(cliDocsHrefs.operatorWorkLedger).toBe(
      "/docs/reference/errors-statuses/#operator-work-ledger",
    );
    expect(cliDocsHrefs.sourceAutoDeploySetup).toBe(
      "/docs/deploy/sources/#source-auto-deploy-setup",
    );
    expect(cliDocsHrefs.sourceAutoDeploySignatures).toBe(
      "/docs/deploy/sources/#source-auto-deploy-signatures",
    );
    expect(cliDocsHrefs.sourceAutoDeployDedupe).toBe(
      "/docs/deploy/sources/#source-auto-deploy-dedupe",
    );
    expect(cliDocsHrefs.sourceAutoDeployIgnoredEvents).toBe(
      "/docs/deploy/sources/#source-auto-deploy-ignored-events",
    );
    expect(cliDocsHrefs.sourceAutoDeployRecovery).toBe(
      "/docs/deploy/sources/#source-auto-deploy-recovery",
    );
    expect(cliDocsHrefs.scheduledTaskLifecycle).toBe(
      "/docs/resources/scheduled-tasks/#scheduled-task-resource-lifecycle",
    );

    expect(cliCommandDescriptions.serverCredential).toContain(cliDocsHrefs.serverSshCredential);
    expect(cliCommandDescriptions.serverRegister).toContain(cliDocsHrefs.serverDockerSwarmTarget);
    expect(cliCommandDescriptions.serverCredentialRotate).toContain(
      cliDocsHrefs.serverSshCredential,
    );
    expect(cliCommandDescriptions.environmentSet).toContain(
      cliDocsHrefs.environmentVariablePrecedence,
    );
    expect(cliCommandDescriptions.environmentClone).toContain(cliDocsHrefs.environmentLifecycle);
    expect(cliCommandDescriptions.environmentLock).toContain(cliDocsHrefs.environmentLifecycle);
    expect(cliCommandDescriptions.environmentUnlock).toContain(cliDocsHrefs.environmentLifecycle);
    expect(cliCommandDescriptions.resourceConfigureRuntime).toContain(
      cliDocsHrefs.resourceRuntimeProfile,
    );
    expect(cliCommandDescriptions.resourceShow).toContain(cliDocsHrefs.resourceProfileDrift);
    expect(cliCommandDescriptions.resourceConfigureAccess).toContain(
      cliDocsHrefs.resourceAccessProfile,
    );
    expect(cliCommandDescriptions.domainBindingCreate).toContain(cliDocsHrefs.domainCustomBinding);
    expect(cliCommandDescriptions.certificateIssueOrRenew).toContain(
      cliDocsHrefs.certificateReadiness,
    );
    expect(cliCommandDescriptions.certificateShow).toContain(cliDocsHrefs.certificateReadiness);
    expect(cliCommandDescriptions.certificateRetry).toContain(cliDocsHrefs.certificateReadiness);
    expect(cliCommandDescriptions.certificateRevoke).toContain(cliDocsHrefs.certificateReadiness);
    expect(cliCommandDescriptions.certificateDelete).toContain(cliDocsHrefs.certificateReadiness);
    expect(cliCommandDescriptions.previewCleanup).toContain(cliDocsHrefs.deploymentPreviewCleanup);
    expect(cliCommandDescriptions.deploymentPlan).toContain(cliDocsHrefs.deploymentPlanPreview);
    expect(cliCommandDescriptions.sourceLinkRelink).toContain(cliDocsHrefs.deploymentSourceRelink);
    expect(cliCommandDescriptions.remoteStateLockInspect).toContain(cliDocsHrefs.remoteStateLock);
    expect(cliCommandDescriptions.remoteStateLockRecoverStale).toContain(
      cliDocsHrefs.remoteStateLock,
    );
    expect(cliCommandDescriptions.serverTerminal).toContain(cliDocsHrefs.serverTerminalSession);
    expect(cliCommandDescriptions.operatorWorkList).toContain(cliDocsHrefs.operatorWorkLedger);
    expect(cliCommandDescriptions.operatorWorkShow).toContain(cliDocsHrefs.operatorWorkLedger);
    expect(cliCommandDescriptions.resourceConfigureAutoDeploy).toContain(
      cliDocsHrefs.sourceAutoDeploySetup,
    );
    expect(cliCommandDescriptions.sourceEventList).toContain(cliDocsHrefs.sourceAutoDeployDedupe);
    expect(cliCommandDescriptions.sourceEventShow).toContain(
      cliDocsHrefs.sourceAutoDeployIgnoredEvents,
    );
    expect(cliCommandDescriptions.scheduledTaskCreate).toContain(
      cliDocsHrefs.scheduledTaskLifecycle,
    );
    expect(cliCommandDescriptions.scheduledTaskRun).toContain(cliDocsHrefs.scheduledTaskLifecycle);
    expect(cliCommandDescriptions.scheduledTaskRunsLogs).toContain(
      cliDocsHrefs.scheduledTaskLifecycle,
    );
  });
});
