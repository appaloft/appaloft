import { basename, join, relative, resolve } from "node:path";

import { listTopLevelFiles, parseCliArgs, stringArg } from "./lib/release-utils";
import { normalizeReleaseVersion, releaseTagName } from "./lib/targets";

type ReleaseArtifactKind =
  | "backend-service"
  | "web-static"
  | "cli-binary"
  | "desktop-installer"
  | "compose-bundle"
  | "install-script"
  | "container-image"
  | "checksum"
  | "other";

interface ReleaseArtifactEntry {
  kind: ReleaseArtifactKind;
  name: string;
  file: string;
  sha256?: string;
}

interface ReleaseManifest {
  version: string;
  tag: string;
  repository: string;
  generatedAt: string;
  gitSha?: string;
  artifacts: ReleaseArtifactEntry[];
}

async function sha256(file: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(await Bun.file(file).arrayBuffer());
  return hasher.digest("hex");
}

function classifyArtifact(fileName: string): ReleaseArtifactKind {
  if (fileName === "checksums.txt") {
    return "checksum";
  }
  if (fileName.startsWith("appaloft-backend-")) {
    return "backend-service";
  }
  if (fileName.startsWith("appaloft-web-static-")) {
    return "web-static";
  }
  if (fileName.startsWith("appaloft-v")) {
    return "cli-binary";
  }
  if (fileName.startsWith("appaloft-desktop-")) {
    return "desktop-installer";
  }
  if (fileName === "docker-compose.selfhost.yml") {
    return "compose-bundle";
  }
  if (fileName === "install.sh") {
    return "install-script";
  }
  return "other";
}

const args = parseCliArgs(Bun.argv.slice(2));
const releaseRoot = resolve(stringArg(args, "release-dir") ?? "dist/release");
const version = normalizeReleaseVersion(
  stringArg(args, "version") ?? process.env.APPALOFT_APP_VERSION ?? "0.1.0",
);
const repository =
  stringArg(args, "repository") ?? process.env.GITHUB_REPOSITORY ?? "appaloft/appaloft";
const tag = releaseTagName(version);
const files = (await listTopLevelFiles(releaseRoot)).filter(
  (file) => !["release-manifest.json", "checksums.txt"].includes(relative(releaseRoot, file)),
);

const artifacts = await Promise.all(
  files.map(async (file): Promise<ReleaseArtifactEntry> => {
    const fileName = basename(file);
    const entry: ReleaseArtifactEntry = {
      kind: classifyArtifact(fileName),
      name: fileName.replace(/\.(tar\.gz|zip|dmg|deb|AppImage|msi|exe|yml|txt|sh)$/u, ""),
      file: relative(releaseRoot, file),
    };
    if (fileName !== "checksums.txt") {
      entry.sha256 = await sha256(file);
    }
    return {
      ...entry,
    };
  }),
);

const manifest: ReleaseManifest = {
  version,
  tag,
  repository,
  generatedAt: new Date().toISOString(),
  ...(process.env.GITHUB_SHA ? { gitSha: process.env.GITHUB_SHA } : {}),
  artifacts: [
    ...artifacts,
    {
      kind: "container-image",
      name: "ghcr.io/appaloft/appaloft",
      file: `ghcr.io/appaloft/appaloft:${version}`,
    },
  ],
};

await Bun.write(
  join(releaseRoot, "release-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`release manifest generated for ${artifacts.length} artifacts`);
