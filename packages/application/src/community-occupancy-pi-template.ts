import { COMMUNITY_REMOTE_DEFAULT_NETWORK_POLICY } from "./community-remote-default-network-policy";

export const COMMUNITY_OCCUPANCY_PI_TEMPLATE_ID = "stp_appaloft_remote_pi";
export const COMMUNITY_OCCUPANCY_PI_TEMPLATE_NAME = "appaloft-remote-pi";
export const COMMUNITY_OCCUPANCY_PI_PROFILE_ID = "appaloft-remote-pi";
export const COMMUNITY_OCCUPANCY_OPENCODE_PROFILE_ID = "appaloft-remote";

export const COMMUNITY_OCCUPANCY_PI_IMAGE = "ghcr.io/appaloft/agent-workspace-pi:0.82.0";
export const COMMUNITY_OCCUPANCY_PI_VERSION = "0.82.0";
export const COMMUNITY_OCCUPANCY_PI_TEMPLATE_DIGEST =
  "sha256:4e89f32d9953fa939e49e5640e399af020b15490b9becef55f423909a4d35190";
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

const occupancyProfileIds: Readonly<Record<string, string>> = {
  opencode: COMMUNITY_OCCUPANCY_OPENCODE_PROFILE_ID,
};

export function occupancyRemoteProfileId(harnessKey: string): string {
  return occupancyProfileIds[harnessKey] ?? `appaloft-remote-${harnessKey}`;
}
