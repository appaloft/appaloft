import { expect, test } from "bun:test";

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

test("[WS-REMOTE-VENDOR-204] occupancy harness install pins the exact npm package", () => {
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
      version: "1.18.21",
    }),
  ).toEqual([
    "bun",
    "add",
    "--global",
    "--exact",
    "--trust",
    `${COMMUNITY_OCCUPANCY_OPENCODE_PACKAGE}@1.18.21`,
  ]);
});

test("[WS-REMOTE-VENDOR-204] Grok occupancy install pins the official CLI version", () => {
  expect(occupancyGrokInstallArgv()).toEqual([
    "sh",
    "-c",
    `curl -fsSL ${COMMUNITY_OCCUPANCY_GROK_INSTALL_URL} -o /tmp/appaloft-grok-install.sh && sh /tmp/appaloft-grok-install.sh ${COMMUNITY_OCCUPANCY_GROK_VERSION} && ln -sfn ${COMMUNITY_OCCUPANCY_GROK_BIN} /usr/local/bin/grok`,
  ]);
});
