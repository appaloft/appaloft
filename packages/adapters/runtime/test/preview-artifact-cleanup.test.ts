import { describe, expect, test } from "bun:test";

import { createPreviewRuntimeArtifactCleanupPlan } from "../src/preview-artifact-cleanup";

describe("preview artifact cleanup plan", () => {
  test("[DEPLOYMENTS-CLEANUP-PREVIEW-007] selects generated local preview workspaces and images", () => {
    expect(
      createPreviewRuntimeArtifactCleanupPlan({
        deploymentId: "dep_preview_1",
        buildStrategy: "workspace-commands",
        sourceKind: "git-public",
        executionKind: "docker-container",
        imageName: "preview-image-dep_preview_1",
        runtimeDir: "/tmp/appaloft/local-deployments/dep_preview_1",
        metadata: {
          "access.sourceFingerprint": "source-fingerprint:v1:preview%3Apr%3A14",
          sourceStrategy: "git-public",
          sourceDir: "/tmp/appaloft/local-deployments/dep_preview_1/source",
        },
      }),
    ).toEqual({
      localSourceDir: "/tmp/appaloft/local-deployments/dep_preview_1/source",
      imageName: "preview-image-dep_preview_1",
    });
  });

  test("[DEPLOYMENTS-CLEANUP-PREVIEW-007] preserves local user workspaces", () => {
    expect(
      createPreviewRuntimeArtifactCleanupPlan({
        deploymentId: "dep_preview_2",
        buildStrategy: "workspace-commands",
        sourceKind: "local-folder",
        executionKind: "docker-container",
        imageName: "preview-image-dep_preview_2",
        runtimeDir: "/tmp/appaloft/local-deployments/dep_preview_2",
        metadata: {
          "access.sourceFingerprint": "source-fingerprint:v1:preview%3Apr%3A14",
          sourceStrategy: "local-workspace",
          sourceDir: "/Users/example/project",
        },
      }),
    ).toEqual({
      imageName: "preview-image-dep_preview_2",
    });
  });

  test("[DEPLOYMENTS-CLEANUP-PREVIEW-007] selects remote preview workspaces under the deployment runtime root", () => {
    expect(
      createPreviewRuntimeArtifactCleanupPlan({
        deploymentId: "dep_preview_3",
        buildStrategy: "dockerfile",
        sourceKind: "local-folder",
        executionKind: "docker-container",
        imageName: "preview-image-dep_preview_3",
        remoteRuntimeRoot: "/var/lib/appaloft/runtime/ssh-deployments/dep_preview_3",
        remoteWorkdir: "/var/lib/appaloft/runtime/ssh-deployments/dep_preview_3/source",
        metadata: {
          "access.sourceFingerprint": "source-fingerprint:v1:preview%3Apr%3A14",
          sourceStrategy: "local-workspace",
          remoteWorkdir: "/var/lib/appaloft/runtime/ssh-deployments/dep_preview_3/source",
        },
      }),
    ).toEqual({
      remoteWorkdir: "/var/lib/appaloft/runtime/ssh-deployments/dep_preview_3/source",
      remoteRuntimeRoot: "/var/lib/appaloft/runtime/ssh-deployments/dep_preview_3",
      imageName: "preview-image-dep_preview_3",
    });
  });

  test("[DEPLOYMENTS-CLEANUP-PREVIEW-007] skips non-preview and prebuilt-image cleanup", () => {
    expect(
      createPreviewRuntimeArtifactCleanupPlan({
        deploymentId: "dep_prod_1",
        buildStrategy: "prebuilt-image",
        sourceKind: "docker-image",
        executionKind: "docker-container",
        imageName: "external/app:latest",
        runtimeDir: "/tmp/appaloft/local-deployments/dep_prod_1",
        metadata: {
          sourceStrategy: "prebuilt-image",
          sourceDir: "/tmp/appaloft/local-deployments/dep_prod_1/source",
        },
      }),
    ).toEqual({});
  });
});
