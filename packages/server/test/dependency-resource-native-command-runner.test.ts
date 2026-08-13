import "reflect-metadata";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BunDependencyResourceNativeCommandRunner } from "../src/register-application-services";

describe("composed dependency resource native command runner", () => {
  let originalPath: string | undefined;
  let temporaryDirectory: string;

  beforeEach(async () => {
    originalPath = process.env.PATH;
    temporaryDirectory = await mkdtemp(join(tmpdir(), "appaloft-server-redis-runner-"));
    const binDirectory = join(temporaryDirectory, "bin");
    await mkdir(binDirectory);
    await Bun.write(
      join(binDirectory, "redis-cli"),
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> ${join(temporaryDirectory, "args.log")}
case "$*" in
  *"--scan"*) printf 'state\\n' ;;
  *" PTTL "*) printf '%s\\n' '-1' ;;
  *" DUMP "*) printf 'serialized-dump\\n' ;;
  *" RESTORE "*) cat >/dev/null; printf 'ERR DUMP payload version or checksum are wrong\\n' ;;
  *) printf '1\\n' ;;
esac
`,
    );
    await chmod(join(binDirectory, "redis-cli"), 0o755);
    process.env.PATH = `${binDirectory}:${originalPath ?? ""}`;
  });

  afterEach(() => {
    process.env.PATH = originalPath;
  });

  test("[DEP-RES-BACKUP-001] strips only the redis-cli response delimiter from binary DUMP", async () => {
    const artifactPath = join(temporaryDirectory, "backup.json");
    const result = await new BunDependencyResourceNativeCommandRunner().run({
      operation: "redis-backup",
      connectionUrl: "redis://127.0.0.1:6379/0",
      artifactPath,
      redactions: [],
    });

    expect(
      result.isOk(),
      result.isErr()
        ? `${result.error.message}; calls=${await readFile(join(temporaryDirectory, "args.log"), "utf8")}`
        : undefined,
    ).toBe(true);
    const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as {
      keys: Array<{ dumpBase64: string }>;
    };
    expect(Buffer.from(artifact.keys[0]?.dumpBase64 ?? "", "base64").toString()).toBe(
      "serialized-dump",
    );
  });

  test("[DEP-RES-BACKUP-006] treats Redis protocol errors as restore failures even with exit code zero", async () => {
    const artifactPath = join(temporaryDirectory, "restore.json");
    await Bun.write(
      artifactPath,
      JSON.stringify({
        schemaVersion: "appaloft.redis-logical-backup/v1",
        generatedAt: "2026-08-13T00:00:00.000Z",
        keyCount: 1,
        keys: [
          {
            key: "state",
            ttlMs: -1,
            dumpBase64: Buffer.from("serialized-dump").toString("base64"),
          },
        ],
      }),
    );

    const result = await new BunDependencyResourceNativeCommandRunner().run({
      operation: "redis-restore",
      connectionUrl: "redis://127.0.0.1:6379/0",
      artifactPath,
      redactions: [],
    });

    expect(
      result.isErr(),
      result.isOk()
        ? `Redis protocol error was accepted; calls=${await readFile(join(temporaryDirectory, "args.log"), "utf8")}`
        : undefined,
    ).toBe(true);
    if (result.isOk()) throw new Error("Expected Redis protocol failure");
    expect(result.error.message).toBe("Redis native backup command failed");
  });
});
