import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { dashboardPerformanceBudgets } from "../src/lib/performance-fixtures";

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

const buildDirectory = join(import.meta.dir, "..", "build", "_app", "immutable");
const files = await javascriptFiles(buildDirectory);
const gzipBytes = files.reduce((total, file) => total + gzipSync(readFileSync(file)).byteLength, 0);
const budget = dashboardPerformanceBudgets.initialRouteJavaScriptGzipBytes;

if (gzipBytes > budget) {
  throw new Error(
    `Dashboard JavaScript bundle is ${gzipBytes} gzip bytes; budget is ${budget} gzip bytes.`,
  );
}

console.log(
  `dashboard-v2 JavaScript: ${gzipBytes} gzip bytes across ${files.length} files (budget ${budget})`,
);
