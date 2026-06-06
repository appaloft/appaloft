import { describe, expect, test } from "bun:test";
import {
  BlueprintComponentRelationGraph,
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
            version: "latest",
            versionKind: "image-tag",
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
      expect(result.value.components[0]?.runtime.version).toBe("latest");
      expect(result.value.components[0]?.runtime.versionKind).toBe("image-tag");
    }
  });

  test("[CLOUD-BLUEPRINT-PUBLIC-SCHEMA-011] accepts underscore-prefixed environment keys", () => {
    const result = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "underscore-env-service",
      name: "Underscore Env Service",
      version: "1.0.0",
      summary: "A service with upstream runtime variables that start with underscores.",
      secrets: [{ key: "_APP_SECRET", label: "Application secret" }],
      components: [
        {
          id: "web",
          name: "Web",
          kind: "service",
          runtime: {
            strategy: "container-image",
            image: "example/web:latest",
          },
          variables: [{ key: "_APP_ENV", value: "production" }],
          usesSecrets: ["_APP_SECRET"],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.components[0]?.variables[0]?.key).toBe("_APP_ENV");
      expect(result.value.components[0]?.usesSecrets).toEqual(["_APP_SECRET"]);
    }
  });

  test("[BP-GENERATED-SECRET-001] validates generated secret policy without changing user-provided defaults", () => {
    const result = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "generated-secret-service",
      name: "Generated Secret Service",
      version: "1.0.0",
      summary: "A service with platform-generated runtime secrets.",
      secrets: [
        {
          key: "NEXTAUTH_SECRET",
          label: "Auth signing secret",
          source: "generated",
          generation: {
            bytes: 32,
            encoding: "base64url",
            description: "Generated during accepted deployment execution.",
            rotation: { strategy: "manual" },
          },
        },
        {
          key: "STRIPE_SECRET_KEY",
          label: "Stripe secret key",
        },
      ],
      components: [
        {
          id: "web",
          name: "Web",
          kind: "service",
          runtime: {
            strategy: "container-image",
            image: "example/web:latest",
          },
          usesSecrets: ["NEXTAUTH_SECRET", "STRIPE_SECRET_KEY"],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.secrets).toEqual([
      expect.objectContaining({
        key: "NEXTAUTH_SECRET",
        required: true,
        source: "generated",
        generation: expect.objectContaining({
          bytes: 32,
          encoding: "base64url",
          scope: "application",
        }),
      }),
      expect.objectContaining({
        key: "STRIPE_SECRET_KEY",
        required: true,
        source: "user-provided",
      }),
    ]);
  });

  test("[BP-GENERATED-SECRET-001] rejects implicit or misplaced generation metadata", () => {
    const missingPolicy = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "missing-generated-policy",
      name: "Missing Generated Policy",
      version: "1.0.0",
      summary: "A service with invalid generated secret metadata.",
      secrets: [{ key: "JWT_SECRET", label: "JWT secret", source: "generated" }],
      components: [
        {
          id: "web",
          name: "Web",
          kind: "service",
          runtime: { strategy: "container-image", image: "example/web:latest" },
          usesSecrets: ["JWT_SECRET"],
        },
      ],
    });
    const userProvidedGeneration = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "user-provided-generation-policy",
      name: "User Provided Generation Policy",
      version: "1.0.0",
      summary: "A service with misplaced generation metadata.",
      secrets: [
        {
          key: "GITHUB_CLIENT_SECRET",
          label: "GitHub client secret",
          generation: { bytes: 32, encoding: "base64url" },
        },
      ],
      components: [
        {
          id: "web",
          name: "Web",
          kind: "service",
          runtime: { strategy: "container-image", image: "example/web:latest" },
          usesSecrets: ["GITHUB_CLIENT_SECRET"],
        },
      ],
    });

    expect(missingPolicy.ok).toBe(false);
    expect(userProvidedGeneration.ok).toBe(false);
    if (!missingPolicy.ok) {
      expect(missingPolicy.issues.map((issue) => issue.message)).toContain(
        "generated secrets require generation policy",
      );
    }
    if (!userProvidedGeneration.ok) {
      expect(userProvidedGeneration.issues.map((issue) => issue.message)).toContain(
        "generation policy is only valid for generated secrets",
      );
    }
  });

  test("[CLOUD-BLUEPRINT-PUBLIC-HEALTH-026] validates component HTTP health checks", () => {
    const result = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "health-service",
      name: "Health Service",
      version: "1.0.0",
      summary: "A service with an explicit HTTP health check.",
      components: [
        {
          id: "web",
          name: "Web",
          kind: "service",
          runtime: {
            strategy: "container-image",
            image: "ghcr.io/appaloft/health:latest",
          },
          ports: [{ name: "http", containerPort: 3000 }],
          healthCheck: {
            enabled: true,
            type: "http",
            http: {
              path: "/api/health",
            },
          },
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
      expect(result.value.components[0]?.healthCheck).toMatchObject({
        enabled: true,
        type: "http",
        intervalSeconds: 5,
        timeoutSeconds: 5,
        retries: 10,
        startPeriodSeconds: 5,
        http: {
          method: "GET",
          scheme: "http",
          host: "localhost",
          path: "/api/health",
          expectedStatusCode: 200,
        },
      });
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
        { id: "mongodb", kind: "mongodb", label: "MongoDB" },
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
          usesResources: [
            "postgres",
            "mongodb",
            "mysql",
            "redis",
            "storage",
            "clickhouse",
            "opensearch",
          ],
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

  test("[CLOUD-BLUEPRINT-PUBLIC-DEPENDENCY-KINDS-022] validates neutral dependency capabilities on matching resource kinds", () => {
    const result = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "dependency-capabilities",
      name: "Dependency Capabilities",
      version: "1.0.0",
      summary: "Blueprint dependency capability vocabulary smoke.",
      resources: [
        {
          id: "postgres",
          kind: "postgres",
          label: "Postgres",
          capabilities: [
            {
              type: "postgres-extension",
              name: "vector",
              required: true,
            },
          ],
        },
        {
          id: "redis",
          kind: "redis",
          label: "Redis",
          capabilities: [
            {
              type: "redis-module",
              name: "search",
              required: false,
            },
          ],
        },
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
          usesResources: ["postgres", "redis"],
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
    if (result.ok) {
      expect(result.value.resources[0]?.capabilities).toEqual([
        { type: "postgres-extension", name: "vector", required: true },
      ]);
      expect(result.value.resources[1]?.capabilities).toEqual([
        { type: "redis-module", name: "search", required: false },
      ]);
    }
  });

  test("[CLOUD-BLUEPRINT-PUBLIC-DEPENDENCY-KINDS-022] rejects dependency capabilities on incompatible resource kinds", () => {
    const result = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "bad-dependency-capabilities",
      name: "Bad Dependency Capabilities",
      version: "1.0.0",
      summary: "Invalid dependency capability vocabulary smoke.",
      resources: [
        {
          id: "mysql",
          kind: "mysql",
          label: "MySQL",
          capabilities: [{ type: "postgres-extension", name: "vector" }],
        },
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
          usesResources: ["mysql"],
        },
      ],
      profiles: {
        production: {
          label: "Production",
          replicas: 1,
        },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.message)).toContain(
        "postgres-extension capability requires a postgres dependency resource",
      );
    }
  });

  test("[BP-DEP-CONTRACT-001] validates dependency env, outputs, readiness, versions, and MariaDB engine metadata", () => {
    const result = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "dependency-contract",
      name: "Dependency Contract",
      version: "1.0.0",
      summary: "A service with structured dependency requirements.",
      resources: [
        {
          id: "postgres",
          kind: "postgres",
          label: "Postgres",
          engine: { family: "postgres" },
          version: { preferred: "15.4", range: ">=15 <17" },
          outputs: [
            { name: "host", secret: false },
            { name: "port", secret: false },
            { name: "database", secret: false },
            { name: "username", secret: true },
            { name: "password", secret: true },
            { name: "url", secret: true },
          ],
          readiness: [{ type: "postgres", database: "app" }],
        },
        {
          id: "mariadb",
          kind: "mysql",
          label: "MariaDB",
          engine: { family: "mariadb" },
          version: { range: ">=10 <12" },
          readiness: [{ type: "mysql", database: "app" }],
        },
        {
          id: "redis",
          kind: "redis",
          label: "Redis",
          readiness: [{ type: "redis", command: "ping" }],
        },
        {
          id: "clickhouse",
          kind: "clickhouse",
          label: "ClickHouse",
          readiness: [
            {
              type: "http",
              endpoint: { host: "clickhouse", port: 8123, path: "/ping" },
              expectedStatus: 200,
              expectedBody: "Ok.",
            },
            {
              type: "tcp",
              endpoint: { host: "clickhouse", port: 9000 },
            },
          ],
        },
        {
          id: "clickhouse-native",
          kind: "clickhouse",
          label: "ClickHouse native",
          readiness: [{ type: "clickhouse", protocol: "native", query: "SELECT 1" }],
        },
        {
          id: "mongodb",
          kind: "mongodb",
          label: "MongoDB",
          readiness: [{ type: "mongodb", command: "ping" }],
        },
      ],
      components: [
        {
          id: "api",
          name: "API",
          kind: "service",
          runtime: { strategy: "container-image", image: "example/api:latest" },
          usesResources: [
            "postgres",
            "mariadb",
            "redis",
            "clickhouse",
            "clickhouse-native",
            "mongodb",
          ],
          dependencyEnv: [
            { resource: "postgres", name: "DATABASE_URL", valueFrom: "url" },
            { resource: "postgres", name: "DB_HOST", valueFrom: "host" },
            { resource: "postgres", name: "DB_PASSWORD", valueFrom: "password" },
            {
              resource: "postgres",
              name: "JDBC_URL",
              template: "jdbc:postgresql://${host}:${port}/${database}",
            },
            { resource: "mariadb", name: "MYSQL_URL", valueFrom: "url" },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.resources[1]).toMatchObject({
        kind: "mysql",
        engine: { family: "mariadb" },
      });
      expect(result.value.resources[2]?.readiness).toEqual([
        { type: "redis", command: "ping", required: true },
      ]);
      expect(result.value.resources[3]?.readiness).toEqual([
        {
          type: "http",
          endpoint: { scheme: "http", host: "clickhouse", port: 8123, path: "/ping" },
          method: "GET",
          expectedStatus: 200,
          expectedBody: "Ok.",
          required: true,
        },
        {
          type: "tcp",
          endpoint: { host: "clickhouse", port: 9000 },
          required: true,
        },
      ]);
      expect(result.value.resources[4]?.readiness).toEqual([
        { type: "clickhouse", protocol: "native", query: "SELECT 1", required: true },
      ]);
      expect(result.value.resources[5]?.readiness).toEqual([
        { type: "mongodb", command: "ping", required: true },
      ]);
    }
  });

  test("[BP-DEP-CONTRACT-002] rejects invalid dependency contract references", () => {
    const invalidOutput = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "invalid-dependency-output",
      name: "Invalid Dependency Output",
      version: "1.0.0",
      summary: "Invalid output.",
      resources: [{ id: "redis", kind: "redis", label: "Redis" }],
      components: [
        {
          id: "api",
          name: "API",
          kind: "service",
          runtime: { strategy: "container-image", image: "example/api:latest" },
          usesResources: ["redis"],
          dependencyEnv: [{ resource: "redis", name: "REDIS_DB", valueFrom: "database" }],
        },
      ],
    });
    const invalidResource = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "invalid-dependency-resource",
      name: "Invalid Dependency Resource",
      version: "1.0.0",
      summary: "Invalid resource.",
      resources: [{ id: "postgres", kind: "postgres", label: "Postgres" }],
      components: [
        {
          id: "api",
          name: "API",
          kind: "service",
          runtime: { strategy: "container-image", image: "example/api:latest" },
          usesResources: ["postgres"],
          dependencyEnv: [{ resource: "redis", name: "REDIS_URL", valueFrom: "url" }],
        },
      ],
    });
    const readinessMismatch = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "invalid-readiness",
      name: "Invalid Readiness",
      version: "1.0.0",
      summary: "Invalid readiness.",
      resources: [
        { id: "redis", kind: "redis", label: "Redis", readiness: [{ type: "postgres" }] },
      ],
      components: [
        {
          id: "api",
          name: "API",
          kind: "service",
          runtime: { strategy: "container-image", image: "example/api:latest" },
          usesResources: ["redis"],
        },
      ],
    });
    const versionBounds = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "version-bounds",
      name: "Version Bounds",
      version: "1.0.0",
      summary: "Valid version bounds.",
      resources: [
        {
          id: "redis",
          kind: "redis",
          label: "Redis",
          version: { preferred: "7.2", minimum: "7", maximum: "7.4" },
        },
      ],
      components: [
        {
          id: "app",
          name: "App",
          kind: "service",
          runtime: { strategy: "container-image", image: "example/app:latest" },
          usesResources: ["redis"],
        },
      ],
    });
    const invalidVersion = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "invalid-version",
      name: "Invalid Version",
      version: "1.0.0",
      summary: "Invalid version.",
      resources: [
        { id: "postgres", kind: "postgres", label: "Postgres", version: { range: "fifteen" } },
      ],
      components: [
        {
          id: "api",
          name: "API",
          kind: "service",
          runtime: { strategy: "container-image", image: "example/api:latest" },
          usesResources: ["postgres"],
        },
      ],
    });

    expect(versionBounds.ok).toBe(true);
    expect(invalidOutput.ok).toBe(false);
    expect(invalidResource.ok).toBe(false);
    expect(readinessMismatch.ok).toBe(false);
    expect(invalidVersion.ok).toBe(false);
    if (!invalidOutput.ok) {
      expect(invalidOutput.issues.map((issue) => issue.message).join("\n")).toContain(
        "unavailable output database",
      );
    }
    if (!invalidResource.ok) {
      expect(invalidResource.issues.map((issue) => issue.message).join("\n")).toContain(
        "unknown resource redis",
      );
    }
    if (!readinessMismatch.ok) {
      expect(readinessMismatch.issues.map((issue) => issue.message).join("\n")).toContain(
        "readiness postgres is not compatible with kind redis",
      );
    }
    if (!invalidVersion.ok) {
      expect(invalidVersion.issues.map((issue) => issue.message).join("\n")).toContain(
        "version range",
      );
    }
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

  test("[BP-COMP-REL-SCHEMA-001] validates endpoint component relations", () => {
    const result = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "component-relations",
      name: "Component Relations",
      version: "1.0.0",
      summary: "A service and worker with an endpoint relation.",
      components: [
        {
          id: "api",
          name: "API",
          kind: "service",
          runtime: { strategy: "container-image", image: "example/api:latest" },
          ports: [{ name: "http", containerPort: 3000 }],
        },
        {
          id: "worker",
          name: "Worker",
          kind: "worker",
          runtime: { strategy: "container-image", image: "example/worker:latest" },
        },
      ],
      componentRelations: [
        {
          id: "worker-uses-api",
          type: "endpoint",
          from: "worker",
          to: "api",
          endpoint: "http",
          effects: [{ kind: "inject-env", name: "API_BASE_URL", valueFrom: "endpoint-url" }],
        },
      ],
      profiles: { production: { replicas: 1 } },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const relation = result.value.componentRelations[0];
      expect(relation).toMatchObject({
        id: "worker-uses-api",
        required: true,
        effects: [{ kind: "inject-env", name: "API_BASE_URL", valueFrom: "endpoint-url" }],
      });
    }
  });

  test("[BP-COMP-REL-SCHEMA-002][BP-COMP-REL-SCHEMA-003][BP-COMP-REL-SCHEMA-005] rejects invalid component relations", () => {
    const missingComponent = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "missing-component-relation",
      name: "Missing Component Relation",
      version: "1.0.0",
      summary: "Invalid relation.",
      components: [
        {
          id: "worker",
          name: "Worker",
          kind: "worker",
          runtime: { strategy: "container-image", image: "example/worker:latest" },
        },
      ],
      componentRelations: [
        {
          id: "worker-uses-api",
          type: "endpoint",
          from: "worker",
          to: "api",
          endpoint: "http",
        },
      ],
    });
    const missingEndpoint = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "missing-endpoint-relation",
      name: "Missing Endpoint Relation",
      version: "1.0.0",
      summary: "Invalid endpoint relation.",
      components: [
        {
          id: "api",
          name: "API",
          kind: "service",
          runtime: { strategy: "container-image", image: "example/api:latest" },
          ports: [{ name: "admin", containerPort: 3000 }],
        },
        {
          id: "worker",
          name: "Worker",
          kind: "worker",
          runtime: { strategy: "container-image", image: "example/worker:latest" },
        },
      ],
      componentRelations: [
        {
          id: "worker-uses-api",
          type: "endpoint",
          from: "worker",
          to: "api",
          endpoint: "http",
        },
      ],
    });
    const invalidOutput = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "invalid-output-relation",
      name: "Invalid Output Relation",
      version: "1.0.0",
      summary: "Invalid output relation.",
      components: [
        {
          id: "api",
          name: "API",
          kind: "service",
          runtime: { strategy: "container-image", image: "example/api:latest" },
        },
        {
          id: "worker",
          name: "Worker",
          kind: "worker",
          runtime: { strategy: "container-image", image: "example/worker:latest" },
        },
      ],
      componentRelations: [
        {
          id: "worker-after-api",
          type: "lifecycle",
          from: "worker",
          to: "api",
          effects: [{ kind: "inject-env", name: "API_BASE_URL", valueFrom: "endpoint-url" }],
        },
      ],
    });

    expect(missingComponent.ok).toBe(false);
    expect(missingEndpoint.ok).toBe(false);
    expect(invalidOutput.ok).toBe(false);
    if (!missingComponent.ok) {
      expect(missingComponent.issues.map((issue) => issue.message).join("\n")).toContain(
        "unknown to component api",
      );
    }
    if (!missingEndpoint.ok) {
      expect(missingEndpoint.issues.map((issue) => issue.message).join("\n")).toContain(
        "unknown provider endpoint http",
      );
    }
    if (!invalidOutput.ok) {
      expect(invalidOutput.issues.map((issue) => issue.message).join("\n")).toContain(
        "unavailable output endpoint-url",
      );
    }
  });

  test("[BP-COMP-REL-SCHEMA-006][BP-COMP-REL-SCHEMA-007] rejects duplicate relation ids and dependency resource targets", () => {
    const duplicateIds = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "duplicate-component-relation",
      name: "Duplicate Component Relation",
      version: "1.0.0",
      summary: "Invalid relation ids.",
      components: [
        {
          id: "api",
          name: "API",
          kind: "service",
          runtime: { strategy: "container-image", image: "example/api:latest" },
          ports: [{ name: "http", containerPort: 3000 }],
        },
        {
          id: "worker",
          name: "Worker",
          kind: "worker",
          runtime: { strategy: "container-image", image: "example/worker:latest" },
        },
      ],
      componentRelations: [
        {
          id: "worker-uses-api",
          type: "endpoint",
          from: "worker",
          to: "api",
          endpoint: "http",
        },
        {
          id: "worker-uses-api",
          type: "lifecycle",
          from: "worker",
          to: "api",
          effects: [{ kind: "order-after", readiness: "healthy" }],
        },
      ],
    });
    const dependencyResourceTarget = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "dependency-resource-target-relation",
      name: "Dependency Resource Target Relation",
      version: "1.0.0",
      summary: "Invalid relation target.",
      resources: [{ id: "postgres", kind: "postgres", label: "Postgres" }],
      components: [
        {
          id: "api",
          name: "API",
          kind: "service",
          runtime: { strategy: "container-image", image: "example/api:latest" },
          usesResources: ["postgres"],
        },
        {
          id: "worker",
          name: "Worker",
          kind: "worker",
          runtime: { strategy: "container-image", image: "example/worker:latest" },
        },
      ],
      componentRelations: [
        {
          id: "worker-uses-postgres",
          type: "lifecycle",
          from: "worker",
          to: "postgres",
          effects: [{ kind: "order-after", readiness: "healthy" }],
        },
      ],
    });

    expect(duplicateIds.ok).toBe(false);
    expect(dependencyResourceTarget.ok).toBe(false);
    if (!duplicateIds.ok) {
      expect(duplicateIds.issues.map((issue) => issue.message).join("\n")).toContain(
        "component relation ids must be unique",
      );
    }
    if (!dependencyResourceTarget.ok) {
      expect(dependencyResourceTarget.issues.map((issue) => issue.message).join("\n")).toContain(
        "to references dependency resource postgres",
      );
    }
  });

  test("[BP-COMP-REL-SCHEMA-004] rejects required lifecycle cycles and exposes topology sorting", () => {
    const components = [
      {
        id: "api",
        name: "API",
        kind: "service" as const,
        runtime: { strategy: "container-image" as const, image: "example/api:latest" },
        ports: [],
        routes: [],
        variables: [],
        usesSecrets: [],
        usesResources: [],
        storageMounts: [],
        dependencyEnv: [],
      },
      {
        id: "worker",
        name: "Worker",
        kind: "worker" as const,
        runtime: { strategy: "container-image" as const, image: "example/worker:latest" },
        ports: [],
        routes: [],
        variables: [],
        usesSecrets: [],
        usesResources: [],
        storageMounts: [],
        dependencyEnv: [],
      },
    ];
    const relations = [
      {
        id: "worker-after-api",
        type: "lifecycle" as const,
        from: "worker",
        to: "api",
        required: true,
        effects: [{ kind: "order-after" as const, readiness: "healthy" as const }],
      },
    ];
    const graph = new BlueprintComponentRelationGraph({ components, relations });
    const sorted = graph.topologicalSort();

    expect(sorted.ok).toBe(true);
    if (sorted.ok) {
      expect(sorted.value.sortedComponentIds).toEqual(["api", "worker"]);
      expect(sorted.value.rule).toContain("provider components before consumer components");
    }
    expect(graph.describeTopologicalSort()).toContain("api -> worker");

    const cyclic = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "cyclic-lifecycle",
      name: "Cyclic Lifecycle",
      version: "1.0.0",
      summary: "Invalid lifecycle cycle.",
      components,
      componentRelations: [
        ...relations,
        {
          id: "api-after-worker",
          type: "lifecycle",
          from: "api",
          to: "worker",
          effects: [{ kind: "order-after", readiness: "healthy" }],
        },
      ],
    });

    expect(cyclic.ok).toBe(false);
    if (!cyclic.ok) {
      expect(cyclic.issues.map((issue) => issue.message).join("\n")).toContain("startup cycle");
    }
  });

  test("[BP-COMP-REL-LOADER-001] loads YAML component relations", () => {
    const result = loadBlueprintManifest({
      format: "yaml",
      content: `
schemaVersion: appaloft.blueprint/v1
id: yaml-component-relations
name: YAML Component Relations
version: 1.0.0
summary: A YAML-authored component graph.
components:
  - id: api
    name: API
    kind: service
    runtime:
      strategy: container-image
      image: example/api:latest
    ports:
      - name: http
        containerPort: 3000
        protocol: http
      - name: otlp-grpc
        containerPort: 4317
        protocol: grpc
  - id: worker
    name: Worker
    kind: worker
    runtime:
      strategy: container-image
      image: example/worker:latest
componentRelations:
  - id: worker-uses-api
    type: endpoint
    from: worker
    to: api
    endpoint: http
    effects:
      - kind: inject-env
        name: API_BASE_URL
        valueFrom: endpoint-url
  - id: worker-starts-after-api
    type: lifecycle
    from: worker
    to: api
    required: true
    effects:
      - kind: order-after
        readiness: healthy
`,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.componentRelations.map((relation) => relation.id)).toEqual([
        "worker-uses-api",
        "worker-starts-after-api",
      ]);
      expect(result.value.components[0]?.ports[1]?.protocol).toBe("grpc");
    }
  });
});
