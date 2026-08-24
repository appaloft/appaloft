import { dashboardClient } from "./data-client";

export type DashboardOrganizationContext = Awaited<
  ReturnType<typeof dashboardClient.organizations.currentContext>
>;

let contextPromise: Promise<DashboardOrganizationContext> | undefined;

export function loadDashboardOrganizationContext(): Promise<DashboardOrganizationContext> {
  contextPromise ??= dashboardClient.organizations.currentContext({}).catch((error: unknown) => {
    contextPromise = undefined;
    throw error;
  });
  return contextPromise;
}
