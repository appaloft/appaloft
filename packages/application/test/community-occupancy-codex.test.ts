import { expect, test } from "bun:test";

import {
  COMMUNITY_OCCUPANCY_CODEX_PACKAGE,
  COMMUNITY_OCCUPANCY_CODEX_VERSION,
  COMMUNITY_OCCUPANCY_OPENCODE_PACKAGE,
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
