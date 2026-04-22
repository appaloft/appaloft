import { describe, expect, test } from "bun:test";

import { deriveRuntimeInstanceNames } from "../src/runtime-instance-names";

describe("runtime instance names", () => {
  test("[DEP-CREATE-ASYNC-010A] derives unique docker and compose names from runtimeName", () => {
    const derived = deriveRuntimeInstanceNames({
      deploymentId: "dep_8mlk4h90zusc",
      metadata: {
        "resource.runtimeName": "www",
      },
    });

    expect(derived).toEqual({
      requestedRuntimeName: "www",
      containerName: "www-dep_8mlk4h90zusc",
      imageName: "www-image-dep_8mlk4h90zusc",
      composeProjectName: "www-dep_8mlk4h90zusc",
    });
  });

  test("[CONFIG-FILE-ENTRY-015A] preserves preview prefixes in derived runtime names", () => {
    const derived = deriveRuntimeInstanceNames({
      deploymentId: "dep_preview_124",
      metadata: {
        "resource.runtimeName": "preview-124",
      },
    });

    expect(derived.containerName.startsWith("preview-124-")).toBe(true);
    expect(derived.imageName.startsWith("preview-124-image-")).toBe(true);
    expect(derived.composeProjectName.startsWith("preview-124-")).toBe(true);
  });
});
