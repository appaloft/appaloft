import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok } from "@appaloft/core";
import {
  CapturedEventBus,
  FixedClock,
  MemoryServerRepository,
  NoopLogger,
  SequenceIdGenerator,
} from "@appaloft/testkit";
import {
  createExecutionContext,
  type ExecutionContext,
  PrepareServerRuntimeUseCase,
  RegisterServerCommand,
  RegisterServerCommandHandler,
  RegisterServerUseCase,
  type ServerConnectivityChecker,
  type ServerConnectivityResult,
  type ServerRuntimePreparer,
} from "../src";

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_prepare_runtime",
    entrypoint: "system",
  });
}

function connectivity(status: ServerConnectivityResult["status"]): ServerConnectivityResult {
  return {
    serverId: "srv_prepare",
    name: "Prepare target",
    host: "example.internal",
    port: 22,
    providerKey: "generic-ssh",
    checkedAt: "2026-01-01T00:00:00.000Z",
    status,
    checks: [
      {
        name: "docker",
        status: status === "healthy" ? "passed" : "failed",
        message:
          status === "healthy" ? "Remote Docker daemon is available" : "docker: command not found",
        durationMs: 1,
      },
    ],
  };
}

async function createServer(input: {
  context: ExecutionContext;
  serverRepository: MemoryServerRepository;
}) {
  const register = new RegisterServerCommandHandler(
    new RegisterServerUseCase(
      input.serverRepository,
      new FixedClock("2026-01-01T00:00:00.000Z"),
      new SequenceIdGenerator(),
      new CapturedEventBus(),
      new NoopLogger(),
    ),
  );
  const command = RegisterServerCommand.create({
    name: "Prepare target",
    host: "example.internal",
    providerKey: "generic-ssh",
  });
  expect(command.isOk()).toBe(true);

  const registered = await register.handle(input.context, command._unsafeUnwrap());
  expect(registered.isOk()).toBe(true);
  return registered._unsafeUnwrap().id;
}

describe("PrepareServerRuntimeUseCase", () => {
  test("reports ready when preparation repairs initially degraded connectivity", async () => {
    const context = createTestContext();
    const serverRepository = new MemoryServerRepository();
    const serverId = await createServer({ context, serverRepository });
    const connectivityResults = [connectivity("degraded"), connectivity("healthy")];
    const connectivityChecker: ServerConnectivityChecker = {
      async test() {
        return ok(connectivityResults.shift() ?? connectivity("healthy"));
      },
    };
    const runtimePreparer: ServerRuntimePreparer = {
      async prepare(_, input) {
        return ok({
          serverId: input.server.id.value,
          steps: [
            {
              phase: "docker",
              status: "succeeded",
              message: "Docker is installed and available",
              durationMs: 1,
            },
          ],
        });
      },
    };
    const bootstrapServerProxyUseCase = {
      async execute() {
        return ok({ attemptId: "pxy_prepare" });
      },
    };

    const result = await new PrepareServerRuntimeUseCase(
      serverRepository,
      connectivityChecker,
      runtimePreparer,
      bootstrapServerProxyUseCase as never,
      new FixedClock("2026-01-01T00:00:00.000Z"),
    ).execute(context, { serverId, mode: "prepare" });

    expect(result.isOk()).toBe(true);
    const prepared = result._unsafeUnwrap();
    expect(prepared.status).toBe("ready");
    expect(prepared.steps).toEqual([
      expect.objectContaining({ phase: "connectivity-before", status: "failed" }),
      expect.objectContaining({ phase: "docker", status: "succeeded" }),
      expect.objectContaining({ phase: "edge-proxy", status: "succeeded" }),
      expect.objectContaining({ phase: "connectivity-after", status: "succeeded" }),
    ]);
  });
});
