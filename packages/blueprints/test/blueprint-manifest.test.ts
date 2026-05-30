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
