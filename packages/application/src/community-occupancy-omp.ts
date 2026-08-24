export const COMMUNITY_OCCUPANCY_OMP_VERSION = "18.0.3";
export const COMMUNITY_OCCUPANCY_OMP_BIN = "/var/tmp/appaloft-bin/omp";
export const COMMUNITY_OCCUPANCY_OMP_RELEASE_REPO = "can1357/oh-my-pi";

export function occupancyOmpLinuxAsset(arch: string): "omp-linux-arm64" | "omp-linux-x64" {
  return arch === "aarch64" || arch === "arm64" ? "omp-linux-arm64" : "omp-linux-x64";
}

export function occupancyOmpReleaseUrl(
  arch: string,
  version: string = COMMUNITY_OCCUPANCY_OMP_VERSION,
): string {
  return `https://github.com/${COMMUNITY_OCCUPANCY_OMP_RELEASE_REPO}/releases/download/v${version}/${occupancyOmpLinuxAsset(arch)}`;
}

export function occupancyOmpAttachArgv(argv: readonly string[] | undefined): boolean {
  const command = argv?.[0];
  return command === "omp" || command === COMMUNITY_OCCUPANCY_OMP_BIN;
}
