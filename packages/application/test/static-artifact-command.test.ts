import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

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
import {
  createExecutionContext,
  type ExecutionContext,
  type IdGenerator,
  type OperationCheckRequest,
  type OperationGuardDecision,
  type OperationGuardPort,
  PublishStaticArtifactArchiveCommand,
  PublishStaticArtifactArchiveCommandHandler,
  PublishStaticArtifactCommand,
  PublishStaticArtifactCommandHandler,
  type PublishStaticArtifactInput,
  PublishStaticArtifactPayloadCommand,
  PublishStaticArtifactPayloadCommandHandler,
  type StaticArtifactPayloadReaderPort,
  type StaticArtifactPayloadReadResult,
  type StaticArtifactPublisherPort,
} from "../src";

class DenyingOperationGuardPort implements OperationGuardPort {
  readonly requests: OperationCheckRequest[] = [];

  async checkOperation(
    _context: ExecutionContext,
    request: OperationCheckRequest,
  ): Promise<OperationGuardDecision> {
    this.requests.push(request);
    return {
      allowed: false,
      checks: [
        {
          allowed: false,
          checkKey: "test.quota",
          kind: "quota",
          reason: "test-operation-denied",
        },
      ],
      deniedBy: {
        checkKey: "test.quota",
        kind: "quota",
      },
      reason: "test-operation-denied",
    };
  }
}

