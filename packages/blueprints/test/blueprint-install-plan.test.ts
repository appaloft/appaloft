import { describe, expect, test } from "bun:test";
import {
  blueprintApplicationBundlePlanSchemaVersion,
  blueprintSchemaVersion,
  blueprintUpgradePlanSchemaVersion,
  createBlueprintApplicationBundlePlan,
  createBlueprintComponentRuntimeProjection,
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
        projectId: "prj_api",
        projectName: "API Project",
        environmentId: "env_api_prod",
        environmentName: "production",
        resourceSlugPrefix: "demo",
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.createsExternalResources).toBe(false);
      expect(result.value.operations.map((operation) => operation.kind)).toEqual([
        "resolve-project",
        "resolve-environment",
        "create-resource",
        "configure-runtime",
        "configure-network",
        "configure-access",
        "set-variable",
        "create-secret-reference",
        "bind-dependency",
        "create-deployment",
      ]);
      expect(result.value.operations[0]).toMatchObject({
        kind: "resolve-project",
        projectId: "prj_api",
        projectName: "API Project",
      });
      expect(result.value.operations[1]).toMatchObject({
        kind: "resolve-environment",
        environmentId: "env_api_prod",
        environmentName: "production",
      });
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
      expect.objectContaining({
        requirementId: "postgres",
        requirementKind: "postgres",
        engine: { family: "postgres" },
        capabilities: [{ type: "postgres-extension", name: "vector", required: true }],
        readiness: [],
        env: [],
      }),
    ]);
  });

  test("[BP-APP-BUNDLE-HEALTH-001] carries component health checks into application bundle plans", () => {
    const manifest = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "health-bundle",
      name: "Health Bundle",
      version: "1.0.0",
      summary: "Bundle health checks.",
      components: [
        {
          id: "web",
          name: "Web",
          kind: "service",
          runtime: {
            strategy: "container-image",
            image: "ghcr.io/appaloft/health-bundle:latest",
          },
          ports: [{ name: "http", containerPort: 3000, protocol: "http", public: true }],
          healthCheck: {
            enabled: true,
            type: "http",
            http: {
              path: "/health",
            },
          },
        },
      ],
      profiles: { production: { replicas: 1 } },
    });
    expect(manifest.ok).toBe(true);
    if (!manifest.ok) throw new Error("Expected manifest to compile");

    const plan = createBlueprintInstallPlan({
      manifest: manifest.value,
      target: {
        projectName: "health-bundle",
        environmentName: "production",
      },
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error("Expected install plan to compile");
    expect(
      plan.value.operations.find((operation) => operation.kind === "configure-runtime"),
    ).toMatchObject({
      kind: "configure-runtime",
      componentId: "web",
      healthCheck: {
        enabled: true,
        type: "http",
        http: {
          path: "/health",
          expectedStatusCode: 200,
        },
      },
    });

    const bundle = createBlueprintApplicationBundlePlan({ plan: plan.value });
    expect(bundle.ok).toBe(true);
    if (!bundle.ok) throw new Error("Expected bundle plan to compile");
    expect(bundle.value.components[0]?.healthCheck).toMatchObject({
      enabled: true,
      type: "http",
      http: {
        path: "/health",
        expectedStatusCode: 200,
      },
    });
  });

  test("[BP-DEP-CONTRACT-003] carries dependency env, output, readiness, and secret metadata into plans and runtime projections", () => {
    const manifest = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "dependency-env-service",
      name: "Dependency Env Service",
      version: "1.0.0",
      summary: "A service with structured dependency env injection.",
      resources: [
        {
          id: "postgres",
          kind: "postgres",
          label: "Postgres",
          version: { range: ">=15 <17" },
          readiness: [{ type: "postgres", database: "app" }],
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
          dependencyEnv: [
            { resource: "postgres", name: "DATABASE_URL", valueFrom: "url", secret: false },
            { resource: "postgres", name: "DB_HOST", valueFrom: "host" },
            { resource: "postgres", name: "DB_PASSWORD", valueFrom: "password" },
            {
              resource: "postgres",
              name: "JDBC_URL",
              template: "jdbc:postgresql://${host}:${port}/${database}",
            },
          ],
        },
      ],
      profiles: {
        production: { replicas: 1 },
      },
    });

    expect(manifest.ok).toBe(true);
    if (!manifest.ok) return;

    const plan = createBlueprintInstallPlan({
      manifest: manifest.value,
      profile: "production",
      target: { projectName: "Dependency Env", environmentName: "production" },
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const bind = plan.value.operations.find((operation) => operation.kind === "bind-dependency");
    expect(bind?.kind).toBe("bind-dependency");
    if (bind?.kind !== "bind-dependency") return;
    expect(bind).toMatchObject({
      requirementId: "postgres",
      engine: { family: "postgres" },
      version: { range: ">=15 <17" },
      readiness: [{ type: "postgres", database: "app", required: true }],
    });
    const waitReadinessIndex = plan.value.operations.findIndex(
      (operation) =>
        operation.kind === "wait-dependency-readiness" &&
        operation.componentId === "api" &&
        operation.requirementId === "postgres",
    );
    const deploymentIndex = plan.value.operations.findIndex(
      (operation) => operation.kind === "create-deployment" && operation.componentId === "api",
    );
    expect(waitReadinessIndex).toBeGreaterThan(-1);
    expect(deploymentIndex).toBeGreaterThan(waitReadinessIndex);
    expect(plan.value.operations[waitReadinessIndex]).toMatchObject({
      kind: "wait-dependency-readiness",
      componentId: "api",
      requirementId: "postgres",
      readiness: { type: "postgres", database: "app", required: true },
      required: true,
    });
    expect(bind.env).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "DATABASE_URL",
          valueFrom: "url",
          secret: true,
          outputNames: ["url"],
        }),
        expect.objectContaining({
          name: "DB_HOST",
          valueFrom: "host",
          secret: false,
        }),
        expect.objectContaining({
          name: "DB_PASSWORD",
          valueFrom: "password",
          secret: true,
        }),
        expect.objectContaining({
          name: "JDBC_URL",
          template: "jdbc:postgresql://${host}:${port}/${database}",
          secret: false,
          outputNames: ["host", "port", "database"],
        }),
      ]),
    );
    expect(JSON.stringify(plan.value)).not.toContain("postgres://appaloft:");

    const bundle = createBlueprintApplicationBundlePlan({ plan: plan.value });
    expect(bundle.ok).toBe(true);
    if (!bundle.ok) return;
    expect(bundle.value.dependencies[0]).toMatchObject({
      requirementId: "postgres",
      kind: "postgres",
      version: { range: ">=15 <17" },
      readiness: [{ type: "postgres", database: "app", required: true }],
    });
    expect(bundle.value.relationships).toEqual(
      expect.arrayContaining([
        {
          kind: "component-waits-for-dependency-readiness",
          componentId: "api",
          requirementId: "postgres",
          requirementKind: "postgres",
          engine: { family: "postgres" },
          readiness: { type: "postgres", database: "app", required: true },
          required: true,
        },
      ]),
    );

    const projection = createBlueprintComponentRuntimeProjection({
      applicationBundle: bundle.value,
    });
    expect(projection.components[0]?.dependencyEnv).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dependencyRequirementId: "postgres",
          name: "DATABASE_URL",
          valueFrom: "url",
          secret: true,
          bindingRef: { kind: "dependency-output", requirementId: "postgres" },
        }),
      ]),
    );
    expect(projection.components[0]?.dependencyReadinessGates).toEqual([
      {
        dependencyRequirementId: "postgres",
        kind: "postgres",
        engine: { family: "postgres" },
        readiness: { type: "postgres", database: "app", required: true },
        required: true,
      },
    ]);
    expect(JSON.stringify(projection)).not.toContain("postgres://appaloft:");
  });

  test("[BP-GENERATED-SECRET-002][BP-GENERATED-SECRET-003] carries generated secret metadata without materialized values", () => {
    const deterministicGeneratedValue = "test-generated-secret-value";
    const manifest = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "runtime-secret-app",
      name: "Runtime Secret App",
      version: "1.0.0",
      summary: "A deployable app with generated and user-provided secrets.",
      secrets: [
        {
          key: "NEXTAUTH_SECRET",
          label: "NextAuth secret",
          source: "generated",
          generation: {
            bytes: 32,
            encoding: "base64url",
            description: "Generated by the platform during accepted execution.",
            scope: "application",
          },
        },
        {
          key: "STRIPE_SECRET_KEY",
          label: "Stripe secret key",
          required: true,
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
      profiles: {
        production: { replicas: 1 },
      },
    });

    expect(manifest.ok).toBe(true);
    if (!manifest.ok) return;

    const plan = createBlueprintInstallPlan({
      manifest: manifest.value,
      profile: "production",
      target: {
        projectName: "Runtime Secret App",
        environmentName: "production",
      },
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const secretOperations = plan.value.operations.filter(
      (operation) => operation.kind === "create-secret-reference",
    );
    expect(secretOperations).toEqual([
      {
        kind: "create-secret-reference",
        componentId: "web",
        key: "NEXTAUTH_SECRET",
        required: true,
        source: "generated",
        generation: {
          bytes: 32,
          encoding: "base64url",
          description: "Generated by the platform during accepted execution.",
          scope: "application",
        },
      },
      {
        kind: "create-secret-reference",
        componentId: "web",
        key: "STRIPE_SECRET_KEY",
        required: true,
        source: "user-provided",
      },
    ]);

    const bundle = createBlueprintApplicationBundlePlan({ plan: plan.value });
    expect(bundle.ok).toBe(true);
    if (!bundle.ok) return;
    expect(bundle.value.components[0]?.secretReferences).toEqual(
      secretOperations.map(({ kind: _kind, componentId: _componentId, ...secret }) => secret),
    );

    const projection = createBlueprintComponentRuntimeProjection({
      applicationBundle: bundle.value,
    });
    expect(projection.components[0]?.secretEnv).toEqual([
      {
        name: "NEXTAUTH_SECRET",
        required: true,
        source: "generated",
        generation: {
          bytes: 32,
          encoding: "base64url",
          description: "Generated by the platform during accepted execution.",
          scope: "application",
        },
        bindingRef: { kind: "secret-reference", key: "NEXTAUTH_SECRET" },
      },
      {
        name: "STRIPE_SECRET_KEY",
        required: true,
        source: "user-provided",
        bindingRef: { kind: "secret-reference", key: "STRIPE_SECRET_KEY" },
      },
    ]);
    expect(JSON.stringify(plan.value)).not.toContain(deterministicGeneratedValue);
    expect(JSON.stringify(bundle.value)).not.toContain(deterministicGeneratedValue);
    expect(JSON.stringify(projection)).not.toContain(deterministicGeneratedValue);
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

  test("[CLOUD-BLUEPRINT-INSTALLED-APPLICATION-040] [APP-BUNDLE-STORAGE-PLAN-002] groups multi-component plans into one neutral application bundle", () => {
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
    expect(bundlePlan.value.storageBindings).toEqual([]);
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
        expect.objectContaining({
          kind: "component-binds-dependency",
          componentId: "worker",
          requirementId: "redis",
          requirementKind: "redis",
          capabilities: [],
        }),
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

  test("[BLUEPRINT-STORAGE-MOUNT-001] [APP-BUNDLE-STORAGE-PLAN-001] [APP-BUNDLE-STORAGE-PLAN-003] [APP-BUNDLE-STORAGE-RUNTIME-001] projects volume mounts as storage bindings without dependency readback", () => {
    const manifest = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "volume-app",
      name: "Volume App",
      version: "1.0.0",
      summary: "A container app with durable storage.",
      resources: [{ id: "data", kind: "volume", label: "Durable data" }],
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
          storageMounts: [
            {
              resource: "data",
              mountPath: "/app/data",
              mountMode: "read-write",
            },
          ],
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
        projectName: "Volume App",
        environmentName: "production",
      },
    });
    expect(installPlan.ok).toBe(true);
    if (!installPlan.ok) {
      throw new Error("Expected install plan to compile");
    }

    expect(installPlan.value.operations).toEqual(
      expect.arrayContaining([
        {
          kind: "attach-storage",
          componentId: "app",
          requirementId: "data",
          mountPath: "/app/data",
          mountMode: "read-write",
        },
      ]),
    );
    expect(
      installPlan.value.operations.some((operation) => operation.kind === "bind-dependency"),
    ).toBe(false);
    expect(
      installPlan.value.operations.some(
        (operation) => operation.kind === "wait-dependency-readiness",
      ),
    ).toBe(false);

    const bundle = createBlueprintApplicationBundlePlan({ plan: installPlan.value });
    expect(bundle.ok).toBe(true);
    if (!bundle.ok) {
      throw new Error("Expected bundle plan to compile");
    }

    expect(bundle.value.components[0]?.storageMounts).toEqual([
      {
        storageRequirementId: "data",
        requirementId: "data",
        mountPath: "/app/data",
        mountMode: "read-write",
      },
    ]);
    expect(bundle.value.components[0]?.dependencyBindings).toEqual([]);
    expect(bundle.value.dependencies).toEqual([]);
    expect(bundle.value.storageBindings).toEqual([
      {
        storageRequirementId: "data",
        requirementId: "data",
        kind: "volume",
        componentId: "app",
        mountPath: "/app/data",
        mountMode: "read-write",
        scope: "storage-volume",
        attachmentMode: "resource-storage-attachment",
      },
    ]);
    expect(bundle.value.relationships).toEqual(
      expect.arrayContaining([
        {
          kind: "component-attaches-storage",
          componentId: "app",
          storageRequirementId: "data",
          requirementId: "data",
          mountPath: "/app/data",
          mountMode: "read-write",
        },
      ]),
    );

    const projection = createBlueprintComponentRuntimeProjection({
      applicationBundle: bundle.value,
    });
    expect(projection.components[0]?.storageMounts).toEqual([
      {
        storageRequirementId: "data",
        dependencyRequirementId: "data",
        mountPath: "/app/data",
        mountMode: "read-write",
        bindingRef: {
          kind: "storage-output",
          requirementId: "data",
          storageRequirementId: "data",
          output: "mountPath",
        },
      },
    ]);
    expect(projection.components[0]?.dependencyEnv).toEqual([]);
    expect(projection.components[0]?.dependencyReadinessGates).toEqual([]);
  });

  test("[BLUEPRINT-STORAGE-MOUNT-002] rejects storage mounts that do not target volume resources", () => {
    const manifest = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "invalid-volume-app",
      name: "Invalid Volume App",
      version: "1.0.0",
      summary: "A container app with invalid storage metadata.",
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
          storageMounts: [
            {
              resource: "database",
              mountPath: "/app/data",
            },
          ],
        },
      ],
      profiles: {
        production: { replicas: 1 },
      },
    });

    expect(manifest.ok).toBe(false);
    if (manifest.ok) return;
    expect(manifest.issues.map((issue) => issue.message)).toContain(
      "storageMount resource database must be a volume resource",
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

  test("[APP-BUNDLE-STORAGE-METADATA-001] preserves storage data format metadata in application bundle plans", () => {
    const manifest = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "pocketbase-like",
      name: "PocketBase Like",
      version: "1.0.0",
      summary: "A deployable app with SQLite data on a volume.",
      resources: [{ id: "data", kind: "volume", label: "PocketBase data" }],
      components: [
        {
          id: "pocketbase",
          name: "PocketBase",
          kind: "service",
          runtime: {
            strategy: "container-image",
            image: "ghcr.io/muchobien/pocketbase:latest",
          },
          usesResources: ["data"],
          storageMounts: [
            {
              resource: "data",
              mountPath: "/pb_data",
              mountMode: "read-write",
              dataFormat: "sqlite",
              applicationDataLabel: "PocketBase data",
            },
          ],
        },
      ],
      profiles: {
        production: { replicas: 1 },
      },
    });
    expect(manifest.ok).toBe(true);
    if (!manifest.ok) return;

    const plan = createBlueprintInstallPlan({
      manifest: manifest.value,
      profile: "production",
      target: {
        projectId: "prj_pb",
        projectName: "PocketBase",
        environmentId: "env_prod",
        environmentName: "Production",
      },
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const bundle = createBlueprintApplicationBundlePlan({ plan: plan.value });
    expect(bundle.ok).toBe(true);
    if (!bundle.ok) return;
    expect(bundle.value.components[0]?.storageMounts).toEqual([
      {
        storageRequirementId: "data",
        requirementId: "data",
        mountPath: "/pb_data",
        mountMode: "read-write",
        dataFormat: "sqlite",
        applicationDataLabel: "PocketBase data",
      },
    ]);

    const runtimeProjection = createBlueprintComponentRuntimeProjection({
      applicationBundle: bundle.value,
    });
    expect(runtimeProjection.components[0]?.storageMounts).toEqual([
      expect.objectContaining({
        storageRequirementId: "data",
        dependencyRequirementId: "data",
        mountPath: "/pb_data",
        mountMode: "read-write",
        dataFormat: "sqlite",
        applicationDataLabel: "PocketBase data",
      }),
    ]);
  });

  test("[BP-DEP-VERSION-UPGRADE-001] reports dependency compatibility changes without executing dependency upgrades", () => {
    const current = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "dependency-version-app",
      name: "Dependency Version App",
      version: "1.0.0",
      summary: "An app with dependency compatibility metadata.",
      resources: [
        {
          id: "postgres",
          kind: "postgres",
          label: "Postgres",
          version: { preferred: "15.4", range: ">=15 <17" },
        },
      ],
      components: [
        {
          id: "app",
          name: "App",
          kind: "service",
          runtime: {
            strategy: "container-image",
            image: "example/app:1",
          },
          usesResources: ["postgres"],
        },
      ],
    });
    const target = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "dependency-version-app",
      name: "Dependency Version App",
      version: "1.1.0",
      summary: "An app with newer dependency compatibility metadata.",
      resources: [
        {
          id: "postgres",
          kind: "postgres",
          label: "Postgres",
          version: { preferred: "16", range: ">=16 <17", minimum: "16" },
        },
      ],
      components: [
        {
          id: "app",
          name: "App",
          kind: "service",
          runtime: {
            strategy: "container-image",
            image: "example/app:1",
          },
          usesResources: ["postgres"],
        },
      ],
    });

    expect(current.ok).toBe(true);
    expect(target.ok).toBe(true);
    if (!current.ok || !target.ok) return;

    const plan = createBlueprintUpgradePlan({
      currentManifest: current.value,
      targetManifest: target.value,
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.createsExternalResources).toBe(false);
    expect(plan.value.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "change-dependency-compatibility",
          requirementId: "postgres",
          fromVersion: { preferred: "15.4", range: ">=15 <17" },
          toVersion: { preferred: "16", range: ">=16 <17", minimum: "16" },
          classification: "potentially-breaking",
        }),
      ]),
    );
    expect(plan.value.operations.map((operation) => operation.kind)).not.toContain(
      "execute-upgrade",
    );
  });
});
