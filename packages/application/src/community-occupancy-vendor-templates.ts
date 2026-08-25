import {
  COMMUNITY_OCCUPANCY_CLAUDE_VERSION,
  COMMUNITY_OCCUPANCY_CODEX_VERSION,
  COMMUNITY_OCCUPANCY_GROK_VERSION,
} from "./community-occupancy-codex";
import {
  COMMUNITY_OCCUPANCY_OMP_IMAGE,
  COMMUNITY_OCCUPANCY_OMP_TEMPLATE_ID,
  COMMUNITY_OCCUPANCY_OMP_TEMPLATE_NAME,
  COMMUNITY_OCCUPANCY_OMP_VERSION,
} from "./community-occupancy-omp";
export {
  COMMUNITY_OCCUPANCY_OMP_IMAGE,
  COMMUNITY_OCCUPANCY_OMP_TEMPLATE_DIGEST,
  COMMUNITY_OCCUPANCY_OMP_TEMPLATE_ID,
  COMMUNITY_OCCUPANCY_OMP_TEMPLATE_NAME,
  COMMUNITY_OCCUPANCY_OMP_VERSION,
} from "./community-occupancy-omp";
import {
  COMMUNITY_OCCUPANCY_OPENCODE_ISOLATION,
  COMMUNITY_OCCUPANCY_OPENCODE_LIMITS,
} from "./community-occupancy-opencode-template";
import { COMMUNITY_REMOTE_DEFAULT_NETWORK_POLICY } from "./community-remote-default-network-policy";

export const COMMUNITY_OCCUPANCY_CLAUDE_TEMPLATE_ID = "stp_appaloft_remote_claude";
export const COMMUNITY_OCCUPANCY_CLAUDE_TEMPLATE_NAME = "appaloft-remote-claude";
export const COMMUNITY_OCCUPANCY_CLAUDE_IMAGE =
  "ghcr.io/appaloft/agent-workspace-occupancy-claude:2.1.199";
export const COMMUNITY_OCCUPANCY_CLAUDE_TEMPLATE_DIGEST =
  "sha256:4b2252b3e8b3427bad8296ada13756c3365686b7cd0fc466fb273c285138bb96";

export const COMMUNITY_OCCUPANCY_CODEX_TEMPLATE_ID = "stp_appaloft_remote_codex";
export const COMMUNITY_OCCUPANCY_CODEX_TEMPLATE_NAME = "appaloft-remote-codex";
export const COMMUNITY_OCCUPANCY_CODEX_IMAGE =
  "ghcr.io/appaloft/agent-workspace-occupancy-codex:0.149.0";
export const COMMUNITY_OCCUPANCY_CODEX_TEMPLATE_DIGEST =
  "sha256:26969e5146ee6fb4f6ffd9235b96db75518263fe3ad0a79de4dabeb123d502a9";

export const COMMUNITY_OCCUPANCY_GROK_TEMPLATE_ID = "stp_appaloft_remote_grok";
export const COMMUNITY_OCCUPANCY_GROK_TEMPLATE_NAME = "appaloft-remote-grok";
export const COMMUNITY_OCCUPANCY_GROK_IMAGE =
  "ghcr.io/appaloft/agent-workspace-occupancy-grok:1.0.5";
export const COMMUNITY_OCCUPANCY_GROK_TEMPLATE_DIGEST =
  "sha256:203b9eeb2612f7ce6ff8c1b77dd1e78cf5a653737154d4bbef1c3046b5beed04";

function occupancyVendorTemplateSpec(input: {
  readonly templateId: string;
  readonly name: string;
  readonly image: string;
}) {
  return {
    templateId: input.templateId,
    name: input.name,
    image: input.image,
    minimumIsolation: COMMUNITY_OCCUPANCY_OPENCODE_ISOLATION,
    limits: { ...COMMUNITY_OCCUPANCY_OPENCODE_LIMITS },
    networkPolicy: COMMUNITY_REMOTE_DEFAULT_NETWORK_POLICY,
  };
}

export function communityOccupancyClaudeTemplateSpec() {
  return occupancyVendorTemplateSpec({
    templateId: COMMUNITY_OCCUPANCY_CLAUDE_TEMPLATE_ID,
    name: COMMUNITY_OCCUPANCY_CLAUDE_TEMPLATE_NAME,
    image: COMMUNITY_OCCUPANCY_CLAUDE_IMAGE,
  });
}

export function communityOccupancyCodexTemplateSpec() {
  return occupancyVendorTemplateSpec({
    templateId: COMMUNITY_OCCUPANCY_CODEX_TEMPLATE_ID,
    name: COMMUNITY_OCCUPANCY_CODEX_TEMPLATE_NAME,
    image: COMMUNITY_OCCUPANCY_CODEX_IMAGE,
  });
}

export function communityOccupancyGrokTemplateSpec() {
  return occupancyVendorTemplateSpec({
    templateId: COMMUNITY_OCCUPANCY_GROK_TEMPLATE_ID,
    name: COMMUNITY_OCCUPANCY_GROK_TEMPLATE_NAME,
    image: COMMUNITY_OCCUPANCY_GROK_IMAGE,
  });
}

export function communityOccupancyOmpTemplateSpec() {
  return occupancyVendorTemplateSpec({
    templateId: COMMUNITY_OCCUPANCY_OMP_TEMPLATE_ID,
    name: COMMUNITY_OCCUPANCY_OMP_TEMPLATE_NAME,
    image: COMMUNITY_OCCUPANCY_OMP_IMAGE,
  });
}

export function communityOccupancyReservedTemplateSpec(templateId: string) {
  switch (templateId) {
    case COMMUNITY_OCCUPANCY_CLAUDE_TEMPLATE_ID:
      return communityOccupancyClaudeTemplateSpec();
    case COMMUNITY_OCCUPANCY_CODEX_TEMPLATE_ID:
      return communityOccupancyCodexTemplateSpec();
    case COMMUNITY_OCCUPANCY_GROK_TEMPLATE_ID:
      return communityOccupancyGrokTemplateSpec();
    case COMMUNITY_OCCUPANCY_OMP_TEMPLATE_ID:
      return communityOccupancyOmpTemplateSpec();
    default:
      return undefined;
  }
}

export const COMMUNITY_OCCUPANCY_VENDOR_TEMPLATE_VERSION = {
  claude: COMMUNITY_OCCUPANCY_CLAUDE_VERSION,
  codex: COMMUNITY_OCCUPANCY_CODEX_VERSION,
  grok: COMMUNITY_OCCUPANCY_GROK_VERSION,
  omp: COMMUNITY_OCCUPANCY_OMP_VERSION,
} as const;
