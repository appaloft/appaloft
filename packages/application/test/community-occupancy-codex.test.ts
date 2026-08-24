import { expect, test } from "bun:test";

import {
  COMMUNITY_OCCUPANCY_CLAUDE_IMAGE,
  COMMUNITY_OCCUPANCY_CLAUDE_TEMPLATE_ID,
  COMMUNITY_OCCUPANCY_CODEX_IMAGE,
  COMMUNITY_OCCUPANCY_CODEX_TEMPLATE_ID,
  COMMUNITY_OCCUPANCY_GROK_IMAGE,
  COMMUNITY_OCCUPANCY_GROK_TEMPLATE_ID,
  communityOccupancyReservedTemplateSpec,
} from "../src/community-occupancy-vendor-templates";
import {
  COMMUNITY_OCCUPANCY_CLAUDE_PACKAGE,
  COMMUNITY_OCCUPANCY_CLAUDE_VERSION,
  COMMUNITY_OCCUPANCY_CODEX_PACKAGE,
  COMMUNITY_OCCUPANCY_CODEX_VERSION,
  COMMUNITY_OCCUPANCY_GROK_BIN,
  COMMUNITY_OCCUPANCY_GROK_INSTALL_URL,
  COMMUNITY_OCCUPANCY_GROK_VERSION,
  COMMUNITY_OCCUPANCY_OPENCODE_PACKAGE,
  occupancyGrokInstallArgv,
  occupancyHarnessInstallArgv,
} from "../src/community-occupancy-codex";
import {
  COMMUNITY_OCCUPANCY_OPENCODE_IMAGE,
  COMMUNITY_OCCUPANCY_OPENCODE_VERSION,
} from "../src/community-occupancy-opencode-template";

test("[WS-REMOTE-VENDOR-204] occupancy harness install helper still pins exact npm packages", () => {
  expect(
    occupancyHarnessInstallArgv({
      packageName: COMMUNITY_OCCUPANCY_CODEX_PACKAGE,
      version: COMMUNITY_OCCUPANCY_CODEX_VERSION,
    }),
  ).toEqual([
    "bun",
    "add",
    "--global",
    "--exact",
    "--trust",
    `${COMMUNITY_OCCUPANCY_CODEX_PACKAGE}@${COMMUNITY_OCCUPANCY_CODEX_VERSION}`,
  ]);
  expect(
    occupancyHarnessInstallArgv({
      packageName: COMMUNITY_OCCUPANCY_CLAUDE_PACKAGE,
      version: COMMUNITY_OCCUPANCY_CLAUDE_VERSION,
    }),
  ).toEqual([
    "bun",
    "add",
    "--global",
    "--exact",
    "--trust",
    `${COMMUNITY_OCCUPANCY_CLAUDE_PACKAGE}@${COMMUNITY_OCCUPANCY_CLAUDE_VERSION}`,
  ]);
  expect(
    occupancyHarnessInstallArgv({
      packageName: COMMUNITY_OCCUPANCY_OPENCODE_PACKAGE,
      version: COMMUNITY_OCCUPANCY_OPENCODE_VERSION,
    }),
  ).toEqual([
    "bun",
    "add",
    "--global",
    "--exact",
    "--trust",
    `${COMMUNITY_OCCUPANCY_OPENCODE_PACKAGE}@${COMMUNITY_OCCUPANCY_OPENCODE_VERSION}`,
  ]);
});

test("[WS-REMOTE-TEMPLATE-019] occupancy OpenCode version matches the published image tag", () => {
  expect(COMMUNITY_OCCUPANCY_OPENCODE_IMAGE).toBe(
    `ghcr.io/appaloft/agent-workspace-opencode:${COMMUNITY_OCCUPANCY_OPENCODE_VERSION}`,
  );
});

test("[WS-REMOTE-VENDOR-204] Grok occupancy install helper pins the official CLI version", () => {
  expect(occupancyGrokInstallArgv()).toEqual([
    "sh",
    "-c",
    `curl -fsSL ${COMMUNITY_OCCUPANCY_GROK_INSTALL_URL} -o /tmp/appaloft-grok-install.sh && sh /tmp/appaloft-grok-install.sh ${COMMUNITY_OCCUPANCY_GROK_VERSION} && ln -sfn ${COMMUNITY_OCCUPANCY_GROK_BIN} /usr/local/bin/grok`,
  ]);
});

test("[WS-REMOTE-VENDOR-204] Claude Codex and Grok occupy reserved images with baked CLIs", () => {
  expect(
    communityOccupancyReservedTemplateSpec(COMMUNITY_OCCUPANCY_CLAUDE_TEMPLATE_ID),
  ).toMatchObject({
    templateId: COMMUNITY_OCCUPANCY_CLAUDE_TEMPLATE_ID,
    image: COMMUNITY_OCCUPANCY_CLAUDE_IMAGE,
  });
  expect(
    communityOccupancyReservedTemplateSpec(COMMUNITY_OCCUPANCY_CODEX_TEMPLATE_ID),
  ).toMatchObject({
    templateId: COMMUNITY_OCCUPANCY_CODEX_TEMPLATE_ID,
    image: COMMUNITY_OCCUPANCY_CODEX_IMAGE,
  });
  expect(
    communityOccupancyReservedTemplateSpec(COMMUNITY_OCCUPANCY_GROK_TEMPLATE_ID),
  ).toMatchObject({
    templateId: COMMUNITY_OCCUPANCY_GROK_TEMPLATE_ID,
    image: COMMUNITY_OCCUPANCY_GROK_IMAGE,
  });
  expect(COMMUNITY_OCCUPANCY_CLAUDE_IMAGE).toContain(COMMUNITY_OCCUPANCY_CLAUDE_VERSION);
  expect(COMMUNITY_OCCUPANCY_CODEX_IMAGE).toContain(COMMUNITY_OCCUPANCY_CODEX_VERSION);
  expect(COMMUNITY_OCCUPANCY_GROK_IMAGE).toContain(COMMUNITY_OCCUPANCY_GROK_VERSION);
});
