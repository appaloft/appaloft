import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListStaticArtifactPublicationsQuery,
  PublishStaticArtifactArchiveCommand,
  PublishStaticArtifactCommand,
  PublishStaticArtifactPayloadCommand,
  type Query,
  type QueryBus,
} from "@appaloft/application";
import {
  ok,
  ProjectId,
  ProviderKey,
  ResourceId,
  type Result,
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
} from "@appaloft/core";
import { Elysia } from "elysia";

import { mountAppaloftOrpcRoutes } from "../src";

class NoopLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class TestExecutionContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      requestId: input.requestId ?? "req_orpc_static_artifact_publish_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

describe("static artifact publish HTTP route", () => {
  test("[STATIC-ARTIFACT-EXT-011] dispatches static-artifacts.publish through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok(createPublication() as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/static-artifacts/publish", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          projectId: "project_docs",
          resourceId: "res_docs",
          sourcePath: "/tmp/site/dist",
          artifactId: "static_artifact_docs",
          metadata: { channel: "local" },
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      schemaVersion: "static-artifacts.publish/v1",
      publicationId: "static_artifact_publication_docs",
      projectId: "project_docs",
      resourceId: "res_docs",
      artifactId: "static_artifact_docs",
      manifestDigest: "manifest-digest",
      fileCount: 1,
      totalBytes: 18,
      files: [
        {
          pathDigest: "path-digest",
          contentDigest: "content-digest",
          sizeBytes: 18,
          mimeType: "text/html",
        },
      ],
      storageRef: "filesystem-static-artifact://static_artifact_docs/manifest-digest",
      storageProviderKey: "filesystem-static-artifact-store",
      routeUrl:
        "http://localhost:3001/static-artifacts/artifacts/static_artifact_docs/manifest-digest/",
      routeProviderKey: "filesystem-static-artifact-route",
    });
    expect(capturedCommand).toBeInstanceOf(PublishStaticArtifactCommand);
    expect(capturedCommand).toMatchObject({
      projectId: "project_docs",
      resourceId: "res_docs",
      sourcePath: "/tmp/site/dist",
      artifactId: "static_artifact_docs",
      metadata: { channel: "local" },
    });
  });

  test("[STATIC-ARTIFACT-EXT-014] dispatches static artifact publication listing through HTTP", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(): Promise<Result<T>> => ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          items: [
            {
              publicationId: "static_artifact_publication_docs",
              projectId: "project_docs",
              resourceId: "res_docs",
              artifactId: "static_artifact_docs",
              manifestDigest: "manifest-digest",
              fileCount: 1,
              totalBytes: 18,
              storageRef: "filesystem-static-artifact://static_artifact_docs/manifest-digest",
              storeProviderKey: "filesystem-static-artifact-store",
              routeUrl:
                "http://localhost:3001/static-artifacts/artifacts/static_artifact_docs/manifest-digest/",
              routeProviderKey: "filesystem-static-artifact-route",
              publishedAt: "2026-05-25T00:00:00.000Z",
              metadata: { channel: "local" },
            },
          ],
        } as T);
      },
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request(
        "http://localhost/api/static-artifacts/publications?projectId=project_docs&resourceId=res_docs&limit=10",
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      schemaVersion: "static-artifacts.publications.list/v1",
      items: [
        {
          publicationId: "static_artifact_publication_docs",
          projectId: "project_docs",
          resourceId: "res_docs",
          artifactId: "static_artifact_docs",
          manifestDigest: "manifest-digest",
          fileCount: 1,
          totalBytes: 18,
          storageRef: "filesystem-static-artifact://static_artifact_docs/manifest-digest",
          storageProviderKey: "filesystem-static-artifact-store",
          routeUrl:
            "http://localhost:3001/static-artifacts/artifacts/static_artifact_docs/manifest-digest/",
          routeProviderKey: "filesystem-static-artifact-route",
          publishedAt: "2026-05-25T00:00:00.000Z",
          metadata: { channel: "local" },
        },
      ],
    });
    expect(capturedQuery).toBeInstanceOf(ListStaticArtifactPublicationsQuery);
    expect(capturedQuery).toMatchObject({
      projectId: "project_docs",
      resourceId: "res_docs",
      limit: 10,
    });
  });

  test("[STATIC-ARTIFACT-EXT-015] dispatches inline static artifact payload publishing through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok(createPublication() as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/static-artifacts/publish-payload", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          projectId: "project_docs",
          resourceId: "res_docs",
          artifactId: "static_artifact_docs",
          files: [
            {
              path: "index.html",
              mimeType: "text/html",
              contentBase64: "PGh0bWw+ZG9jczwvaHRtbD4=",
            },
          ],
          metadata: { channel: "inline" },
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      schemaVersion: "static-artifacts.publish/v1",
      publicationId: "static_artifact_publication_docs",
      projectId: "project_docs",
      resourceId: "res_docs",
      artifactId: "static_artifact_docs",
      routeUrl:
        "http://localhost:3001/static-artifacts/artifacts/static_artifact_docs/manifest-digest/",
    });
    expect(capturedCommand).toBeInstanceOf(PublishStaticArtifactPayloadCommand);
    expect(capturedCommand).toMatchObject({
      projectId: "project_docs",
      resourceId: "res_docs",
      artifactId: "static_artifact_docs",
      files: [
        {
          path: "index.html",
          mimeType: "text/html",
          contentBase64: "PGh0bWw+ZG9jczwvaHRtbD4=",
        },
      ],
      metadata: { channel: "inline" },
    });
  });

  test("[STATIC-ARTIFACT-EXT-016] dispatches archive static artifact publishing through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok(createPublication() as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/static-artifacts/publish-archive", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          projectId: "project_docs",
          resourceId: "res_docs",
          artifactId: "static_artifact_docs",
          archiveBase64: "UEsDBAoAAAAAA",
          metadata: { channel: "archive" },
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      schemaVersion: "static-artifacts.publish/v1",
      publicationId: "static_artifact_publication_docs",
      projectId: "project_docs",
      resourceId: "res_docs",
      artifactId: "static_artifact_docs",
    });
    expect(capturedCommand).toBeInstanceOf(PublishStaticArtifactArchiveCommand);
    expect(capturedCommand).toMatchObject({
      projectId: "project_docs",
      resourceId: "res_docs",
      artifactId: "static_artifact_docs",
      archiveBase64: "UEsDBAoAAAAAA",
      metadata: { channel: "archive" },
    });
  });
});

