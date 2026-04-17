import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { appaloftDeploymentConfigJsonSchema } from "../src/index";

const outputPath = resolve("json-schema/appaloft.config.schema.json");

await mkdir(dirname(outputPath), { recursive: true });
await Bun.write(outputPath, `${JSON.stringify(appaloftDeploymentConfigJsonSchema, null, 2)}\n`);

const format = Bun.spawnSync(["bunx", "biome", "format", "--write", outputPath], {
  stdout: "pipe",
  stderr: "pipe",
});

if (!format.success) {
  throw new Error(format.stderr.toString() || "Failed to format generated JSON Schema");
}
