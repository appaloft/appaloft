import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok } from "@appaloft/core";

import {
  createExecutionContext,
  ListStaticArtifactPublicationsQuery,
  ListStaticArtifactPublicationsQueryHandler,
  type StaticArtifactPublicationReadModelPort,
} from "../src";

describe("ListStaticArtifactPublicationsQuery", () => {
  test("[STATIC-ARTIFACT-EXT-014] lists static artifact publications through the read model port", async () => {
    const readModel: StaticArtifactPublicationReadModelPort = {
      async listPublications(_context, input) {
        return ok({
          items: [
            {
              publicationId: "static_artifact_publication_001",
              projectId: input?.projectId ?? "project_docs",
              resourceId: input?.resourceId ?? "res_docs",
              artifactId: "artifact_docs",
              manifestDigest: "manifest-digest",
              storageRef: "filesystem-static-artifact://artifact_docs/manifest-digest",
              storeProviderKey: "filesystem-static-artifact-store",
              routeUrl: "https://static.example.test/artifacts/artifact_docs/manifest-digest/",
              routeProviderKey: "filesystem-static-artifact-route",
              fileCount: 1,
              totalBytes: 42,
            },
          ],
        });
      },
    };

    const query = ListStaticArtifactPublicationsQuery.create({
      projectId: "project_docs",
      resourceId: "res_docs",
      limit: 10,
    })._unsafeUnwrap();
    const result = await new ListStaticArtifactPublicationsQueryHandler(readModel).handle(
      createExecutionContext({ entrypoint: "system" }),
      query,
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      items: [
        expect.objectContaining({
          publicationId: "static_artifact_publication_001",
          projectId: "project_docs",
          resourceId: "res_docs",
          routeUrl: "https://static.example.test/artifacts/artifact_docs/manifest-digest/",
        }),
      ],
    });
  });
});