describe("PublishStaticArtifactCommand", () => {
  test("[STATIC-ARTIFACT-EXT-007] reads a source path and publishes through the static artifact publisher port", async () => {
    const calls: string[] = [];
    let publishInput: PublishStaticArtifactInput | undefined;
    const manifest = createManifest("static_artifact_001");
    const payload = {
      path: "index.html",
      sizeBytes: 12,
      mimeType: "text/plain",
      contentDigest: "content-digest",
      async readBytes() {
        return new TextEncoder().encode("hello static");
      },
    };
    const reader: StaticArtifactPayloadReaderPort = {
      async read(_context, input) {
        calls.push("read");
        expect(input).toMatchObject({
          artifactId: "static_artifact_001",
          sourcePath: "dist",
          metadata: { channel: "local" },
        });
        return ok<StaticArtifactPayloadReadResult>({
          manifest,
          files: [payload],
        });
      },
    };
    const publisher: StaticArtifactPublisherPort = {
      async publish(_context, input) {
        calls.push("publish");
        publishInput = input;
        return StaticArtifactPublication.create({
          publicationId: StaticArtifactPublicationId.rehydrate("pub_static"),
          projectId: ProjectId.rehydrate(input.projectId),
          resourceId: ResourceId.rehydrate(input.resourceId),
          manifest: input.manifest,
          storedManifest: StaticArtifactStoredManifest.create({
            artifactId: StaticArtifactId.rehydrate("static_artifact_001"),
            manifestDigest: StaticArtifactDigest.rehydrate("manifest-digest"),
            storageRef: StaticArtifactStorageRef.rehydrate(
              "filesystem-static-artifact://static_artifact_001/manifest-digest",
            ),
            providerKey: ProviderKey.rehydrate("filesystem"),
          })._unsafeUnwrap(),
          routeActivation: StaticArtifactRouteActivation.create({
            publicationId: StaticArtifactPublicationId.rehydrate("pub_static"),
            url: StaticArtifactRouteUrl.rehydrate(
              "https://static.example.test/artifacts/static_artifact_001/manifest-digest/",
            ),
            providerKey: ProviderKey.rehydrate("route"),
          })._unsafeUnwrap(),
        });
      },
    };
    const idGenerator: IdGenerator = {
      next(prefix) {
        return `${prefix}_001`;
      },
    };

    const command = PublishStaticArtifactCommand.create({
      projectId: "project_docs",
      resourceId: "res_docs",
      sourcePath: "dist",
      promoteAlias: true,
      metadata: { channel: "local" },
    })._unsafeUnwrap();
    const result = await new PublishStaticArtifactCommandHandler(
      reader,
      publisher,
      idGenerator,
    ).handle(createExecutionContext({ entrypoint: "system" }), command);

    expect(result.isOk()).toBe(true);
    expect(calls).toEqual(["read", "publish"]);
    expect(result._unsafeUnwrap().url).toBe(
      "https://static.example.test/artifacts/static_artifact_001/manifest-digest/",
    );
    expect(publishInput).toMatchObject({
      projectId: "project_docs",
      resourceId: "res_docs",
      files: [payload],
      promoteAlias: true,
      metadata: { channel: "local" },
    });
  });

  test("[STATIC-ARTIFACT-EXT-015] publishes inline file payloads without a server-local source path", async () => {
    let publishInput: PublishStaticArtifactInput | undefined;
    const publisher: StaticArtifactPublisherPort = {
      async publish(_context, input) {
        publishInput = input;
        return StaticArtifactPublication.create({
          publicationId: StaticArtifactPublicationId.rehydrate("pub_static_payload"),
          projectId: ProjectId.rehydrate(input.projectId),
          resourceId: ResourceId.rehydrate(input.resourceId),
          manifest: input.manifest,
          storedManifest: StaticArtifactStoredManifest.create({
            artifactId: StaticArtifactId.rehydrate("static_artifact_payload"),
            manifestDigest: StaticArtifactDigest.rehydrate(input.manifest.manifestDigest),
            storageRef: StaticArtifactStorageRef.rehydrate(
              `filesystem-static-artifact://static_artifact_payload/${input.manifest.manifestDigest}`,
            ),
            providerKey: ProviderKey.rehydrate("filesystem"),
          })._unsafeUnwrap(),
          routeActivation: StaticArtifactRouteActivation.create({
            publicationId: StaticArtifactPublicationId.rehydrate("pub_static_payload"),
            url: StaticArtifactRouteUrl.rehydrate(
              `https://static.example.test/artifacts/static_artifact_payload/${input.manifest.manifestDigest}/`,
            ),
            providerKey: ProviderKey.rehydrate("route"),
          })._unsafeUnwrap(),
        });
      },
    };
    const idGenerator: IdGenerator = {
      next(prefix) {
        return `${prefix}_payload`;
      },
    };

    const command = PublishStaticArtifactPayloadCommand.create({
      projectId: "project_docs",
      resourceId: "res_docs",
      artifactId: "static_artifact_payload",
      promoteAlias: true,
      files: [
        {
          path: "index.html",
          mimeType: "text/html",
          contentBase64: "PGh0bWw+ZG9jczwvaHRtbD4=",
        },
      ],
      metadata: { channel: "inline" },
    })._unsafeUnwrap();
    const result = await new PublishStaticArtifactPayloadCommandHandler(
      publisher,
      idGenerator,
    ).handle(createExecutionContext({ entrypoint: "system" }), command);

    expect(result.isOk()).toBe(true);
    expect(publishInput).toMatchObject({
      projectId: "project_docs",
      resourceId: "res_docs",
      promoteAlias: true,
      metadata: { channel: "inline" },
    });
    expect(publishInput?.manifest.artifactId).toBe("static_artifact_payload");
    expect(publishInput?.files).toHaveLength(1);
    const [payload] = publishInput?.files ?? [];
    expect(payload).toMatchObject({
      path: "index.html",
      mimeType: "text/html",
      sizeBytes: 17,
      contentDigest: digestText("<html>docs</html>"),
    });
    await expect(payload?.readBytes()).resolves.toEqual(
      new TextEncoder().encode("<html>docs</html>"),
    );
  });

  test("[STATIC-ARTIFACT-EXT-016] publishes zipped archive payloads without a server-local source path", async () => {
    let publishInput: PublishStaticArtifactInput | undefined;
    const publisher: StaticArtifactPublisherPort = {
      async publish(_context, input) {
        publishInput = input;
        return StaticArtifactPublication.create({
          publicationId: StaticArtifactPublicationId.rehydrate("pub_static_archive"),
          projectId: ProjectId.rehydrate(input.projectId),
          resourceId: ResourceId.rehydrate(input.resourceId),
          manifest: input.manifest,
          storedManifest: StaticArtifactStoredManifest.create({
            artifactId: StaticArtifactId.rehydrate("static_artifact_archive"),
            manifestDigest: StaticArtifactDigest.rehydrate(input.manifest.manifestDigest),
            storageRef: StaticArtifactStorageRef.rehydrate(
              `filesystem-static-artifact://static_artifact_archive/${input.manifest.manifestDigest}`,
            ),
            providerKey: ProviderKey.rehydrate("filesystem"),
          })._unsafeUnwrap(),
          routeActivation: StaticArtifactRouteActivation.create({
            publicationId: StaticArtifactPublicationId.rehydrate("pub_static_archive"),
            url: StaticArtifactRouteUrl.rehydrate(
              `https://static.example.test/artifacts/static_artifact_archive/${input.manifest.manifestDigest}/`,
            ),
            providerKey: ProviderKey.rehydrate("route"),
          })._unsafeUnwrap(),
        });
      },
    };
    const idGenerator: IdGenerator = {
      next(prefix) {
        return `${prefix}_archive`;
      },
    };

    const archiveBase64 = Buffer.from(
      createZipArchive([
        { path: "index.html", content: "<html>docs</html>" },
        { path: "assets/app.css", content: "body { color: #222; }" },
      ]),
    ).toString("base64");
    const command = PublishStaticArtifactArchiveCommand.create({
      projectId: "project_docs",
      resourceId: "res_docs",
      artifactId: "static_artifact_archive",
      promoteAlias: true,
      archiveBase64,
      metadata: { channel: "archive" },
    })._unsafeUnwrap();
    const result = await new PublishStaticArtifactArchiveCommandHandler(
      publisher,
      idGenerator,
    ).handle(createExecutionContext({ entrypoint: "system" }), command);

    expect(result.isOk()).toBe(true);
    expect(publishInput).toMatchObject({
      projectId: "project_docs",
      resourceId: "res_docs",
      promoteAlias: true,
      metadata: { channel: "archive" },
    });
    expect(publishInput?.manifest.artifactId).toBe("static_artifact_archive");
    expect(publishInput?.manifest.toState().fileCount.value).toBe(2);
    const files = publishInput?.files;
    expect(files).toBeDefined();
    expect(files?.map((file) => file.path)).toEqual(["assets/app.css", "index.html"]);
    expect(files?.[0]).toMatchObject({
      path: "assets/app.css",
      mimeType: "text/css",
      contentDigest: digestText("body { color: #222; }"),
    });
  });

  test("[STATIC-ARTIFACT-GUARD-001] publish command can be denied before reading or publishing", async () => {
    const guard = new DenyingOperationGuardPort();
    const calls: string[] = [];
    const reader: StaticArtifactPayloadReaderPort = {
      async read() {
        calls.push("read");
        return ok<StaticArtifactPayloadReadResult>({
          manifest: createManifest("static_artifact_denied"),
          files: [],
        });
      },
    };
    const publisher: StaticArtifactPublisherPort = {
      async publish(): Promise<Result<StaticArtifactPublication>> {
        calls.push("publish");
        throw new Error("publisher should not be called after operation guard denial");
      },
    };
    const idGenerator: IdGenerator = {
      next(prefix) {
        return `${prefix}_denied`;
      },
    };

    const command = PublishStaticArtifactCommand.create({
      projectId: "project_docs",
      resourceId: "res_docs",
      sourcePath: "dist",
    })._unsafeUnwrap();
    const result = await new PublishStaticArtifactCommandHandler(
      reader,
      publisher,
      idGenerator,
      guard,
    ).handle(createExecutionContext({ entrypoint: "system" }), command);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "operation_check_denied",
      details: {
        checkKey: "test.quota",
        checkKind: "quota",
        operationKey: "static-artifacts.publish",
        projectId: "project_docs",
        resourceId: "res_docs",
        reason: "test-operation-denied",
      },
    });
    expect(guard.requests).toHaveLength(1);
    expect(guard.requests[0]).toMatchObject({
      operationKey: "static-artifacts.publish",
      resourceRefs: {
        projectId: "project_docs",
        resourceId: "res_docs",
      },
      contextAttributes: expect.objectContaining({
        estimatedExternalProviderCalls: 2,
        estimatedInputBytes: 4,
        estimatedWriteUnits: 2,
      }),
    });
    expect(calls).toEqual([]);
  });

  test("[STATIC-ARTIFACT-GUARD-002] inline publish estimates provider and payload cost before publishing", async () => {
    const guard = new DenyingOperationGuardPort();
    const calls: string[] = [];
    const publisher: StaticArtifactPublisherPort = {
      async publish(): Promise<Result<StaticArtifactPublication>> {
        calls.push("publish");
        throw new Error("publisher should not be called after operation guard denial");
      },
    };
    const idGenerator: IdGenerator = {
      next(prefix) {
        return `${prefix}_inline_denied`;
      },
    };

    const command = PublishStaticArtifactPayloadCommand.create({
      projectId: "project_docs",
      resourceId: "res_docs",
      files: [
        {
          path: "index.html",
          mimeType: "text/html",
          contentBase64: "PGh0bWw+ZG9jczwvaHRtbD4=",
        },
        {
          path: "assets/app.css",
          mimeType: "text/css",
          contentBase64: "Ym9keSB7IGNvbG9yOiAjMjIyOyB9",
        },
      ],
    })._unsafeUnwrap();
    const result = await new PublishStaticArtifactPayloadCommandHandler(
      publisher,
      idGenerator,
      guard,
    ).handle(createExecutionContext({ entrypoint: "system" }), command);

    expect(result.isErr()).toBe(true);
    expect(guard.requests[0]).toMatchObject({
      operationKey: "static-artifacts.publish-payload",
      resourceRefs: {
        projectId: "project_docs",
        resourceId: "res_docs",
      },
      contextAttributes: expect.objectContaining({
        estimatedExternalProviderCalls: 2,
        estimatedFieldCount: 6,
        estimatedInputBytes: 52,
        estimatedItemCount: 2,
        estimatedNestingDepth: 2,
        estimatedWriteUnits: 2,
      }),
    });
    expect(calls).toEqual([]);
  });

  test("[STATIC-ARTIFACT-GUARD-003] archive publish estimates provider and archive cost before publishing", async () => {
    const guard = new DenyingOperationGuardPort();
    const calls: string[] = [];
    const publisher: StaticArtifactPublisherPort = {
      async publish(): Promise<Result<StaticArtifactPublication>> {
        calls.push("publish");
        throw new Error("publisher should not be called after operation guard denial");
      },
    };
    const idGenerator: IdGenerator = {
      next(prefix) {
        return `${prefix}_archive_denied`;
      },
    };
    const archiveBase64 = Buffer.from(
      createZipArchive([{ path: "assets/pages/index.html", content: "<html>docs</html>" }]),
    ).toString("base64");

    const command = PublishStaticArtifactArchiveCommand.create({
      projectId: "project_docs",
      resourceId: "res_docs",
      archiveBase64,
    })._unsafeUnwrap();
    const result = await new PublishStaticArtifactArchiveCommandHandler(
      publisher,
      idGenerator,
      guard,
    ).handle(createExecutionContext({ entrypoint: "system" }), command);

    expect(result.isErr()).toBe(true);
    expect(guard.requests[0]).toMatchObject({
      operationKey: "static-artifacts.publish-archive",
      resourceRefs: {
        projectId: "project_docs",
        resourceId: "res_docs",
      },
      contextAttributes: expect.objectContaining({
        estimatedExternalProviderCalls: 2,
        estimatedInputBytes: archiveBase64.length,
        estimatedItemCount: 1,
        estimatedNestingDepth: 3,
        estimatedWriteUnits: 2,
      }),
    });
    expect(calls).toEqual([]);
  });
});

