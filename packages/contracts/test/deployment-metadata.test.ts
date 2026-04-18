import { describe, expect, test } from "bun:test";
import {
  deploymentSourceCommitShaMetadataKey,
  shortDeploymentSourceCommitSha,
  sourceCommitShaForDeployment,
} from "../src/index";

describe("deployment metadata helpers", () => {
  test("prefers the resolved deployment source commit over source binding metadata", () => {
    const deployment = {
      sourceCommitSha: "2222222222222222222222222222222222222222",
      runtimePlan: {
        source: {
          metadata: {
            commitSha: "1111111111111111111111111111111111111111",
          },
        },
        execution: {
          metadata: {
            [deploymentSourceCommitShaMetadataKey]: "3333333333333333333333333333333333333333",
          },
        },
      },
    };

    expect(sourceCommitShaForDeployment(deployment)).toBe(
      "2222222222222222222222222222222222222222",
    );
  });

  test("falls back to execution metadata when the read model field is absent", () => {
    const deployment = {
      runtimePlan: {
        source: {
          metadata: {
            commitSha: "1111111111111111111111111111111111111111",
          },
        },
        execution: {
          metadata: {
            [deploymentSourceCommitShaMetadataKey]: "3333333333333333333333333333333333333333",
          },
        },
      },
    };

    expect(sourceCommitShaForDeployment(deployment)).toBe(
      "3333333333333333333333333333333333333333",
    );
    expect(shortDeploymentSourceCommitSha(sourceCommitShaForDeployment(deployment) ?? "")).toBe(
      "333333333333",
    );
  });
});
