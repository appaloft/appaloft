import { createAppaloftOrpcClient } from "@appaloft/orpc/client";

import { dashboardI18n } from "./i18n.svelte";

export const dashboardClient = createAppaloftOrpcClient("", () => dashboardI18n.locale);

export type DashboardProjectSummary = Awaited<
  ReturnType<typeof dashboardClient.projects.listSummaries>
>["items"][number];

export type DashboardProjectEnvironmentOverview = Awaited<
  ReturnType<typeof dashboardClient.projects.environmentOverview>
>;

export type DashboardResourceOverview = Awaited<
  ReturnType<typeof dashboardClient.resources.overview>
>;
