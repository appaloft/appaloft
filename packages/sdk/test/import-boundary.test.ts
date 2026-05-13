import { describe, expect, test } from "bun:test";

const forbiddenImportPatterns = [
  /(?:from\s+|import\s*\(\s*|import\s+)["']@appaloft\/core(?:\/|["'])/,
  /(?:from\s+|import\s*\(\s*|import\s+)["']@appaloft\/application(?:\/|["'])/,
  /(?:from\s+|import\s*\(\s*|import\s+)["']@appaloft\/persistence-pg(?:\/|["'])/,
  /(?:from\s+|import\s*\(\s*|import\s+)["']@appaloft\/adapter-[^"']+/,
  /(?:from\s+|import\s*\(\s*|import\s+)["']@appaloft\/provider-[^"']+/,
  /(?:from\s+|import\s*\(\s*|import\s+)["']@appaloft\/plugin-host(?:\/|["'])/,
  /(?:from\s+|import\s*\(\s*|import\s+)["']@appaloft\/testkit(?:\/|["'])/,
  /(?:from\s+|import\s*\(\s*|import\s+)["']@appaloft\/orpc(?:\/|["'])/,
  /(?:from\s+|import\s*\(\s*|import\s+)["']@appaloft\/openapi(?:\/|["'])/,
  /(?:from\s+|import\s*\(\s*|import\s+)["']@appaloft\/sdk-generator(?:\/|["'])/,
  /(?:from\s+|import\s*\(\s*|import\s+)["']tsyringe(?:\/|["'])/,
] as const;

describe("TypeScript SDK package boundary", () => {
  test("[TS-SDK-BOUNDARY-001] @appaloft/sdk does not import inward runtime packages", async () => {
    const sourceFiles = new Bun.Glob("src/**/*.ts").scan({
      cwd: import.meta.dir.replace(/\/test$/, ""),
      absolute: true,
    });
    const scannedFiles: string[] = [];

    for await (const filePath of sourceFiles) {
      scannedFiles.push(filePath);
      const source = await Bun.file(filePath).text();

      for (const pattern of forbiddenImportPatterns) {
        expect(pattern.test(source), `${filePath} matched ${pattern}`).toBe(false);
      }
    }

    expect(scannedFiles.length).toBeGreaterThan(0);
  });
});
