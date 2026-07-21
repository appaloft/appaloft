import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  SandboxId,
  SourceArtifact,
  SourceArtifactDigest,
  SourceArtifactId,
  SourceArtifactManifest,
  SourceArtifactStoreReference,
  WorkspaceRevision,
} from "../src";

describe("Source Artifact", () => {
  test("[ARTIFACT-CORE-001] is immutable and reference-protected", () => {
    const manifest = SourceArtifactManifest.create([
      { path: "package.json", digest: "sha256:1111", sizeBytes: 20, mode: "file" },
      { path: "src/index.ts", digest: "sha256:2222", sizeBytes: 42, mode: "file" },
    ])._unsafeUnwrap();
    const artifact = SourceArtifact.create({
      id: SourceArtifactId.rehydrate("sart_demo"),
      sandboxId: SandboxId.rehydrate("sbx_demo"),
      digest: SourceArtifactDigest.rehydrate(
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ),
      manifest,
      sourceRoot: "app",
      workspaceRevision: WorkspaceRevision.rehydrate("rev_1"),
      storeReference: SourceArtifactStoreReference.rehydrate("artifact://sha256/demo"),
      createdAt: CreatedAt.rehydrate("2026-07-20T00:00:00.000Z"),
    })._unsafeUnwrap();

    artifact.protectReference()._unsafeUnwrap();
    expect(artifact.delete().isErr()).toBe(true);
    expect(artifact.toState().manifest.entries()).toEqual([
      { path: "package.json", digest: "sha256:1111", sizeBytes: 20, mode: "file" },
      { path: "src/index.ts", digest: "sha256:2222", sizeBytes: 42, mode: "file" },
    ]);
  });
});
