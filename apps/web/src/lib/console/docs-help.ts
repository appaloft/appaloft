import { resolvePublicDocsHelpHref } from "@appaloft/docs-registry";

export const webDocsHrefs = {
  deploymentSource: resolvePublicDocsHelpHref("deployment.source"),
  serverDeploymentTarget: resolvePublicDocsHelpHref("server.deployment-target"),
  serverSshCredential: resolvePublicDocsHelpHref("server.ssh-credential"),
  serverConnectivityTest: resolvePublicDocsHelpHref("server.connectivity-test"),
  resourceConcept: resolvePublicDocsHelpHref("resource.concept"),
  resourceSourceProfile: resolvePublicDocsHelpHref("resource.source-profile"),
  resourceRuntimeProfile: resolvePublicDocsHelpHref("resource.runtime-profile"),
  resourceHealthProfile: resolvePublicDocsHelpHref("resource.health-profile"),
  resourceNetworkProfile: resolvePublicDocsHelpHref("resource.network-profile"),
  environmentConcept: resolvePublicDocsHelpHref("environment.concept"),
  environmentVariablePrecedence: resolvePublicDocsHelpHref("environment.variable-precedence"),
} as const;

export const quickDeploySourceHelpHref = webDocsHrefs.deploymentSource;
