import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  createExecutionContext,
  type ExecutionContextFactory,
  type QueryBus,
} from "@appaloft/application";
import { ok } from "@appaloft/core";

describe("first deploy door login fold and agent-env guard", () => {
  test("[DEPLOY-DOOR-LOGIN-001] unauthenticated remote deploy starts login instead of Run appaloft login", async () => {
    const commands: string[] = [];
    let loginCalls = 0;
    let stderr = "";
    const home = await mkdtemp(join(tmpdir(), "appaloft-deploy-fold-login-"));
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      executionTarget: "remote",
      startServer: async () => {},
      startWorkerRuntime: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: AppCommand<T>) => {
          commands.push(command.constructor.name);
          return ok({ id: "dep_folded" } as T);
        },
      } as unknown as CommandBus,
      queryBus: {
        execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({ items: [] } as T),
      } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) =>
          createExecutionContext({
            ...input,
            requestId: "req_deploy_fold_login",
          }),
      } as ExecutionContextFactory,
      environment: { APPALOFT_HOME: home },
      loginControlPlane: async () => {
        loginCalls += 1;
        return ok({
          name: "cloud",
          mode: "cloud",
          baseUrl: "https://app.appaloft.com",
          active: true,
          auth: { kind: "bearer", redacted: "***" },
        });
      },
      terminalIO: {
        stdin: { isTTY: true, on: () => undefined },
        stdout: { isTTY: true, write: () => true },
        stderr: {
          isTTY: true,
          write: (chunk: string | Uint8Array) => {
            stderr += String(chunk);
            return true;
          },
        },
      },
    });

    try {
      await program.parseAsync(["node", "appaloft", "deploy", "."]).catch(() => undefined);
    } finally {
      await rm(home, { recursive: true, force: true });
    }

    expect(loginCalls).toBe(1);
    expect(stderr).toContain("Signing in");
    expect(stderr).not.toContain("Run appaloft login");
    expect(stderr).not.toContain("Occupancy");
  });

  test("[DEPLOY-DOOR-LOGIN-002] agent-env deploy without --yes does not login or mutate", async () => {
    const commands: string[] = [];
    let loginCalls = 0;
    let stderr = "";
    const home = await mkdtemp(join(tmpdir(), "appaloft-deploy-agent-guard-"));
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      executionTarget: "remote",
      startServer: async () => {},
      startWorkerRuntime: async () => {},
      commandBus: {
        execute: async <T>(_context: unknown, command: AppCommand<T>) => {
          commands.push(command.constructor.name);
          return ok({ id: "dep_blocked" } as T);
        },
      } as unknown as CommandBus,
      queryBus: {
        execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({ items: [] } as T),
      } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) =>
          createExecutionContext({
            ...input,
            requestId: "req_deploy_agent_guard",
          }),
      } as ExecutionContextFactory,
      environment: { APPALOFT_HOME: home, CURSOR_AGENT: "1" },
      loginControlPlane: async () => {
        loginCalls += 1;
        return ok({
          name: "cloud",
          mode: "cloud",
          baseUrl: "https://app.appaloft.com",
          active: true,
          auth: { kind: "bearer", redacted: "***" },
        });
      },
      terminalIO: {
        stdin: { isTTY: false, on: () => undefined },
        stdout: { isTTY: false, write: () => true },
        stderr: {
          isTTY: false,
          write: (chunk: string | Uint8Array) => {
            stderr += String(chunk);
            return true;
          },
        },
      },
    });

    try {
      await program.parseAsync(["node", "appaloft", "deploy", "."]).catch(() => undefined);
    } finally {
      await rm(home, { recursive: true, force: true });
    }

    expect(loginCalls).toBe(0);
    expect(commands).toEqual([]);
    expect(stderr).toContain("Would sign in and deploy this folder.");
    expect(stderr).toContain("Pass --yes to continue.");
    expect(stderr).not.toContain("Run appaloft login");
    expect(stderr).not.toContain("Occupancy");
  });
});
