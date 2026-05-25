import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createBlueprintInstallPlan, loadBlueprintManifest } from "../src";

const sampleFiles = [
  "background-worker.blueprint.yaml",
  "component-graph-openclaw.blueprint.yaml",
  "pocketbase.blueprint.yaml",
  "pocketbase-jaeger.blueprint.yaml",
  "static-site.blueprint.yaml",
  "worker-api-readiness.blueprint.yaml",
] as const;

describe("Blueprint sample manifests", () => {
  for (const file of sampleFiles) {
    test(`[CLOUD-BLUEPRINT-SAMPLE-SMOKE-014] ${file} loads and emits an install plan`, async () => {
      const path = join(import.meta.dir, "..", "samples", file);
      const loaded = loadBlueprintManifest({
        path,
        content: await Bun.file(path).text(),
      });

      expect(loaded.ok).toBe(true);
      if (!loaded.ok) {
        throw new Error(loaded.issues.map((issue) => issue.message).join("\n"));
      }

      const plan = createBlueprintInstallPlan({
        manifest: loaded.value,
        profile: "production",
        parameters: Object.fromEntries(
          loaded.value.parameters.map((parameter) => [
            parameter.key,
            parameter.default ?? "sample",
          ]),
        ),
        target: {
          projectName: loaded.value.name,
          environmentName: "production",
          resourceSlugPrefix: "sample",
        },
      });

      expect(plan.ok).toBe(true);
      if (plan.ok) {
        expect(plan.value.operations.length).toBeGreaterThan(0);
        expect(
          plan.value.operations.some((operation) => operation.kind === "create-deployment"),
        ).toBe(true);
      }
    });
  }

  test("[BP-COMP-REL-SAMPLE-001] PocketBase plus bundled Jaeger validates and plans telemetry relation", async () => {
    const path = join(import.meta.dir, "..", "samples", "pocketbase-jaeger.blueprint.yaml");
    const loaded = loadBlueprintManifest({ path, content: await Bun.file(path).text() });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const plan = createBlueprintInstallPlan({
      manifest: loaded.value,
      profile: "production",
      target: {
        projectName: loaded.value.name,
        environmentName: "production",
      },
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "configure-component-link",
          relationId: "pocketbase-traces-to-jaeger",
          relationType: "telemetry",
          fromComponentId: "pocketbase",
          toComponentId: "jaeger",
          endpoint: "otlp-grpc",
        }),
      ]),
    );
  });

  test("[BP-COMP-REL-SAMPLE-002] multi-component sample keeps database as dependency resource", async () => {
    const path = join(import.meta.dir, "..", "samples", "component-graph-openclaw.blueprint.yaml");
    const loaded = loadBlueprintManifest({ path, content: await Bun.file(path).text() });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const plan = createBlueprintInstallPlan({
      manifest: loaded.value,
      profile: "production",
      target: {
        projectName: loaded.value.name,
        environmentName: "production",
      },
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(
      plan.value.operations.filter((operation) => operation.kind === "configure-component-link"),
    ).toHaveLength(2);
    expect(
      plan.value.operations.some(
        (operation) =>
          operation.kind === "bind-dependency" && operation.requirementId === "database",
      ),
    ).toBe(true);
  });

  test("[BP-COMP-REL-SAMPLE-003] worker readiness sample preserves lifecycle order", async () => {
    const path = join(import.meta.dir, "..", "samples", "worker-api-readiness.blueprint.yaml");
    const loaded = loadBlueprintManifest({ path, content: await Bun.file(path).text() });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const plan = createBlueprintInstallPlan({
      manifest: loaded.value,
      profile: "production",
      target: {
        projectName: loaded.value.name,
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
  });
});
