import { describe, expect, test } from "bun:test";
import { blueprintSchemaVersion, loadBlueprintManifest, validateBlueprintManifest } from "../src";

describe("Blueprint manifest schema", () => {
  test("[CLOUD-BLUEPRINT-PUBLIC-SCHEMA-011] validates JSON-compatible Blueprint manifests", () => {
    const result = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "hello-service",
      name: "Hello Service",
      version: "1.0.0",
      summary: "A small service.",
      components: [
        {
          id: "web",
          name: "Web",
          kind: "service",
          runtime: {
            strategy: "container-image",
            image: "ghcr.io/appaloft/hello:latest",
          },
          ports: [{ name: "http", containerPort: 3000 }],
          routes: [{ port: "http" }],
        },
      ],
      profiles: {
        production: {
          replicas: 1,
        },
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe("hello-service");
      expect(result.value.components[0]?.ports[0]?.protocol).toBe("http");
    }
  });

  test("[CLOUD-BLUEPRINT-PUBLIC-SCHEMA-011] reports structured validation issues", () => {
    const result = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "bad-service",
      name: "Bad Service",
      version: "1.0.0",
      summary: "Invalid service.",
      components: [
        {
          id: "web",
          name: "Web",
          kind: "service",
          runtime: {
            strategy: "container-image",
          },
        },
      ],
      profiles: {
        production: {
          replicas: 1,
        },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.path.join(".").includes("image"))).toBe(true);
    }
  });

  test("[CLOUD-BLUEPRINT-PUBLIC-SCHEMA-011] loads YAML authoring format", () => {
    const result = loadBlueprintManifest({
      format: "yaml",
      content: `
schemaVersion: appaloft.blueprint/v1
id: yaml-service
name: YAML Service
version: 1.0.0
summary: A YAML-authored service.
components:
  - id: web
    name: Web
    kind: service
    runtime:
      strategy: workspace-commands
      startCommand: bun run start
profiles:
  production:
    replicas: 1
`,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe("yaml-service");
    }
  });
});
