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
  "sha256:47cafe5cfbdec7949275ad0f9b7458c7bbee2d1e1042bae5c2824eaf994ab30f";

export const COMMUNITY_OCCUPANCY_CODEX_TEMPLATE_ID = "stp_appaloft_remote_codex";
export const COMMUNITY_OCCUPANCY_CODEX_TEMPLATE_NAME = "appaloft-remote-codex";
export const COMMUNITY_OCCUPANCY_CODEX_IMAGE =
  "ghcr.io/appaloft/agent-workspace-occupancy-codex:0.149.0";
export const COMMUNITY_OCCUPANCY_CODEX_TEMPLATE_DIGEST =
  "sha256:51e1e66a5dd824938370fec142f5bd49ff0809898690edb9352c2f7a9651666e";

export const COMMUNITY_OCCUPANCY_GROK_TEMPLATE_ID = "stp_appaloft_remote_grok";
export const COMMUNITY_OCCUPANCY_GROK_TEMPLATE_NAME = "appaloft-remote-grok";
export const COMMUNITY_OCCUPANCY_GROK_IMAGE =
  "ghcr.io/appaloft/agent-workspace-occupancy-grok:1.0.5";
export const COMMUNITY_OCCUPANCY_GROK_TEMPLATE_DIGEST =
  "sha256:44c959904fa7621dcaac49427f31df0738d34737f24205d9820fbfd8ca8895b8";

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
