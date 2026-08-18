import { COMMUNITY_REMOTE_DEFAULT_NETWORK_POLICY } from "./community-remote-default-network-policy";

export const COMMUNITY_OCCUPANCY_PI_TEMPLATE_ID = "stp_appaloft_remote_pi";
export const COMMUNITY_OCCUPANCY_PI_TEMPLATE_NAME = "appaloft-remote-pi";
export const COMMUNITY_OCCUPANCY_PI_PROFILE_ID = "appaloft-remote-pi";
export const COMMUNITY_OCCUPANCY_OPENCODE_PROFILE_ID = "appaloft-remote";

export const COMMUNITY_OCCUPANCY_PI_IMAGE = "ghcr.io/appaloft/agent-workspace-pi:0.82.0";
export const COMMUNITY_OCCUPANCY_PI_VERSION = "0.82.0";
export const COMMUNITY_OCCUPANCY_PI_TEMPLATE_DIGEST =
  "sha256:6e20f0375ec3b99f68dd1fbd35ae3c5604fb30bc338a53bcdebf858d3a320b43";
export const COMMUNITY_OCCUPANCY_PI_ISOLATION = "container-trusted" as const;
export const COMMUNITY_OCCUPANCY_PI_LIMITS = {
  cpuMillis: 2_000,
  memoryBytes: 4_294_967_296,
  diskBytes: 21_474_836_480,
  maxProcesses: 128,
} as const;

export function communityOccupancyPiTemplateSpec() {
  return {
    templateId: COMMUNITY_OCCUPANCY_PI_TEMPLATE_ID,
    name: COMMUNITY_OCCUPANCY_PI_TEMPLATE_NAME,
    image: COMMUNITY_OCCUPANCY_PI_IMAGE,
    minimumIsolation: COMMUNITY_OCCUPANCY_PI_ISOLATION,
    limits: { ...COMMUNITY_OCCUPANCY_PI_LIMITS },
    networkPolicy: COMMUNITY_REMOTE_DEFAULT_NETWORK_POLICY,
  };
}

export function occupancyRemoteProfileId(harnessKey: string): string {
  return harnessKey === "pi"
    ? COMMUNITY_OCCUPANCY_PI_PROFILE_ID
    : COMMUNITY_OCCUPANCY_OPENCODE_PROFILE_ID;
}
