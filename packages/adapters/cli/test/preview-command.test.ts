import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  type ExecutionContextFactory,
  type QueryBus,
} from "@appaloft/application";
import { ok } from "@appaloft/core";

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

async function withMutedProcessOutput<T>(callback: () => Promise<T>): Promise<T> {
  const writeStdout = process.stdout.write;
  const writeStderr = process.stderr.write;

  try {
    process.stdout.write = (() => true) as typeof process.stdout.write;
    process.stderr.write = (() => true) as typeof process.stderr.write;
    return await callback();
  } finally {
    process.stdout.write = writeStdout;
    process.stderr.write = writeStderr;
    process.exitCode = 0;
  }
}

describe("CLI preview commands", () => {
  test("[DEPLOYMENTS-CLEANUP-PREVIEW-CLI-001][CONFIG-FILE-ENTRY-019] preview cleanup dispatches the cleanup command with preview fingerprint", async () => {
    ensureReflectMetadata();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-preview-cleanup-cli-"));
    const configPath = join(workspace, "appaloft.preview.yml");
    writeFileSync(
      configPath,
      [
        "runtime:",
        "  strategy: workspace-commands",
        "network:",
        "  internalPort: 4310",
        "  exposureMode: reverse-proxy",
        "",
      ].join("\n"),
    );

    const previousWorkspace = Bun.env.GITHUB_WORKSPACE;
    delete Bun.env.GITHUB_REPOSITORY;
    delete Bun.env.GITHUB_REPOSITORY_ID;
    Bun.env.GITHUB_WORKSPACE = workspace;

    try {
      const { CleanupPreviewCommand, createExecutionContext } = await import(
        "@appaloft/application"
      );
      const { createCliProgram } = await import("../src");
      const commands: AppCommand<unknown>[] = [];
      const operations: string[] = [];
      const commandBus = {
        execute: async <T>(_context: unknown, command: AppCommand<T>) => {
          commands.push(command as AppCommand<unknown>);
          return ok({
            sourceFingerprint: (command as { sourceFingerprint: string }).sourceFingerprint,
            status: "cleaned",
            cleanedRuntime: true,
            removedServerAppliedRoute: true,
            removedSourceLink: true,
          } as T);
        },
      } as unknown as CommandBus;
      const queryBus = {
        execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({ items: [] } as T),
      } as unknown as QueryBus;
      const executionContextFactory: ExecutionContextFactory = {
        create: (input) =>
          createExecutionContext({
            ...input,
            requestId: "req_cli_preview_cleanup_test",
          }),
      };
      const program = createCliProgram({
        version: "0.1.0-test",
        startServer: async () => {},
        commandBus,
        queryBus,
        executionContextFactory,
        prepareDeploymentStateBackend: async (decision) => {
          operations.push(`prepare:${decision.kind}`);
          return ok({
            dataRoot: "/var/lib/appaloft/runtime/state",
            schemaVersion: 1,
            release: async () => {
              operations.push(`release:${decision.kind}`);
              return ok(undefined);
            },
          });
        },
      });

      await withMutedProcessOutput(async () => {
        await program.parseAsync([
          "node",
          "appaloft",
          "preview",
          "cleanup",
          workspace,
          "--config",
          configPath,
          "--preview",
          "pull-request",
          "--preview-id",
          "14",
          "--server-host",
          "203.0.113.10",
          "--server-ssh-username",
          "deploy",
          "--server-ssh-private-key-file",
          "/tmp/appaloft.key",
        ]);
      });

      expect(commands).toHaveLength(1);
      expect(commands[0]).toBeInstanceOf(CleanupPreviewCommand);
      expect((commands[0] as { sourceFingerprint: string }).sourceFingerprint).toContain(
        "preview%3Apr%3A14",
      );
      expect((commands[0] as { sourceFingerprint: string }).sourceFingerprint).toContain(
        "appaloft.preview.yml",
      );
      expect(operations).toEqual(["prepare:ssh-pglite", "release:ssh-pglite"]);
    } finally {
      if (previousWorkspace === undefined) {
        delete Bun.env.GITHUB_WORKSPACE;
      } else {
        Bun.env.GITHUB_WORKSPACE = previousWorkspace;
      }
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
