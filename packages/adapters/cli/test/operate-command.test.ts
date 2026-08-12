import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import { type CommandBus, createExecutionContext, type QueryBus } from "@appaloft/application";
import { ok } from "@appaloft/core";

describe("Operate CLI", () => {
  test("[OPR-TUI-004][OPR-HEADLESS-005] TTY and JSON use the same injected Operate presentation boundary", async () => {
    const starts: unknown[] = [];
    const headless: unknown[] = [];
    const output: string[] = [];
    const { createCliProgram } = await import("../src");
    const makeProgram = (interactive: boolean) =>
      createCliProgram({
        version: "0.1.0-test",
        startServer: async () => {},
        commandBus: { execute: async () => ok({}) } as unknown as CommandBus,
        queryBus: { execute: async () => ok({}) } as unknown as QueryBus,
        executionContextFactory: {
          create: (input) => createExecutionContext({ ...input, requestId: "req_operate_cli" }),
        },
        terminalIO: {
          stdin: { isTTY: interactive, on: () => undefined },
          stdout: {
            isTTY: interactive,
            write: (chunk) => {
              output.push(String(chunk));
              return true;
            },
          },
          stderr: { isTTY: interactive, write: () => true },
        },
        environment: { TERM: "xterm-256color" },
        operatePresentation: {
          start: async (_context, input) => {
            starts.push(input);
          },
          headless: async (_context, input) => {
            headless.push(input);
            return {
              protocol: "operate/v1" as const,
              state: "selected" as const,
              snapshot: {
                protocol: "operate/v1" as const,
                observedAt: "2026-08-13T00:00:00.000Z",
                target: { resourceId: "res_api", deploymentId: "dep_1" },
              },
            };
          },
        },
      });

    const processWrite = process.stdout.write;
    process.stdout.write = ((chunk) => {
      output.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      await makeProgram(true).parseAsync([
        "node",
        "appaloft",
        "operate",
        "res_api",
        "--deployment",
        "dep_1",
      ]);
      await makeProgram(false).parseAsync(["node", "appaloft", "operate", "res_api", "--json"]);
    } finally {
      process.stdout.write = processWrite;
    }

    expect(starts).toEqual([{ resourceId: "res_api", deploymentId: "dep_1" }]);
    expect(headless).toEqual([{ resourceId: "res_api" }]);
    expect(output.join("")).toContain('"protocol": "operate/v1"');
    expect(output.join("")).toContain('"resourceId": "res_api"');
  });

  test("[OPR-TUI-004][OPR-HEADLESS-005][OPR-COMPAT-018] remote Cloud target injects the same public Operate presentation boundary", async () => {
    const starts: unknown[] = [];
    const { createRemoteCliProgram } = await import("../src");
    const program = createRemoteCliProgram({
      version: "0.1.0-test",
      profile: {
        name: "cloud",
        mode: "public-cloud",
        baseUrl: "https://api.example.test",
        auth: { kind: "bearer", token: "not-used-by-presentation-seam" },
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
      },
      terminalIO: {
        stdin: { isTTY: true, on: () => undefined },
        stdout: { isTTY: true, write: () => true },
        stderr: { isTTY: true, write: () => true },
      },
      environment: { TERM: "xterm-256color" },
      operatePresentation: {
        start: async (_context, input) => {
          starts.push(input);
        },
        headless: async () => ({
          protocol: "operate/v1" as const,
          state: "empty" as const,
          resources: [],
        }),
      },
    });

    await program.parseAsync(["node", "appaloft", "operate", "res_api"]);

    expect(starts).toEqual([{ resourceId: "res_api" }]);
  });
});
