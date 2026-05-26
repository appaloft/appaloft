import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import {
  domainError,
  err,
  ok,
  type Result,
  StaticArtifactByteSize,
  StaticArtifactDigest,
  StaticArtifactFileCount,
  StaticArtifactFileDigest,
  StaticArtifactId,
  StaticArtifactManifest,
  StaticArtifactMimeType,
} from "@appaloft/core";

import { type StaticArtifactFilePayload, type StaticArtifactPayloadReadResult } from "../../ports";

export interface StaticArtifactInlineFileInput {
  readonly path: string;
  readonly mimeType: string;
  readonly contentBase64: string;
}

export interface StaticArtifactZipArchiveInput {
  readonly archiveBase64: string;
}

export function createStaticArtifactPayloadReadResultFromInlineFiles(
  artifactId: string,
  files: readonly StaticArtifactInlineFileInput[],
): Result<StaticArtifactPayloadReadResult> {
  const payloads: StaticArtifactFilePayload[] = [];
  const seenPaths = new Set<string>();

  for (const file of files) {
    const normalizedPath = normalizeStaticArtifactPayloadPath(file.path);
    if (normalizedPath.isErr()) return err(normalizedPath.error);
    if (seenPaths.has(normalizedPath.value)) {
      return err(
        domainError.validation("Static artifact payload paths must be unique", {
          path: normalizedPath.value,
        }),
      );
    }
    seenPaths.add(normalizedPath.value);

    const content = decodeBase64Content(file.contentBase64, normalizedPath.value);
    if (content.isErr()) return err(content.error);
    const contentBytes = content.value;
    const contentDigest = digestBytes(contentBytes);

    payloads.push({
      path: normalizedPath.value,
      mimeType: file.mimeType.trim().toLowerCase(),
      sizeBytes: contentBytes.byteLength,
      contentDigest,
      async readBytes() {
        return new Uint8Array(contentBytes);
      },
    });
  }

  return createStaticArtifactPayloadReadResult(artifactId, payloads);
}

export function createStaticArtifactPayloadReadResultFromZipArchive(
  artifactId: string,
  input: StaticArtifactZipArchiveInput,
): Result<StaticArtifactPayloadReadResult> {
  const archiveBytes = decodeBase64Content(input.archiveBase64, "archive.zip");
  if (archiveBytes.isErr()) return err(archiveBytes.error);

  const entries = readZipCentralDirectory(archiveBytes.value);
  if (entries.isErr()) return err(entries.error);

  const seenPaths = new Set<string>();
  const payloads: StaticArtifactFilePayload[] = [];
  for (const entry of entries.value) {
    if (entry.path.endsWith("/")) continue;
    const normalizedPath = normalizeStaticArtifactPayloadPath(entry.path);
    if (normalizedPath.isErr()) return err(normalizedPath.error);
    if (seenPaths.has(normalizedPath.value)) {
      return err(
        domainError.validation("Static artifact archive contains duplicate file paths", {
          path: normalizedPath.value,
        }),
      );
    }
    seenPaths.add(normalizedPath.value);

    const bytes = readZipEntryBytes(archiveBytes.value, entry);
    if (bytes.isErr()) return err(bytes.error);
    const contentBytes = bytes.value;
    payloads.push({
      path: normalizedPath.value,
      sizeBytes: contentBytes.byteLength,
      mimeType: inferStaticArtifactMimeType(normalizedPath.value),
      contentDigest: digestBytes(contentBytes),
      async readBytes() {
        return new Uint8Array(contentBytes);
      },
    });
  }

  if (payloads.length === 0) {
    return err(domainError.validation("Static artifact archive must contain at least one file"));
  }

  return createStaticArtifactPayloadReadResult(artifactId, payloads);
}

function createStaticArtifactPayloadReadResult(
  artifactId: string,
  payloads: readonly StaticArtifactFilePayload[],
): Result<StaticArtifactPayloadReadResult> {
  const artifactIdValue = StaticArtifactId.create(artifactId);
  if (artifactIdValue.isErr()) return err(artifactIdValue.error);

  const orderedPayloads = [...payloads].sort((left, right) => left.path.localeCompare(right.path));
  const fileDigests: StaticArtifactFileDigest[] = [];

  for (const payload of orderedPayloads) {
    const pathDigest = StaticArtifactDigest.create(digestText(payload.path));
    if (pathDigest.isErr()) return err(pathDigest.error);
    const contentDigest = StaticArtifactDigest.create(payload.contentDigest);
    if (contentDigest.isErr()) return err(contentDigest.error);
    const sizeBytes = StaticArtifactByteSize.create(payload.sizeBytes);
    if (sizeBytes.isErr()) return err(sizeBytes.error);
    const mimeType = StaticArtifactMimeType.create(payload.mimeType);
    if (mimeType.isErr()) return err(mimeType.error);

    const fileDigest = StaticArtifactFileDigest.create({
      pathDigest: pathDigest.value,
      contentDigest: contentDigest.value,
      sizeBytes: sizeBytes.value,
      mimeType: mimeType.value,
    });
    if (fileDigest.isErr()) return err(fileDigest.error);
    fileDigests.push(fileDigest.value);
  }

  const fileCount = StaticArtifactFileCount.create(fileDigests.length);
  if (fileCount.isErr()) return err(fileCount.error);
  const totalBytes = StaticArtifactByteSize.create(
    orderedPayloads.reduce((sum, payload) => sum + payload.sizeBytes, 0),
  );
  if (totalBytes.isErr()) return err(totalBytes.error);
  const manifestDigest = StaticArtifactDigest.create(
    digestText(
      orderedPayloads
        .map((payload) => `${payload.path}:${payload.contentDigest}:${payload.sizeBytes}`)
        .join("\n"),
    ),
  );
  if (manifestDigest.isErr()) return err(manifestDigest.error);

  const manifest = StaticArtifactManifest.create({
    artifactId: artifactIdValue.value,
    manifestDigest: manifestDigest.value,
    fileCount: fileCount.value,
    totalBytes: totalBytes.value,
    files: fileDigests,
  });
  if (manifest.isErr()) return err(manifest.error);

  return ok({
    manifest: manifest.value,
    files: orderedPayloads,
  });
}

