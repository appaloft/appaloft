import { describe, expect, test } from "bun:test";

import { githubIntegration } from "../src/index";

describe("github integration contract", () => {
  test("exposes explicit capability flags instead of hard-coded special cases", () => {
    expect(githubIntegration).toEqual(
      expect.objectContaining({
        key: "github",
        title: "GitHub",
        capabilities: expect.arrayContaining(["repository-import", "webhook-ready"]),
      }),
    );
  });
});
