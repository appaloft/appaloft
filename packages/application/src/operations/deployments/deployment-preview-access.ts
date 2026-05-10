import { type DeploymentSummary } from "../../ports";

export function publicPreviewUrlsFromDeploymentSummary(deployment: DeploymentSummary): string[] {
  const accessRoutes = deployment.runtimePlan.execution.accessRoutes ?? [];
  const urls: string[] = [];

  for (const route of accessRoutes) {
    if (route.routeBehavior === "redirect") {
      continue;
    }

    const scheme = route.tlsMode === "disabled" ? "http" : "https";
    const path = route.pathPrefix && route.pathPrefix !== "/" ? route.pathPrefix : "";
    for (const domain of route.domains) {
      urls.push(`${scheme}://${domain}${path}`);
    }
  }

  return urls;
}
