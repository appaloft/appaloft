import { join, resolve } from "node:path";

import { chmodExecutable, parseCliArgs, resetDir, run, stringArg } from "./lib/release-utils";
import {
  normalizeReleaseVersion,
  type ReleaseBinaryTarget,
  releaseBinaryTargets,
} from "./lib/targets";

const root = resolve(import.meta.dir, "../..");
const args = parseCliArgs(Bun.argv.slice(2));
const version = normalizeReleaseVersion(
  stringArg(args, "version") ?? process.env.APPALOFT_APP_VERSION ?? "0.1.0",
);
const releaseDir = resolve(stringArg(args, "release-dir") ?? join(root, "dist", "release"));
const tempDir = join(root, "dist", ".tmp-npm-binaries");
const mainPackageDir = join(root, "packages", "npm", "cli");

async function readPackageJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await Bun.file(path).text()) as Record<string, unknown>;
}

async function writePackageJson(path: string, value: Record<string, unknown>): Promise<void> {
  await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function extractBinary(target: ReleaseBinaryTarget): Promise<string> {
  const archiveBaseName = `appaloft-v${version}-${target.name}`;
  const archivePath = join(releaseDir, `${archiveBaseName}.${target.archiveFormat}`);
  const extractDir = join(tempDir, target.name);

  if (!(await Bun.file(archivePath).exists())) {
    throw new Error(
      `Missing binary archive for npm package ${target.npmPackageName}: ${archivePath}`,
    );
  }

  await resetDir(extractDir);
  if (target.archiveFormat === "zip") {
    await run(["unzip", "-q", archivePath, "-d", extractDir], root);
  } else {
    await run(["tar", "-xzf", archivePath, "-C", extractDir], root);
  }

  const binaryPath = join(extractDir, archiveBaseName, target.executableName);
  if (!(await Bun.file(binaryPath).exists())) {
    throw new Error(`Missing extracted binary ${binaryPath}`);
  }
  return binaryPath;
}

async function preparePlatformPackage(target: ReleaseBinaryTarget): Promise<void> {
  const packageDir = join(root, "packages", "npm", target.npmPackageName.replace("@appaloft/", ""));
  const packageJsonPath = join(packageDir, "package.json");
  const packageJson = await readPackageJson(packageJsonPath);
  packageJson.version = version;
  await writePackageJson(packageJsonPath, packageJson);

  const sourceBinaryPath = await extractBinary(target);
  const targetBinDir = join(packageDir, "bin");
  const targetBinaryPath = join(targetBinDir, target.executableName);
  await resetDir(targetBinDir);
  await Bun.write(targetBinaryPath, Bun.file(sourceBinaryPath));
  await chmodExecutable(targetBinaryPath);
}

async function prepareMainPackage(): Promise<void> {
  const packageJsonPath = join(mainPackageDir, "package.json");
  const packageJson = await readPackageJson(packageJsonPath);
  packageJson.version = version;
  packageJson.optionalDependencies = Object.fromEntries(
    releaseBinaryTargets.map((target) => [target.npmPackageName, version]),
  );
  await writePackageJson(packageJsonPath, packageJson);
  await chmodExecutable(join(mainPackageDir, "bin", "appaloft.js"));
}

await resetDir(tempDir);
for (const target of releaseBinaryTargets) {
  await preparePlatformPackage(target);
}
await prepareMainPackage();

console.log(`prepared npm packages for Appaloft ${version}`);
