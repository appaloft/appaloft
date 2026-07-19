import { describe, expect, test } from "bun:test";

import { compareResourceProfileDrift } from "../src/operations/resources/resource-profile-drift";

describe("resource profile drift", () => {
  test("[RESOURCE-PROFILE-DRIFT-001] treats relative and canonical static publish directories as equivalent", () => {
    const diagnostics = compareResourceProfileDrift({
      resource: {
        runtimeProfile: {
          publishDirectory: "/apps/site/dist",
        },
      },
      profile: {
        runtimeProfile: {
          publishDirectory: "apps/site/dist",
        },
      },
      comparison: "resource-vs-entry-profile",
      comparedValueKey: "entryProfileValue",
      blocksDeploymentAdmission: true,
      configPointerPrefix: "deployment",
    });

    expect(diagnostics).toEqual([]);
  });

  test("[RESOURCE-PROFILE-DRIFT-002] still reports different static publish directories", () => {
    const diagnostics = compareResourceProfileDrift({
      resource: {
        runtimeProfile: {
          publishDirectory: "/apps/site/dist",
        },
      },
      profile: {
        runtimeProfile: {
          publishDirectory: "dist",
        },
      },
      comparison: "resource-vs-entry-profile",
      comparedValueKey: "entryProfileValue",
      blocksDeploymentAdmission: true,
      configPointerPrefix: "deployment",
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        fieldPath: "runtimeProfile.publishDirectory",
        configPointer: "deployment.runtime.publishDirectory",
        blocksDeploymentAdmission: true,
      }),
    ]);
  });
});
