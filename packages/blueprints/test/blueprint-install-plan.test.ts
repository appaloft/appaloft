import { describe, expect, test } from "bun:test";
import {
  blueprintApplicationBundlePlanSchemaVersion,
  blueprintSchemaVersion,
  blueprintUpgradePlanSchemaVersion,
  createBlueprintApplicationBundlePlan,
  createBlueprintInstallPlan,
  createBlueprintUpgradePlan,
  resolveBlueprintVariantManifest,
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

  test("[CLOUD-BLUEPRINT-PUBLIC-DEPENDENCY-KINDS-022] preserves neutral dependency kinds in install plans", () => {
    const manifest = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "dependency-service",
      name: "Dependency Service",
      version: "1.0.0",
      summary: "A deployable service with mainstream dependency kinds.",
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
            image: "ghcr.io/appaloft/api:latest",
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
      target: {
        projectName: "Dependency Project",
        environmentName: "production",
        resourceSlugPrefix: "deps",
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const dependencyKinds = result.value.operations.flatMap((operation) =>
        operation.kind === "bind-dependency" ? [operation.requirementKind] : [],
      );

      expect(dependencyKinds).toEqual([
        "postgres",
        "mongodb",
        "mysql",
        "redis",
        "object-storage",
        "clickhouse",
        "opensearch",
      ]);
    }
  });

  test("[CLOUD-BLUEPRINT-PUBLIC-DEPENDENCY-KINDS-022] carries dependency capabilities into plans and bundles", () => {
    const manifest = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "capability-service",
      name: "Capability Service",
      version: "1.0.0",
      summary: "A deployable service with dependency capabilities.",
      resources: [
        {
          id: "postgres",
          kind: "postgres",
          label: "Postgres",
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
            image: "ghcr.io/appaloft/api:latest",
          },
          usesResources: ["postgres"],
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

    const plan = createBlueprintInstallPlan({
      manifest: manifest.value,
      profile: "production",
      target: {
        projectName: "Capability Project",
        environmentName: "production",
      },
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      throw new Error("Expected install plan to compile");
    }

    const bindDependency = plan.value.operations.find(
      (operation) => operation.kind === "bind-dependency",
    );
    expect(bindDependency).toMatchObject({
      kind: "bind-dependency",
      requirementId: "postgres",
      requirementKind: "postgres",
      capabilities: [{ type: "postgres-extension", name: "vector", required: true }],
    });

    const bundle = createBlueprintApplicationBundlePlan({ plan: plan.value });
    expect(bundle.ok).toBe(true);
    if (!bundle.ok) {
      throw new Error("Expected bundle plan to compile");
    }
    expect(bundle.value.dependencies).toEqual([
      expect.objectContaining({
        requirementId: "postgres",
        kind: "postgres",
        capabilities: [{ type: "postgres-extension", name: "vector", required: true }],
      }),
    ]);
    expect(bundle.value.components[0]?.dependencyBindings).toEqual([
      {
        requirementId: "postgres",
        requirementKind: "postgres",
        capabilities: [{ type: "postgres-extension", name: "vector", required: true }],
      },
    ]);
  });

  test("[CLOUD-BLUEPRINT-PUBLIC-VARIANT-033] compiles the selected variant into the install plan", () => {
    const manifest = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "multi-database-app",
      name: "Multi Database App",
      version: "1.0.0",
      summary: "A deployable app with selectable data backends.",
      defaultVariant: "sqlite",
      resources: [{ id: "data", kind: "volume", label: "SQLite data" }],
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
        preview: { replicas: 1 },
        production: { replicas: 1 },
      },
      variants: {
        sqlite: {
          label: "SQLite",
          defaultProfile: "preview",
        },
        postgres: {
          label: "Postgres",
          defaultProfile: "production",
          resources: [{ id: "postgres", kind: "postgres", label: "Postgres" }],
          components: [
            {
              id: "app",
              name: "App",
              kind: "service",
              runtime: {
                strategy: "container-image",
                image: "example/app:latest",
              },
              usesResources: ["postgres"],
            },
          ],
        },
      },
    });

    expect(manifest.ok).toBe(true);
    if (!manifest.ok) {
      throw new Error("Expected manifest to validate");
    }

    const resolved = resolveBlueprintVariantManifest({
      manifest: manifest.value,
      variant: "postgres",
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.value.resources.map((resource) => resource.kind)).toEqual(["postgres"]);
    }

    const plan = createBlueprintInstallPlan({
      manifest: manifest.value,
      variant: "postgres",
      target: {
        projectName: "Multi Database App",
        environmentName: "production",
      },
    });

    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.value.blueprint.variant).toBe("postgres");
      expect(plan.value.profile).toBe("production");
      expect(
        plan.value.operations.some(
          (operation) =>
            operation.kind === "bind-dependency" && operation.requirementKind === "postgres",
        ),
      ).toBe(true);
    }
  });

  test("[CLOUD-BLUEPRINT-INSTALLED-APPLICATION-040] groups multi-component plans into one neutral application bundle", () => {
    const manifest = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "multi-component-app",
      name: "Multi Component App",
      version: "1.0.0",
      summary: "An app bundle with a web service, worker, and dependency resources.",
      resources: [
        { id: "postgres", kind: "postgres", label: "Postgres" },
        { id: "redis", kind: "redis", label: "Redis" },
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
          ports: [{ name: "http", containerPort: 3000 }],
          routes: [{ port: "http", pathPrefix: "/" }],
          usesResources: ["postgres", "redis"],
        },
        {
          id: "worker",
          name: "Worker",
          kind: "worker",
          runtime: {
            strategy: "container-image",
            image: "example/worker:latest",
          },
          usesResources: ["redis"],
        },
      ],
      profiles: {
        production: { replicas: 1 },
      },
    });

    expect(manifest.ok).toBe(true);
    if (!manifest.ok) {
      throw new Error("Expected manifest to validate");
    }

    const installPlan = createBlueprintInstallPlan({
      manifest: manifest.value,
      profile: "production",
      target: {
        projectName: "Multi Component App",
        environmentName: "production",
        resourceSlugPrefix: "bundle",
      },
    });
    expect(installPlan.ok).toBe(true);
    if (!installPlan.ok) {
      throw new Error("Expected install plan to compile");
    }

    const bundlePlan = createBlueprintApplicationBundlePlan({ plan: installPlan.value });
    expect(bundlePlan.ok).toBe(true);
    if (!bundlePlan.ok) {
      throw new Error("Expected bundle plan to compile");
    }

    expect(bundlePlan.value.schemaVersion).toBe(blueprintApplicationBundlePlanSchemaVersion);
    expect(bundlePlan.value.createsExternalResources).toBe(false);
    expect(bundlePlan.value.application).toMatchObject({
      blueprintId: "multi-component-app",
      projectName: "Multi Component App",
      environmentName: "production",
      profile: "production",
    });
    expect(bundlePlan.value.components.map((component) => component.componentId)).toEqual([
      "web",
      "worker",
    ]);
    expect(bundlePlan.value.dependencies.map((dependency) => dependency.kind)).toEqual([
      "postgres",
      "redis",
    ]);
    expect(bundlePlan.value.relationships).toEqual(
      expect.arrayContaining([
        {
          kind: "application-contains-component",
          componentId: "web",
        },
        {
          kind: "application-contains-component",
          componentId: "worker",
        },
        {
          kind: "component-deploys-as-resource",
          componentId: "web",
          resourceSlug: "bundle-web",
        },
        {
          kind: "component-binds-dependency",
          componentId: "worker",
          requirementId: "redis",
          requirementKind: "redis",
          capabilities: [],
        },
      ]),
    );
    expect(bundlePlan.value.execution).toEqual({
      mode: "dry-run-only",
      requiredFollowUp: "accepted-install-command",
    });
  });

  test("[BP-COMP-REL-PLAN-001] compiles endpoint component links into dry-run plan operations", () => {
    const manifest = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "endpoint-linked-app",
      name: "Endpoint Linked App",
      version: "1.0.0",
      summary: "A worker uses an API endpoint.",
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
          effects: [
            { kind: "inject-env", name: "API_BASE_URL", valueFrom: "endpoint-url" },
            { kind: "private-service-discovery", valueFrom: "endpoint-host" },
          ],
        },
      ],
      profiles: { production: { replicas: 1 } },
    });
    expect(manifest.ok).toBe(true);
    if (!manifest.ok) return;

    const plan = createBlueprintInstallPlan({
      manifest: manifest.value,
      profile: "production",
      target: {
        projectName: "Endpoint Linked App",
        environmentName: "production",
      },
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const relationIndex = plan.value.operations.findIndex(
      (operation) => operation.kind === "configure-component-link",
    );
    const workerDeploymentIndex = plan.value.operations.findIndex(
      (operation) => operation.kind === "create-deployment" && operation.componentId === "worker",
    );
    expect(relationIndex).toBeGreaterThan(-1);
    expect(relationIndex).toBeLessThan(workerDeploymentIndex);
    expect(plan.value.operations[relationIndex]).toMatchObject({
      kind: "configure-component-link",
      relationId: "worker-uses-api",
      relationType: "endpoint",
      fromComponentId: "worker",
      toComponentId: "api",
      endpoint: "http",
      required: true,
      outputs: expect.arrayContaining(["endpoint-url", "endpoint-host"]),
      effects: expect.arrayContaining([
        { kind: "inject-env", name: "API_BASE_URL", valueFrom: "endpoint-url" },
      ]),
    });
  });

  test("[BP-COMP-REL-PLAN-002] topologically orders required lifecycle component links", () => {
    const manifest = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "lifecycle-linked-app",
      name: "Lifecycle Linked App",
      version: "1.0.0",
      summary: "A worker starts after an API.",
      components: [
        {
          id: "worker",
          name: "Worker",
          kind: "worker",
          runtime: { strategy: "container-image", image: "example/worker:latest" },
        },
        {
          id: "api",
          name: "API",
          kind: "service",
          runtime: { strategy: "container-image", image: "example/api:latest" },
          ports: [{ name: "http", containerPort: 3000 }],
        },
      ],
      componentRelations: [
        {
          id: "worker-starts-after-api",
          type: "lifecycle",
          from: "worker",
          to: "api",
          effects: [{ kind: "order-after", readiness: "healthy" }],
        },
      ],
      profiles: { production: { replicas: 1 } },
    });
    expect(manifest.ok).toBe(true);
    if (!manifest.ok) return;

    const plan = createBlueprintInstallPlan({
      manifest: manifest.value,
      profile: "production",
      target: {
        projectName: "Lifecycle Linked App",
        environmentName: "production",
      },
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(
      plan.value.operations.flatMap((operation) =>
        operation.kind === "create-deployment" ? [operation.componentId] : [],
      ),
    ).toEqual(["api", "worker"]);
    expect(plan.value.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "configure-component-link",
          relationId: "worker-starts-after-api",
          effects: [{ kind: "order-after", readiness: "healthy" }],
        }),
      ]),
    );
  });

  test("[BP-COMP-REL-BUNDLE-001] projects component links into application bundle relationships", () => {
    const manifest = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "bundle-linked-app",
      name: "Bundle Linked App",
      version: "1.0.0",
      summary: "A bundle with component graph relationships.",
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
    expect(manifest.ok).toBe(true);
    if (!manifest.ok) return;
    const installPlan = createBlueprintInstallPlan({
      manifest: manifest.value,
      profile: "production",
      target: {
        projectName: "Bundle Linked App",
        environmentName: "production",
        resourceSlugPrefix: "linked",
      },
    });
    expect(installPlan.ok).toBe(true);
    if (!installPlan.ok) return;

    const bundle = createBlueprintApplicationBundlePlan({ plan: installPlan.value });

    expect(bundle.ok).toBe(true);
    if (!bundle.ok) return;
    expect(bundle.value.relationships).toEqual(
      expect.arrayContaining([
        {
          kind: "component-links-component",
          relationId: "worker-uses-api",
          relationType: "endpoint",
          fromComponentId: "worker",
          toComponentId: "api",
          endpoint: "http",
          required: true,
          effects: [{ kind: "inject-env", name: "API_BASE_URL", valueFrom: "endpoint-url" }],
        },
      ]),
    );
  });

  test("[CLOUD-BLUEPRINT-UPGRADE-PLAN-038] creates a dry-run upgrade plan without executing updates", () => {
    const current = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "upgradable-app",
      name: "Upgradable App",
      version: "1.0.0",
      summary: "An app with an older topology.",
      defaultVariant: "sqlite",
      resources: [{ id: "data", kind: "volume", label: "SQLite data" }],
      secrets: [{ key: "APP_SECRET", label: "App secret" }],
      components: [
        {
          id: "app",
          name: "App",
          kind: "service",
          runtime: {
            strategy: "container-image",
            image: "example/app:1",
          },
          ports: [{ name: "http", containerPort: 3000 }],
          usesSecrets: ["APP_SECRET"],
          usesResources: ["data"],
        },
      ],
      profiles: {
        production: { replicas: 1 },
      },
      variants: {
        sqlite: {
          label: "SQLite",
        },
      },
    });
    const target = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "upgradable-app",
      name: "Upgradable App",
      version: "2.0.0",
      summary: "An app with a newer topology.",
      defaultVariant: "postgres",
      resources: [{ id: "postgres", kind: "postgres", label: "Postgres" }],
      secrets: [
        { key: "APP_SECRET", label: "App secret" },
        { key: "MIGRATION_TOKEN", label: "Migration token" },
      ],
      components: [
        {
          id: "app",
          name: "App",
          kind: "service",
          runtime: {
            strategy: "container-image",
            image: "example/app:2",
          },
          ports: [{ name: "http", containerPort: 8080 }],
          usesSecrets: ["APP_SECRET", "MIGRATION_TOKEN"],
          usesResources: ["postgres"],
        },
      ],
      profiles: {
        production: { replicas: 1 },
      },
      variants: {
        postgres: {
          label: "Postgres",
        },
      },
      upgrade: {
        strategy: "blueprint-plan",
        destructive: false,
        steps: [
          {
            from: "1.x",
            to: "2.x",
            classification: "potentially-breaking",
            requiresManualReview: true,
            changes: ["Database migration requires review."],
          },
        ],
      },
    });

    expect(current.ok).toBe(true);
    expect(target.ok).toBe(true);
    if (!current.ok || !target.ok) {
      throw new Error("Expected manifests to validate");
    }

    const plan = createBlueprintUpgradePlan({
      currentManifest: current.value,
      targetManifest: target.value,
      currentVariant: "sqlite",
      targetVariant: "postgres",
    });

    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.value.schemaVersion).toBe(blueprintUpgradePlanSchemaVersion);
      expect(plan.value.createsExternalResources).toBe(false);
      expect(plan.value.classification).toBe("breaking");
      expect(plan.value.requiresManualReview).toBe(true);
      expect(plan.value.blueprint).toMatchObject({
        fromVersion: "1.0.0",
        toVersion: "2.0.0",
        fromVariant: "sqlite",
        toVariant: "postgres",
      });
      expect(plan.value.operations.map((operation) => operation.kind)).toEqual(
        expect.arrayContaining([
          "review-upgrade-policy",
          "change-blueprint-version",
          "change-variant",
          "change-runtime",
          "change-network",
          "add-dependency",
          "remove-dependency",
          "add-secret",
          "review-user-configuration",
        ]),
      );
      expect(plan.value.operations.map((operation) => operation.kind)).not.toContain(
        "execute-upgrade",
      );
    }
  });
});
