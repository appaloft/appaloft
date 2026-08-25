import { expect, test } from "bun:test";

import {
  COMMUNITY_OCCUPANCY_OMP_BIN,
  COMMUNITY_OCCUPANCY_OMP_IMAGE,
  COMMUNITY_OCCUPANCY_OMP_INSTALL_TIMEOUT_MS,
  COMMUNITY_OCCUPANCY_OMP_NATIVE_LINK,
  COMMUNITY_OCCUPANCY_OMP_NATIVES,
  COMMUNITY_OCCUPANCY_OMP_SHA256_AMD64,
  COMMUNITY_OCCUPANCY_OMP_SHA256_ARM64,
  COMMUNITY_OCCUPANCY_OMP_TEMPLATE_ID,
  COMMUNITY_OCCUPANCY_OMP_VERSION,
  occupancyOmpAttachArgv,
  occupancyOmpLinuxAsset,
  occupancyOmpNativesPrepareScript,
  occupancyOmpReleaseUrl,
} from "../src/community-occupancy-omp";

test("[WS-REMOTE-VENDOR-204] occupancy omp uses a reserved image with a baked official binary", () => {
  expect(COMMUNITY_OCCUPANCY_OMP_VERSION).toBe("18.0.3");
  expect(COMMUNITY_OCCUPANCY_OMP_TEMPLATE_ID).toBe("stp_appaloft_remote_omp");
  expect(COMMUNITY_OCCUPANCY_OMP_IMAGE).toBe(
    "ghcr.io/appaloft/agent-workspace-occupancy-omp:18.0.3",
  );
  expect(COMMUNITY_OCCUPANCY_OMP_BIN).toBe("/usr/local/bin/omp");
  expect(COMMUNITY_OCCUPANCY_OMP_NATIVES).toBe("/var/tmp/appaloft-bin/natives");
  expect(COMMUNITY_OCCUPANCY_OMP_NATIVE_LINK).toBe("/workspace/.omp/natives");
  expect(COMMUNITY_OCCUPANCY_OMP_SHA256_AMD64).toHaveLength(64);
  expect(COMMUNITY_OCCUPANCY_OMP_SHA256_ARM64).toHaveLength(64);
  expect(COMMUNITY_OCCUPANCY_OMP_INSTALL_TIMEOUT_MS).toBe(10 * 60 * 1_000);
  expect(occupancyOmpLinuxAsset("aarch64")).toBe("omp-linux-arm64");
  expect(occupancyOmpLinuxAsset("x86_64")).toBe("omp-linux-x64");
  expect(occupancyOmpReleaseUrl("arm64")).toBe(
    "https://github.com/can1357/oh-my-pi/releases/download/v18.0.3/omp-linux-arm64",
  );
  expect(occupancyOmpAttachArgv(["omp"])).toBe(true);
  expect(occupancyOmpAttachArgv([COMMUNITY_OCCUPANCY_OMP_BIN])).toBe(true);
  expect(occupancyOmpAttachArgv(["pi"])).toBe(false);
  expect(occupancyOmpNativesPrepareScript()).toContain("ln -sfn");
  expect(occupancyOmpNativesPrepareScript()).toContain(COMMUNITY_OCCUPANCY_OMP_NATIVE_LINK);
});
