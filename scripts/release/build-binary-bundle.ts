import { join, resolve } from "node:path";

import { createBinaryBundle } from "./lib/binary-bundle";
import { archiveDirectory, booleanArg, parseCliArgs, stringArg } from "./lib/release-utils";
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
  stringArg(args, "out-dir") ??
  (stringArg(args, "target") || booleanArg(args, "archive")
    ? join(root, "dist", "release", `appaloft-v${version}-${target.name}`)
    : join(root, "dist", "release", "appaloft-binary-bundle"));

await createBinaryBundle({
  root,
  outDir,
  target,
  version,
});

if (booleanArg(args, "archive")) {
  const archivePath = join(
    root,
    "dist",
    "release",
    `appaloft-v${version}-${target.name}.${target.archiveFormat}`,
  );
  await archiveDirectory({
    sourceDir: outDir,
    archivePath,
    format: target.archiveFormat,
  });
  console.log(`binary archive created at ${archivePath}`);
}

console.log(`binary bundle created at ${outDir}`);
