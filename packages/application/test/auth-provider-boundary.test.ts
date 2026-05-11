import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");

const forbiddenAuthImplementationMarkers = [
  "@appaloft/auth-better",
  "better-auth",
  "BetterAuth",
  "betterAuth",
] as const;

async function sourceFilesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sourceFilesUnder(path)));
      continue;
    }

    if (entry.isFile() && path.endsWith(".ts")) {
      files.push(path);
    }
  }

  return files;
}

describe("auth provider dependency boundary", () => {
  test("[SELF-HOSTED-AUTH-ARCH-001] core and application depend only on Appaloft-owned auth abstractions", async () => {
    const files = [
      ...(await sourceFilesUnder(join(root, "packages/core/src"))),
      ...(await sourceFilesUnder(join(root, "packages/application/src"))),
    ];

    const violations: string[] = [];

    for (const file of files) {
      const source = await Bun.file(file).text();
      for (const marker of forbiddenAuthImplementationMarkers) {
        if (source.includes(marker)) {
          violations.push(`${relative(root, file)} contains ${marker}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
