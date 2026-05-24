import { describe, expect, test } from "bun:test";
import {
  blueprintManifestJsonSchema,
  blueprintSchemaVersion,
  loadBlueprintManifest,
  validateBlueprintManifest,
} from "../src";

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

  test("[CLOUD-BLUEPRINT-PUBLIC-DEPENDENCY-KINDS-022] validates mainstream neutral dependency kinds", () => {
    const result = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "mainstream-dependencies",
      name: "Mainstream Dependencies",
      version: "1.0.0",
      summary: "Blueprint dependency vocabulary smoke.",
      resources: [
        { id: "postgres", kind: "postgres", label: "Postgres" },
        { id: "mysql", kind: "mysql", label: "MySQL" },
        { id: "redis", kind: "redis", label: "Redis" },
        { id: "storage", kind: "object-storage", label: "Object storage" },
        { id: "clickhouse", kind: "clickhouse", label: "ClickHouse" },
        { id: "opensearch", kind: "opensearch", label: "OpenSearch" },
      ],
      components: [
        {
          id: "api",
          name: "API",
          kind: "service",
          runtime: {
            strategy: "container-image",
            image: "example/api:latest",
          },
          usesResources: ["postgres", "mysql", "redis", "storage", "clickhouse", "opensearch"],
        },
      ],
      profiles: {
        production: {
          label: "Production",
          replicas: 1,
        },
      },
    });

    expect(result.ok).toBe(true);
  });

  test("[CLOUD-BLUEPRINT-PUBLIC-SCHEMA-032] exports JSON Schema for file validation", () => {
    expect(blueprintManifestJsonSchema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
    });
    expect(JSON.stringify(blueprintManifestJsonSchema)).toContain("appaloft.blueprint/v1");
    expect(JSON.stringify(blueprintManifestJsonSchema)).toContain("variants");
  });

  test("[CLOUD-BLUEPRINT-PUBLIC-VARIANT-033] validates topology variants and upgrade metadata", () => {
    const result = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "variant-service",
      name: "Variant Service",
      version: "1.0.0",
      summary: "A service with multiple dependency variants.",
      defaultVariant: "sqlite",
      resources: [{ id: "data", kind: "volume", label: "Local data" }],
      components: [
        {
          id: "app",
          name: "App",
          kind: "service",
          runtime: {
            strategy: "container-image",
            image: "example/app:latest",
          },
          usesResources: ["data"],
        },
      ],
      profiles: {
        production: { replicas: 1 },
      },
      variants: {
        sqlite: {
          label: "SQLite",
          summary: "Single container with volume-backed state.",
        },
        postgres: {
          label: "Postgres",
          summary: "External Postgres-backed state.",
          defaultProfile: "production",
          resources: [{ id: "database", kind: "postgres", label: "Postgres" }],
          components: [
            {
              id: "app",
              name: "App",
              kind: "service",
              runtime: {
                strategy: "container-image",
                image: "example/app:latest",
              },
              usesResources: ["database"],
            },
          ],
          upgrade: {
            strategy: "blueprint-plan",
            destructive: false,
            steps: [
              {
                classification: "potentially-breaking",
                requiresManualReview: true,
                changes: ["Database engine changes require dependency binding review."],
              },
            ],
          },
        },
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.defaultVariant).toBe("sqlite");
      expect(result.value.variants.postgres?.upgrade?.steps[0]?.classification).toBe(
        "potentially-breaking",
      );
    }
  });
});
