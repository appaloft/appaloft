import { describe, expect, test } from "bun:test";

import { resourceSourceBindingFromInput } from "../src/operations/resources/resource-source-binding.mapper";

describe("resource source binding version reference", () => {
  test("uses optional Git version kind hints to disambiguate requested versions", () => {
    const result = resourceSourceBindingFromInput({
      kind: "git-public",
      locator: "https://github.com/acme/api.git",
      version: "v1.2.3",
      versionKind: "branch",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.versionReference?.sourceKind).toBe("git");
      expect(result.value.versionReference?.referenceKind).toBe("branch");
      expect(result.value.versionReference?.value).toBe("v1.2.3");
    }
  });

  test("rejects version kind hints outside the source kind range", () => {
    const result = resourceSourceBindingFromInput({
      kind: "docker-image",
      locator: "ghcr.io/acme/api:latest",
      version: "main",
      versionKind: "branch",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.details).toMatchObject({
        phase: "version-resolution",
        sourceKind: "docker-image",
        referenceKind: "branch",
      });
    }
  });

  test("keeps static artifact versions read-only from external source input", () => {
    const result = resourceSourceBindingFromInput({
      kind: "zip-artifact",
      locator: "https://example.com/site.zip",
      version: "sha256:8b1a9953c4611296a827abf8c47804d7f6f4e6a6d7f4aaf8f6f5c6e6d7c8b9a0",
      versionKind: "content-digest",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.details).toMatchObject({
        phase: "version-resolution",
        sourceKind: "static-artifact",
      });
    }
  });
});
