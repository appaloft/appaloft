import { join, resolve } from "node:path";

import { createDeployCliBinaryBundle } from "./lib/binary-bundle";
import { parseCliArgs, stringArg } from "./lib/release-utils";
import {
  detectHostReleaseBinaryTarget,
  getReleaseBinaryTarget,
  normalizeReleaseVersion,
} from "./lib/targets";

const root = resolve(import.meta.dir, "../..");
const args = parseCliArgs(Bun.argv.slice(2));
const version = normalizeReleaseVersion(
  stringArg(args, "version") ?? process.env.APPALOFT_APP_VERSION ?? "0.1.0",
);
const target = stringArg(args, "target")
  ? getReleaseBinaryTarget(stringArg(args, "target") ?? "")
  : detectHostReleaseBinaryTarget();
const outDir =
  stringArg(args, "out-dir") ?? join(root, "dist", "release", "appaloft-deploy-cli-bundle");

await createDeployCliBinaryBundle({
  root,
  outDir,
  target,
  version,
});

console.log(`deploy CLI bundle created at ${outDir}`);
