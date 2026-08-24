import { createAppaloftOrpcClient } from "@appaloft/orpc/client";

import { dashboardI18n } from "./i18n.svelte";

export const dashboardClient = createAppaloftOrpcClient("", () => dashboardI18n.locale);

export type DashboardProjectSummary = Awaited<
  ReturnType<typeof dashboardClient.projects.listSummaries>
>["items"][number];
