import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { LocalFileBlueprintRegistry } from "../src";

const samplesDir = join(import.meta.dir, "..", "samples");

describe("LocalFileBlueprintRegistry", () => {
  test("[CLOUD-BLUEPRINT-PUBLIC-REGISTRY-012] lists neutral local Blueprint entries", async () => {
    const registry = new LocalFileBlueprintRegistry({
      files: [
        join(samplesDir, "pocketbase.blueprint.yaml"),
        join(samplesDir, "static-site.blueprint.yaml"),
      ],
    });

    const entries = await registry.list();

    expect(entries.map((entry) => entry.id)).toEqual(["pocketbase", "static-site"]);
    expect(JSON.stringify(entries)).not.toContain("Cloud marketplace");
  });

  test("[CLOUD-BLUEPRINT-PUBLIC-REGISTRY-012] resolves a Blueprint by id", async () => {
    const registry = new LocalFileBlueprintRegistry({
      files: [join(samplesDir, "background-worker.blueprint.yaml")],
    });

    const result = await registry.resolve("background-worker");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.resources[0]?.kind).toBe("redis");
    }
  });
});
