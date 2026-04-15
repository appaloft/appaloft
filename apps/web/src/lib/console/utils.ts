import {
  type DeploymentSummary,
  type EnvironmentSummary,
  type ProjectSummary,
  type ResourceSummary,
  type ServerSummary,
} from "@yundu/contracts";

export function readSessionIdentity(session: unknown): string | null {
  if (!session || typeof session !== "object") {
    return null;
  }

  const sessionRecord = session as Record<string, unknown>;
  const user =
    "user" in sessionRecord && sessionRecord.user && typeof sessionRecord.user === "object"
      ? (sessionRecord.user as Record<string, unknown>)
      : null;

  if (!user) {
    return null;
  }

  if (typeof user.name === "string" && user.name.trim().length > 0) {
    return user.name;
  }

  if (typeof user.email === "string" && user.email.trim().length > 0) {
    return user.email;
  }

  return null;
}

export function formatTime(value: string): string {
  return value.slice(0, 19).replace("T", " ");
}

export function initials(value: string | null | undefined): string {
  if (!value) {
    return "CP";
  }

  return value
    .split(/[\s/-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() ?? "")
    .join("");
}

export function deploymentStatusLabel(status: DeploymentSummary["status"] | undefined): string {
  return status ?? "no-deployment";
}

export function latestResourceDeployment(
  resource: ResourceSummary,
  deployments: DeploymentSummary[],
): DeploymentSummary | null {
  if (resource.lastDeploymentId) {
    const matchingDeployment = deployments.find(
      (deployment) => deployment.id === resource.lastDeploymentId,
    );

    if (matchingDeployment) {
      return matchingDeployment;
    }
  }

  return deployments.find((deployment) => deployment.resourceId === resource.id) ?? null;
}

export function latestResourceDeploymentStatus(
  resource: ResourceSummary,
  deployments: DeploymentSummary[],
): DeploymentSummary["status"] | undefined {
  return resource.lastDeploymentStatus ?? latestResourceDeployment(resource, deployments)?.status;
}

export function projectDetailHref(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}`;
}

export function projectCreateResourceHref(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/resources/new`;
}

export function resourceDetailHref(
  resource: Pick<ResourceSummary, "id" | "projectId" | "environmentId">,
): string {
  return `/projects/${encodeURIComponent(resource.projectId)}/environments/${encodeURIComponent(resource.environmentId)}/resources/${encodeURIComponent(resource.id)}`;
}

export function deploymentDetailHref(
  deployment: Pick<DeploymentSummary, "id" | "projectId" | "environmentId" | "resourceId">,
): string {
  return `/projects/${encodeURIComponent(deployment.projectId)}/environments/${encodeURIComponent(deployment.environmentId)}/resources/${encodeURIComponent(deployment.resourceId)}/deployments/${encodeURIComponent(deployment.id)}`;
}

export function resourceNewDeploymentHref(
  resource: Pick<ResourceSummary, "id" | "projectId" | "environmentId">,
): string {
  return `/projects/${encodeURIComponent(resource.projectId)}/environments/${encodeURIComponent(resource.environmentId)}/resources/${encodeURIComponent(resource.id)}/deployments/new`;
}

export function countProjectDeployments(
  project: ProjectSummary,
  deployments: DeploymentSummary[],
): number {
  return deployments.filter((deployment) => deployment.projectId === project.id).length;
}

export function countProjectEnvironments(
  project: ProjectSummary,
  environments: EnvironmentSummary[],
): number {
  return environments.filter((environment) => environment.projectId === project.id).length;
}

export function countProjectResources(
  project: ProjectSummary,
  resources: ResourceSummary[],
): number {
  return resources.filter((resource) => resource.projectId === project.id).length;
}

export function findProject(projects: ProjectSummary[], projectId: string): ProjectSummary | null {
  return projects.find((project) => project.id === projectId) ?? null;
}

export function findEnvironment(
  environments: EnvironmentSummary[],
  environmentId: string,
): EnvironmentSummary | null {
  return environments.find((environment) => environment.id === environmentId) ?? null;
}

export function findDeployment(
  deployments: DeploymentSummary[],
  deploymentId: string,
): DeploymentSummary | null {
  return deployments.find((deployment) => deployment.id === deploymentId) ?? null;
}

export function findResource(
  resources: ResourceSummary[],
  resourceId: string,
): ResourceSummary | null {
  return resources.find((resource) => resource.id === resourceId) ?? null;
}

export function findServer(servers: ServerSummary[], serverId: string): ServerSummary | null {
  return servers.find((server) => server.id === serverId) ?? null;
}

export function latestProjectDeployment(
  project: ProjectSummary,
  deployments: DeploymentSummary[],
): DeploymentSummary | null {
  return deployments.find((deployment) => deployment.projectId === project.id) ?? null;
}