function decodeBase64Content(contentBase64: string, path: string): Result<Uint8Array> {
  const normalized = contentBase64.trim();
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
    return err(
      domainError.validation("Static artifact inline file content must be base64 encoded", {
        path,
      }),
    );
  }

  const bytes = Buffer.from(normalized, "base64");
  const canonical = bytes.toString("base64").replace(/=+$/, "");
  if (canonical !== normalized.replace(/=+$/, "")) {
    return err(
      domainError.validation("Static artifact inline file content must be base64 encoded", {
        path,
      }),
    );
  }

  return ok(new Uint8Array(bytes));
}

interface ZipCentralDirectoryEntry {
  readonly path: string;
  readonly compressionMethod: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
}

function readZipCentralDirectory(bytes: Uint8Array): Result<readonly ZipCentralDirectoryEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOfCentralDirectoryOffset = findZipEndOfCentralDirectory(view);
  if (endOfCentralDirectoryOffset === undefined) {
    return err(domainError.validation("Static artifact archive must be a valid .zip file"));
  }

  const entryCount = view.getUint16(endOfCentralDirectoryOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(endOfCentralDirectoryOffset + 16, true);
  const entries: ZipCentralDirectoryEntry[] = [];
  let cursor = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) {
      return err(domainError.validation("Static artifact archive central directory is invalid"));
    }

    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const fileNameStart = cursor + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    entries.push({
      path: new TextDecoder().decode(bytes.slice(fileNameStart, fileNameEnd)),
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    cursor = fileNameEnd + extraLength + commentLength;
  }

  return ok(entries);
}

function findZipEndOfCentralDirectory(view: DataView): number | undefined {
  if (view.byteLength < 22) return undefined;
  const minimumOffset = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  return undefined;
}

function readZipEntryBytes(
  archiveBytes: Uint8Array,
  entry: ZipCentralDirectoryEntry,
): Result<Uint8Array> {
  const view = new DataView(archiveBytes.buffer, archiveBytes.byteOffset, archiveBytes.byteLength);
  if (view.getUint32(entry.localHeaderOffset, true) !== 0x04034b50) {
    return err(domainError.validation("Static artifact archive local header is invalid"));
  }

  const fileNameLength = view.getUint16(entry.localHeaderOffset + 26, true);
  const extraLength = view.getUint16(entry.localHeaderOffset + 28, true);
  const dataStart = entry.localHeaderOffset + 30 + fileNameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > archiveBytes.byteLength) {
    return err(domainError.validation("Static artifact archive entry is truncated"));
  }

  const compressed = archiveBytes.slice(dataStart, dataEnd);
  if (entry.compressionMethod === 0) return ok(compressed);
  if (entry.compressionMethod === 8) {
    const inflated = inflateRawSync(compressed);
    if (inflated.byteLength !== entry.uncompressedSize) {
      return err(domainError.validation("Static artifact archive entry size is invalid"));
    }
    return ok(inflated);
  }

  return err(
    domainError.validation("Static artifact archive entry compression is unsupported", {
      compressionMethod: entry.compressionMethod,
    }),
  );
}

function normalizeStaticArtifactPayloadPath(payloadPath: string): Result<string> {
  const segments = payloadPath.split(/[\\/]+/).filter((segment) => segment.length > 0);
  if (
    payloadPath.startsWith("/") ||
    /^[a-z]:[\\/]/i.test(payloadPath) ||
    segments.length === 0 ||
    segments.some(isUnsafePathSegment)
  ) {
    return err(
      domainError.validation("Static artifact file payload path must be relative and safe", {
        path: payloadPath,
      }),
    );
  }

  return ok(segments.join("/"));
}

function isUnsafePathSegment(segment: string): boolean {
  return segment === "." || segment === ".." || segment.includes(":") || segment.includes("\0");
}

function inferStaticArtifactMimeType(path: string): string {
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith(".html") || lowerPath.endsWith(".htm")) return "text/html";
  if (lowerPath.endsWith(".css")) return "text/css";
  if (lowerPath.endsWith(".js") || lowerPath.endsWith(".mjs")) return "text/javascript";
  if (lowerPath.endsWith(".json")) return "application/json";
  if (lowerPath.endsWith(".svg")) return "image/svg+xml";
  if (lowerPath.endsWith(".png")) return "image/png";
  if (lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg")) return "image/jpeg";
  if (lowerPath.endsWith(".gif")) return "image/gif";
  if (lowerPath.endsWith(".webp")) return "image/webp";
  if (lowerPath.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

function digestBytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function digestText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
