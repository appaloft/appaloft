import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Command as AppCommand,
  type CommandBus,
  createExecutionContext,
  type ExecutionContextFactory,
  ExportControlPlaneCommand,
  type QueryBus,
} from "@appaloft/application";
import { ok } from "@appaloft/core";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("CLI whole-instance portability", () => {
  test("[PORTABILITY-CLI-009] reads passphrase from stdin and writes only the envelope with mode 0600", async () => {
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      async execute<T>(_context: unknown, command: AppCommand<T>) {
        commands.push(command as AppCommand<unknown>);
        return ok({
          schemaVersion: "control-plane-portability.export/v1",
          encryptedEnvelope: "encrypted-envelope-only",
          artifact: {
            id: "cpa_test",
            kind: "export",
            checksum: "sha256:test",
            sourceRevision: "104",
            byteLength: 23,
            createdAt: "2026-07-20T00:00:00.000Z",
          },
        } as T);
      },
    } as unknown as CommandBus;
    const queryBus = { execute: async <T>() => ok({} as T) } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) => createExecutionContext({ ...input, requestId: "req_portability_cli" }),
    };
    const root = mkdtempSync(join(tmpdir(), "appaloft-portability-cli-"));
    roots.push(root);
    const output = join(root, "instance.appaloft-portability.json");
    const stdout: string[] = [];
    const writeStdout = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      const program = createCliProgram({
        version: "0.1.0-test",
        startServer: async () => {},
        commandBus,
        queryBus,
        executionContextFactory,
        readStdinText: async () => "correct horse battery staple\n",
      });
      await program.parseAsync([
        "node",
        "appaloft",
        "instance",
        "portability",
        "export",
        "--output",
        output,
        "--passphrase-stdin",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(ExportControlPlaneCommand);
    expect(commands[0]).toMatchObject({ passphrase: "correct horse battery staple" });
    expect(readFileSync(output, "utf8")).toBe("encrypted-envelope-only");
    expect(statSync(output).mode & 0o777).toBe(0o600);
    expect(stdout.join("")).not.toContain("encrypted-envelope-only");
    expect(stdout.join("")).not.toContain("correct horse battery staple");
  });
});
