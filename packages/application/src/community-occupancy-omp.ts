export const COMMUNITY_OCCUPANCY_OMP_VERSION = "18.0.3";
export const COMMUNITY_OCCUPANCY_OMP_TEMPLATE_ID = "stp_appaloft_remote_omp";
export const COMMUNITY_OCCUPANCY_OMP_TEMPLATE_NAME = "appaloft-remote-omp";
export const COMMUNITY_OCCUPANCY_OMP_IMAGE =
  "ghcr.io/appaloft/agent-workspace-occupancy-omp:18.0.3";
export const COMMUNITY_OCCUPANCY_OMP_TEMPLATE_DIGEST =
  "sha256:f9eb5bcc6f3420d9a9fa5c7d7211092a8d66f20cf176f7ba7e04edaff4ce4bd2";
export const COMMUNITY_OCCUPANCY_OMP_BIN = "/usr/local/bin/omp";
export const COMMUNITY_OCCUPANCY_OMP_NATIVES = "/var/tmp/appaloft-bin/natives";
export const COMMUNITY_OCCUPANCY_OMP_NATIVE_LINK = "/workspace/.omp/natives";
export const COMMUNITY_OCCUPANCY_OMP_RELEASE_REPO = "can1357/oh-my-pi";
export const COMMUNITY_OCCUPANCY_OMP_SHA256_AMD64 =
  "4733662062bfb4364e4ab387d7940e56a7143e5dc1c20726787e61bb1b52df28";
export const COMMUNITY_OCCUPANCY_OMP_SHA256_ARM64 =
  "3b7e6ec68175451ec0ae2e07aac042d180d6ee03dbea11851aa84c050b7995f6";
export const COMMUNITY_OCCUPANCY_OMP_INSTALL_TIMEOUT_MS = 10 * 60 * 1_000;

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

export function occupancyOmpNativesPrepareScript(): string {
  return [
    `mkdir -p ${COMMUNITY_OCCUPANCY_OMP_NATIVES} /workspace/.omp`,
    `if [ ! -L ${COMMUNITY_OCCUPANCY_OMP_NATIVE_LINK} ]; then`,
    `rm -rf ${COMMUNITY_OCCUPANCY_OMP_NATIVE_LINK}`,
    `ln -sfn ${COMMUNITY_OCCUPANCY_OMP_NATIVES} ${COMMUNITY_OCCUPANCY_OMP_NATIVE_LINK}`,
    "fi",
  ].join(" && ");
}
