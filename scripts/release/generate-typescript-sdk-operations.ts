import { join, resolve } from "node:path";

import { createAppaloftOpenApiSpec } from "@appaloft/openapi";
import { renderTypescriptSdkFacade } from "@appaloft/sdk-generator";

const root = resolve(import.meta.dir, "../..");
const outPath = join(root, "packages", "sdk", "src", "generated-operations.ts");

await Bun.write(
  outPath,
  renderTypescriptSdkFacade(await createAppaloftOpenApiSpec(), {
    importPath: "./internal",
  }),
);

console.log(`generated TypeScript SDK operations at ${outPath}`);
