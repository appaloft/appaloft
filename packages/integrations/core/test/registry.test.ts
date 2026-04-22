import { describe, expect, test } from "bun:test";
import { InMemoryIntegrationRegistry } from "../src/index";

describe("integration registry contract", () => {
  test("returns integration descriptors with stable capability flags", () => {
    const registry = new InMemoryIntegrationRegistry([
      {
        key: "github",
        title: "GitHub",
        capabilities: ["repository-browser", "oauth"],
      },
      {
        key: "gitlab",
        title: "GitLab",
        capabilities: ["repository-browser"],
      },
    ]);

    expect(registry.list()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "github",
          capabilities: ["repository-browser", "oauth"],
        }),
        expect.objectContaining({
          key: "gitlab",
          capabilities: ["repository-browser"],
        }),
      ]),
    );
  });

  test("finds an integration descriptor by key without scanning callers", () => {
    const registry = new InMemoryIntegrationRegistry([
      {
        key: "github",
        title: "GitHub",
        capabilities: ["repository-browser", "oauth"],
      },
      {
        key: "gitlab",
        title: "GitLab",
        capabilities: ["repository-browser"],
      },
    ]);

    expect(registry.findByKey("github")).toMatchObject({
      key: "github",
      title: "GitHub",
    });
    expect(registry.findByKey("missing-integration")).toBeNull();
  });
});
