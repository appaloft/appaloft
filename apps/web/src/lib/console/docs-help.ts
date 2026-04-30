import { publicDocsBasePath, resolvePublicDocsHelpHref } from "@appaloft/docs-registry";

export const webDocsHrefs = {
  docsHome: `${publicDocsBasePath}/`,
  deploymentLifecycle: resolvePublicDocsHelpHref("deployment.lifecycle"),
  deploymentPlanPreview: resolvePublicDocsHelpHref("deployment.plan-preview"),
  deploymentSource: resolvePublicDocsHelpHref("deployment.source"),
  serverDeploymentTarget: resolvePublicDocsHelpHref("server.deployment-target"),
  serverSshCredential: resolvePublicDocsHelpHref("server.ssh-credential"),
  serverConnectivityTest: resolvePublicDocsHelpHref("server.connectivity-test"),
  serverProxyReadiness: resolvePublicDocsHelpHref("server.proxy-readiness"),
  serverTerminalSession: resolvePublicDocsHelpHref("server.terminal-session"),
  projectLifecycle: resolvePublicDocsHelpHref("project.lifecycle"),
  defaultAccessPolicy: resolvePublicDocsHelpHref("default-access.policy"),
  resourceConcept: resolvePublicDocsHelpHref("resource.concept"),
  resourceSourceProfile: resolvePublicDocsHelpHref("resource.source-profile"),
  resourceRuntimeProfile: resolvePublicDocsHelpHref("resource.runtime-profile"),
  resourceHealthProfile: resolvePublicDocsHelpHref("resource.health-profile"),
  resourceNetworkProfile: resolvePublicDocsHelpHref("resource.network-profile"),
  resourceAccessProfile: resolvePublicDocsHelpHref("resource.access-profile"),
  environmentConcept: resolvePublicDocsHelpHref("environment.concept"),
  environmentLifecycle: resolvePublicDocsHelpHref("environment.lifecycle"),
  environmentVariablePrecedence: resolvePublicDocsHelpHref("environment.variable-precedence"),
  domainGeneratedAccessRoute: resolvePublicDocsHelpHref("domain.generated-access-route"),
  domainCustomDomainBinding: resolvePublicDocsHelpHref("domain.custom-domain-binding"),
  domainOwnershipCheck: resolvePublicDocsHelpHref("domain.ownership-check"),
  certificateReadiness: resolvePublicDocsHelpHref("certificate.readiness"),
  observabilityRuntimeLogs: resolvePublicDocsHelpHref("observability.runtime-logs"),
  observabilityHealthSummary: resolvePublicDocsHelpHref("observability.health-summary"),
  diagnosticsSafeSupportPayload: resolvePublicDocsHelpHref("diagnostics.safe-support-payload"),
} as const;

export const quickDeploySourceHelpHref = webDocsHrefs.deploymentSource;
