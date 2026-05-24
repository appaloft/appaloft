import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createBlueprintInstallPlan, loadBlueprintManifest } from "../src";

const sampleFiles = [
  "background-worker.blueprint.yaml",
  "pocketbase.blueprint.yaml",
  "static-site.blueprint.yaml",
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
});
