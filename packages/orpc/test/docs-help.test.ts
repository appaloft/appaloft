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
    expect(apiDocsHrefs.environmentLifecycle).toBe(
      "/docs/environments/model/#environment-lifecycle",
    );
    expect(apiDocsHrefs.resourceHealthProfile).toBe(
      "/docs/resources/profiles/health-network/#resource-health-profile",
    );
    expect(apiDocsHrefs.resourceProfileDrift).toBe(
      "/docs/resources/profiles/source-runtime/#resource-profile-drift",
    );
    expect(apiDocsHrefs.resourceAccessProfile).toBe(
      "/docs/access/generated-routes/#resource-access-profile",
    );
    expect(apiDocsHrefs.domainOwnershipCheck).toBe(
      "/docs/access/domains/ownership/#domain-binding-ownership-check",
    );
    expect(apiDocsHrefs.terminalSession).toBe(
      "/docs/servers/operations/proxy-and-terminal/#server-terminal-session",
    );
    expect(apiDocsHrefs.serverDockerSwarmTarget).toBe(
      "/docs/servers/register-connect/#docker-swarm-runtime-target",
    );
    expect(apiDocsHrefs.operatorWorkLedger).toBe(
      "/docs/reference/errors-statuses/#operator-work-ledger",
    );
    expect(apiDocsHrefs.deploymentPlan).toBe("/docs/deploy/lifecycle/#deployment-plan-preview");
    expect(apiDocsHrefs.sourceAutoDeploySetup).toBe(
      "/docs/deploy/sources/#source-auto-deploy-setup",
    );
    expect(apiDocsHrefs.sourceAutoDeploySignatures).toBe(
      "/docs/deploy/sources/#source-auto-deploy-signatures",
    );
    expect(apiDocsHrefs.sourceAutoDeployDedupe).toBe(
      "/docs/deploy/sources/#source-auto-deploy-dedupe",
    );
    expect(apiDocsHrefs.sourceAutoDeployIgnoredEvents).toBe(
      "/docs/deploy/sources/#source-auto-deploy-ignored-events",
    );
    expect(apiDocsHrefs.sourceAutoDeployRecovery).toBe(
      "/docs/deploy/sources/#source-auto-deploy-recovery",
    );
    expect(apiDocsHrefs.scheduledTaskLifecycle).toBe(
      "/docs/resources/scheduled-tasks/#scheduled-task-resource-lifecycle",
    );
    expect(apiDocsHrefs.productGradePreviews).toBe(
      "/docs/deploy/previews/#product-grade-preview-deployments",
    );

    expect(apiRouteDescriptions.configureServerCredential).toContain(apiDocsHrefs.serverCredential);
    expect(apiRouteDescriptions.registerServer).toContain(apiDocsHrefs.serverDockerSwarmTarget);
    expect(apiRouteDescriptions.rotateSshCredential).toContain(apiDocsHrefs.serverCredential);
    expect(apiRouteDescriptions.setEnvironmentVariable).toContain(
      apiDocsHrefs.environmentVariablePrecedence,
    );
    expect(apiRouteDescriptions.archiveEnvironment).toContain(apiDocsHrefs.environmentLifecycle);
    expect(apiRouteDescriptions.cloneEnvironment).toContain(apiDocsHrefs.environmentLifecycle);
    expect(apiRouteDescriptions.lockEnvironment).toContain(apiDocsHrefs.environmentLifecycle);
    expect(apiRouteDescriptions.unlockEnvironment).toContain(apiDocsHrefs.environmentLifecycle);
    expect(apiRouteDescriptions.configureResourceHealth).toContain(
      apiDocsHrefs.resourceHealthProfile,
    );
    expect(apiRouteDescriptions.showResource).toContain(apiDocsHrefs.resourceProfileDrift);
    expect(apiRouteDescriptions.configureResourceAccess).toContain(
      apiDocsHrefs.resourceAccessProfile,
    );
    expect(apiRouteDescriptions.confirmDomainBindingOwnership).toContain(
      apiDocsHrefs.domainOwnershipCheck,
    );
    expect(apiRouteDescriptions.openTerminalSession).toContain(apiDocsHrefs.terminalSession);
    expect(apiRouteDescriptions.operatorWorkLedger).toContain(apiDocsHrefs.operatorWorkLedger);
    expect(apiRouteDescriptions.deploymentPlan).toContain(apiDocsHrefs.deploymentPlan);
    expect(apiRouteDescriptions.configureResourceAutoDeploy).toContain(
      apiDocsHrefs.sourceAutoDeploySetup,
    );
    expect(apiRouteDescriptions.listSourceEvents).toContain(apiDocsHrefs.sourceAutoDeployDedupe);
    expect(apiRouteDescriptions.showSourceEvent).toContain(
      apiDocsHrefs.sourceAutoDeployIgnoredEvents,
    );
    expect(apiRouteDescriptions.listPreviewEnvironments).toContain(
      apiDocsHrefs.productGradePreviews,
    );
    expect(apiRouteDescriptions.showPreviewEnvironment).toContain(
      apiDocsHrefs.productGradePreviews,
    );
    expect(apiRouteDescriptions.deletePreviewEnvironment).toContain(
      apiDocsHrefs.productGradePreviews,
    );
    expect(apiRouteDescriptions.createScheduledTask).toContain(apiDocsHrefs.scheduledTaskLifecycle);
    expect(apiRouteDescriptions.runScheduledTaskNow).toContain(apiDocsHrefs.scheduledTaskLifecycle);
    expect(apiRouteDescriptions.scheduledTaskRunLogs).toContain(
      apiDocsHrefs.scheduledTaskLifecycle,
    );
  });
});
