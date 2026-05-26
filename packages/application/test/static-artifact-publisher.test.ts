import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import {
  domainError,
  err,
  ok,
  ProviderKey,
  type Result,
  StaticArtifactByteSize,
  StaticArtifactDigest,
  StaticArtifactFileCount,
  StaticArtifactFileDigest,
  StaticArtifactId,
  StaticArtifactManifest,
  StaticArtifactMimeType,
  StaticArtifactRouteActivation,
  StaticArtifactRouteUrl,
  StaticArtifactStorageRef,
  StaticArtifactStoredManifest,
} from "@appaloft/core";
import {
  type ActivateStaticArtifactRouteInput,
  createExecutionContext,
  type IdGenerator,
  PortBackedStaticArtifactPublisher,
  type RecordStaticArtifactPublicationInput,
  type StaticArtifactPublicationJournalPort,
  type StaticArtifactRouteProviderPort,
  type StaticArtifactStorePort,
  type StoreStaticArtifactManifestInput,
} from "../src";

describe("PortBackedStaticArtifactPublisher", () => {
  test("[STATIC-ARTIFACT-EXT-005] composes store and route provider ports without provider branching", async () => {
    const calls: string[] = [];
    let storedInput: StoreStaticArtifactManifestInput | undefined;
    let routeInput: ActivateStaticArtifactRouteInput | undefined;
    let journalInput: RecordStaticArtifactPublicationInput | undefined;
    const manifest = createManifest();
    const store: StaticArtifactStorePort = {
      async storeManifest(_context, input) {
        calls.push("store");
        storedInput = input;
        const manifestState = input.manifest.toState();
        return ok(
          StaticArtifactStoredManifest.create({
            artifactId: manifestState.artifactId,
            manifestDigest: manifestState.manifestDigest,
            storageRef: StaticArtifactStorageRef.rehydrate("object-store://artifact/docs/v1"),
            providerKey: ProviderKey.rehydrate("object-store"),
          })._unsafeUnwrap(),
        );
      },
    };
    const routeProvider: StaticArtifactRouteProviderPort = {
      async activateRoute(_context, input) {
        calls.push("route");
        routeInput = input;
        return ok(
          StaticArtifactRouteActivation.create({
            publicationId: input.publication.toState().publicationId,
            url: StaticArtifactRouteUrl.rehydrate("https://static.example.test/docs/v1/"),
            providerKey: ProviderKey.rehydrate("route-provider"),
          })._unsafeUnwrap(),
        );
      },
    };
    const idGenerator: IdGenerator = {
      next(prefix) {
        return `${prefix}_001`;
      },
    };
    const journal: StaticArtifactPublicationJournalPort = {
      async recordPublication(_context, input) {
        calls.push("journal");
        journalInput = input;
        const publicationState = input.publication.toState();
        const manifestState = publicationState.manifest.toState();
        const storedManifestState = publicationState.storedManifest.toState();
        return ok({
          publicationId: publicationState.publicationId.value,
          projectId: publicationState.projectId.value,
          resourceId: publicationState.resourceId.value,
          artifactId: manifestState.artifactId.value,
          manifestDigest: manifestState.manifestDigest.value,
          storageRef: storedManifestState.storageRef.value,
          storeProviderKey: storedManifestState.providerKey.value,
          routeUrl: publicationState.routeActivation?.url,
          routeProviderKey: publicationState.routeActivation?.toState().providerKey.value,
          fileCount: manifestState.fileCount.value,
          totalBytes: manifestState.totalBytes.value,
          metadata: input.metadata,
        });
      },
    };

    const result = await new PortBackedStaticArtifactPublisher(
      store,
      routeProvider,
      idGenerator,
      journal,
    ).publish(createExecutionContext({ entrypoint: "system" }), {
      projectId: "project_docs",
      resourceId: "res_docs",
      manifest,
      files: [
        {
          path: "index.html",
          sizeBytes: 42,
          mimeType: "text/html",
          contentDigest: "content-digest",
          async readBytes() {
            return new Uint8Array(42);
          },
        },
      ],
      promoteAlias: true,
      metadata: { source: "unit-test" },
    });

    expect(result.isOk()).toBe(true);
    const publication = result._unsafeUnwrap();
    expect(calls).toEqual(["store", "route", "journal"]);
    expect(publication.publicationId).toBe("static_artifact_publication_001");
    expect(publication.url).toBe("https://static.example.test/docs/v1/");
    expect(publication.toState().storedManifest.storageRef).toBe("object-store://artifact/docs/v1");
    expect(storedInput?.projectId).toBe("project_docs");
    expect(storedInput?.resourceId).toBe("res_docs");
    expect(storedInput?.files).toHaveLength(1);
    expect(storedInput?.metadata).toEqual({ source: "unit-test" });
    expect(routeInput?.routeKind).toBe("alias");
    expect(routeInput?.metadata).toEqual({ source: "unit-test" });
    expect(journalInput?.publication.publicationId).toBe("static_artifact_publication_001");
    expect(journalInput?.metadata).toEqual({ source: "unit-test" });
  });

  test("[STATIC-ARTIFACT-EXT-005] does not activate a route when storage fails", async () => {
    const store: StaticArtifactStorePort = {
      async storeManifest(): Promise<Result<StaticArtifactStoredManifest>> {
        return err(domainError.provider("Static artifact store unavailable"));
      },
    };
    const routeProvider: StaticArtifactRouteProviderPort = {
      async activateRoute(): Promise<Result<StaticArtifactRouteActivation>> {
        throw new Error("route provider should not be called");
      },
    };
    const idGenerator: IdGenerator = {
      next(prefix) {
        return `${prefix}_001`;
      },
    };

    const result = await new PortBackedStaticArtifactPublisher(
      store,
      routeProvider,
      idGenerator,
    ).publish(createExecutionContext({ entrypoint: "system" }), {
      projectId: "project_docs",
      resourceId: "res_docs",
      manifest: createManifest(),
    });

    expect(result.isErr()).toBe(true);
  });
});

function createManifest(): StaticArtifactManifest {
  return StaticArtifactManifest.create({
    artifactId: StaticArtifactId.rehydrate("artifact_docs"),
    manifestDigest: StaticArtifactDigest.rehydrate("manifest-digest"),
    fileCount: StaticArtifactFileCount.rehydrate(1),
    totalBytes: StaticArtifactByteSize.rehydrate(42),
    files: [
      StaticArtifactFileDigest.create({
        pathDigest: StaticArtifactDigest.rehydrate("path-digest"),
        contentDigest: StaticArtifactDigest.rehydrate("content-digest"),
        sizeBytes: StaticArtifactByteSize.rehydrate(42),
        mimeType: StaticArtifactMimeType.rehydrate("text/html"),
      })._unsafeUnwrap(),
    ],
  })._unsafeUnwrap();
}
