import { describe, expect, test } from "bun:test";
import {
  deploymentSourceCommitShaMetadataKey,
  shortDeploymentSourceCommitSha,
  sourceCommitShaForDeployment,
  sourceVersionForDeployment,
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

  test("displays fixed Docker image digests resolved from mutable tags", () => {
    const digest = "sha256:8b1a9953c4611296a827abf8c47804d7f6f4e6a6d7f4aaf8f6f5c6e6d7c8b9a0";
    const deployment = {
      runtimePlan: {
        source: {
          version: {
            reference: {
              sourceKind: "docker-image" as const,
              referenceKind: "image-tag" as const,
              value: "latest",
            },
            fixedIdentifier: {
              sourceKind: "docker-image" as const,
              referenceKind: "image-digest" as const,
              value: digest,
            },
            aliases: [
              {
                sourceKind: "docker-image" as const,
                referenceKind: "image-tag" as const,
                value: "latest",
              },
            ],
          },
        },
        execution: {},
      },
    };

    expect(sourceVersionForDeployment(deployment)).toEqual({
      label: "Image digest",
      value: digest,
      shortValue: "sha256:8b1a9953c461",
      requested: "latest",
      fixed: true,
    });
  });
});