function createPublication(): StaticArtifactPublication {
  const manifest = StaticArtifactManifest.create({
    artifactId: StaticArtifactId.rehydrate("static_artifact_docs"),
    manifestDigest: StaticArtifactDigest.rehydrate("manifest-digest"),
    fileCount: StaticArtifactFileCount.rehydrate(1),
    totalBytes: StaticArtifactByteSize.rehydrate(18),
    files: [
      StaticArtifactFileDigest.create({
        pathDigest: StaticArtifactDigest.rehydrate("path-digest"),
        contentDigest: StaticArtifactDigest.rehydrate("content-digest"),
        sizeBytes: StaticArtifactByteSize.rehydrate(18),
        mimeType: StaticArtifactMimeType.rehydrate("text/html"),
      })._unsafeUnwrap(),
    ],
  })._unsafeUnwrap();

  return StaticArtifactPublication.create({
    publicationId: StaticArtifactPublicationId.rehydrate("static_artifact_publication_docs"),
    projectId: ProjectId.rehydrate("project_docs"),
    resourceId: ResourceId.rehydrate("res_docs"),
    manifest,
    storedManifest: StaticArtifactStoredManifest.create({
      artifactId: StaticArtifactId.rehydrate("static_artifact_docs"),
      manifestDigest: StaticArtifactDigest.rehydrate("manifest-digest"),
      storageRef: StaticArtifactStorageRef.rehydrate(
        "filesystem-static-artifact://static_artifact_docs/manifest-digest",
      ),
      providerKey: ProviderKey.rehydrate("filesystem-static-artifact-store"),
    })._unsafeUnwrap(),
    routeActivation: StaticArtifactRouteActivation.create({
      publicationId: StaticArtifactPublicationId.rehydrate("static_artifact_publication_docs"),
      url: StaticArtifactRouteUrl.rehydrate(
        "http://localhost:3001/static-artifacts/artifacts/static_artifact_docs/manifest-digest/",
      ),
      providerKey: ProviderKey.rehydrate("filesystem-static-artifact-route"),
    })._unsafeUnwrap(),
  })._unsafeUnwrap();
}
