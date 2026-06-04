import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  DisplayNameText,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
  VersionReference,
} from "@appaloft/core";
import { createExecutionContext } from "../src/execution-context";
import { CoreSourceVersionDetector } from "../src/use-cases";

const context = createExecutionContext({
  entrypoint: "cli",
  requestId: "req_version_detector",
});

describe("CoreSourceVersionDetector", () => {
  test("delegates Git version resolution to core source value objects", async () => {
    const detector = new CoreSourceVersionDetector();
    const requested = VersionReference.create({
      sourceKind: "git",
      referenceKind: "branch",
      value: "main",
    })._unsafeUnwrap();
    const source = SourceDescriptor.rehydrate({
      kind: SourceKindValue.rehydrate("git-public"),
      locator: SourceLocator.rehydrate("https://github.com/acme/api.git"),
      displayName: DisplayNameText.rehydrate("api"),
      metadata: {
        gitRef: "main",
        commitSha: "0f5c2d1",
      },
    });

    const result = await detector.detect(context, {
      source,
      requestedVersion: requested,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.version.isFixed()).toBe(true);
      expect(result.value.version.reference.value).toBe("main");
      expect(result.value.version.fixedIdentifier?.value).toBe("0f5c2d1");
      expect(result.value.reasoning).toEqual([
        "Resolved fixed Git version from commit SHA metadata",
      ]);
    }
  });

  test("rejects version references that do not belong to the source kind", async () => {
    const detector = new CoreSourceVersionDetector();
    const requested = VersionReference.create({
      sourceKind: "docker-image",
      referenceKind: "image-tag",
      value: "latest",
    })._unsafeUnwrap();
    const source = SourceDescriptor.rehydrate({
      kind: SourceKindValue.rehydrate("git-public"),
      locator: SourceLocator.rehydrate("https://github.com/acme/api.git"),
      displayName: DisplayNameText.rehydrate("api"),
    });

    const result = await detector.detect(context, {
      source,
      requestedVersion: requested,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.details).toMatchObject({
        phase: "version-resolution",
      });
    }
  });
});
