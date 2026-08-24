export const dashboardResourceFixtureSizes = [1, 10, 50, 100] as const;

export interface DashboardResourceFixture {
  id: string;
  name: string;
  kind: "service" | "worker" | "database" | "scheduled-task";
  health: "healthy" | "degraded" | "failed";
  latestDeployment: {
    id: string;
    status: "succeeded" | "failed";
    createdAt: string;
  };
}

const kinds = ["service", "worker", "database", "scheduled-task"] as const;
const healthStates = ["healthy", "healthy", "healthy", "degraded", "failed"] as const;

export function makeResourceFixture(count: number): DashboardResourceFixture[] {
  if (!Number.isInteger(count) || count < 0 || count > 100) {
    throw new Error("Dashboard Resource fixture count must be an integer between 0 and 100.");
  }

  return Array.from({ length: count }, (_, index) => {
    const sequence = index + 1;
    const suffix = String(sequence).padStart(3, "0");
    const health = healthStates[index % healthStates.length] ?? "healthy";

    return {
      id: `resource-${suffix}`,
      name: `service-${suffix}`,
      kind: kinds[index % kinds.length] ?? "service",
      health,
      latestDeployment: {
        id: `deployment-${suffix}`,
        status: health === "failed" ? "failed" : "succeeded",
        createdAt: new Date(Date.UTC(2026, 7, 24, 12, sequence % 60)).toISOString(),
      },
    };
  });
}

export function visibleResourceRows(
  resources: readonly DashboardResourceFixture[],
  maximum = 50,
): DashboardResourceFixture[] {
  return resources.slice(0, maximum);
}

export const dashboardPerformanceBudgets = {
  projectsRequests: 4,
  projectsUsableP95Ms: 1_500,
  projectOverviewRequests: 5,
  projectOverviewUsableP95Ms: 1_800,
  resourceOpenAddedRequests: 2,
  resourceShellP95Ms: 300,
  navigationInpP75Ms: 200,
  maximumLongTaskMs: 100,
  initialRouteJavaScriptGzipBytes: 300 * 1024,
  topologyMinimumFps: 55,
  topologyEnabled: false,
} as const;
