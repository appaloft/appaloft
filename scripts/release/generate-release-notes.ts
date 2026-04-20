import { basename, join, relative, resolve } from "node:path";

import { listTopLevelFiles, parseCliArgs, stringArg } from "./lib/release-utils";
import { normalizeReleaseVersion, releaseTagName } from "./lib/targets";

type ReleaseAssetGroup = "desktop" | "cli" | "install" | "self-host" | "metadata" | "other";

interface ReleaseAsset {
  group: ReleaseAssetGroup;
  file: string;
}

function classifyAsset(fileName: string): ReleaseAssetGroup {
  if (fileName === "checksums.txt" || fileName === "release-manifest.json") {
    return "metadata";
  }
  if (fileName.startsWith("appaloft-desktop-")) {
    return "desktop";
  }
  if (fileName.startsWith("appaloft-v")) {
    return "cli";
  }
  if (fileName === "install.sh") {
    return "install";
  }
  if (
    fileName.startsWith("appaloft-backend-") ||
    fileName.startsWith("appaloft-web-static-") ||
    fileName === "docker-compose.selfhost.yml" ||
    fileName === "Dockerfile"
  ) {
    return "self-host";
  }
  return "other";
}

function releaseAssetUrl(repository: string, tag: string, fileName: string): string {
  return `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(fileName)}`;
}

function markdownAssetList(
  assets: readonly ReleaseAsset[],
  repository: string,
  tag: string,
): string[] {
  if (assets.length === 0) {
    return ["- Not published for this release."];
  }

  return assets.map(
    (asset) => `- [\`${asset.file}\`](${releaseAssetUrl(repository, tag, asset.file)})`,
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function changelogHeadingPattern(version: string): RegExp {
  const escapedVersion = escapeRegExp(version);
  return new RegExp(`^## (?:\\[)?${escapedVersion}(?:\\])?(?:\\b|\\s|$)`, "u");
}

function extractChangelogSection(changelog: string, version: string): string | undefined {
  const headingPattern = changelogHeadingPattern(version);
  const lines = changelog.split(/\r?\n/u);
  const startIndex = lines.findIndex((line) => headingPattern.test(line));
  if (startIndex < 0) {
    return undefined;
  }

  const collected: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.startsWith("## ")) {
      break;
    }
    collected.push(line);
  }

  return collected.join("\n").trim();
}

function releaseNotesOpening(version: string): string {
  if (version.startsWith("0.")) {
    return `Appaloft ${version} is a pre-GA release of the Appaloft deployment platform.`;
  }
  return `Appaloft ${version} is a stable release of the Appaloft deployment platform.`;
}

function knownGaps(version: string, assets: readonly ReleaseAsset[]): string[] {
  const gaps: string[] = [];
  const desktopFiles = assets
    .filter((asset) => asset.group === "desktop")
    .map((asset) => asset.file);
  const cliFiles = assets.filter((asset) => asset.group === "cli").map((asset) => asset.file);

  if (version.startsWith("0.")) {
    gaps.push(
      "- This is a pre-GA release. Public APIs, config shape, and packaging may still change before `1.0.0`.",
    );
  }

  if (
    cliFiles.some((file) => file.includes("win32")) &&
    !desktopFiles.some((file) => file.includes("win32"))
  ) {
    gaps.push(
      "- Windows CLI archives are published, but a Windows desktop installer is not included in this release.",
    );
  }

  return gaps;
}

const args = parseCliArgs(Bun.argv.slice(2));
const releaseRoot = resolve(stringArg(args, "release-dir") ?? "dist/release");
const version = normalizeReleaseVersion(
  stringArg(args, "version") ?? process.env.APPALOFT_APP_VERSION ?? "0.1.0",
);
const tag = releaseTagName(stringArg(args, "tag") ?? version);
const repository =
  stringArg(args, "repository") ?? process.env.GITHUB_REPOSITORY ?? "appaloft/appaloft";
const changelogPath = resolve(stringArg(args, "changelog") ?? "CHANGELOG.md");
const outputPath = resolve(stringArg(args, "out") ?? join(releaseRoot, "release-notes.md"));

const files = await listTopLevelFiles(releaseRoot);
const assets = files
  .map((file): ReleaseAsset => {
    const fileName = basename(file);
    return {
      group: classifyAsset(fileName),
      file: relative(releaseRoot, file),
    };
  })
  .filter((asset) => asset.file !== "release-notes.md")
  .sort((left, right) => left.file.localeCompare(right.file));

const changelogSection = extractChangelogSection(await Bun.file(changelogPath).text(), version);
const gaps = knownGaps(version, assets);

const lines = [
  releaseNotesOpening(version),
  "",
  "## Install",
  "",
  "```bash",
  "curl -fsSL https://appaloft.com/install.sh | sudo sh",
  `curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- --version ${version}`,
  `docker pull ghcr.io/${repository}:${version}`,
  "```",
  "",
  "## Downloads",
  "",
  "### Install Script",
  ...markdownAssetList(
    assets.filter((asset) => asset.group === "install"),
    repository,
    tag,
  ),
  "",
  "### Desktop Installers",
  ...markdownAssetList(
    assets.filter((asset) => asset.group === "desktop"),
    repository,
    tag,
  ),
  "",
  "### CLI Archives",
  ...markdownAssetList(
    assets.filter((asset) => asset.group === "cli"),
    repository,
    tag,
  ),
  "",
  "### Self-Host Artifacts",
  ...markdownAssetList(
    assets.filter((asset) => asset.group === "self-host"),
    repository,
    tag,
  ),
  "",
  "### Integrity Metadata",
  ...markdownAssetList(
    assets.filter((asset) => asset.group === "metadata"),
    repository,
    tag,
  ),
  "",
  "## Container Image",
  "",
  `- \`ghcr.io/${repository}:${version}\``,
  "",
  ...(gaps.length > 0 ? ["## Known Gaps", "", ...gaps, ""] : []),
  "## Changes",
  "",
  changelogSection ?? "No changelog entries were found for this version.",
  "",
];

await Bun.write(outputPath, `${lines.join("\n")}\n`);
console.log(`release notes written to ${outputPath}`);