function createManifest(artifactId: string): StaticArtifactManifest {
  return StaticArtifactManifest.create({
    artifactId: StaticArtifactId.rehydrate(artifactId),
    manifestDigest: StaticArtifactDigest.rehydrate("manifest-digest"),
    fileCount: StaticArtifactFileCount.rehydrate(1),
    totalBytes: StaticArtifactByteSize.rehydrate(12),
    files: [
      StaticArtifactFileDigest.create({
        pathDigest: StaticArtifactDigest.rehydrate("path-digest"),
        contentDigest: StaticArtifactDigest.rehydrate("content-digest"),
        sizeBytes: StaticArtifactByteSize.rehydrate(12),
        mimeType: StaticArtifactMimeType.rehydrate("text/plain"),
      })._unsafeUnwrap(),
    ],
  })._unsafeUnwrap();
}

function digestText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function createZipArchive(entries: readonly { path: string; content: string }[]): Uint8Array {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.path, "utf8");
    const content = Buffer.from(entry.content, "utf8");
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt32LE(0, 10);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(content.byteLength, 18);
    localHeader.writeUInt32LE(content.byteLength, 22);
    localHeader.writeUInt16LE(name.byteLength, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt32LE(0, 12);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(content.byteLength, 20);
    centralHeader.writeUInt32LE(content.byteLength, 24);
    centralHeader.writeUInt16LE(name.byteLength, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt32LE(0, 34);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.byteLength + name.byteLength + content.byteLength;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(entries.length, 8);
  endOfCentralDirectory.writeUInt16LE(entries.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.byteLength, 12);
  endOfCentralDirectory.writeUInt32LE(offset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory]);
}
