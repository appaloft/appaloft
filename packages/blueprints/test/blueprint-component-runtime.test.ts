import { describe, expect, test } from "bun:test";
import {
  blueprintComponentRuntimePlanFromMetadata,
  blueprintComponentRuntimePlanToMetadata,
  blueprintComponentRuntimeProjectionSchemaVersion,
  blueprintSchemaVersion,
  createBlueprintApplicationBundlePlan,
  createBlueprintComponentRuntimeProjection,
  createBlueprintInstallPlan,
  validateBlueprintManifest,
} from "../src";

describe("Blueprint component runtime projection", () => {
  test("[BP-COMP-REL-RUNTIME-001] lowers relation effects into neutral component runtime plans", () => {
    const manifest = validateBlueprintManifest({
      schemaVersion: blueprintSchemaVersion,
      id: "runtime-component-graph",
      name: "Runtime Component Graph",
      version: "1.0.0",
      summary: "A multi-component application with runtime relation effects.",
      components: [
        {
          id: "api",
          name: "API",
          kind: "service",
          runtime: {
            strategy: "container-image",
            image: "example/api:latest",
          },
          ports: [{ name: "http", containerPort: 3000, protocol: "http" }],
        },
        {
          id: "worker",
          name: "Worker",
          kind: "worker",
          runtime: {
            strategy: "container-image",
            image: "example/worker:latest",
          },
        },
        {
          id: "jaeger",
          name: "Jaeger",
          kind: "service",
          runtime: {
            strategy: "container-image",
            image: "jaegertracing/all-in-one:latest",
          },
          ports: [{ name: "otlp-grpc", containerPort: 4317, protocol: "grpc" }],
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
            {
              kind: "inject-env",
              name: "API_BASE_URL",
              valueFrom: "endpoint-url",
            },
            {
              kind: "private-service-discovery",
            },
            {
              kind: "network-allow",
            },
          ],
        },
        {
          id: "worker-starts-after-api",
          type: "lifecycle",
          from: "worker",
          to: "api",
          required: true,
          effects: [
            {
              kind: "order-after",
              readiness: "healthy",
            },
          ],
        },
        {
          id: "api-traces-to-jaeger",
          type: "telemetry",
          from: "api",
          to: "jaeger",
          endpoint: "otlp-grpc",
          required: false,
          effects: [
            {
              kind: "attach-telemetry",
              signal: "traces",
            },
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

    const installPlan = createBlueprintInstallPlan({
      manifest: manifest.value,
      profile: "production",
      target: {
        projectName: "Runtime Graph",
        environmentName: "production",
        resourceSlugPrefix: "runtime",
      },
    });
    expect(installPlan.ok).toBe(true);
    if (!installPlan.ok) {
      throw new Error("Expected install plan to compile");
    }

    const bundle = createBlueprintApplicationBundlePlan({ plan: installPlan.value });
    expect(bundle.ok).toBe(true);
    if (!bundle.ok) {
      throw new Error("Expected application bundle plan to compile");
    }

    const projection = createBlueprintComponentRuntimeProjection({
      applicationBundle: bundle.value,
      componentServiceNames: {
        api: "api.internal",
        worker: "worker.internal",
        jaeger: "jaeger.internal",
      },
      networkName: "appaloft-blueprint-private",
    });

    expect(projection.schemaVersion).toBe(blueprintComponentRuntimeProjectionSchemaVersion);
    expect(projection.warnings).toEqual([]);

    const workerRuntime = projection.components.find(
      (component) => component.componentId === "worker",
    );
    expect(workerRuntime).toBeDefined();
    expect(workerRuntime?.injectedEnv).toEqual([
      {
        relationId: "worker-uses-api",
        relationType: "endpoint",
        providerComponentId: "api",
        endpoint: "http",
        name: "API_BASE_URL",
        valueFrom: "endpoint-url",
        value: "http://api.internal:3000",
        required: true,
      },
    ]);
    expect(workerRuntime?.serviceDiscovery).toEqual([
      {
        relationId: "worker-uses-api",
        providerComponentId: "api",
        serviceName: "api.internal",
        host: "api.internal",
        endpoint: "http",
        port: 3000,
        scheme: "http",
        required: true,
      },
    ]);
    expect(workerRuntime?.networkAllows).toEqual([
      {
        relationId: "worker-uses-api",
        providerComponentId: "api",
        mode: "private",
        networkName: "appaloft-blueprint-private",
        required: true,
      },
    ]);
    expect(workerRuntime?.readinessGates).toEqual([
      {
        relationId: "worker-starts-after-api",
        providerComponentId: "api",
        providerServiceName: "api.internal",
        kind: "order-after",
        readiness: "healthy",
        required: true,
      },
    ]);

    const apiRuntime = projection.components.find((component) => component.componentId === "api");
    expect(apiRuntime?.telemetryAttachments).toEqual([
      {
        relationId: "api-traces-to-jaeger",
        providerComponentId: "jaeger",
        providerServiceName: "jaeger.internal",
        signal: "traces",
        endpoint: "otlp-grpc",
        endpointUrl: "grpc://jaeger.internal:4317",
        required: false,
      },
    ]);

    if (!workerRuntime) {
      throw new Error("Expected worker runtime projection");
    }
    expect(
      blueprintComponentRuntimePlanFromMetadata(
        blueprintComponentRuntimePlanToMetadata(workerRuntime),
      ),
    ).toEqual(workerRuntime);
    expect(blueprintComponentRuntimePlanFromMetadata({})).toBeUndefined();
  });
});
