import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { dashboardPerformanceBudgets } from "../src/lib/performance-fixtures";

export interface ViteManifestEntry {
  file: string;
  name?: string;
  imports?: string[];
  dynamicImports?: string[];
  isEntry?: boolean;
  isDynamicEntry?: boolean;
}

export type ViteManifest = Record<string, ViteManifestEntry>;

export function collectStaticManifestFiles(
  manifest: ViteManifest,
  roots: readonly string[],
): string[] {
  const visited = new Set<string>();
  const files = new Set<string>();
  const pending = [...roots];

  while (pending.length > 0) {
    const key = pending.pop();
    if (!key || visited.has(key)) continue;
    visited.add(key);
    const entry = manifest[key];
    if (!entry) throw new Error(`Dashboard manifest entry ${key} was not found.`);
    files.add(entry.file);
    pending.push(...(entry.imports ?? []));
  }

  return [...files].toSorted();
}

async function javascriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return javascriptFiles(path);
      return entry.name.endsWith(".js") ? [path] : [];
    }),
  );
  return files.flat();
}

function gzipBytes(buildDirectory: string, files: readonly string[]): number {
  return files.reduce(
    (total, file) => total + gzipSync(readFileSync(join(buildDirectory, file))).byteLength,
    0,
  );
}

function manifestKeyByName(manifest: ViteManifest, name: string): string {
  const match = Object.entries(manifest).find(([, entry]) => entry.name === name);
  if (!match) throw new Error(`Dashboard manifest entry named ${name} was not found.`);
  return match[0];
}

async function main(): Promise<void> {
  const buildDirectory = join(import.meta.dir, "..", "build");
  const manifestPath = join(
    import.meta.dir,
    "..",
    ".svelte-kit",
    "output",
    "client",
    ".vite",
    "manifest.json",
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ViteManifest;
  const pageKey = manifestKeyByName(manifest, "nodes/3");
  const initialRoots = [
    manifestKeyByName(manifest, "entry/start"),
    manifestKeyByName(manifest, "entry/app"),
    manifestKeyByName(manifest, "nodes/0"),
    manifestKeyByName(manifest, "nodes/2"),
    pageKey,
  ];
  const destinationRoots = manifest[pageKey]?.dynamicImports ?? [];
  const routeCandidates = [undefined, ...destinationRoots].map((destinationRoot) => {
    const files = collectStaticManifestFiles(manifest, [
      ...initialRoots,
      ...(destinationRoot ? [destinationRoot] : []),
    ]);
    return {
      destinationRoot,
      files,
      gzipBytes: gzipBytes(buildDirectory, files),
    };
  });
  const largestRoute = routeCandidates.toSorted(
    (left, right) => right.gzipBytes - left.gzipBytes,
  )[0];
  if (!largestRoute) throw new Error("Dashboard manifest produced no active-route candidates.");

  const allFiles = await javascriptFiles(join(buildDirectory, "_app", "immutable"));
  const allGzipBytes = allFiles.reduce(
    (total, file) => total + gzipSync(readFileSync(file)).byteLength,
    0,
  );
  const budget = dashboardPerformanceBudgets.initialRouteJavaScriptGzipBytes;

  if (largestRoute.gzipBytes > budget) {
    throw new Error(
      `Dashboard active-route JavaScript is ${largestRoute.gzipBytes} gzip bytes; budget is ${budget} gzip bytes.`,
    );
  }

  console.log(
    `dashboard-v2 active-route JavaScript: ${largestRoute.gzipBytes} gzip bytes across ${largestRoute.files.length} files (budget ${budget}); ${allGzipBytes} gzip bytes across ${allFiles.length} files including lazy destinations`,
  );
}

if (import.meta.main) await main();
