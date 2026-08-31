import { basename, join, relative, resolve } from "node:path";

import { listTopLevelFiles, parseCliArgs, stringArg } from "./lib/release-utils";
import { normalizeReleaseVersion, releaseTagName } from "./lib/targets";

type ReleaseAssetGroup = "desktop" | "cli" | "install" | "self-host" | "metadata" | "other";

export interface ReleaseAsset {
  group: ReleaseAssetGroup;
  file: string;
}

const FORBIDDEN_SESSION_WORDING = /occupanc|occupy/iu;

export function classifyAsset(fileName: string): ReleaseAssetGroup {
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

function releaseNotesOpening(version: string): string {
  if (version.startsWith("0.")) {
    return `Appaloft ${version} is a pre-GA developer release of the Appaloft Railway alternative.`;
  }
  return `Appaloft ${version} is a developer release of the Appaloft Railway alternative.`;
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

function assertNoForbiddenSessionWording(text: string): string {
  if (FORBIDDEN_SESSION_WORDING.test(text)) {
    throw new Error("GitHub release notes must not contain forbidden session wording");
  }
  return text;
}

export function buildReleaseNotes(input: {
  version: string;
  tag: string;
  repository: string;
  assets: readonly ReleaseAsset[];
}): string {
  const { version, tag, repository, assets } = input;
  const gaps = knownGaps(version, assets);

  const lines = [
    releaseNotesOpening(version),
    "",
    "## Deploy",
    "",
    "```bash",
    "appaloft up",
    "```",
    "",
    "`appaloft up` is the canonical Deploy-door command. `appaloft deploy` remains the supported 1.x alias for the same workflow.",
    "",
    "## Agent",
    "",
    "```bash",
    "appaloft setup agent",
    "```",
    "",
    "Teaches the detected hosts on this machine (skill + MCP). It does not deploy.",
    "",
    "## Gotcha",
    "",
    "You do not need the self-hosted stack to deploy. `npm` and Homebrew install the developer CLI. `curl …/install.sh | sudo sh` is the optional Linux control-plane installer.",
    "",
    "Appaloft is a Railway alternative, not a complete replacement. See the [Compare Railway](https://www.appaloft.com/compare/railway) FAQ.",
    "",
    "## Install",
    "",
    "```bash",
    "npm install -g @appaloft/cli",
    "brew install appaloft/tap/appaloft",
    "```",
    "",
    "Or download a platform archive from [GitHub Releases](https://github.com/appaloft/appaloft/releases/latest).",
    "",
    "Self-host (optional; Linux control plane, not the developer CLI):",
    "",
    "```bash",
    `curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- --version ${version}`,
    `docker pull ghcr.io/${repository}:${version}`,
    `docker pull ghcr.io/${repository}:v${version}`,
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
    `- \`ghcr.io/${repository}:v${version}\``,
    "",
    ...(gaps.length > 0 ? ["## Known Gaps", "", ...gaps, ""] : []),
    "## Details",
    "",
    `Commit-level notes stay in [CHANGELOG.md](https://github.com/${repository}/blob/${tag}/CHANGELOG.md). They are not copied into this GitHub Release body.`,
    "",
  ];

  return assertNoForbiddenSessionWording(`${lines.join("\n")}\n`);
}

async function main(): Promise<void> {
  const args = parseCliArgs(Bun.argv.slice(2));
  const releaseRoot = resolve(stringArg(args, "release-dir") ?? "dist/release");
  const version = normalizeReleaseVersion(
    stringArg(args, "version") ?? process.env.APPALOFT_APP_VERSION ?? "0.1.0",
  );
  const tag = releaseTagName(stringArg(args, "tag") ?? version);
  const repository =
    stringArg(args, "repository") ?? process.env.GITHUB_REPOSITORY ?? "appaloft/appaloft";
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

  await Bun.write(
    outputPath,
    buildReleaseNotes({
      version,
      tag,
      repository,
      assets,
    }),
  );
  console.log(`release notes written to ${outputPath}`);
}

if (import.meta.main) {
  await main();
}
