import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type QueryBus,
} from "@appaloft/application";
import { resolveConfig } from "@appaloft/config";
import { ok, type Result } from "@appaloft/core";

import { createHttpApp } from "../src";

class SilentLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class CapturingCommandBus {
  readonly commands: Command[] = [];

  execute<TResult>(
    _context: ExecutionContext,
    command: Command<TResult>,
  ): Promise<Result<TResult>> {
    this.commands.push(command);
    return Promise.resolve(ok({ connected: true } as TResult));
  }
}

function createTestApp(commandBus: CommandBus) {
  return createHttpApp({
    config: resolveConfig({
      flags: {
        appVersion: "0.1.0-test",
        authProvider: "none",
        webOrigin: "https://console.example.com",
        webStaticDir: "",
      },
    }),
    commandBus,
    queryBus: {} as unknown as QueryBus,
    logger: new SilentLogger(),
    executionContextFactory: {
      create(input) {
        return createExecutionContext(input);
      },
    },
  });
}

describe("GitHub App callback", () => {
  test("[QD-GHA-005] redirects to safe Quick Deploy state after installation", async () => {
    const commandBus = new CapturingCommandBus();
    const app = createTestApp(commandBus as unknown as CommandBus);
    const state = encodeURIComponent(
      "https://console.example.com/?modal=quick-deploy&source=github&githubMode=browser&step=source",
    );

    const response = await app.handle(
      new Request(
        `http://localhost/api/integrations/github/app/callback?installation_id=123&setup_action=install&state=${state}`,
        { redirect: "manual" },
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://console.example.com/?modal=quick-deploy&source=github&githubMode=browser&step=source",
    );
    expect(commandBus.commands[0]).toMatchObject({
      installationId: "123",
      setupAction: "install",
    });
  });

  test("[QD-GHA-006] rejects cross-origin callback state redirects", async () => {
    const commandBus = new CapturingCommandBus();
    const app = createTestApp(commandBus as unknown as CommandBus);
    const state = encodeURIComponent("https://evil.example.com/deploy");

    const response = await app.handle(
      new Request(
        `http://localhost/api/integrations/github/app/callback?installation_id=123&state=${state}`,
        { redirect: "manual" },
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://console.example.com/?modal=quick-deploy&source=github&githubMode=browser&step=source",
    );
  });
});
