import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type IdGenerator,
  type StaticArtifactFilePayload,
  type StaticArtifactRouteProviderPort,
} from "@appaloft/application";
import {
  StaticArtifactByteSize,
  StaticArtifactDigest,
  StaticArtifactFileCount,
  StaticArtifactFileDigest,
  StaticArtifactId,
  StaticArtifactManifest,
  StaticArtifactMimeType,
} from "@appaloft/core";

function ensureReflectMetadata(): void {
  const reflectObject = Reflect as typeof Reflect & {
    defineMetadata?: (...args: unknown[]) => void;
    getMetadata?: (...args: unknown[]) => unknown;
    getOwnMetadata?: (...args: unknown[]) => unknown;
    hasMetadata?: (...args: unknown[]) => boolean;
    metadata?: (_metadataKey: unknown, _metadataValue: unknown) => ClassDecorator;
  };

  reflectObject.defineMetadata ??= () => {};
  reflectObject.getMetadata ??= () => undefined;
  reflectObject.getOwnMetadata ??= () => undefined;
  reflectObject.hasMetadata ??= () => false;
  reflectObject.metadata ??= () => () => {};
}

describe("FileSystemStaticArtifactStore", () => {
  test("[STATIC-ARTIFACT-EXT-008] publishes a dist directory through the public command pipeline", async () => {
    ensureReflectMetadata();
    const [
      {
        createExecutionContext,
        PortBackedStaticArtifactPublisher,
        PublishStaticArtifactCommand,
        PublishStaticArtifactCommandHandler,
      },
      filesystem,
    ] = await Promise.all([import("@appaloft/application"), import("../src")]);
    const workspaceRoot = await mkdtemp(join(tmpdir(), "appaloft-static-command-"));
    const sourceRoot = join(workspaceRoot, "dist");
    const storageRoot = join(workspaceRoot, "storage");
    await mkdir(join(sourceRoot, "assets"), { recursive: true });
    await writeFile(join(sourceRoot, "index.html"), "<html>hello</html>", "utf8");
    await writeFile(join(sourceRoot, "assets", "app.css"), "body{color:#222}", "utf8");
    const idGenerator: IdGenerator = {
      next(prefix) {
        return `${prefix}_filesystem`;
      },
    };

    const command = PublishStaticArtifactCommand.create({
      projectId: "project_docs",
      resourceId: "res_docs",
      sourcePath: sourceRoot,
    })._unsafeUnwrap();
    const publisher = new PortBackedStaticArtifactPublisher(
      new filesystem.FileSystemStaticArtifactStore({ rootPath: storageRoot }),
      new filesystem.FileSystemStaticArtifactRouteProvider({
        baseUrl: "https://static.example.test",
      }),
      idGenerator,
    );
    const result = await new PublishStaticArtifactCommandHandler(
      new filesystem.FileSystemStaticArtifactPayloadReader(),
      publisher,
      idGenerator,
    ).handle(createExecutionContext({ entrypoint: "system" }), command);

    expect(result.isOk()).toBe(true);
    const publication = result._unsafeUnwrap();
    const manifestDigest = publication.toState().manifest.manifestDigest;
    expect(publication.url).toBe(
      `https://static.example.test/artifacts/static_artifact_filesystem/${manifestDigest}/`,
    );
    expect(
      await readFile(
        join(storageRoot, "static_artifact_filesystem", manifestDigest, "files", "index.html"),
        "utf8",
      ),
    ).toBe("<html>hello</html>");
    expect(
      await readFile(
        join(
          storageRoot,
          "static_artifact_filesystem",
          manifestDigest,
          "files",
          "assets",
          "app.css",
        ),
        "utf8",
      ),
    ).toBe("body{color:#222}");
  });

  test("[STATIC-ARTIFACT-EXT-013] publishes a zipped static artifact through the public command pipeline", async () => {
    ensureReflectMetadata();
    const [
      {
        createExecutionContext,
        PortBackedStaticArtifactPublisher,
        PublishStaticArtifactCommand,
        PublishStaticArtifactCommandHandler,
      },
      filesystem,
    ] = await Promise.all([import("@appaloft/application"), import("../src")]);
    const workspaceRoot = await mkdtemp(join(tmpdir(), "appaloft-static-archive-command-"));
    const archivePath = join(workspaceRoot, "dist.zip");
    const storageRoot = join(workspaceRoot, "storage");
    await writeFile(
      archivePath,
      createZipArchive([
        { path: "index.html", content: "<html>archive</html>" },
        { path: "assets/app.css", content: "body{color:#334}" },
      ]),
    );
    const idGenerator: IdGenerator = {
      next(prefix) {
        return `${prefix}_archive`;
      },
    };

    const command = PublishStaticArtifactCommand.create({
      projectId: "project_docs",
      resourceId: "res_docs",
      sourcePath: archivePath,
    })._unsafeUnwrap();
    const publisher = new PortBackedStaticArtifactPublisher(
      new filesystem.FileSystemStaticArtifactStore({ rootPath: storageRoot }),
      new filesystem.FileSystemStaticArtifactRouteProvider({
        baseUrl: "https://static.example.test",
      }),
      idGenerator,
    );
    const result = await new PublishStaticArtifactCommandHandler(
      new filesystem.FileSystemStaticArtifactPayloadReader(),
      publisher,
      idGenerator,
    ).handle(createExecutionContext({ entrypoint: "system" }), command);

    expect(result.isOk()).toBe(true);
    const publication = result._unsafeUnwrap();
    const manifestDigest = publication.toState().manifest.manifestDigest;
    expect(publication.url).toBe(
      `https://static.example.test/artifacts/static_artifact_archive/${manifestDigest}/`,
    );
    expect(
      await readFile(
        join(storageRoot, "static_artifact_archive", manifestDigest, "files", "index.html"),
        "utf8",
      ),
    ).toBe("<html>archive</html>");
    expect(
      await readFile(
        join(storageRoot, "static_artifact_archive", manifestDigest, "files", "assets", "app.css"),
        "utf8",
      ),
    ).toBe("body{color:#334}");
  });

  test("[STATIC-ARTIFACT-EXT-013] rejects zipped static artifact entries with unsafe paths", async () => {
    const filesystem = await import("../src");
    const workspaceRoot = await mkdtemp(join(tmpdir(), "appaloft-static-archive-unsafe-"));
    const archivePath = join(workspaceRoot, "dist.zip");
    await writeFile(
      archivePath,
      createZipArchive([{ path: "../secrets.txt", content: "not for publish" }]),
    );

    const result = await new filesystem.FileSystemStaticArtifactPayloadReader().read({} as never, {
      artifactId: "artifact_docs",
      sourcePath: archivePath,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toBe(
      "Static artifact file payload path must be relative and safe",
    );
  });

  test("[STATIC-ARTIFACT-EXT-006] stores static artifact payloads and activates a neutral local route", async () => {
    ensureReflectMetadata();
    const [{ createExecutionContext, PortBackedStaticArtifactPublisher }, filesystem] =
      await Promise.all([import("@appaloft/application"), import("../src")]);
    const storageRoot = await mkdtemp(join(tmpdir(), "appaloft-static-artifacts-"));
    const manifest = createManifest();
    const payload = createPayload("index.html", "hello static");
    const idGenerator: IdGenerator = {
      next(prefix) {
        return `${prefix}_filesystem`;
      },
    };

    const result = await new PortBackedStaticArtifactPublisher(
      new filesystem.FileSystemStaticArtifactStore({ rootPath: storageRoot }),
      new filesystem.FileSystemStaticArtifactRouteProvider({
        baseUrl: "https://static.example.test",
      }),
      idGenerator,
      new filesystem.FileSystemStaticArtifactPublicationJournal({ rootPath: storageRoot }),
    ).publish(createExecutionContext({ entrypoint: "system" }), {
      projectId: "project_docs",
      resourceId: "res_docs",
      manifest,
      files: [payload],
      metadata: { channel: "filesystem-test" },
    });

    expect(result.isOk()).toBe(true);
    const publication = result._unsafeUnwrap();
    expect(publication.url).toBe(
      "https://static.example.test/artifacts/artifact_docs/manifest-digest/",
    );
    expect(publication.toState().storedManifest.storageRef).toBe(
      "filesystem-static-artifact://artifact_docs/manifest-digest",
    );
    expect(
      await readFile(
        join(storageRoot, "artifact_docs", "manifest-digest", "files", "index.html"),
        "utf8",
      ),
    ).toBe("hello static");
    const storedManifest = JSON.parse(
      await readFile(
        join(storageRoot, "artifact_docs", "manifest-digest", "manifest.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;
    expect(storedManifest).toMatchObject({
      schemaVersion: "appaloft-filesystem-static-artifact-store/v1",
      projectId: "project_docs",
      resourceId: "res_docs",
      artifactId: "artifact_docs",
      manifestDigest: "manifest-digest",
      fileCount: 1,
      totalBytes: 12,
    });
    const readback = await new filesystem.FileSystemStaticArtifactPublicationJournal({
      rootPath: storageRoot,
    }).listPublications(createExecutionContext({ entrypoint: "system" }), {
      projectId: "project_docs",
    });
    expect(readback.isOk()).toBe(true);
    expect(readback._unsafeUnwrap().items).toEqual([
      expect.objectContaining({
        publicationId: "static_artifact_publication_filesystem",
        projectId: "project_docs",
        resourceId: "res_docs",
        artifactId: "artifact_docs",
        manifestDigest: "manifest-digest",
        routeUrl: "https://static.example.test/artifacts/artifact_docs/manifest-digest/",
        metadata: { channel: "filesystem-test" },
      }),
    ]);
  });

  test("[STATIC-ARTIFACT-EXT-012] promotes a local filesystem alias to the current artifact", async () => {
    ensureReflectMetadata();
    const [{ createExecutionContext, PortBackedStaticArtifactPublisher }, filesystem] =
      await Promise.all([import("@appaloft/application"), import("../src")]);
    const storageRoot = await mkdtemp(join(tmpdir(), "appaloft-static-artifacts-"));
    const manifest = createManifest();
    const payload = createPayload("index.html", "hello static");
    const idGenerator: IdGenerator = {
      next(prefix) {
        return `${prefix}_filesystem`;
      },
    };

    const result = await new PortBackedStaticArtifactPublisher(
      new filesystem.FileSystemStaticArtifactStore({ rootPath: storageRoot }),
      new filesystem.FileSystemStaticArtifactRouteProvider({
        baseUrl: "https://static.example.test",
        rootPath: storageRoot,
      }),
      idGenerator,
    ).publish(createExecutionContext({ entrypoint: "system" }), {
      projectId: "project_docs",
      resourceId: "res_docs",
      manifest,
      files: [payload],
      promoteAlias: true,
    });

    expect(result.isOk()).toBe(true);
    const publication = result._unsafeUnwrap();
    expect(publication.url).toBe(
      "https://static.example.test/projects/project_docs/resources/res_docs/current/",
    );
    const alias = JSON.parse(
      await readFile(
        join(
          storageRoot,
          "aliases",
          "projects",
          "project_docs",
          "resources",
          "res_docs",
          "current.json",
        ),
        "utf8",
      ),
    ) as Record<string, unknown>;
    expect(alias).toMatchObject({
      schemaVersion: "appaloft-filesystem-static-artifact-alias/v1",
      projectId: "project_docs",
      resourceId: "res_docs",
      publicationId: "static_artifact_publication_filesystem",
      artifactId: "artifact_docs",
      manifestDigest: "manifest-digest",
    });
  });

  test("[STATIC-ARTIFACT-EXT-006] rejects file payload paths that escape the storage root", async () => {
    ensureReflectMetadata();
    const [{ createExecutionContext, PortBackedStaticArtifactPublisher }, filesystem] =
      await Promise.all([import("@appaloft/application"), import("../src")]);
    const storageRoot = await mkdtemp(join(tmpdir(), "appaloft-static-artifacts-"));
    let routeActivated = false;
    const routeProvider: StaticArtifactRouteProviderPort = {
      async activateRoute() {
        routeActivated = true;
        throw new Error("route provider should not activate for unsafe payload paths");
      },
    };
    const idGenerator: IdGenerator = {
      next(prefix) {
        return `${prefix}_filesystem`;
      },
    };

    const result = await new PortBackedStaticArtifactPublisher(
      new filesystem.FileSystemStaticArtifactStore({ rootPath: storageRoot }),
      routeProvider,
      idGenerator,
    ).publish(createExecutionContext({ entrypoint: "system" }), {
      projectId: "project_docs",
      resourceId: "res_docs",
      manifest: createManifest(),
      files: [createPayload("../secret.txt", "hello static")],
    });

    expect(result.isErr()).toBe(true);
    expect(routeActivated).toBe(false);
  });
});

function createManifest(): StaticArtifactManifest {
  return StaticArtifactManifest.create({
    artifactId: StaticArtifactId.rehydrate("artifact_docs"),
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

function createPayload(path: string, content: string): StaticArtifactFilePayload {
  return {
    path,
    sizeBytes: new TextEncoder().encode(content).byteLength,
    mimeType: "text/plain",
    contentDigest: "content-digest",
    async readBytes() {
      return new TextEncoder().encode(content);
    },
  };
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
