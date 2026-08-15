import { COMMUNITY_REMOTE_DEFAULT_NETWORK_POLICY } from "./community-remote-default-network-policy";

export const COMMUNITY_OCCUPANCY_OPENCODE_TEMPLATE_ID = "stp_appaloft_remote_opencode";
export const COMMUNITY_OCCUPANCY_OPENCODE_TEMPLATE_NAME = "appaloft-remote-opencode";

export const COMMUNITY_OCCUPANCY_OPENCODE_IMAGE =
  "ghcr.io/appaloft/agent-workspace-opencode:1.18.4";
export const COMMUNITY_OCCUPANCY_OPENCODE_VERSION = "1.18.4";
export const COMMUNITY_OCCUPANCY_OPENCODE_TEMPLATE_DIGEST =
  "sha256:27f7a3ca10124d922b35de64d17588278e5dc0d1db398d69ea5920f80e87a324";
export const COMMUNITY_OCCUPANCY_OPENCODE_ISOLATION = "container-trusted" as const;
export const COMMUNITY_OCCUPANCY_OPENCODE_LIMITS = {
  cpuMillis: 2_000,
  memoryBytes: 4_294_967_296,
  diskBytes: 21_474_836_480,
  maxProcesses: 128,
} as const;
export function communityOccupancyOpenCodeTemplateSpec() {
  return {
    templateId: COMMUNITY_OCCUPANCY_OPENCODE_TEMPLATE_ID,
    name: COMMUNITY_OCCUPANCY_OPENCODE_TEMPLATE_NAME,
    image: COMMUNITY_OCCUPANCY_OPENCODE_IMAGE,
    minimumIsolation: COMMUNITY_OCCUPANCY_OPENCODE_ISOLATION,
    limits: { ...COMMUNITY_OCCUPANCY_OPENCODE_LIMITS },
    networkPolicy: COMMUNITY_REMOTE_DEFAULT_NETWORK_POLICY,
  };
}
