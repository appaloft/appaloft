export type ReleaseArchiveFormat = "tar.gz" | "zip";

export interface ReleaseBinaryTarget {
  name: string;
  bunTarget: string;
  npmPackageName: string;
  os: "darwin" | "linux" | "win32";
  cpu: "arm64" | "x64";
  libc?: "glibc" | "musl";
  tauriTriple: string;
  executableName: string;
  archiveFormat: ReleaseArchiveFormat;
}

export const releaseBinaryTargets = [
  {
    name: "darwin-arm64",
    bunTarget: "bun-darwin-arm64",
    npmPackageName: "@appaloft/cli-darwin-arm64",
    os: "darwin",
    cpu: "arm64",
    tauriTriple: "aarch64-apple-darwin",
    executableName: "appaloft",
    archiveFormat: "tar.gz",
  },
  {
    name: "darwin-x64",
    bunTarget: "bun-darwin-x64",
    npmPackageName: "@appaloft/cli-darwin-x64",
    os: "darwin",
    cpu: "x64",
    tauriTriple: "x86_64-apple-darwin",
    executableName: "appaloft",
    archiveFormat: "tar.gz",
  },
  {
    name: "linux-arm64-gnu",
    bunTarget: "bun-linux-arm64",
    npmPackageName: "@appaloft/cli-linux-arm64-gnu",
    os: "linux",
    cpu: "arm64",
    libc: "glibc",
    tauriTriple: "aarch64-unknown-linux-gnu",
    executableName: "appaloft",
    archiveFormat: "tar.gz",
  },
  {
    name: "linux-x64-gnu",
    bunTarget: "bun-linux-x64-baseline",
    npmPackageName: "@appaloft/cli-linux-x64-gnu",
    os: "linux",
    cpu: "x64",
    libc: "glibc",
    tauriTriple: "x86_64-unknown-linux-gnu",
    executableName: "appaloft",
    archiveFormat: "tar.gz",
  },
  {
    name: "linux-arm64-musl",
    bunTarget: "bun-linux-arm64-musl",
    npmPackageName: "@appaloft/cli-linux-arm64-musl",
    os: "linux",
    cpu: "arm64",
    libc: "musl",
    tauriTriple: "aarch64-unknown-linux-musl",
    executableName: "appaloft",
    archiveFormat: "tar.gz",
  },
  {
    name: "linux-x64-musl",
    bunTarget: "bun-linux-x64-musl",
    npmPackageName: "@appaloft/cli-linux-x64-musl",
    os: "linux",
    cpu: "x64",
    libc: "musl",
    tauriTriple: "x86_64-unknown-linux-musl",
    executableName: "appaloft",
    archiveFormat: "tar.gz",
  },
  {
    name: "win32-arm64",
    bunTarget: "bun-windows-arm64",
    npmPackageName: "@appaloft/cli-win32-arm64",
    os: "win32",
    cpu: "arm64",
    tauriTriple: "aarch64-pc-windows-msvc",
    executableName: "appaloft.exe",
    archiveFormat: "zip",
  },
  {
    name: "win32-x64",
    bunTarget: "bun-windows-x64-baseline",
    npmPackageName: "@appaloft/cli-win32-x64",
    os: "win32",
    cpu: "x64",
    tauriTriple: "x86_64-pc-windows-msvc",
    executableName: "appaloft.exe",
    archiveFormat: "zip",
  },
] as const satisfies readonly ReleaseBinaryTarget[];

export type ReleaseBinaryTargetName = (typeof releaseBinaryTargets)[number]["name"];

export function findReleaseBinaryTarget(name: string): ReleaseBinaryTarget | undefined {
  return releaseBinaryTargets.find((target) => target.name === name);
}

export function getReleaseBinaryTarget(name: string): ReleaseBinaryTarget {
  const target = findReleaseBinaryTarget(name);
  if (!target) {
    throw new Error(
      `Unsupported release target "${name}". Expected one of: ${releaseBinaryTargets.map((candidate) => candidate.name).join(", ")}`,
    );
  }
  return target;
}

export function findReleaseBinaryTargetByTauriTriple(
  triple: string,
): ReleaseBinaryTarget | undefined {
  return releaseBinaryTargets.find((target) => target.tauriTriple === triple);
}

export function detectHostReleaseBinaryTarget(): ReleaseBinaryTarget {
  const target = releaseBinaryTargets.find(
    (candidate) => candidate.os === process.platform && candidate.cpu === process.arch,
  );
  if (!target) {
    throw new Error(
      `Unsupported host release target for platform=${process.platform} arch=${process.arch}`,
    );
  }
  return target;
}

export function normalizeReleaseVersion(rawVersion: string): string {
  return rawVersion.startsWith("v") ? rawVersion.slice(1) : rawVersion;
}

export function releaseTagName(version: string): string {
  return version.startsWith("v") ? version : `v${version}`;
}
