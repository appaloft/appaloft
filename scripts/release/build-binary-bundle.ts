import { join, resolve } from "node:path";

import { createBinaryBundle } from "./lib/binary-bundle";

const root = resolve(import.meta.dir, "../..");
const outDir = join(root, "dist", "release", "yundu-binary-bundle");

await createBinaryBundle({
  root,
  outDir,
});

console.log(`binary bundle created at ${outDir}`);
