import { join, resolve } from "node:path";

import { createStandardReleaseManifest } from "@appaloft/adapter-packaging";
import { createBinaryBundle } from "./lib/binary-bundle";
import {
  archiveDirectory,
  booleanArg,
  copyDir,
  copyFileIfExists,
  parseCliArgs,
  resetDir,
  run,
  stringArg,
} from "./lib/release-utils";
import { detectHostReleaseBinaryTarget, normalizeReleaseVersion } from "./lib/targets";

const root = resolve(import.meta.dir, "../..");
const releaseRoot = join(root, "dist", "release");
const args = parseCliArgs(Bun.argv.slice(2));
const version = normalizeReleaseVersion(
  stringArg(args, "version") ?? process.env.APPALOFT_APP_VERSION ?? "0.1.0",
);
const hostTarget = detectHostReleaseBinaryTarget();

await resetDir(releaseRoot);

await run(["bun", "run", "--cwd", "apps/shell", "build"], root);
await run(["bun", "run", "--cwd", "apps/web", "build"], root);

await copyDir(join(root, "apps", "shell", "dist"), join(releaseRoot, "appaloft-backend"));
await copyDir(join(root, "apps", "web", "build"), join(releaseRoot, "appaloft-web-static"));

if (!booleanArg(args, "skip-binary")) {
  await createBinaryBundle({
    root,
    outDir: join(releaseRoot, "appaloft-binary-bundle"),
    skipWebBuild: true,
    target: hostTarget,
    version,
  });
}

await copyFileIfExists(
  join(root, "docker-compose.selfhost.yml"),
  join(releaseRoot, "docker-compose.selfhost.yml"),
);
await copyFileIfExists(join(root, "Dockerfile"), join(releaseRoot, "Dockerfile"));
await copyFileIfExists(join(root, "install.sh"), join(releaseRoot, "install.sh"));

await Bun.write(
  join(releaseRoot, "release-manifest.json"),
  `${JSON.stringify(
    createStandardReleaseManifest({
      version,
      generatedAt: new Date().toISOString(),
    }),
    null,
    2,
  )}\n`,
);

if (booleanArg(args, "archives")) {
  await archiveDirectory({
    sourceDir: join(releaseRoot, "appaloft-backend"),
    archivePath: join(releaseRoot, `appaloft-backend-v${version}.tar.gz`),
    format: "tar.gz",
  });
  await archiveDirectory({
    sourceDir: join(releaseRoot, "appaloft-web-static"),
    archivePath: join(releaseRoot, `appaloft-web-static-v${version}.tar.gz`),
    format: "tar.gz",
  });

  if (!booleanArg(args, "skip-binary")) {
    await archiveDirectory({
      sourceDir: join(releaseRoot, "appaloft-binary-bundle"),
      archivePath: join(releaseRoot, `appaloft-v${version}-${hostTarget.name}.tar.gz`),
      format: "tar.gz",
    });
  }
}

console.log(`release artifacts created at ${releaseRoot}`);
