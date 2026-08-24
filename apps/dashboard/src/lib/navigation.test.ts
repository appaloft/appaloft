import { describe, expect, test } from "vitest";

import {
  parseDashboardRoute,
  projectNavigation,
  serializeDashboardRoute,
  workspaceNavigation,
} from "./navigation";

describe("Dashboard navigation", () => {
  test("[DASH-ROUTE-004] exposes exactly five permanent Workspace destinations", () => {
    expect(workspaceNavigation.map(({ id }) => id)).toEqual([
      "projects",
      "infrastructure",
      "activity",
      "marketplace",
      "settings",
    ]);
  });

  test("[DASH-ROUTE-005] replaces Workspace navigation with four Project destinations", () => {
    expect(projectNavigation.map(({ id }) => id)).toEqual([
      "overview",
      "deployments",
      "observability",
      "settings",
    ]);
  });

  test("[DASH-FOUND-002] parses and serializes canonical Project state deterministically", () => {
    const route = parseDashboardRoute(
      "/projects/proj%20one/overview?cursor=next%3A10&sort=attention&search=edge&view=list&environment=env%2Fprod&filter=running&filter=failed",
    );

    expect(route).toEqual({
      kind: "project",
      projectId: "proj one",
      destination: "overview",
      environmentId: "env/prod",
      view: "list",
      search: "edge",
      sort: "attention",
      cursor: "next:10",
      filters: ["failed", "running"],
    });
    expect(serializeDashboardRoute(route)).toBe(
      "/projects/proj%20one/overview?environment=env%2Fprod&view=list&search=edge&sort=attention&cursor=next%3A10&filter=failed&filter=running",
    );
  });

  test("[DASH-FOUND-002] round-trips a canonical Resource destination with owner context", () => {
    const canonical =
      "/projects/proj_1/resources/res_9/deployments?environment=env_2&view=list&search=api&sort=recent&cursor=c%3A9&filter=failed";
    const route = parseDashboardRoute(canonical);

    expect(route).toMatchObject({
      kind: "resource",
      projectId: "proj_1",
      resourceId: "res_9",
      destination: "deployments",
      environmentId: "env_2",
    });
    expect(serializeDashboardRoute(route)).toBe(canonical);
  });

  test("[DASH-GOV-022] keeps the pattern gallery outside permanent product navigation", () => {
    expect(parseDashboardRoute("/patterns")).toEqual({
      kind: "utility",
      destination: "patterns",
      filters: [],
    });
    expect(workspaceNavigation.some(({ id }) => id === ("patterns" as never))).toBe(false);
  });
});
