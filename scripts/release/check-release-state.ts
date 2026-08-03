import { resolve } from "node:path";

import { parseCliArgs, stringArg } from "./lib/release-utils";
import { normalizeReleaseVersion } from "./lib/targets";

interface VersionedJson {
  version?: string;
}

interface ReleasePleaseManifest {
  "."?: string;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await Bun.file(path).text()) as T;
}

function requireVersion(value: string | undefined, label: string): string {
  const version = normalizeReleaseVersion(value ?? "");
  if (!version) {
    throw new Error(`Cannot determine ${label}.`);
  }
  return version;
}

const root = resolve(import.meta.dir, "../..");
const packageJson = await readJson<VersionedJson>(resolve(root, "package.json"));
const manifest = await readJson<ReleasePleaseManifest>(
  resolve(root, ".github/.release-please-manifest.json"),
);
const tauriConfig = await readJson<VersionedJson>(
  resolve(root, "apps/desktop/src-tauri/tauri.conf.json"),
);
const cargoToml = await Bun.file(resolve(root, "apps/desktop/src-tauri/Cargo.toml")).text();
const cargoVersion = cargoToml.match(/^version = "(?<version>[^"]+)"$/mu)?.groups?.version;

const versions = new Map<string, string>([
  ["package.json", requireVersion(packageJson.version, "package.json version")],
  [
    ".github/.release-please-manifest.json",
    requireVersion(manifest["."], "Release Please manifest version"),
  ],
  [
    "apps/desktop/src-tauri/tauri.conf.json",
    requireVersion(tauriConfig.version, "Tauri config version"),
  ],
  ["apps/desktop/src-tauri/Cargo.toml", requireVersion(cargoVersion, "Cargo package version")],
]);

const distinctVersions = new Set(versions.values());
if (distinctVersions.size !== 1) {
  throw new Error(
    `Repository release version sources diverge: ${[...versions.entries()]
      .map(([path, version]) => `${path}=${version}`)
      .join(", ")}`,
  );
}

const repositoryVersion = versions.get("package.json");
if (!repositoryVersion) {
  throw new Error("Repository release version is unavailable.");
}

const args = parseCliArgs(Bun.argv.slice(2));
const latestReleaseTag = stringArg(args, "latest-release-tag");
if (latestReleaseTag) {
  const latestReleaseVersion = requireVersion(latestReleaseTag, "latest GitHub release tag");
  if (latestReleaseVersion !== repositoryVersion) {
    throw new Error(
      `Repository release state is ${repositoryVersion}, but the latest GitHub release is ${latestReleaseTag}. Reconcile the repository version sources before running Release Please.`,
    );
  }
}

console.log(`Repository release state is synchronized at ${repositoryVersion}.`);
