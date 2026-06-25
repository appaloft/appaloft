import { relative, sep } from "node:path";

export type EmbeddedStaticAssets = Readonly<Record<string, Blob>>;

function normalizeAssetPath(path: string): string | null {
  const normalized = path.split("\\").join("/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((segment) => segment === "..")) {
    return null;
  }
  return normalized;
}

function assetContentType(path: string): string {
  return Bun.file(path).type;
}

export async function createStaticAssetArchive(input: {
  archivePath: string;
  files: readonly string[];
  staticBuildDir: string;
}): Promise<void> {
  const archiveInput: Record<string, Uint8Array<ArrayBuffer>> = {};

  for (const file of input.files) {
    const archivePath = normalizeAssetPath(
      relative(input.staticBuildDir, file).split(sep).join("/"),
    );
    if (!archivePath) {
      continue;
    }

    // Bun 1.3.14 writes empty archive entries when Bun.file(...) is passed directly.
    archiveInput[archivePath] = await Bun.file(file).bytes();
  }

  await Bun.Archive.write(input.archivePath, archiveInput, { compress: "gzip" });
}

export async function loadEmbeddedStaticAssetsArchive(
  archivePath: string,
): Promise<EmbeddedStaticAssets> {
  // Bun 1.3.14 does not accept Bun.file(...) Blob inputs here, even though bytes work.
  const archive = new Bun.Archive(await Bun.file(archivePath).bytes());
  const files = await archive.files();
  const assets: Record<string, Blob> = {};

  for (const [path, file] of files) {
    const assetPath = normalizeAssetPath(path);
    if (!assetPath) {
      continue;
    }

    const contentType = assetContentType(assetPath);
    assets[`/${assetPath}`] = contentType ? file.slice(0, file.size, contentType) : file;
  }

  return assets;
}
