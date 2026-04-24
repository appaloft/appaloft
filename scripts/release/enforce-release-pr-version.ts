import { resolve } from "node:path";

import { parseCliArgs, stringArg } from "./lib/release-utils";
import { normalizeReleaseVersion, releaseTagName } from "./lib/targets";

interface PackageJson {
  version?: string;
}

interface ReleasePleaseManifest {
  ".": string;
}

const args = parseCliArgs(Bun.argv.slice(2));
const targetVersion = normalizeReleaseVersion(stringArg(args, "target-version") ?? "");
const currentVersion = normalizeReleaseVersion(stringArg(args, "current-version") ?? "");
const repository =
  stringArg(args, "repository") ?? process.env.GITHUB_REPOSITORY ?? "appaloft/appaloft";
const date = stringArg(args, "date") ?? new Date().toISOString().slice(0, 10);
const bodyOut = stringArg(args, "body-out");

if (!targetVersion) {
  throw new Error("Pass --target-version to enforce the Release Please PR version.");
}
if (!currentVersion) {
  throw new Error("Pass --current-version from the base branch release manifest.");
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await Bun.file(path).text()) as T;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);
}

function replaceRequired(
  input: string,
  pattern: RegExp,
  replacement: string,
  label: string,
): string {
  if (!pattern.test(input)) {
    throw new Error(`Cannot update ${label}; expected pattern was not found.`);
  }
  return input.replace(pattern, replacement);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function extractChangelogSection(changelog: string, version: string): string {
  const lines = changelog.split(/\r?\n/u);
  const start = lines.findIndex((line) => line.startsWith(`## [${version}](`));
  if (start < 0) {
    throw new Error(`Cannot find CHANGELOG.md section for ${version}.`);
  }

  const collected: string[] = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (index > start && line.startsWith("## ")) {
      break;
    }
    collected.push(line);
  }

  return collected.join("\n").trim();
}

const packageJsonPath = resolve("package.json");
const manifestPath = resolve(".github/.release-please-manifest.json");
const tauriConfigPath = resolve("apps/desktop/src-tauri/tauri.conf.json");
const cargoTomlPath = resolve("apps/desktop/src-tauri/Cargo.toml");
const changelogPath = resolve("CHANGELOG.md");

const packageJson = await readJson<PackageJson>(packageJsonPath);
const generatedVersion = normalizeReleaseVersion(packageJson.version ?? "");
if (!generatedVersion) {
  throw new Error("Cannot determine the Release Please PR version from package.json.");
}

if (generatedVersion !== targetVersion) {
  packageJson.version = targetVersion;
  await writeJson(packageJsonPath, packageJson);

  const manifest = await readJson<ReleasePleaseManifest>(manifestPath);
  manifest["."] = targetVersion;
  await writeJson(manifestPath, manifest);

  const tauriConfig = await readJson<PackageJson>(tauriConfigPath);
  tauriConfig.version = targetVersion;
  await writeJson(tauriConfigPath, tauriConfig);

  const cargoToml = await Bun.file(cargoTomlPath).text();
  await Bun.write(
    cargoTomlPath,
    replaceRequired(
      cargoToml,
      new RegExp(`(^version = ")${generatedVersion.replaceAll(".", "\\.")}(")$`, "mu"),
      `$1${targetVersion}$2`,
      "apps/desktop/src-tauri/Cargo.toml",
    ),
  );

  const generatedTag = releaseTagName(generatedVersion);
  const targetTag = releaseTagName(targetVersion);
  const changelog = await Bun.file(changelogPath).text();
  await Bun.write(
    changelogPath,
    replaceRequired(
      changelog,
      new RegExp(
        `## \\[${escapeRegExp(generatedVersion)}\\]\\(${escapeRegExp(`https://github.com/${repository}/compare/${releaseTagName(currentVersion)}...${generatedTag}`)}\\) \\(${escapeRegExp(date)}\\)`,
        "u",
      ),
      `## [${targetVersion}](https://github.com/${repository}/compare/${releaseTagName(currentVersion)}...${targetTag}) (${date})`,
      "CHANGELOG.md release heading",
    ),
  );
}

if (bodyOut) {
  const section = extractChangelogSection(await Bun.file(changelogPath).text(), targetVersion);
  const body = [
    ":robot: I have created a release *beep* *boop*",
    "---",
    "",
    "",
    section,
    "",
    "---",
    "This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).",
    "",
  ].join("\n");
  await Bun.write(resolve(bodyOut), body);
}

console.log(
  generatedVersion === targetVersion
    ? `Release Please PR already targets ${targetVersion}`
    : `Release Please PR version changed from ${generatedVersion} to ${targetVersion}`,
);
