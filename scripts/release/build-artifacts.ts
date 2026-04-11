import { join, resolve } from "node:path";

import { createStandardReleaseManifest } from "@yundu/adapter-packaging";
import { createBinaryBundle } from "./lib/binary-bundle";
import { copyDir, copyFileIfExists, resetDir, run } from "./lib/release-utils";

const root = resolve(import.meta.dir, "../..");
const releaseRoot = join(root, "dist", "release");

await resetDir(releaseRoot);

await run(["bun", "run", "--cwd", "apps/shell", "build"], root);
await run(["bun", "run", "--cwd", "apps/web", "build"], root);

await copyDir(join(root, "apps", "shell", "dist"), join(releaseRoot, "yundu-backend"));
await copyDir(join(root, "apps", "web", "build"), join(releaseRoot, "yundu-web-static"));

await createBinaryBundle({
  root,
  outDir: join(releaseRoot, "yundu-binary-bundle"),
  skipWebBuild: true,
});

await copyFileIfExists(
  join(root, "docker-compose.selfhost.yml"),
  join(releaseRoot, "docker-compose.selfhost.yml"),
);
await copyFileIfExists(join(root, "Dockerfile"), join(releaseRoot, "Dockerfile"));

await Bun.write(
  join(releaseRoot, "release-manifest.json"),
  `${JSON.stringify(
    createStandardReleaseManifest({
      version: process.env.YUNDU_APP_VERSION ?? "0.1.0",
      generatedAt: new Date().toISOString(),
    }),
    null,
    2,
  )}\n`,
);

console.log(`release artifacts created at ${releaseRoot}`);
