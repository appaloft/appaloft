import { describe, expect, test } from "bun:test";

import {
  ProjectId,
  ProviderKey,
  ResourceId,
  StaticArtifactByteSize,
  StaticArtifactDigest,
  StaticArtifactFileCount,
  StaticArtifactFileDigest,
  StaticArtifactId,
  StaticArtifactManifest,
  StaticArtifactMimeType,
  StaticArtifactPublication,
  StaticArtifactPublicationId,
  StaticArtifactRouteActivation,
  StaticArtifactRouteUrl,
  StaticArtifactStorageRef,
  StaticArtifactStoredManifest,
} from "../src";

describe("StaticArtifactManifest", () => {
  test("[STATIC-ARTIFACT-EXT-001] validates manifest count and byte totals", () => {
    const file = StaticArtifactFileDigest.create({
      pathDigest: StaticArtifactDigest.rehydrate("path-digest"),
      contentDigest: StaticArtifactDigest.rehydrate("content-digest"),
      sizeBytes: StaticArtifactByteSize.rehydrate(42),
      mimeType: StaticArtifactMimeType.rehydrate("text/html"),
    })._unsafeUnwrap();

    const valid = StaticArtifactManifest.create({
      artifactId: StaticArtifactId.rehydrate("artifact_docs"),
      manifestDigest: StaticArtifactDigest.rehydrate("manifest-digest"),
      fileCount: StaticArtifactFileCount.rehydrate(1),
      totalBytes: StaticArtifactByteSize.rehydrate(42),
      files: [file],
    });
    const wrongCount = StaticArtifactManifest.create({
      artifactId: StaticArtifactId.rehydrate("artifact_docs"),
      manifestDigest: StaticArtifactDigest.rehydrate("manifest-digest"),
      fileCount: StaticArtifactFileCount.rehydrate(2),
      totalBytes: StaticArtifactByteSize.rehydrate(42),
      files: [file],
    });
    const wrongTotal = StaticArtifactManifest.create({
      artifactId: StaticArtifactId.rehydrate("artifact_docs"),
      manifestDigest: StaticArtifactDigest.rehydrate("manifest-digest"),
      fileCount: StaticArtifactFileCount.rehydrate(1),
      totalBytes: StaticArtifactByteSize.rehydrate(41),
      files: [file],
    });

    expect(valid.isOk()).toBe(true);
    expect(wrongCount.isErr()).toBe(true);
    expect(wrongTotal.isErr()).toBe(true);
  });

  test("[STATIC-ARTIFACT-EXT-002] keeps publication storage and route provider-neutral", () => {
    const manifest = StaticArtifactManifest.create({
      artifactId: StaticArtifactId.rehydrate("artifact_docs"),
      manifestDigest: StaticArtifactDigest.rehydrate("manifest-digest"),
      fileCount: StaticArtifactFileCount.rehydrate(1),
      totalBytes: StaticArtifactByteSize.rehydrate(0),
      files: [
        StaticArtifactFileDigest.create({
          pathDigest: StaticArtifactDigest.rehydrate("path-digest"),
          contentDigest: StaticArtifactDigest.rehydrate("content-digest"),
          sizeBytes: StaticArtifactByteSize.rehydrate(0),
          mimeType: StaticArtifactMimeType.rehydrate("text/html"),
        })._unsafeUnwrap(),
      ],
    })._unsafeUnwrap();
    const storedManifest = StaticArtifactStoredManifest.create({
      artifactId: StaticArtifactId.rehydrate("artifact_docs"),
      manifestDigest: StaticArtifactDigest.rehydrate("manifest-digest"),
      storageRef: StaticArtifactStorageRef.rehydrate("s3-compatible://bucket/key"),
      providerKey: ProviderKey.rehydrate("user-owned-object-storage"),
    })._unsafeUnwrap();
    const routeActivation = StaticArtifactRouteActivation.create({
      publicationId: StaticArtifactPublicationId.rehydrate("pub_docs"),
      url: StaticArtifactRouteUrl.rehydrate("https://static.example.test/docs/v1/"),
      providerKey: ProviderKey.rehydrate("user-owned-route-provider"),
    })._unsafeUnwrap();

    const publication = StaticArtifactPublication.create({
      publicationId: StaticArtifactPublicationId.rehydrate("pub_docs"),
      projectId: ProjectId.rehydrate("project_docs"),
      resourceId: ResourceId.rehydrate("res_docs"),
      manifest,
      storedManifest,
      routeActivation,
    });

    expect(publication.isOk()).toBe(true);
    expect(publication._unsafeUnwrap().url).toBe("https://static.example.test/docs/v1/");
  });

  test("[STATIC-ARTIFACT-EXT-003] rejects mismatched stored manifest identity", () => {
    const manifest = StaticArtifactManifest.create({
      artifactId: StaticArtifactId.rehydrate("artifact_docs"),
      manifestDigest: StaticArtifactDigest.rehydrate("manifest-digest"),
      fileCount: StaticArtifactFileCount.rehydrate(1),
      totalBytes: StaticArtifactByteSize.rehydrate(0),
      files: [
        StaticArtifactFileDigest.create({
          pathDigest: StaticArtifactDigest.rehydrate("path-digest"),
          contentDigest: StaticArtifactDigest.rehydrate("content-digest"),
          sizeBytes: StaticArtifactByteSize.rehydrate(0),
          mimeType: StaticArtifactMimeType.rehydrate("text/html"),
        })._unsafeUnwrap(),
      ],
    })._unsafeUnwrap();
    const storedManifest = StaticArtifactStoredManifest.create({
      artifactId: StaticArtifactId.rehydrate("artifact_other"),
      manifestDigest: StaticArtifactDigest.rehydrate("manifest-digest"),
      storageRef: StaticArtifactStorageRef.rehydrate("static-artifact://manifest"),
      providerKey: ProviderKey.rehydrate("local"),
    })._unsafeUnwrap();

    expect(
      StaticArtifactPublication.create({
        publicationId: StaticArtifactPublicationId.rehydrate("pub_docs"),
        projectId: ProjectId.rehydrate("project_docs"),
        resourceId: ResourceId.rehydrate("res_docs"),
        manifest,
        storedManifest,
      }).isErr(),
    ).toBe(true);
  });
});
