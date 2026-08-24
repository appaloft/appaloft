import { describe, expect, test } from "vitest";

import { dashboardAuthRedirect, safeDashboardReturnPath } from "./auth";

describe("Dashboard authentication handoff", () => {
  test("[DASH-AUTH-002] accepts same-origin paths and rejects open redirects", () => {
    expect(safeDashboardReturnPath("/projects/atlas/overview?environment=production")).toBe(
      "/projects/atlas/overview?environment=production",
    );
    expect(safeDashboardReturnPath("https://evil.example/projects")).toBe("/projects");
    expect(safeDashboardReturnPath("//evil.example/projects")).toBe("/projects");
    expect(safeDashboardReturnPath("projects")).toBe("/projects");
  });

  test("[DASH-AUTH-003] gates product routes without losing the intended destination", () => {
    expect(
      dashboardAuthRedirect({
        currentPath: "/projects/atlas/overview?environment=production",
        loginRequired: true,
        hasSession: false,
      }),
    ).toBe("/login?next=%2Fprojects%2Fatlas%2Foverview%3Fenvironment%3Dproduction");
    expect(
      dashboardAuthRedirect({ currentPath: "/projects", loginRequired: true, hasSession: true }),
    ).toBeNull();
    expect(
      dashboardAuthRedirect({ currentPath: "/projects", loginRequired: false, hasSession: false }),
    ).toBeNull();
  });
});
