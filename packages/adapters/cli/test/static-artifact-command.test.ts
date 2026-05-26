import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  createExecutionContext,
  type ExecutionContextFactory,
  PublishStaticArtifactPayloadCommand,
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

function createHarness() {
  const commands: AppCommand<unknown>[] = [];
  const commandBus = {
    execute: async <T>(_context: unknown, command: AppCommand<T>) => {
      commands.push(command as AppCommand<unknown>);
      return ok({ publicationId: "pub_cli_static", url: "https://static.example.test" } as T);
    },
  } as unknown as CommandBus;
  const queryBus = {
    execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
  } as unknown as QueryBus;
  const executionContextFactory: ExecutionContextFactory = {
    create: (input) =>
      createExecutionContext({
        ...input,
        requestId: "req_cli_static_artifact_test",
      }),
  };

  return { commandBus, commands, executionContextFactory, queryBus };
}

async function runCli(args: string[], harness = createHarness()) {
  ensureReflectMetadata();
  const { createCliProgram } = await import("../src");
  const program = createCliProgram({
    version: "0.1.0-test",
    startServer: async () => {},
    commandBus: harness.commandBus,
    queryBus: harness.queryBus,
    executionContextFactory: harness.executionContextFactory,
  });
  const writeStdout = process.stdout.write;
  try {
    process.stdout.write = (() => true) as typeof process.stdout.write;
    await program.parseAsync(["node", "appaloft", ...args]);
  } finally {
    process.stdout.write = writeStdout;
  }

  return harness;
}

describe("CLI static artifact commands", () => {
  test("[STATIC-ARTIFACT-EXT-009] static artifact publish dispatches a portable file payload command", async () => {
    const harness = createHarness();
    const workspace = mkdtempSync(join(tmpdir(), "appaloft-static-artifact-cli-"));
    const dist = join(workspace, "dist");
    mkdirSync(join(dist, "assets"), { recursive: true });
    writeFileSync(join(dist, "index.html"), "<main>Hello</main>");
    writeFileSync(join(dist, "assets", "app.js"), "console.log('hello');");

    await runCli(
      [
        "static-artifacts",
        "publish",
        dist,
        "--project",
        "project_docs",
        "--resource",
        "res_docs",
        "--artifact",
        "artifact_docs",
        "--promote-alias",
      ],
      harness,
    );

    expect(harness.commands[0]).toBeInstanceOf(PublishStaticArtifactPayloadCommand);
    expect(harness.commands[0]).toMatchObject({
      projectId: "project_docs",
      resourceId: "res_docs",
      artifactId: "artifact_docs",
      promoteAlias: true,
      files: [
        {
          path: "assets/app.js",
          mimeType: "text/javascript",
          contentBase64: Buffer.from("console.log('hello');").toString("base64"),
        },
        {
          path: "index.html",
          mimeType: "text/html",
          contentBase64: Buffer.from("<main>Hello</main>").toString("base64"),
        },
      ],
    });
  });
});
