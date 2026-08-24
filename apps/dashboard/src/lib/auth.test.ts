import { describe, expect, test } from "vitest";

import { safeDashboardReturnPath } from "./auth";

describe("Dashboard authentication handoff", () => {
  test("[DASH-AUTH-002] accepts same-origin paths and rejects open redirects", () => {
    expect(safeDashboardReturnPath("/projects/atlas/overview?environment=production")).toBe(
      "/projects/atlas/overview?environment=production",
    );
    expect(safeDashboardReturnPath("https://evil.example/projects")).toBe("/projects");
    expect(safeDashboardReturnPath("//evil.example/projects")).toBe("/projects");
    expect(safeDashboardReturnPath("projects")).toBe("/projects");
  });
});
