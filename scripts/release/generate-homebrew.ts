import { join, resolve } from "node:path";

import { parseCliArgs, resetDir, stringArg } from "./lib/release-utils";
import { normalizeReleaseVersion, releaseTagName } from "./lib/targets";

const args = parseCliArgs(Bun.argv.slice(2));
const version = normalizeReleaseVersion(
  stringArg(args, "version") ?? process.env.APPALOFT_APP_VERSION ?? "0.1.0",
);
const tag = releaseTagName(version);
const repository =
  stringArg(args, "repository") ?? process.env.GITHUB_REPOSITORY ?? "appaloft/appaloft";
const releaseBaseUrl = `https://github.com/${repository}/releases/download/${tag}`;
const checksumsPath = resolve(stringArg(args, "checksums") ?? "dist/release/checksums.txt");
const outDir = resolve(stringArg(args, "out-dir") ?? "dist/homebrew");

function readChecksums(text: string): Map<string, string> {
  const checksums = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const [hash, file] = trimmed.split(/\s+/, 2);
    if (!hash || !file) {
      throw new Error(`Invalid checksum line: ${line}`);
    }
    checksums.set(file, hash);
  }
  return checksums;
}

function requiredChecksum(checksums: ReadonlyMap<string, string>, file: string): string {
  const checksum = checksums.get(file);
  if (!checksum) {
    throw new Error(`Missing checksum for ${file}`);
  }
  return checksum;
}

function formula(checksums: ReadonlyMap<string, string>): string {
  const macArm = `appaloft-v${version}-darwin-arm64.tar.gz`;
  const macX64 = `appaloft-v${version}-darwin-x64.tar.gz`;
  const linuxArm = `appaloft-v${version}-linux-arm64-gnu.tar.gz`;
  const linuxX64 = `appaloft-v${version}-linux-x64-gnu.tar.gz`;

  return `class Appaloft < Formula
  desc "Backend-first local-to-cloud deployment platform"
  homepage "https://github.com/${repository}"
  license "MIT"
  version "${version}"

  on_macos do
    if Hardware::CPU.arm?
      url "${releaseBaseUrl}/${macArm}"
      sha256 "${requiredChecksum(checksums, macArm)}"
    else
      url "${releaseBaseUrl}/${macX64}"
      sha256 "${requiredChecksum(checksums, macX64)}"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "${releaseBaseUrl}/${linuxArm}"
      sha256 "${requiredChecksum(checksums, linuxArm)}"
    else
      url "${releaseBaseUrl}/${linuxX64}"
      sha256 "${requiredChecksum(checksums, linuxX64)}"
    end
  end

  def install
    binary = Dir["appaloft-v#{version}-*/appaloft"].first || "appaloft"
    bin.install binary => "appaloft"
  end

  test do
    system "#{bin}/appaloft", "doctor"
  end
end
`;
}

function cask(checksums: ReadonlyMap<string, string>): string | undefined {
  const macArm = `appaloft-desktop-v${version}-darwin-arm64.dmg`;
  const macX64 = `appaloft-desktop-v${version}-darwin-x64.dmg`;
  const armChecksum = checksums.get(macArm);
  const x64Checksum = checksums.get(macX64);

  if (!armChecksum || !x64Checksum) {
    return undefined;
  }

  return `cask "appaloft-desktop" do
  version "${version}"

  on_arm do
    sha256 "${armChecksum}"
    url "${releaseBaseUrl}/${macArm}"
  end

  on_intel do
    sha256 "${x64Checksum}"
    url "${releaseBaseUrl}/${macX64}"
  end

  name "Appaloft"
  desc "Local desktop shell for Appaloft"
  homepage "https://github.com/${repository}"

  app "Appaloft.app"
end
`;
}

const checksums = readChecksums(await Bun.file(checksumsPath).text());
await resetDir(outDir);
await Bun.write(join(outDir, "Formula", "appaloft.rb"), formula(checksums));

const caskContent = cask(checksums);
if (caskContent) {
  await Bun.write(join(outDir, "Casks", "appaloft-desktop.rb"), caskContent);
}

console.log(`homebrew files generated at ${outDir}`);
