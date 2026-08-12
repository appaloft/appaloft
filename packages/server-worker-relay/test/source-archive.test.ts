import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createBoundedServerWorkerSourceArchive,
  materializeBoundedServerWorkerSourceArchive,
} from "../src";

describe("Server Worker source archive", () => {
  test("[SWR-DEV-008] transfers bounded ignore-aware source without symlink escape", async () => {
    const source = mkdtempSync(join(tmpdir(), "appaloft-source-"));
    writeFileSync(join(source, ".gitignore"), "ignored.txt\nbuild/\n");
    writeFileSync(join(source, "appaloft.json"), "{}");
    writeFileSync(join(source, "index.ts"), "console.log('ok')");
    writeFileSync(join(source, "ignored.txt"), "secret-ish");
    mkdirSync(join(source, "build"));
    writeFileSync(join(source, "build", "output.js"), "ignored");
    symlinkSync("/etc/passwd", join(source, "escape"));
    const archive = await createBoundedServerWorkerSourceArchive(source);
    expect(archive.isOk()).toBe(true);
    if (archive.isErr()) return;
    expect(archive.value.files.map((file) => file.path)).toEqual([
      ".gitignore",
      "appaloft.json",
      "index.ts",
    ]);
    const target = mkdtempSync(join(tmpdir(), "appaloft-source-target-"));
    expect((await materializeBoundedServerWorkerSourceArchive(archive.value, target)).isOk()).toBe(
      true,
    );
    expect(readFileSync(join(target, "index.ts"), "utf8")).toBe("console.log('ok')");
    expect(() => readFileSync(join(target, "escape"))).toThrow();
  });
});
