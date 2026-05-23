import { describe, expect, test } from "bun:test";
import {
  blueprintSchemaVersion,
  createBlueprintInstallPlan,
  validateBlueprintManifest,
} from "../src";

describe("Blueprint install plan", () => {
  test("[CLOUD-BLUEPRINT-PUBLIC-INSTALL-013] compiles a manifest into deterministic install operations", () => {
    const manifest = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "api-service",
      name: "API Service",
      version: "1.0.0",
      summary: "A deployable API service.",
      parameters: [
        {
          key: "APP_NAME",
          label: "App name",
          type: "string",
          required: true,
        },
      ],
      secrets: [
        {
          key: "API_TOKEN",
          label: "API token",
          required: true,
        },
      ],
      resources: [{ id: "database", kind: "postgres", label: "Postgres" }],
      components: [
        {
          id: "api",
          name: "API",
          kind: "service",
          runtime: {
            strategy: "container-image",
            image: "ghcr.io/appaloft/api:latest",
          },
          ports: [{ name: "http", containerPort: 8080 }],
          routes: [{ port: "http", pathPrefix: "/" }],
          usesSecrets: ["API_TOKEN"],
          usesResources: ["database"],
        },
      ],
      profiles: {
        production: {
          replicas: 1,
        },
      },
    });

    expect(manifest.ok).toBe(true);
    if (!manifest.ok) {
      throw new Error("Expected manifest to validate");
    }

    const result = createBlueprintInstallPlan({
      manifest: manifest.value,
      profile: "production",
      parameters: {
        APP_NAME: "api",
      },
      target: {
        projectName: "API Project",
        environmentName: "production",
        resourceSlugPrefix: "demo",
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.createsExternalResources).toBe(false);
      expect(result.value.operations.map((operation) => operation.kind)).toEqual([
        "create-project",
        "create-environment",
        "create-resource",
        "configure-runtime",
        "configure-network",
        "configure-access",
        "set-variable",
        "create-secret-reference",
        "bind-dependency",
        "create-deployment",
      ]);
    }
  });
});
