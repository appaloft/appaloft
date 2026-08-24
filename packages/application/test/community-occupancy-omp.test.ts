import { expect, test } from "bun:test";

import {
  COMMUNITY_OCCUPANCY_OMP_BIN,
  COMMUNITY_OCCUPANCY_OMP_NATIVE_LINK,
  COMMUNITY_OCCUPANCY_OMP_NATIVES,
  COMMUNITY_OCCUPANCY_OMP_VERSION,
  occupancyOmpAttachArgv,
  occupancyOmpLinuxAsset,
  occupancyOmpNativesPrepareScript,
  occupancyOmpReleaseUrl,
} from "../src/community-occupancy-omp";

test("[WS-REMOTE-HARNESS-175] occupancy omp attach pins the official linux release", () => {
  expect(COMMUNITY_OCCUPANCY_OMP_VERSION).toBe("18.0.3");
  expect(COMMUNITY_OCCUPANCY_OMP_BIN).toBe("/var/tmp/appaloft-bin/omp");
  expect(COMMUNITY_OCCUPANCY_OMP_NATIVES).toBe("/var/tmp/appaloft-bin/natives");
  expect(COMMUNITY_OCCUPANCY_OMP_NATIVE_LINK).toBe("/workspace/.omp/natives");
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
